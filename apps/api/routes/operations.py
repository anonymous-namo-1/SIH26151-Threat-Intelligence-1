import html
import csv
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import cast, exists, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import Audit, Entity, Evidence, Job, Report, Role, SavedView, User
from ..rbac import audit, get_visible_case, require, visible_cases_query
from ..redis_service import cache_get, cache_set, publish_job
from ..schemas import NonNullPatch

router = APIRouter()


def comparable_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def safe_csv_cell(value: str) -> str:
    index = 0
    while index < len(value) and (value[index].isspace() or ord(value[index]) < 32
                                  or ord(value[index]) == 127):
        index += 1
    return "'" + value if index < len(value) and value[index] in "=+-@" else value


class ViewInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    filters: dict
    positions: dict
    viewport: dict


class ReportInput(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(max_length=200000)
    citations: list[uuid.UUID] = Field(max_length=1000)


class ReportUpdate(NonNullPatch):
    title: str | None = Field(None, min_length=1, max_length=300)
    body: str | None = Field(None, max_length=200000)
    citations: list[uuid.UUID] | None = Field(None, max_length=1000)


class AnalysisInput(BaseModel):
    mode: str = Field(pattern="^(extract|correlate|summarize)$")
    evidence_ids: list[uuid.UUID] | None = Field(None, min_length=1, max_length=500)


def serialize(model, metadata=False):
    result = {}
    for column in model.__table__.columns:
        key = "extra_metadata" if column.name == "metadata" else column.name
        value = getattr(model, key)
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        result[key] = value
    if metadata:
        result["metadata"] = result.pop("extra_metadata")
    return result


@router.get("/cases/{case_id}/views")
def list_views(case_id: uuid.UUID, limit: int = Query(100, ge=1, le=200),
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(SavedView).where(SavedView.case_id == case_id)
                           .order_by(SavedView.created_at.desc(), SavedView.id).limit(limit)))


@router.post("/cases/{case_id}/views", status_code=201)
def create_view(case_id: uuid.UUID, data: ViewInput, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    require(user, "case:edit"); get_visible_case(db, user, case_id)
    view = SavedView(case_id=case_id, **data.model_dump())
    db.add(view); db.flush(); audit(db, user, "view.created", "view", view.id, case_id); db.commit(); db.refresh(view)
    return view


@router.delete("/views/{view_id}", status_code=204)
def delete_view(view_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "case:edit")
    view = db.get(SavedView, view_id)
    if not view: raise HTTPException(404, "Saved view not found")
    get_visible_case(db, user, view.case_id)
    db.delete(view); db.commit()
    return Response(status_code=204)


@router.get("/cases/{case_id}/timeline")
def timeline(case_id: uuid.UUID,
             kind: list[Literal["POST", "TRANSACTION", "DOMAIN_APPEARANCE",
                                "ALIAS_CREATION", "PGP_USAGE", "INFRASTRUCTURE_CHANGE",
                                "ENTITY_OBSERVED", "EVIDENCE_COLLECTED", "AUDIT"]] | None = Query(None),
             start: datetime | None = None, end: datetime | None = None,
             entity_id: uuid.UUID | None = None,
             limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
             db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    if start and end and comparable_utc(start) > comparable_utc(end):
        raise HTTPException(422, "start must not be after end")
    if entity_id:
        found = db.scalar(select(Entity.id).where(Entity.case_id == case_id, Entity.id == entity_id))
        if found is None:
            raise HTTPException(404, "Entity not found")
    events = []
    entity_kinds = {"POST": "POST", "CRYPTO_TRANSACTION": "TRANSACTION",
                    "DOMAIN": "DOMAIN_APPEARANCE", "PGP_KEY": "PGP_USAGE",
                    "INFRASTRUCTURE": "INFRASTRUCTURE_CHANGE", "PERSONA": "ALIAS_CREATION"}
    selected_kinds = set(kind or [])
    page_window = offset + limit
    if not selected_kinds or "EVIDENCE_COLLECTED" in selected_kinds:
        evidence_query = select(Evidence).where(Evidence.case_id == case_id)
        if entity_id:
            from .intelligence import _evidence_linked_to_entity
            evidence_query = evidence_query.where(_evidence_linked_to_entity(db, entity_id))
        if start: evidence_query = evidence_query.where(Evidence.collected_at >= start)
        if end: evidence_query = evidence_query.where(Evidence.collected_at < end)
        for item in db.scalars(evidence_query.order_by(
                Evidence.collected_at.desc(), Evidence.id.desc()).limit(page_window)):
            events.append({"id": item.id, "kind": "EVIDENCE_COLLECTED", "title": item.source,
                           "occurred_at": item.collected_at, "entity_id": entity_id,
                           "evidence_id": item.id})
    wanted_entity_types = (
        [entity_type for entity_type, event_kind in entity_kinds.items()
         if not selected_kinds or event_kind in selected_kinds]
    )
    include_other_entities = not selected_kinds or "ENTITY_OBSERVED" in selected_kinds
    if wanted_entity_types or include_other_entities:
        occurred = func.coalesce(Entity.first_seen, Entity.created_at)
        eq = select(Entity).where(Entity.case_id == case_id)
        if entity_id: eq = eq.where(Entity.id == entity_id)
        if not include_other_entities: eq = eq.where(Entity.type.in_(wanted_entity_types))
        elif selected_kinds and not wanted_entity_types:
            eq = eq.where(Entity.type.notin_(list(entity_kinds)))
        elif selected_kinds:
            eq = eq.where(Entity.type.in_(wanted_entity_types)
                          | Entity.type.notin_(list(entity_kinds)))
        if start: eq = eq.where(occurred >= start)
        if end: eq = eq.where(occurred < end)
        for item in db.scalars(eq.order_by(occurred.desc(), Entity.id.desc()).limit(page_window)):
            events.append({"id": item.id, "kind": entity_kinds.get(item.type, "ENTITY_OBSERVED"),
                           "title": item.value, "occurred_at": item.first_seen or item.created_at,
                           "entity_id": item.id, "evidence_id": None})
    if not selected_kinds or "AUDIT" in selected_kinds:
        audit_query = select(Audit).where(Audit.case_id == case_id)
        if entity_id: audit_query = audit_query.where(Audit.resource_id == str(entity_id))
        if start: audit_query = audit_query.where(Audit.created_at >= start)
        if end: audit_query = audit_query.where(Audit.created_at < end)
        for item in db.scalars(audit_query.order_by(
                Audit.created_at.desc(), Audit.id.desc()).limit(page_window)):
            events.append({"id": item.id, "kind": "AUDIT", "title": item.action,
                           "occurred_at": item.created_at, "entity_id": None,
                           "evidence_id": None})
    events.sort(key=lambda x: (comparable_utc(x["occurred_at"]), x["kind"], str(x["id"])),
                reverse=True)
    return events[offset:offset + limit]


def valid_citations(db: Session, case_id: uuid.UUID, citations: list[uuid.UUID]) -> None:
    try:
        citation_ids = [value if isinstance(value, uuid.UUID) else uuid.UUID(str(value)) for value in citations]
    except ValueError:
        raise HTTPException(422, "Report contains an invalid evidence citation") from None
    found = {str(value) for value in db.scalars(
        select(Evidence.id).where(Evidence.case_id == case_id, Evidence.id.in_(citation_ids))
    )}
    if found != {str(value) for value in citations}:
        raise HTTPException(422, "Reports may cite only evidence in the same case")


@router.get("/cases/{case_id}/reports")
def list_reports(case_id: uuid.UUID, limit: int = Query(100, ge=1, le=200),
                 offset: int = Query(0, ge=0),
                 db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Report).where(Report.case_id == case_id)
                           .order_by(Report.created_at.desc(), Report.id.desc())
                           .offset(offset).limit(limit)))


@router.post("/cases/{case_id}/reports", status_code=201)
def create_report(case_id: uuid.UUID, data: ReportInput, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    require(user, "report:write"); get_visible_case(db, user, case_id)
    valid_citations(db, case_id, data.citations)
    values = data.model_dump()
    values["citations"] = [str(value) for value in values["citations"]]
    # Reports are stored as neutral human-authored drafts. The server validates
    # citations but does not claim to verify every statement in the body.
    report = Report(case_id=case_id, created_by=user.id, hypotheses_marked=False, **values)
    db.add(report); db.flush(); audit(db, user, "REPORT_GENERATED", "report", report.id, case_id); db.commit(); db.refresh(report)
    return report


def get_report(db: Session, user: User, report_id: uuid.UUID) -> Report:
    report = db.get(Report, report_id)
    if not report: raise HTTPException(404, "Report not found")
    get_visible_case(db, user, report.case_id)
    return report


@router.get("/reports/{report_id}")
def read_report(report_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return get_report(db, user, report_id)


@router.patch("/reports/{report_id}")
def update_report(report_id: uuid.UUID, data: ReportUpdate, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    require(user, "report:write")
    report = get_report(db, user, report_id)
    changes = data.model_dump(exclude_unset=True)
    if "citations" in changes:
        valid_citations(db, report.case_id, changes["citations"])
        changes["citations"] = [str(value) for value in changes["citations"]]
    for key, value in changes.items(): setattr(report, key, value)
    audit(db, user, "report.updated", "report", report.id, report.case_id); db.commit(); db.refresh(report)
    return report


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "report:write")
    report = get_report(db, user, report_id)
    db.delete(report); db.commit()
    return Response(status_code=204)


@router.get("/reports/{report_id}/export")
def export_report(report_id: uuid.UUID, format: str = Query(pattern="^(markdown|json|html|csv)$"),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "report:export")
    report = get_report(db, user, report_id)
    valid_citations(db, report.case_id, report.citations)
    warning = (
        "HUMAN-AUTHORED DRAFT: citations were validated, but report statements "
        "have not been independently verified by ARGUS."
    )
    if format == "json":
        content, media = json.dumps({"title": report.title, "body": report.body, "citations": [str(x) for x in report.citations], "hypothesis_notice": warning}), "application/json"
    elif format == "html":
        content = ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
                   f"<title>{html.escape(report.title)}</title><style>body{{font:16px/1.5 sans-serif;"
                   "max-width:900px;margin:3rem auto;padding:0 2rem}}pre{white-space:pre-wrap}"
                   "@media print{body{margin:0;max-width:none}}</style></head><body>"
                   f"<h1>{html.escape(report.title)}</h1><p><strong>{html.escape(warning)}</strong></p>"
                   f"<pre>{html.escape(report.body)}</pre><h2>Evidence citations</h2><ul>"
                   + "".join(f"<li>{html.escape(str(x))}</li>" for x in report.citations)
                   + "</ul></body></html>")
        media = "text/html"
    elif format == "csv":
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(["field", "value"])
        writer.writerow(["title", safe_csv_cell(report.title)])
        writer.writerow(["hypothesis_notice", warning])
        writer.writerow(["body", safe_csv_cell(report.body)])
        for citation in report.citations:
            writer.writerow(["evidence_id", str(citation)])
        content, media = stream.getvalue(), "text/csv"
    else:
        content, media = f"# {report.title}\n\n> **{warning}**\n\n{report.body}\n\n## Evidence citations\n" + "\n".join(f"- `{x}`" for x in report.citations), "text/markdown"
    filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", report.title).strip("-")[:80] or "report"
    audit(db, user, "DATA_EXPORTED", "report", report.id, report.case_id, {"format": format})
    db.commit()
    return {"format": format, "media_type": media, "filename": f"{filename}.{format}", "content": content}


@router.post("/cases/{case_id}/analyze", status_code=202)
def analyze(case_id: uuid.UUID, data: AnalysisInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "analysis:run"); get_visible_case(db, user, case_id)
    if data.evidence_ids:
        valid_citations(db, case_id, data.evidence_ids)
    job = Job(case_id=case_id, mode=data.mode,
              result={"input": {"evidence_ids": [str(value) for value in data.evidence_ids]}}
              if data.evidence_ids else None)
    db.add(job); db.flush(); audit(db, user, "analysis.queued", "job", job.id, case_id); db.commit(); db.refresh(job)
    publish_job(job.id, job.case_id, "QUEUED")
    return job


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    job = db.get(Job, job_id)
    if not job: raise HTTPException(404, "Job not found")
    get_visible_case(db, user, job.case_id)
    return job


@router.get("/cases/{case_id}/jobs")
def list_jobs(case_id: uuid.UUID, limit: int = Query(100, ge=1, le=200),
              offset: int = Query(0, ge=0),
              db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Job).where(Job.case_id == case_id)
                           .order_by(Job.created_at.desc(), Job.id.desc())
                           .offset(offset).limit(limit)))


def _pending_candidate_predicate(dialect_name: str):
    if dialect_name == "postgresql":
        candidates = func.jsonb_array_elements(
            cast(Job.result, JSONB)["candidates"]
        ).table_valued("value")
        decision = cast(candidates.c.value, JSONB)["decision"].as_string()
    else:
        candidates = func.json_each(
            func.json_extract(Job.result, "$.candidates")
        ).table_valued("key", "value")
        decision = func.json_extract(candidates.c.value, "$.decision")
    return exists(select(1).select_from(candidates).where(
        or_(decision.is_(None), decision == "")
    ))


@router.get("/cases/{case_id}/jobs/pending-review")
def list_pending_review_jobs(
    case_id: uuid.UUID, limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0), db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    get_visible_case(db, user, case_id)
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
    query = select(Job).where(
        Job.case_id == case_id, Job.status == "SUCCEEDED",
        Job.mode.in_(["extract", "correlate"]),
        _pending_candidate_predicate(dialect_name),
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    pending = list(db.scalars(
        query.order_by(Job.created_at.desc(), Job.id.desc())
        .offset(offset).limit(limit)
    ))
    return {"items": pending, "total": total,
            "limit": limit, "offset": offset}


@router.get("/cases/{case_id}/compare")
def compare(case_id: uuid.UUID, left: uuid.UUID, right: uuid.UUID, db: Session = Depends(get_db),
            user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    from .modules import current_rules
    rules = current_rules(db, case_id)
    cache_key = f"case:{case_id}:compare:v2:{rules['model_version']}:{left}:{right}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    entities = list(db.scalars(select(Entity).where(Entity.case_id == case_id, Entity.id.in_([left, right]))))
    if len(entities) != 2: raise HTTPException(404, "Comparison entities not found")
    evidence = list(db.scalars(select(Evidence).where(Evidence.case_id == case_id)))
    try:
        from services.argus_analysis import compare_entities
        by_id = {item.id: item for item in entities}
        result = compare_entities(serialize(by_id[left], True), serialize(by_id[right], True),
                                   [serialize(x) for x in evidence], rules["weights"])
        if hasattr(result, "__await__"):
            raise HTTPException(503, "Async comparison is available only through a background job")
        raw_factors = result.get("factors", [])
        unknown = sum(1 for factor in raw_factors if factor.get("score") is None)
        factors = [{"factor": str(factor.get("name", "unknown")),
                    "score": float(factor.get("score") or 0),
                    "explanation": str(factor.get("reason", "")),
                     "evidence_ids": factor.get("evidence_ids", []),
                     "status": factor.get("status", "unknown"),
                     "weight": factor.get("weight", 0),
                     "contribution": factor.get("contribution", 0)} for factor in raw_factors]
        response = {"left_id": left, "right_id": right,
                    "similarity": float(result.get("correlation_score", 0)),
                    "uncertainty": unknown / max(1, len(raw_factors)),
                    "hypothesis": str(result.get("explanation", "Similarity hypothesis only.")),
                     "factors": factors, "model_version": rules["model_version"],
                     "generated_at": result.get("generated_at"),
                     "unknown_factors": result.get("unknown_factors", []),
                     "contradictions": result.get("contradictions", [])}
        cache_set(cache_key, response, ttl=120)
        return response
    except ImportError:
        raise HTTPException(503, "Analysis service unavailable") from None