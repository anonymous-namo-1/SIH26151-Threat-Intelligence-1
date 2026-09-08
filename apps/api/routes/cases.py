import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..database import get_db
from ..models import Audit, Case, Entity, Evidence, Job, Relationship, User
from ..rbac import PERMISSIONS, audit, get_visible_case, require, visible_cases_query
from ..schemas import CaseInput, CaseOut, CaseUpdate, EntityOut, UserOut

router = APIRouter()


def with_users(query):
    return query.options(selectinload(Case.created_by), selectinload(Case.assignments))


def assignments(db: Session, ids: list[uuid.UUID]) -> list[User]:
    users = list(db.scalars(select(User).where(User.id.in_(ids), User.active.is_(True)))) if ids else []
    if len(users) != len(set(ids)):
        raise HTTPException(422, "One or more assigned users do not exist")
    return users


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"user": UserOut.model_validate(user), "permissions": sorted(PERMISSIONS[user.role])}


@router.get("/cases")
def list_cases(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
               status_filter: str | None = Query(None, alias="status"),
               db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = visible_cases_query(user)
    if status_filter:
        query = query.where(Case.status == status_filter)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(with_users(query).order_by(Case.updated_at.desc()).offset(offset).limit(limit)).unique())
    return {"items": [CaseOut.model_validate(x) for x in items], "total": total, "limit": limit, "offset": offset}


@router.post("/cases", response_model=CaseOut, status_code=201)
def create_case(data: CaseInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "case:create")
    case = Case(**data.model_dump(exclude={"assignment_ids"}), created_by_id=user.id)
    case.assignments = assignments(db, data.assignment_ids)
    db.add(case)
    db.flush()
    audit(db, user, "case.created", "case", case.id, case.id)
    db.commit()
    db.refresh(case)
    return case


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    case = get_visible_case(db, user, case_id)
    _ = case.created_by, case.assignments
    return case


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: uuid.UUID, data: CaseUpdate, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    require(user, "case:edit")
    case = get_visible_case(db, user, case_id)
    changes = data.model_dump(exclude_unset=True, exclude={"assignment_ids"})
    for key, value in changes.items():
        setattr(case, key, value)
    if "assignment_ids" in data.model_fields_set:
        case.assignments = assignments(db, data.assignment_ids or [])
    audit(db, user, "case.updated", "case", case.id, case.id, {"fields": sorted(data.model_fields_set)})
    db.commit()
    db.refresh(case)
    return case


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "case:delete")
    case = get_visible_case(db, user, case_id)
    audit(db, user, "case.deleted", "case", case.id, case.id)
    db.delete(case)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(current_user)):
    ids = visible_cases_query(user).with_only_columns(Case.id).subquery()
    all_cases = list(db.scalars(with_users(visible_cases_query(user)).order_by(Case.updated_at.desc()).limit(5)).unique())
    total = db.scalar(select(func.count()).select_from(ids)) or 0
    opened = db.scalar(select(func.count()).select_from(Case).where(Case.id.in_(select(ids.c.id)), Case.status.notin_(["CLOSED", "ARCHIVED"]))) or 0
    evidence = db.scalar(select(func.count()).select_from(Evidence).where(Evidence.case_id.in_(select(ids.c.id)))) or 0
    entities = db.scalar(select(func.count()).select_from(Entity).where(Entity.case_id.in_(select(ids.c.id)))) or 0
    critical = db.scalar(select(func.count()).select_from(Case).where(
        Case.id.in_(select(ids.c.id)), Case.priority == "CRITICAL",
        Case.status.notin_(["CLOSED", "ARCHIVED"]))) or 0
    relationships = db.scalar(select(func.count()).select_from(Relationship).where(
        Relationship.case_id.in_(select(ids.c.id)))) or 0
    review_results = db.scalars(select(Job.result).where(
        Job.case_id.in_(select(ids.c.id)), Job.status == "SUCCEEDED",
        Job.result["review_required"].as_boolean().is_(True)))
    pending = sum(sum(not candidate.get("decision") for candidate in (result or {}).get("candidates", []))
                  for result in review_results)
    activity = db.scalars(select(Audit).where(Audit.case_id.in_(select(ids.c.id)))
                         .order_by(Audit.created_at.desc()).limit(10))
    correlations = db.scalars(select(Job).where(
        Job.case_id.in_(select(ids.c.id)), Job.mode == "module", Job.status == "SUCCEEDED",
        Job.result["module"].as_string() == "persona",
        Job.result["confidence"].as_float() >= 70).order_by(Job.created_at.desc()).limit(10))
    return {"total_cases": total, "open_cases": opened, "evidence_count": evidence,
            "entity_count": entities, "recent_cases": [CaseOut.model_validate(x) for x in all_cases],
            "critical_cases": critical, "relationship_count": relationships, "pending_reviews": pending,
            "recent_activity": [{"id": item.id, "case_id": item.case_id, "action": item.action,
                                 "created_at": item.created_at} for item in activity],
            "high_confidence_correlations": [
                {"job_id": item.id, "case_id": item.case_id, "confidence": item.result["confidence"],
                 "explanation": item.result["explanation"], "generated_at": item.result["generated_at"]}
                for item in correlations if item.result.get("evidence_ids")]}


@router.get("/search")
def search(q: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db),
           user: User = Depends(current_user)):
    pattern = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
    case_query = with_users(visible_cases_query(user).where(
        Case.title.ilike(pattern, escape="\\"))).limit(25)
    cases = list(db.scalars(case_query).unique())
    ids = visible_cases_query(user).with_only_columns(Case.id).subquery()
    entities = list(db.scalars(select(Entity).where(
        Entity.case_id.in_(select(ids.c.id)),
        Entity.value.ilike(pattern, escape="\\"),
    ).limit(100)))
    groups = [{"type": kind, "entities": [EntityOut.model_validate(e) for e in entities if e.type == kind]}
              for kind in sorted({e.type for e in entities})]
    return {"query": q, "cases": [CaseOut.model_validate(c) for c in cases], "groups": groups}
@router.get("/capabilities")
def capabilities():
    from ..config import get_settings
    from ..redis_service import status as redis_status
    settings = get_settings()
    try:
        import services.argus_analysis  # noqa: F401
        analysis = True
    except ImportError:
        analysis = False
    redis_available, _ = redis_status()
    return {"analysis": analysis, "redis_notifications": redis_available,
            "storage_uploads": True, "max_upload_bytes": settings.max_upload_bytes}