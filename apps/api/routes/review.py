import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import Case, Entity, Evidence, Job, Relationship, User
from ..rbac import audit, get_visible_case, require
from ..redis_service import invalidate_case, publish_job
from services.argus_analysis.normalization import canonicalize_indicator

router = APIRouter()


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str = Field(min_length=1, max_length=100)
    action: Literal["accept", "reject"]
    type: str | None = Field(None, min_length=1, max_length=40)
    value: str | None = Field(None, min_length=1, max_length=2000)
    explanation: str | None = Field(None, max_length=10000)


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[ReviewDecision] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_candidates(self):
        ids = [decision.candidate_id for decision in self.decisions]
        if len(ids) != len(set(ids)):
            raise ValueError("Each candidate may appear only once")
        return self


def _candidate_map(job: Job) -> tuple[dict, dict[str, dict]]:
    result = dict(job.result or {})
    candidates = result.get("candidates")
    if not isinstance(candidates, list):
        raise HTTPException(409, "This job has no reviewable candidates")
    valid = {
        item.get("id"): dict(item)
        for item in candidates
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    return result, valid


def _evidence_ids(db: Session, case_id: uuid.UUID, candidate: dict) -> list[str]:
    raw = candidate.get("evidence_ids")
    if not isinstance(raw, list) or not raw:
        raise HTTPException(422, "Candidate has no supporting evidence")
    try:
        ids = [uuid.UUID(str(value)) for value in raw]
    except (ValueError, TypeError):
        raise HTTPException(422, "Candidate contains an invalid evidence reference") from None
    found = set(db.scalars(select(Evidence.id).where(
        Evidence.case_id == case_id, Evidence.id.in_(ids)
    )))
    if found != set(ids):
        raise HTTPException(422, "Candidate evidence must belong to the job case")
    return [str(value) for value in ids]


def _accept_entity(
    db: Session, job: Job, user: User, candidate: dict, decision: ReviewDecision
) -> uuid.UUID:
    evidence_ids = _evidence_ids(db, job.case_id, candidate)
    kind = (decision.type or str(candidate.get("type", ""))).strip().upper()
    value = (decision.value or str(candidate.get("value", ""))).strip()
    if not kind or not value:
        raise HTTPException(422, "Accepted entity requires type and value")
    if len(value) > 2000:
        raise HTTPException(422, "Accepted entity value is too long")
    entity = db.scalar(select(Entity).where(
        Entity.case_id == job.case_id,
        Entity.type == kind,
        Entity.value == value,
    ).with_for_update())
    if entity is None:
        # Case-insensitive matching is completed in Python for portable SQLite /
        # PostgreSQL behavior and prevents duplicate accepted drafts across jobs.
        entity = next((
            item for item in db.scalars(select(Entity).where(
                Entity.case_id == job.case_id, Entity.type == kind
            ))
            if canonicalize_indicator(kind, item.value) == canonicalize_indicator(kind, value)
        ), None)
    if entity is None:
        entity = Entity(
            case_id=job.case_id, type=kind, value=value,
            source="Accepted analysis candidate",
            description=decision.explanation or str(candidate.get("reason", "")),
            confidence=float(candidate.get("confidence", 0.5)),
            extra_metadata={
                "analysis_candidate_id": candidate["id"],
                "analysis_job_id": str(job.id),
                "evidence_ids": evidence_ids,
            },
        )
        db.add(entity)
        db.flush()
    metadata = dict(entity.extra_metadata or {})
    metadata["evidence_ids"] = list(dict.fromkeys([
        *metadata.get("evidence_ids", []), *evidence_ids
    ]))
    reviews = list(metadata.get("analysis_reviews", []))
    review_key = (str(job.id), candidate["id"])
    if not any(
        (str(item.get("job_id")), item.get("candidate_id")) == review_key
        for item in reviews if isinstance(item, dict)
    ):
        reviews.append({
            "job_id": str(job.id),
            "candidate_id": candidate["id"],
            "original_type": candidate.get("type"),
            "original_value": candidate.get("value"),
            "original_reason": candidate.get("reason"),
            "reviewed_type": kind,
            "reviewed_value": value,
            "reviewed_explanation": (
                decision.explanation
                if decision.explanation is not None
                else str(candidate.get("reason", ""))
            ),
        })
    metadata["analysis_reviews"] = reviews[-100:]
    entity.extra_metadata = metadata
    for evidence in db.scalars(select(Evidence).where(
        Evidence.case_id == job.case_id,
        Evidence.id.in_([uuid.UUID(value) for value in evidence_ids]),
    ).with_for_update()):
        evidence.entity_ids = list(dict.fromkeys([*evidence.entity_ids, str(entity.id)]))
    audit(db, user, "analysis.candidate.accepted", "entity", entity.id, job.case_id, {
        "job_id": str(job.id), "candidate_id": candidate["id"],
        "reviewed_type": kind, "reviewed_value": value,
        "reviewed_explanation": (
            decision.explanation
            if decision.explanation is not None
            else str(candidate.get("reason", ""))
        ),
    })
    return entity.id


def _resolve_ref(db: Session, job: Job, candidates: dict[str, dict], ref: object) -> uuid.UUID:
    reference = str(ref or "")
    nested = candidates.get(reference)
    if nested is not None:
        entity_id = nested.get("entity_id")
        if nested.get("decision") != "accepted" or not entity_id:
            raise HTTPException(422, f"Referenced entity candidate {reference} must be accepted first")
        reference = str(entity_id)
    try:
        entity_id = uuid.UUID(reference)
    except ValueError:
        raise HTTPException(422, "Relationship contains an invalid entity reference") from None
    entity = db.get(Entity, entity_id)
    if entity is None or entity.case_id != job.case_id:
        raise HTTPException(422, "Relationship entities must belong to the job case")
    return entity_id


def _accept_relationship(
    db: Session, job: Job, user: User, candidates: dict[str, dict],
    candidate: dict, decision: ReviewDecision,
) -> uuid.UUID:
    evidence_ids = _evidence_ids(db, job.case_id, candidate)
    source_id = _resolve_ref(db, job, candidates, candidate.get("source_ref"))
    target_id = _resolve_ref(db, job, candidates, candidate.get("target_ref"))
    if source_id == target_id:
        raise HTTPException(422, "Relationship endpoints must be different")
    kind = (decision.type or str(candidate.get("type", ""))).strip().upper()
    explanation = (
        decision.explanation
        if decision.explanation is not None
        else str(candidate.get("reason", ""))
    )
    if not kind:
        raise HTTPException(422, "Accepted relationship requires a type")
    if len(explanation) > 10000:
        raise HTTPException(422, "Accepted relationship explanation is too long")
    relationship = db.scalar(select(Relationship).where(
        Relationship.case_id == job.case_id,
        Relationship.type == kind,
        Relationship.evidence_ids == evidence_ids,
        or_(
            (Relationship.source_id == source_id) & (Relationship.target_id == target_id),
            (Relationship.source_id == target_id) & (Relationship.target_id == source_id),
        ),
    ).with_for_update())
    if relationship is None:
        relationship = Relationship(
            case_id=job.case_id, source_id=source_id, target_id=target_id,
            type=kind, confidence=float(candidate.get("confidence", 0.5)),
            evidence_ids=evidence_ids, explanation=explanation,
            attribution="ALGORITHM", created_by=user.id,
        )
        db.add(relationship)
        db.flush()
    audit(db, user, "analysis.candidate.accepted", "relationship", relationship.id,
          job.case_id, {"job_id": str(job.id), "candidate_id": candidate["id"],
                        "reviewed_type": kind})
    return relationship.id


@router.post("/jobs/{job_id}/review")
def review_analysis_job(
    job_id: uuid.UUID, data: ReviewInput, db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require(user, "analysis:run")
    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if job is None:
        raise HTTPException(404, "Job not found")
    get_visible_case(db, user, job.case_id)
    if job.status != "SUCCEEDED":
        raise HTTPException(409, "Only succeeded jobs can be reviewed")
    # Serialize review materialization across every job in this case.
    db.execute(select(Case.id).where(Case.id == job.case_id).with_for_update()).all()
    result, candidates = _candidate_map(job)
    requested = {decision.candidate_id: decision for decision in data.decisions}
    missing = set(requested) - set(candidates)
    if missing:
        raise HTTPException(404, f"Candidate not found: {sorted(missing)[0]}")
    if any(decision.action == "accept" for decision in data.decisions):
        require(user, "case:edit")

    # Entities are materialized first so relationships may safely reference
    # candidates accepted in the same request, independent of client ordering.
    ordered = sorted(data.decisions, key=lambda value: candidates[value.candidate_id].get("kind") == "relationship")
    for decision in ordered:
        candidate = candidates[decision.candidate_id]
        previous = candidate.get("decision")
        if previous == "accepted":
            if decision.action != "accept":
                raise HTTPException(409, "Accepted decisions are immutable")
            continue
        if previous == "rejected":
            if decision.action != "reject":
                raise HTTPException(409, "Rejected decisions are immutable")
            continue
        if decision.action == "reject":
            candidate["decision"] = "rejected"
            candidate.pop("entity_id", None)
            candidate.pop("relationship_id", None)
            audit(db, user, "analysis.candidate.rejected", "job", job.id, job.case_id, {
                "candidate_id": candidate["id"], "kind": candidate.get("kind"),
            })
        elif candidate.get("kind") == "entity":
            candidate["entity_id"] = str(_accept_entity(db, job, user, candidate, decision))
            candidate["reviewed_type"] = (
                decision.type or str(candidate.get("type", ""))
            ).strip().upper()
            candidate["reviewed_value"] = (
                decision.value or str(candidate.get("value", ""))
            ).strip()
            candidate["reviewed_explanation"] = (
                decision.explanation
                if decision.explanation is not None
                else str(candidate.get("reason", ""))
            )
            candidate["decision"] = "accepted"
        elif candidate.get("kind") == "relationship":
            candidate["relationship_id"] = str(
                _accept_relationship(db, job, user, candidates, candidate, decision)
            )
            candidate["reviewed_type"] = (
                decision.type or str(candidate.get("type", ""))
            ).strip().upper()
            candidate["reviewed_explanation"] = (
                decision.explanation
                if decision.explanation is not None
                else str(candidate.get("reason", ""))
            )
            candidate["decision"] = "accepted"
        else:
            raise HTTPException(422, "Unknown candidate kind")

    result["candidates"] = list(candidates.values())
    result["review_required"] = any(
        candidate.get("decision") not in {"accepted", "rejected"}
        for candidate in candidates.values()
    )
    job.result = result
    db.commit()
    db.refresh(job)
    invalidate_case(job.case_id)
    publish_job(job.id, job.case_id, job.status, {"result": job.result})
    return job