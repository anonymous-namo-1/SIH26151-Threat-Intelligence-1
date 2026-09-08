import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Audit, Case, Role, User, case_assignments


PERMISSIONS = {
    Role.ADMIN: {"case:create", "case:edit", "case:delete", "evidence:write", "analysis:run", "report:write", "report:export", "users:manage", "seed"},
    Role.LEAD_INVESTIGATOR: {"case:create", "case:edit", "case:delete", "evidence:write", "analysis:run", "report:write", "report:export", "seed"},
    Role.INVESTIGATOR: {"case:create", "case:edit", "evidence:write", "analysis:run", "report:write", "report:export", "seed"},
    Role.ANALYST: {"evidence:write", "analysis:run"},
    Role.VIEWER: set(),
}


def require(user: User, permission: str) -> None:
    if permission not in PERMISSIONS[user.role]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Permission required: {permission}")


def visible_cases_query(user: User):
    query = select(Case)
    if user.role not in (Role.ADMIN, Role.LEAD_INVESTIGATOR):
        assigned = select(case_assignments.c.case_id).where(case_assignments.c.user_id == user.id)
        query = query.where(or_(Case.created_by_id == user.id, Case.id.in_(assigned)))
    return query


def get_visible_case(db: Session, user: User, case_id: uuid.UUID) -> Case:
    case = db.scalar(visible_cases_query(user).where(Case.id == case_id))
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


def audit(db: Session, user: User, action: str, resource_type: str, resource_id: object,
          case_id: uuid.UUID | None = None, metadata: dict | None = None) -> None:
    db.add(Audit(actor_id=user.id, case_id=case_id, action=action, resource_type=resource_type,
                 resource_id=str(resource_id), extra_metadata=metadata or {}))
