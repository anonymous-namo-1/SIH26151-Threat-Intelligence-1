import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from services.argus_analysis.assistant import ask_case_assistant
from services.argus_analysis.errors import InvalidAIResponseError, MissingAIConfigurationError

from ..auth import current_user
from ..database import get_db
from ..models import Entity, Evidence, Relationship, User
from ..rbac import audit, get_visible_case, require

router = APIRouter()


class AssistantInput(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AssistantQuote(BaseModel):
    evidence_id: str
    quote: str


class AssistantFinding(BaseModel):
    text: str
    evidence_ids: list[str]
    quotes: list[AssistantQuote] = Field(default_factory=list)


class AssistantResponse(BaseModel):
    status: str
    answer: str
    findings: list[AssistantFinding]
    evidence_ids: list[str]
    uncertainties: list[str]
    model_version: str
    generated_at: str


@router.post("/cases/{case_id}/assistant", response_model=AssistantResponse)
async def ask_assistant(
    case_id: uuid.UUID,
    data: AssistantInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    require(user, "analysis:run")
    get_visible_case(db, user, case_id)
    if not data.question.strip():
        raise HTTPException(422, "Question must not be blank")
    evidence_rows = list(db.scalars(
        select(Evidence)
        .where(Evidence.case_id == case_id)
        .order_by(Evidence.collected_at.desc())
        .limit(50)
    ))
    entity_rows = list(db.scalars(
        select(Entity).where(Entity.case_id == case_id).limit(100)
    ))
    relationship_rows = list(db.scalars(
        select(Relationship).where(Relationship.case_id == case_id).limit(100)
    ))
    evidence = [{
        "id": str(item.id),
        "source": item.source,
        "reliability": item.reliability,
        "text": "\n".join(value for value in (item.content, item.notes) if value),
    } for item in evidence_rows]
    entities = [{"id": str(item.id), "type": item.type, "value": item.value} for item in entity_rows]
    relationships = [{
        "source_id": str(item.source_id),
        "target_id": str(item.target_id),
        "type": item.type,
        "evidence_ids": item.evidence_ids or [],
    } for item in relationship_rows]

    # Record that a query occurred, but never retain question or evidence content.
    audit(
        db, user, "assistant.queried", "case", case_id, case_id,
        metadata={
            "evidence_count": len(evidence),
            "entity_count": len(entities),
            "relationship_count": len(relationships),
        },
    )
    db.commit()
    try:
        result = await ask_case_assistant(data.question, evidence, entities, relationships)
    except TimeoutError as exc:
        raise HTTPException(
            503, "Case assistant timed out before producing a validated answer; retry the request"
        ) from exc
    except MissingAIConfigurationError as exc:
        raise HTTPException(503, str(exc)) from exc
    except InvalidAIResponseError as exc:
        raise HTTPException(502, f"Assistant response failed evidence validation: {exc}") from exc
    except Exception as exc:
        raise HTTPException(503, "Case assistant provider is unavailable") from exc
    result["generated_at"] = datetime.now(timezone.utc).isoformat()
    return result