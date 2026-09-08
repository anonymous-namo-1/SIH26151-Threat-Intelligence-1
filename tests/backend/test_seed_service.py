"""Disposable SQLite integration coverage for the opt-in Nightglass seed."""

from sqlalchemy import func, select

from apps.api.models import Case, Entity, Evidence, Relationship
from apps.api.seed_service import FICTION_NOTICE, TITLE, create_fictional_case
from services.argus_analysis.modules import run_module


def _rows(db, model, case_id):
    return list(db.scalars(select(model).where(model.case_id == case_id)))


def _module_rows(entities, evidence, relationships):
    entity_data = [
        {
            "id": str(item.id), "type": item.type, "value": item.value,
            "aliases": item.aliases, "description": item.description,
            "metadata": item.extra_metadata,
        }
        for item in entities
    ]
    evidence_data = [
        {
            "id": str(item.id), "source": item.source, "content_hash": item.content_hash,
            "content": item.content, "entity_ids": item.entity_ids,
            "observed_at": item.collected_at.isoformat(),
        }
        for item in evidence
    ]
    relationship_data = [
        {
            "id": str(item.id), "source_id": str(item.source_id),
            "target_id": str(item.target_id), "type": item.type,
            "evidence_ids": item.evidence_ids,
        }
        for item in relationships
    ]
    return entity_data, evidence_data, relationship_data


def test_nightglass_seed_is_complete_and_evidence_first(db, user):
    case = create_fictional_case(db, user)
    db.commit()

    entities = _rows(db, Entity, case.id)
    evidence = _rows(db, Evidence, case.id)
    relationships = _rows(db, Relationship, case.id)
    by_value = {item.value: item for item in entities}
    valid_citations = {str(item.id) for item in evidence}

    assert case.title == TITLE
    assert len(entities) >= 20
    assert len(evidence) >= 10
    assert len(relationships) >= 20
    assert {"NullRaven", "CipherWolf", "GreyMerchant"} <= set(by_value)
    assert {"PERSONA", "ACTOR_HYPOTHESIS", "DOMAIN", "IP_ADDRESS", "CRYPTO_WALLET",
            "PGP_KEY", "FORUM_POST", "MESSAGE", "CRYPTO_TRANSACTION"} <= {
                item.type for item in entities
            }
    assert all(item.attribution == "HUMAN" for item in relationships)
    assert all(item.evidence_ids and set(item.evidence_ids) <= valid_citations
               for item in relationships)
    assert not any(item.type == "SIGNED_WITH" for item in relationships)
    pgp_ids = {item.id for item in entities if item.type == "PGP_KEY"}
    assert all(
        item.type == "MENTIONED" and "signing is not established" in item.explanation
        for item in relationships
        if item.target_id in pgp_ids
    )
    assert all(item.content_hash and len(item.content_hash) == 64 for item in evidence)
    assert all("example.invalid" in item.value for item in entities if item.type == "DOMAIN")
    assert all("INVALID" in item.value for item in entities if item.type == "CRYPTO_WALLET")
    assert all(item.extra_metadata.get("valid_key") is False
               for item in entities if item.type == "PGP_KEY")
    assert FICTION_NOTICE in case.notes

    entity_data, evidence_data, relationship_data = _module_rows(
        entities, evidence, relationships
    )
    contradiction = run_module(
        "contradiction", entity_data, evidence_data, relationship_data, {}
    )
    assert any(
        finding["kind"] == "conflicting_identity_claims"
        and {str(by_value["NullRaven"].id), str(by_value["CipherWolf"].id)}
        == set(finding["entity_ids"])
        and finding["evidence_ids"]
        for finding in contradiction["data"]["findings"]
    )


def test_seed_supplies_all_fourteen_demo_flow_preconditions_without_ai(db, user):
    case = create_fictional_case(db, user)
    db.commit()
    entities = _rows(db, Entity, case.id)
    evidence = _rows(db, Evidence, case.id)
    relationships = _rows(db, Relationship, case.id)
    by_value = {item.value: item for item in entities}
    entity_data, evidence_data, relationship_data = _module_rows(
        entities, evidence, relationships
    )

    # These are data preconditions only: no route, provider, or live AI is invoked.
    assert user in case.assignments  # 1. assigned user can open the case
    assert case.title == "Operation Nightglass"  # 2. expected case exists
    assert "NullRaven" in by_value  # 3. exact search target exists
    assert by_value["NullRaven"].type == "PERSONA"  # 4. persona profile target
    assert len(relationships) >= 20  # 5. useful relationship graph
    assert any(
        item.source_id == by_value["NullRaven"].id
        and item.target_id == by_value["CipherWolf"].id
        for item in relationships
    )  # 6. another possible persona is discoverable

    cluster = by_value["Nightglass Cluster #NG-1042"]
    personas = {by_value[name].id for name in ("NullRaven", "CipherWolf", "GreyMerchant")}
    actor_edges = [
        item for item in relationships
        if item.source_id == cluster.id and item.target_id in personas
    ]
    persona_indicator_edges = [
        item for item in relationships
        if item.source_id in personas and item.target_id not in personas
    ]
    competing_edges = [
        item for item in relationships
        if {item.source_id, item.target_id}
        == {by_value["NullRaven"].id, by_value["CipherWolf"].id}
        and item.type in {"SAME_PERSON_AS", "DISTINCT_FROM"}
    ]
    assert len(actor_edges) == 3 and all(item.evidence_ids for item in actor_edges)
    assert persona_indicator_edges and all(item.evidence_ids for item in persona_indicator_edges)
    assert {item.type for item in competing_edges} == {"SAME_PERSON_AS", "DISTINCT_FROM"}
    assert all(item.evidence_ids for item in competing_edges)

    persona = run_module(
        "persona", entity_data, evidence_data, relationship_data,
        {"left_id": str(by_value["NullRaven"].id), "right_id": str(by_value["CipherWolf"].id)},
    )
    assert persona["module"] == "persona"  # 7. correlation input pair
    assert persona["confidence"] > 0  # 8. explainable nonzero score
    assert persona["evidence_ids"]  # 9. supporting evidence

    contradiction = run_module(
        "contradiction", entity_data, evidence_data, relationship_data, {}
    )
    assert contradiction["data"]["findings"]  # 10. competing cited hypotheses

    wallet = run_module(
        "wallet", entity_data, evidence_data, relationship_data,
        {"entity_id": str(by_value["NG-DEMO-WALLET-A-INVALID"].id)},
    )
    assert wallet["data"]["transaction_count"] >= 2  # 11. transaction graph

    timeline = run_module("timeline", entity_data, evidence_data, relationship_data, {})
    assert timeline["data"]["observation_count"] >= 7  # 12. timeline
    assert len(evidence) >= 10 and all(item.content for item in evidence)  # 13. assistant context
    assert (
        db.scalar(select(func.count()).select_from(Evidence).where(Evidence.case_id == case.id))
        and all(item.evidence_ids for item in relationships)
    )  # 14. cited report source material


def test_seed_refuses_duplicate_for_same_user_without_partial_writes(db, user):
    first = create_fictional_case(db, user)
    db.commit()
    counts = tuple(
        db.scalar(select(func.count()).select_from(model).where(model.case_id == first.id))
        for model in (Entity, Evidence, Relationship)
    )

    try:
        create_fictional_case(db, user)
    except ValueError as exc:
        assert "already exists for this user" in str(exc)
    else:
        raise AssertionError("duplicate seed should be refused")

    assert db.scalar(
        select(func.count()).select_from(Case).where(
            Case.created_by_id == user.id, Case.title == TITLE
        )
    ) == 1
    assert counts == tuple(
        db.scalar(select(func.count()).select_from(model).where(model.case_id == first.id))
        for model in (Entity, Evidence, Relationship)
    )