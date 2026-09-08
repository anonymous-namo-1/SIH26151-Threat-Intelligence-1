"""Case-scoped, deterministic analysis with traceable input versions."""
import hashlib
import json
import math
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from services.argus_analysis.modules import DEFAULT_WEIGHTS, MODEL_VERSION, run_module

from ..auth import current_user
from ..database import get_db
from ..models import Case, Entity, Evidence, Job, Relationship, User
from ..rbac import audit, get_visible_case, require
from ..redis_service import invalidate_case
from .operations import serialize

router = APIRouter()


class ModuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module: Literal["persona", "stylometry", "temporal", "wallet", "infrastructure",
                    "alias", "relationship", "reliability", "contradiction", "timeline"]
    left_id: uuid.UUID | None = None
    right_id: uuid.UUID | None = None
    entity_id: uuid.UUID | None = None
    corpus_left: str = Field("", max_length=50000)
    corpus_right: str = Field("", max_length=50000)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None

    @model_validator(mode="after")
    def valid_inputs(self):
        if self.start and self.end and self.start > self.end:
            raise ValueError("Start must precede end")
        if self.module == "persona" and (
            not self.left_id or not self.right_id or self.left_id == self.right_id
        ):
            raise ValueError("Select two different case entities")
        if self.module == "stylometry" and (not self.corpus_left.strip() or not self.corpus_right.strip()):
            raise ValueError("Supply both text corpora")
        return self


class ScoringRuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weights: dict[str, float]

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, weights):
        if not weights or set(weights) - set(DEFAULT_WEIGHTS):
            raise ValueError("Supply only recognized scoring rule names")
        if any(not math.isfinite(value) or not -50 <= value <= 50 for value in weights.values()):
            raise ValueError("Weights must be finite values between -50 and 50")
        if any(value > 0 for name, value in weights.items() if name.startswith("conflicting_")):
            raise ValueError("Contradiction weights cannot increase confidence")
        if any(value < 0 for name, value in weights.items() if not name.startswith("conflicting_")):
            raise ValueError("Supporting factors must have nonnegative weights")
        return weights


def current_rules(db: Session, case_id: uuid.UUID) -> dict:
    job = db.scalar(select(Job).where(Job.case_id == case_id, Job.mode == "scoring_rules",
                                    Job.status == "SUCCEEDED").order_by(Job.created_at.desc()).limit(1))
    if job and job.result:
        return job.result
    return {"weights": DEFAULT_WEIGHTS, "model_version": MODEL_VERSION, "updated_at": None}


@router.get("/cases/{case_id}/scoring-rules")
def get_rules(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return current_rules(db, case_id)


@router.put("/cases/{case_id}/scoring-rules")
def save_rules(case_id: uuid.UUID, data: ScoringRuleInput, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    require(user, "case:edit")
    require(user, "analysis:run")
    get_visible_case(db, user, case_id)
    db.scalar(select(Case).where(Case.id == case_id).with_for_update())
    weights = {**current_rules(db, case_id)["weights"], **data.weights}
    digest = hashlib.sha256(json.dumps(weights, sort_keys=True).encode()).hexdigest()[:12]
    result = {"weights": weights, "model_version": f"{MODEL_VERSION}:{digest}",
              "updated_at": datetime.now(timezone.utc).isoformat()}
    job = Job(case_id=case_id, mode="scoring_rules", status="SUCCEEDED", result=result)
    db.add(job)
    db.flush()
    audit(db, user, "analysis.rules_updated", "job", job.id, case_id,
          {"model_version": result["model_version"]})
    db.commit()
    invalidate_case(case_id)
    return result


def case_inputs(db: Session, case_id: uuid.UUID):
    # Fetch one extra record and reject oversized synchronous runs instead of
    # silently claiming to have analyzed a complete case.
    groups = []
    for model in (Entity, Evidence, Relationship):
        rows = list(db.scalars(select(model).where(model.case_id == case_id)
                              .order_by(model.created_at, model.id).limit(1001)))
        if len(rows) > 1000:
            raise HTTPException(422, "Interactive analysis supports at most 1,000 records per category; split the case.")
        groups.append(rows)
    return groups


@router.post("/cases/{case_id}/modules")
def analyze_module(case_id: uuid.UUID, data: ModuleInput, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    require(user, "analysis:run")
    get_visible_case(db, user, case_id)
    entities, evidence, relationships = case_inputs(db, case_id)
    requested = {value for value in (data.left_id, data.right_id, data.entity_id) if value}
    if requested - {item.id for item in entities}:
        raise HTTPException(404, "Analysis entity not found in this case")
    if sum(len(item.content or "") for item in evidence) > 5_000_000:
        raise HTTPException(422, "Interactive case analysis is limited to 5 MB of parsed text.")
    rules = current_rules(db, case_id)
    options = data.model_dump(mode="json", exclude_none=True)
    options["rules"] = rules["weights"]
    if data.module == "stylometry":
        options["corpus_left"] = [data.corpus_left]
        options["corpus_right"] = [data.corpus_right]
    try:
        result = run_module(
            data.module,
            jsonable_encoder([serialize(item, True) for item in entities]),
            jsonable_encoder([serialize(item) for item in evidence]),
            jsonable_encoder([serialize(item) for item in relationships]),
            options,
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    result["model_version"] = rules["model_version"]
    result["data"]["scoring_rules"] = rules["weights"] if data.module == "persona" else None
    result["data"]["input_counts"] = {"entities": len(entities), "evidence": len(evidence),
                                     "relationships": len(relationships)}
    result["data"]["selection"] = {key: options[key] for key in (
        "left_id", "right_id", "entity_id", "start", "end"
    ) if key in options}
    result["data"]["evidence_versions"] = [
        {"id": str(item.id), "sha256": item.content_hash} for item in evidence
    ]
    if data.module == "stylometry":
        result["data"]["provenance_notice"] = (
            "Investigator-supplied corpora, not linked case evidence. Similarity does not establish authorship."
        )
        result["data"]["corpus_sha256"] = {
            "left": hashlib.sha256(data.corpus_left.encode()).hexdigest(),
            "right": hashlib.sha256(data.corpus_right.encode()).hexdigest(),
        }
    result = jsonable_encoder(result)
    job = Job(case_id=case_id, mode="module", status="SUCCEEDED", result=result)
    db.add(job)
    db.flush()
    result["job_id"] = str(job.id)
    job.result = {**result}
    audit(db, user, "analysis.module_completed", "job", job.id, case_id,
          {"module": data.module, "model_version": rules["model_version"]})
    db.commit()
    return result