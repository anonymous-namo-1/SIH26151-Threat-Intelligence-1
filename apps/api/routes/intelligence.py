import hashlib
import uuid
from collections import deque

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import String, cast, exists, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from ..auth import current_user
from ..database import get_db
from ..models import Audit, Case, Entity, Evidence, Relationship, SavedView, User
from ..rbac import audit, get_visible_case, require, visible_cases_query
from ..redis_service import invalidate_case
from ..schemas import (EntityInput, EntityOut, EntityUpdate, EvidenceInput, EvidenceOut,
                       EvidenceUpdate, RelationshipInput, RelationshipOut, RelationshipUpdate,
                       EntityProfile)

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
def list_entities(case_id: uuid.UUID, limit: int = Query(100, ge=1, le=500),
                  offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Entity).where(Entity.case_id == case_id)
                           .order_by(Entity.created_at.desc(), Entity.id.desc())
                           .offset(offset).limit(limit)))


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


def _profile_event(entity: Entity) -> dict:
    kinds = {
        "POST": "POST", "CRYPTO_TRANSACTION": "TRANSACTION",
        "DOMAIN": "DOMAIN_APPEARANCE", "PGP_KEY": "PGP_USAGE",
        "INFRASTRUCTURE": "INFRASTRUCTURE_CHANGE",
        "PERSONA": "ALIAS_CREATION",
    }
    return {"id": entity.id, "kind": kinds.get(entity.type, "ENTITY_OBSERVED"),
            "title": entity.value, "occurred_at": entity.first_seen or entity.created_at,
            "entity_id": entity.id, "evidence_id": None}


def _evidence_entity_link_predicate(dialect_name: str, entity_id: uuid.UUID):
    value = str(entity_id)
    if dialect_name == "postgresql":
        # The model's portable JSON comparator would compile contains() as LIKE.
        # An explicit JSONB cast guarantees PostgreSQL's indexed @> semantics.
        return cast(Evidence.entity_ids, JSONB).contains([value])
    values = func.json_each(Evidence.entity_ids).table_valued("key", "value")
    return exists(select(1).select_from(values).where(
        cast(values.c.value, String) == value
    ))


def _evidence_linked_to_entity(db: Session, entity_id: uuid.UUID):
    dialect_name = db.bind.dialect.name if db.bind is not None else "sqlite"
    return _evidence_entity_link_predicate(dialect_name, entity_id)


def _validated_relationship_evidence(
    relationships: list[Relationship], evidence: list[Evidence],
) -> dict[uuid.UUID, list[str]]:
    actual = {str(item.id) for item in evidence}
    return {
        relationship.id: sorted({
            str(value) for value in (relationship.evidence_ids or [])
            if str(value) in actual
        })
        for relationship in relationships
    }


@router.get("/entities/{entity_id}/profile", response_model=EntityProfile)
def entity_profile(entity_id: uuid.UUID, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    entity = get_entity(db, user, entity_id)
    case_entity_ids = select(Entity.id).where(Entity.case_id == entity.case_id)
    direct_relationships = list(db.scalars(
        select(Relationship).where(
            Relationship.case_id == entity.case_id,
            Relationship.source_id.in_(case_entity_ids),
            Relationship.target_id.in_(case_entity_ids),
            or_(Relationship.source_id == entity.id, Relationship.target_id == entity.id))
        .order_by(Relationship.created_at.desc(), Relationship.id).limit(200)))
    direct_ids = {
        r.target_id if r.source_id == entity.id else r.source_id
        for r in direct_relationships
    }
    direct_related = list(db.scalars(
        select(Entity).where(Entity.case_id == entity.case_id, Entity.id.in_(direct_ids))
        .order_by(Entity.created_at.desc(), Entity.id))) if direct_ids else []
    relationships = direct_relationships
    related = direct_related
    if entity.type == "ACTOR_HYPOTHESIS":
        persona_ids = [item.id for item in direct_related if item.type == "PERSONA"][:100]
        persona_relationships = list(db.scalars(
            select(Relationship).where(
                Relationship.case_id == entity.case_id,
                Relationship.source_id.in_(case_entity_ids),
                Relationship.target_id.in_(case_entity_ids),
                or_(Relationship.source_id.in_(persona_ids),
                    Relationship.target_id.in_(persona_ids)))
            .order_by(Relationship.created_at.desc(), Relationship.id).limit(400)
        )) if persona_ids else []
        by_id = {item.id: item for item in direct_relationships}
        for item in persona_relationships:
            by_id.setdefault(item.id, item)
        relationships = list(by_id.values())[:400]
        two_hop_ids = {
            endpoint for rel in persona_relationships
            for endpoint in (rel.source_id, rel.target_id)
            if endpoint != entity.id
        }
        related = list(db.scalars(
            select(Entity).where(Entity.case_id == entity.case_id,
                                 Entity.id.in_(direct_ids | two_hop_ids))
            .order_by(Entity.created_at.desc(), Entity.id).limit(400)))
    raw_evidence_ids = {str(value) for r in relationships for value in (r.evidence_ids or [])}
    relationship_evidence_ids = []
    for value in raw_evidence_ids:
        try:
            relationship_evidence_ids.append(uuid.UUID(value))
        except (ValueError, TypeError):
            continue
    evidence = list(db.scalars(
        select(Evidence).where(
            Evidence.case_id == entity.case_id,
            or_(Evidence.id.in_(relationship_evidence_ids),
                _evidence_linked_to_entity(db, entity.id)))
        .order_by(Evidence.collected_at.desc(), Evidence.id).limit(200)))
    validated_evidence = _validated_relationship_evidence(relationships, evidence)
    visible_ids = visible_cases_query(user).with_only_columns(Case.id).subquery()
    related_cases = list(db.execute(
        select(Case.id, Case.title).join(Entity, Entity.case_id == Case.id).where(
            Case.id.in_(select(visible_ids.c.id)), Case.id != entity.case_id,
            Entity.type == entity.type, Entity.value == entity.value)
        .order_by(Case.updated_at.desc(), Case.id).limit(25)).all())
    activity = list(db.scalars(
        select(Audit).where(Audit.case_id == entity.case_id,
                            or_(Audit.resource_id == str(entity.id),
                                Audit.resource_id.in_([str(r.id) for r in relationships])))
        .order_by(Audit.created_at.desc(), Audit.id).limit(100)))
    notes = []
    if entity.description:
        notes.append({"source": "entity.description", "key": None, "value": entity.description})
    metadata_notes = entity.extra_metadata.get("notes") if isinstance(entity.extra_metadata, dict) else None
    if metadata_notes is not None:
        notes.append({"source": "entity.metadata", "key": "notes", "value": metadata_notes})
    timeline = [_profile_event(entity)] + [
        {"id": row.id, "kind": "EVIDENCE_COLLECTED", "title": row.source,
         "occurred_at": row.collected_at, "entity_id": entity.id, "evidence_id": row.id}
        for row in evidence]
    actor = None
    if entity.type == "ACTOR_HYPOTHESIS":
        personas = [item for item in related if item.type == "PERSONA"]
        groups: dict[str, list[Entity]] = {}
        for item in related:
            if item.type != "PERSONA":
                groups.setdefault(item.type, []).append(item)
        strengths, contradictions = [], []
        contradiction_types = {"CONTRADICTS", "DISTINCT_FROM", "NOT_SAME_AS", "DENIES_IDENTITY"}
        identity_types = {"SAME_AS", "POSSIBLY_SAME_AS", "SAME_PERSON_AS"}
        persona_ids = {item.id for item in personas}
        for rel in relationships:
            cited = validated_evidence.get(rel.id, [])
            if not cited:
                continue
            relevant_identity = (
                rel.source_id == entity.id or rel.target_id == entity.id
                or (rel.source_id in persona_ids and rel.target_id in persona_ids)
            )
            if not relevant_identity or rel.type not in contradiction_types | identity_types:
                continue
            conclusion = {"relationship_id": rel.id, "relationship_type": rel.type,
                          "confidence": rel.confidence, "explanation": rel.explanation,
                          "evidence_ids": cited}
            (contradictions if rel.type in contradiction_types else strengths).append(conclusion)
        actor = {
            "reviewable_hypothesis": True,
            "caution": ("Reviewable hypothesis only. Correlation is not identity, culpability, "
                        "or a basis for labeling any real individual a criminal."),
            "analyst_assigned_confidence": entity.confidence,
            "personas": personas, "indicator_groups": groups,
            "evidence_strength": strengths, "contradictions": contradictions,
            "evidence_ids": sorted({uuid.UUID(x) for values in validated_evidence.values()
                                    for x in values}, key=str),
        }
    return {
        "entity": entity, "confidence": entity.confidence, "metadata": entity.extra_metadata,
        "relationships": relationships, "evidence": evidence,
        "timeline": sorted(timeline, key=lambda x: (x["occurred_at"], str(x["id"])), reverse=True),
        "activity": [{"id": x.id, "action": x.action, "created_at": x.created_at,
                      "resource_type": x.resource_type, "resource_id": x.resource_id}
                     for x in activity],
        "related_entities": related,
        "related_cases": [{"id": row.id, "title": row.title} for row in related_cases],
        "notes": notes,
        "notes_storage": "Entity description and metadata; no separate note table.",
        "actor_hypothesis": actor,
    }


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
def list_evidence(case_id: uuid.UUID, limit: int = Query(100, ge=1, le=500),
                  offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Evidence).where(Evidence.case_id == case_id)
                           .order_by(Evidence.created_at.desc(), Evidence.id.desc())
                           .offset(offset).limit(limit)))


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
def list_relationships(case_id: uuid.UUID, limit: int = Query(200, ge=1, le=500),
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    return list(db.scalars(select(Relationship).where(Relationship.case_id == case_id)
                           .order_by(Relationship.created_at.desc(), Relationship.id).limit(limit)))


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
           node_limit: int = Query(500, ge=1, le=1000),
           edge_limit: int = Query(1000, ge=1, le=2000),
          db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_visible_case(db, user, case_id)
    eq = select(Entity).where(Entity.case_id == case_id, Entity.confidence >= min_confidence)
    if entity_type: eq = eq.where(Entity.type == entity_type)
    eq = eq.order_by(Entity.confidence.desc(), Entity.created_at.desc(), Entity.id)
    node_rows = list(db.scalars(eq.limit(node_limit + 1)))
    nodes, nodes_truncated = node_rows[:node_limit], len(node_rows) > node_limit
    node_ids = {n.id for n in nodes}
    rq = select(Relationship).where(Relationship.case_id == case_id,
                                    Relationship.confidence >= min_confidence,
                                    Relationship.source_id.in_(node_ids),
                                    Relationship.target_id.in_(node_ids))
    if relationship_type: rq = rq.where(Relationship.type == relationship_type)
    rq = rq.order_by(Relationship.confidence.desc(), Relationship.created_at.desc(), Relationship.id)
    edge_rows = list(db.scalars(rq.limit(edge_limit + 1)))
    return {"nodes": [EntityOut.model_validate(n) for n in nodes],
            "edges": [RelationshipOut.model_validate(r) for r in edge_rows[:edge_limit]],
            "truncation": {"truncated": nodes_truncated or len(edge_rows) > edge_limit,
                           "nodes_truncated": nodes_truncated,
                           "edges_truncated": len(edge_rows) > edge_limit,
                           "node_limit": node_limit, "edge_limit": edge_limit}}


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