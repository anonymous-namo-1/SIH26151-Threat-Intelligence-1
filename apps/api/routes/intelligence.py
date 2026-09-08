import hashlib
import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import Entity, Evidence, Relationship, SavedView, User
from ..rbac import audit, get_visible_case, require
from ..redis_service import invalidate_case
from ..schemas import (EntityInput, EntityOut, EntityUpdate, EvidenceInput, EvidenceOut,
                       EvidenceUpdate, RelationshipInput, RelationshipOut, RelationshipUpdate)

router = APIRouter()


def get_entity(db: Session, user: User, entity_id: uuid.UUID) -> Entity:
    entity = db.get(Entity, entity_id)
    if not entity:
        raise HTTPException(404, "Entity not found")
    get_visible_case(db, user, entity.case_id)
    return entity


def get_evidence(db: Session, user: User, evidence_id: uuid.UUID) -> Evidence:
    evidence = db.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(404, "Evidence not found")
    get_visible_case(db, user, evidence.case_id)
    return evidence


def validate_entity_refs(db: Session, case_id: uuid.UUID, ids: list[uuid.UUID]) -> None:
    if not ids:
        return
    count = len(list(db.scalars(select(Entity.id).where(Entity.case_id == case_id, Entity.id.in_(ids)))))
    if count != len(set(ids)):
        raise HTTPException(422, "Every entity reference must belong to this case")


def validate_evidence_refs(db: Session, case_id: uuid.UUID, ids: list[uuid.UUID]) -> None:
    if not ids:
        raise HTTPException(422, "At least one evidence reference is required")
    found = len(list(db.scalars(select(Evidence.id).where(Evidence.case_id == case_id, Evidence.id.in_(ids)))))
    if found != len(set(ids)):
        raise HTTPException(422, "Every evidence reference must belong to this case")


@router.get("/cases/{case_id}/entities", response_model=list[EntityOut])
def list_entities(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Entity).where(Entity.case_id == case_id).order_by(Entity.created_at)))


@router.post("/cases/{case_id}/entities", response_model=EntityOut, status_code=201)
def create_entity(case_id: uuid.UUID, data: EntityInput, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    require(user, "case:edit")
    get_visible_case(db, user, case_id)
    values = data.model_dump()
    values["extra_metadata"] = values.pop("metadata")
    entity = Entity(case_id=case_id, **values)
    db.add(entity); db.flush()
    audit(db, user, "entity.created", "entity", entity.id, case_id)
    db.commit(); db.refresh(entity); invalidate_case(case_id)
    return entity


@router.get("/entities/{entity_id}", response_model=EntityOut)
def read_entity(entity_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return get_entity(db, user, entity_id)


@router.patch("/entities/{entity_id}", response_model=EntityOut)
def update_entity(entity_id: uuid.UUID, data: EntityUpdate, db: Session = Depends(get_db),
                  user: User = Depends(current_user)):
    require(user, "case:edit")
    entity = get_entity(db, user, entity_id)
    changes = data.model_dump(exclude_unset=True)
    if "metadata" in changes:
        changes["extra_metadata"] = changes.pop("metadata")
    for key, value in changes.items():
        setattr(entity, key, value)
    audit(db, user, "entity.updated", "entity", entity.id, entity.case_id)
    db.commit(); db.refresh(entity); invalidate_case(entity.case_id)
    return entity


@router.get("/cases/{case_id}/evidence", response_model=list[EvidenceOut])
def list_evidence(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.created_at)))


@router.post("/cases/{case_id}/evidence", response_model=EvidenceOut, status_code=201)
def create_evidence(case_id: uuid.UUID, data: EvidenceInput, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    require(user, "evidence:write")
    get_visible_case(db, user, case_id)
    validate_entity_refs(db, case_id, data.entity_ids)
    values = data.model_dump()
    content = values["content"]
    values["entity_ids"] = [str(value) for value in values["entity_ids"]]
    values["source_url"] = str(values["source_url"]) if values["source_url"] else None
    values["collected_at"] = values["collected_at"] or __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    evidence = Evidence(case_id=case_id, collector_id=user.id,
                        content_hash=hashlib.sha256(content.encode()).hexdigest(), **values)
    db.add(evidence); db.flush()
    audit(db, user, "evidence.created", "evidence", evidence.id, case_id)
    db.commit(); db.refresh(evidence); invalidate_case(case_id)
    return evidence


@router.get("/evidence/{evidence_id}", response_model=EvidenceOut)
def read_evidence(evidence_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return get_evidence(db, user, evidence_id)


@router.patch("/evidence/{evidence_id}", response_model=EvidenceOut)
def update_evidence(evidence_id: uuid.UUID, data: EvidenceUpdate, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    require(user, "evidence:write")
    evidence = get_evidence(db, user, evidence_id)
    changes = data.model_dump(exclude_unset=True)
    if "entity_ids" in changes:
        validate_entity_refs(db, evidence.case_id, changes["entity_ids"])
        changes["entity_ids"] = [str(value) for value in changes["entity_ids"]]
    for key, value in changes.items():
        setattr(evidence, key, value)
    audit(db, user, "evidence.updated", "evidence", evidence.id, evidence.case_id)
    db.commit(); db.refresh(evidence); invalidate_case(evidence.case_id)
    return evidence


@router.get("/cases/{case_id}/relationships", response_model=list[RelationshipOut])
def list_relationships(case_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Relationship).where(Relationship.case_id == case_id)))


@router.post("/cases/{case_id}/relationships", response_model=RelationshipOut, status_code=201)
def create_relationship(case_id: uuid.UUID, data: RelationshipInput, db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    require(user, "case:edit")
    get_visible_case(db, user, case_id)
    validate_entity_refs(db, case_id, [data.source_id, data.target_id])
    validate_evidence_refs(db, case_id, data.evidence_ids)
    values = data.model_dump()
    values["evidence_ids"] = [str(value) for value in values["evidence_ids"]]
    rel = Relationship(case_id=case_id, created_by=user.id, **values)
    db.add(rel); db.flush()
    audit(db, user, "relationship.created", "relationship", rel.id, case_id)
    db.commit(); db.refresh(rel); invalidate_case(case_id)
    return rel


def get_relationship(db: Session, user: User, rel_id: uuid.UUID) -> Relationship:
    rel = db.get(Relationship, rel_id)
    if not rel:
        raise HTTPException(404, "Relationship not found")
    get_visible_case(db, user, rel.case_id)
    return rel


@router.patch("/relationships/{relationship_id}", response_model=RelationshipOut)
def update_relationship(relationship_id: uuid.UUID, data: RelationshipUpdate,
                        db: Session = Depends(get_db), user: User = Depends(current_user)):
    require(user, "case:edit")
    rel = get_relationship(db, user, relationship_id)
    changes = data.model_dump(exclude_unset=True)
    if "evidence_ids" in changes:
        validate_evidence_refs(db, rel.case_id, changes["evidence_ids"])
        changes["evidence_ids"] = [str(value) for value in changes["evidence_ids"]]
    for key, value in changes.items(): setattr(rel, key, value)
    audit(db, user, "relationship.updated", "relationship", rel.id, rel.case_id)
    db.commit(); db.refresh(rel); invalidate_case(rel.case_id)
    return rel


@router.delete("/relationships/{relationship_id}", status_code=204)
def delete_relationship(relationship_id: uuid.UUID, db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    require(user, "case:edit")
    rel = get_relationship(db, user, relationship_id)
    audit(db, user, "relationship.deleted", "relationship", rel.id, rel.case_id)
    case_id = rel.case_id
    db.delete(rel); db.commit(); invalidate_case(case_id)
    return Response(status_code=204)


@router.get("/cases/{case_id}/graph")
def graph(case_id: uuid.UUID, min_confidence: float = Query(0, ge=0, le=1),
          entity_type: str | None = None, relationship_type: str | None = None,
          db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    eq = select(Entity).where(Entity.case_id == case_id, Entity.confidence >= min_confidence)
    if entity_type: eq = eq.where(Entity.type == entity_type)
    nodes = list(db.scalars(eq))
    node_ids = {n.id for n in nodes}
    rq = select(Relationship).where(Relationship.case_id == case_id,
                                    Relationship.confidence >= min_confidence,
                                    Relationship.source_id.in_(node_ids),
                                    Relationship.target_id.in_(node_ids))
    if relationship_type: rq = rq.where(Relationship.type == relationship_type)
    return {"nodes": [EntityOut.model_validate(n) for n in nodes],
            "edges": [RelationshipOut.model_validate(r) for r in db.scalars(rq)]}


@router.get("/cases/{case_id}/path")
def find_path(case_id: uuid.UUID, source: uuid.UUID, target: uuid.UUID,
              min_confidence: float = Query(0, ge=0, le=1), db: Session = Depends(get_db),
              user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    validate_entity_refs(db, case_id, [source, target])
    rels = list(db.scalars(select(Relationship).where(Relationship.case_id == case_id,
                                                       Relationship.confidence >= min_confidence)))
    adjacency: dict[uuid.UUID, list[tuple[uuid.UUID, Relationship]]] = {}
    for rel in rels:
        adjacency.setdefault(rel.source_id, []).append((rel.target_id, rel))
        adjacency.setdefault(rel.target_id, []).append((rel.source_id, rel))
    queue, prior = deque([source]), {source: None}
    used: dict[uuid.UUID, Relationship] = {}
    while queue and target not in prior:
        node = queue.popleft()
        for nxt, rel in adjacency.get(node, []):
            if nxt not in prior: prior[nxt] = node; used[nxt] = rel; queue.append(nxt)
    if target not in prior: return {"found": False, "nodes": [], "edges": []}
    ids, edges, cur = [], [], target
    while cur is not None:
        ids.append(cur)
        if cur != source: edges.append(used[cur])
        cur = prior[cur]
    entities = {e.id: e for e in db.scalars(select(Entity).where(Entity.id.in_(ids)))}
    ids.reverse(); edges.reverse()
    return {"found": True, "nodes": [EntityOut.model_validate(entities[x]) for x in ids],
            "edges": [RelationshipOut.model_validate(x) for x in edges]}