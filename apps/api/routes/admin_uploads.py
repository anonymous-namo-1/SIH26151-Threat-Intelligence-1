import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..auth import current_user, require_broker_scope
from ..config import get_settings
from ..database import get_db
from ..models import Audit, Case, Entity, Evidence, Role, Upload, User
from ..rbac import audit, get_visible_case, require, visible_cases_query
from ..redis_service import invalidate_case
from ..schemas import CaseOut, EntityInput, EvidenceOut, UserOut
from ..seed_service import create_fictional_case

router = APIRouter()
SEALED_PATH = re.compile(r"^/objects/sealed/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class UserUpdate(BaseModel):
    role: Role
    active: bool | None = None


class UploadInput(BaseModel):
    case_id: uuid.UUID
    object_path: str = Field(min_length=1, max_length=2000)
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0, le=5 * 1024 * 1024)
    content_type: str = Field(min_length=1, max_length=255)

    @classmethod
    def validate_path(cls, path: str) -> str:
        return path


class ExtractedEntity(BaseModel):
    type: str = Field(min_length=1, max_length=40)
    value: str = Field(min_length=1, max_length=2000)


class UploadFinalize(BaseModel):
    content: str = Field(max_length=5 * 1024 * 1024)
    content_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    sealed_object_path: str
    source: str = Field(min_length=1, max_length=2000)
    source_url: HttpUrl | None = None
    collected_at: datetime | None = None
    reliability: str = Field(pattern=r"^(A|B|C|D|E|F|UNKNOWN|LOW|MEDIUM|HIGH|VERIFIED)$")
    notes: str = Field("", max_length=20000)
    entities: list[ExtractedEntity] = Field(default_factory=list, max_length=1000)

    @field_validator("sealed_object_path")
    @classmethod
    def sealed_path_only(cls, value: str) -> str:
        if not SEALED_PATH.fullmatch(value):
            raise ValueError("must be /objects/sealed/<uuid>")
        return value


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "users:manage")
    return list(db.scalars(select(User).order_by(User.created_at)))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, data: UserUpdate, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    require(user, "users:manage")
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        # Serialize all administrator-role changes before counting admins.
        db.execute(text("SELECT pg_advisory_xact_lock(1095910734)"))
    target = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if not target: raise HTTPException(404, "User not found")
    db.refresh(target)
    removes_admin = target.role == Role.ADMIN and (data.role != Role.ADMIN or data.active is False)
    if removes_admin:
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == Role.ADMIN, User.active.is_(True))) or 0
        if admins <= 1: raise HTTPException(409, "Cannot remove or disable the last administrator")
    target.role = data.role
    if data.active is not None: target.active = data.active
    audit(db, user, "user.updated", "user", target.id, metadata={"role": target.role.value, "active": target.active})
    db.commit(); db.refresh(target)
    return target


@router.get("/audit")
def list_audit(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
               case_id: uuid.UUID | None = None, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    visible_ids = visible_cases_query(user).with_only_columns(Case.id).subquery()
    query = select(Audit).where((Audit.case_id.is_(None)) | (Audit.case_id.in_(select(visible_ids.c.id))))
    if case_id:
        get_visible_case(db, user, case_id); query = query.where(Audit.case_id == case_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(query.order_by(Audit.created_at.desc()).offset(offset).limit(limit)))
    return {"items": [{"id": x.id, "actor_id": x.actor_id, "case_id": x.case_id, "action": x.action,
                       "resource_type": x.resource_type, "resource_id": x.resource_id,
                       "created_at": x.created_at, "metadata": x.extra_metadata} for x in items],
            "total": total, "limit": limit, "offset": offset}


@router.post("/uploads", status_code=201, dependencies=[Depends(require_broker_scope)])
def create_upload(data: UploadInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "evidence:write"); get_visible_case(db, user, data.case_id)
    if data.size > get_settings().max_upload_bytes: raise HTTPException(413, "Upload exceeds configured size limit")
    if ".." in data.object_path.split("/") or "\x00" in data.object_path:
        raise HTTPException(422, "Invalid object path")
    ticket = Upload(**data.model_dump(), owner_id=user.id)
    db.add(ticket); db.flush(); audit(db, user, "upload.created", "upload", ticket.id, data.case_id); db.commit(); db.refresh(ticket)
    return ticket


def visible_ticket(db: Session, user: User, upload_id: uuid.UUID) -> Upload:
    ticket = db.get(Upload, upload_id)
    if not ticket: raise HTTPException(404, "Upload ticket not found")
    get_visible_case(db, user, ticket.case_id)
    if ticket.owner_id != user.id and user.role not in (Role.ADMIN, Role.LEAD_INVESTIGATOR):
        raise HTTPException(404, "Upload ticket not found")
    return ticket


@router.get("/uploads/{upload_id}", dependencies=[Depends(require_broker_scope)])
def get_upload(upload_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return visible_ticket(db, user, upload_id)


@router.post("/uploads/{upload_id}/finalize", response_model=EvidenceOut, status_code=201,
             dependencies=[Depends(require_broker_scope)])
def finalize_upload(upload_id: uuid.UUID, data: UploadFinalize, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    require(user, "evidence:write")
    ticket = db.scalar(select(Upload).where(Upload.id == upload_id).with_for_update())
    if not ticket:
        raise HTTPException(404, "Upload ticket not found")
    get_visible_case(db, user, ticket.case_id)
    if ticket.owner_id != user.id and user.role not in (Role.ADMIN, Role.LEAD_INVESTIGATOR):
        raise HTTPException(404, "Upload ticket not found")
    if ticket.state == "FINALIZED":
        evidence = db.get(Evidence, ticket.evidence_id)
        if evidence is None:
            raise HTTPException(409, "Finalized upload is missing its evidence record")
        return evidence
    if ticket.state != "PENDING":
        raise HTTPException(409, "Upload is not pending")
    if not SEALED_PATH.fullmatch(data.sealed_object_path):
        raise HTTPException(422, "sealed_object_path must be an immutable sealed UUID path")
    evidence = Evidence(case_id=ticket.case_id, type="DOCUMENT", source=data.source,
                        source_url=str(data.source_url) if data.source_url else None,
                        collected_at=data.collected_at or datetime.now(timezone.utc), collector_id=user.id,
                        content_hash=data.content_hash.lower(), content=data.content, notes=data.notes,
                        reliability=data.reliability, entity_ids=[],
                        object_path=data.sealed_object_path)
    db.add(evidence); db.flush()
    entity_ids = []
    for extracted in data.entities:
        entity = Entity(case_id=ticket.case_id, type=extracted.type, value=extracted.value,
                        source=f"Evidence {evidence.id}", confidence=0.5,
                        description="Extracted indicator; association is evidence-scoped, not attribution.")
        db.add(entity); db.flush(); entity_ids.append(str(entity.id))
    evidence.entity_ids = entity_ids
    ticket.state, ticket.evidence_id = "FINALIZED", evidence.id
    audit(db, user, "upload.finalized", "evidence", evidence.id, ticket.case_id,
          {"upload_id": str(ticket.id), "entity_count": len(entity_ids)})
    db.commit(); db.refresh(evidence); invalidate_case(ticket.case_id)
    return evidence


@router.post("/seed", response_model=CaseOut, status_code=201)
def seed(db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "seed")
    try:
        case = create_fictional_case(db, user)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    audit(db, user, "workspace.seeded", "case", case.id, case.id, {"fictional": True})
    db.commit(); db.refresh(case)
    return case