import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects import postgresql, sqlite

from apps.api.models import Audit, Entity, Evidence, Job, Relationship
from apps.api.routes.intelligence import _evidence_entity_link_predicate
from apps.api.routes.operations import _pending_candidate_predicate


def _case(client):
    response = client.post("/api/argus/cases", json={"title": "Bounded profile fixture"})
    assert response.status_code == 201
    return response.json()


def test_actor_profile_is_case_scoped_and_evidence_cited(client):
    case = _case(client)
    actor = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "ACTOR_HYPOTHESIS", "value": "Hypothesis A",
        "description": "Analyst-authored review note", "metadata": {"notes": "Needs review"},
    }).json()
    persona = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "PERSONA", "value": "Fictional persona",
    }).json()
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture", "content": "Cited observation",
        "reliability": "B", "entity_ids": [actor["id"], persona["id"]],
    }).json()
    relationship = client.post(f"/api/argus/cases/{case['id']}/relationships", json={
        "source_id": actor["id"], "target_id": persona["id"], "type": "POSSIBLY_SAME_AS",
        "confidence": .7, "evidence_ids": [evidence["id"]],
        "explanation": "Reviewable evidence-backed correlation", "attribution": "HUMAN",
    })
    assert relationship.status_code == 201

    response = client.get(f"/api/argus/entities/{actor['id']}/profile")
    assert response.status_code == 200, response.text
    profile = response.json()
    assert profile["actor_hypothesis"]["reviewable_hypothesis"] is True
    assert profile["actor_hypothesis"]["analyst_assigned_confidence"] == actor["confidence"]
    assert profile["actor_hypothesis"]["evidence_ids"] == [evidence["id"]]
    assert profile["actor_hypothesis"]["evidence_strength"][0]["evidence_ids"] == [evidence["id"]]
    assert profile["notes_storage"].endswith("no separate note table.")
    assert {note["source"] for note in profile["notes"]} == {
        "entity.description", "entity.metadata",
    }


def test_timeline_filters_pages_deterministically(client):
    case = _case(client)
    entity = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "DOMAIN", "value": "fixture.example.invalid",
        "first_seen": "2024-01-02T03:04:05Z",
    }).json()
    response = client.get(f"/api/argus/cases/{case['id']}/timeline", params={
        "kind": "DOMAIN_APPEARANCE", "entity_id": entity["id"], "limit": 1, "offset": 0,
        "start": "2024-01-01T00:00:00Z", "end": "2024-01-03T00:00:00Z",
    })
    assert response.status_code == 200, response.text
    assert [event["kind"] for event in response.json()] == ["DOMAIN_APPEARANCE"]
    assert client.get(f"/api/argus/cases/{case['id']}/timeline",
                      params={"limit": 201}).status_code == 422
    assert client.get(f"/api/argus/cases/{case['id']}/timeline",
                      params={"kind": "INVENTED"}).status_code == 422


def test_csv_and_printable_html_exports_are_audited(client, db):
    case = _case(client)
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture", "content": "safe", "reliability": "B",
    }).json()
    report = client.post(f"/api/argus/cases/{case['id']}/reports", json={
        "title": "=unsafe title", "body": "<script>alert(1)</script>",
        "citations": [evidence["id"]],
    }).json()
    csv_export = client.get(f"/api/argus/reports/{report['id']}/export",
                            params={"format": "csv"}).json()
    assert csv_export["media_type"] == "text/csv"
    assert "'=unsafe title" in csv_export["content"]
    html_export = client.get(f"/api/argus/reports/{report['id']}/export",
                             params={"format": "html"}).json()
    assert html_export["content"].startswith("<!doctype html>")
    assert "<script>" not in html_export["content"]
    actions = set(db.query(Audit.action).filter(
        Audit.resource_id == str(uuid.UUID(report["id"]))).all())
    assert ("REPORT_GENERATED",) in actions
    assert ("DATA_EXPORTED",) in actions


def test_actor_profile_two_hops_contradictions_and_cross_case_isolation(client, db, user):
    case, other = _case(client), _case(client)
    actor = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "ACTOR_HYPOTHESIS", "value": "Actor review",
    }).json()
    personas = [client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "PERSONA", "value": f"Persona {index}",
    }).json() for index in range(2)]
    indicator = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "DOMAIN", "value": "two-hop.example.invalid",
    }).json()
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Cited", "content": "observation", "reliability": "B",
    }).json()
    for left, right, kind in (
        (actor, personas[0], "POSSIBLY_SAME_AS"),
        (actor, personas[1], "POSSIBLY_SAME_AS"),
        (personas[0], personas[1], "DENIES_IDENTITY"),
        (personas[0], indicator, "USES"),
    ):
        assert client.post(f"/api/argus/cases/{case['id']}/relationships", json={
            "source_id": left["id"], "target_id": right["id"], "type": kind,
            "confidence": .6, "evidence_ids": [evidence["id"]],
            "explanation": "Cited fixture", "attribution": "HUMAN",
        }).status_code == 201
    foreign = client.post(f"/api/argus/cases/{other['id']}/entities", json={
        "type": "PERSONA", "value": "Must not leak",
    }).json()
    foreign_evidence = client.post(f"/api/argus/cases/{other['id']}/evidence", json={
        "type": "MANUAL", "source": "Other", "content": "other", "reliability": "B",
    }).json()
    db.add(Relationship(
        case_id=uuid.UUID(case["id"]), source_id=uuid.UUID(actor["id"]),
        target_id=uuid.UUID(foreign["id"]), type="SAME_AS", confidence=.9,
        evidence_ids=[foreign_evidence["id"]], explanation="Malformed cross-case legacy row",
        attribution="HUMAN", created_by=user.id,
    ))
    db.commit()

    profile = client.get(f"/api/argus/entities/{actor['id']}/profile").json()
    hypothesis = profile["actor_hypothesis"]
    assert {item["value"] for item in hypothesis["personas"]} == {"Persona 0", "Persona 1"}
    assert hypothesis["indicator_groups"]["DOMAIN"][0]["id"] == indicator["id"]
    assert hypothesis["contradictions"][0]["relationship_type"] == "DENIES_IDENTITY"
    assert all(item["evidence_ids"] == [evidence["id"]]
               for item in hypothesis["evidence_strength"] + hypothesis["contradictions"])
    assert foreign["id"] not in {item["id"] for item in profile["related_entities"]}
    assert foreign_evidence["id"] not in hypothesis["evidence_ids"]


def test_timeline_predicates_precede_caps_and_page_boundaries(client, db):
    case = _case(client)
    case_id = uuid.UUID(case["id"])
    occurred = datetime(2024, 2, 1, 12, tzinfo=timezone.utc)
    domains = [
        Entity(case_id=case_id, type="DOMAIN", value=f"{index}.example.invalid",
               first_seen=occurred, confidence=.5)
        for index in range(3)
    ]
    noise = [Entity(case_id=case_id, type="USERNAME", value=f"noise-{index}", confidence=.5)
             for index in range(205)]
    db.add_all(domains + noise)
    db.commit()
    expected = [str(item.id) for item in sorted(domains, key=lambda item: str(item.id), reverse=True)]
    pages = [
        client.get(f"/api/argus/cases/{case['id']}/timeline", params={
            "kind": "DOMAIN_APPEARANCE", "limit": 1, "offset": offset,
            "start": "2024-02-01T00:00:00Z", "end": "2024-02-02T00:00:00Z",
        }).json()
        for offset in range(3)
    ]
    assert [page[0]["id"] for page in pages] == expected
    assert client.get(f"/api/argus/cases/{case['id']}/timeline", params={
        "kind": "DOMAIN_APPEARANCE", "start": "2024-02-02T00:00:00Z",
        "end": "2024-02-03T00:00:00Z",
    }).json() == []


def test_pending_review_jobs_preserve_old_queues_and_paginate(client, db):
    case = _case(client)
    case_id = uuid.UUID(case["id"])
    old = [
        Job(case_id=case_id, mode=mode, status="SUCCEEDED",
            result={"review_required": True, "candidates": [
                {"id": f"candidate-{index}", "kind": "entity"}
            ]})
        for index, mode in enumerate(("extract", "correlate", "extract"))
    ]
    decided = Job(case_id=case_id, mode="extract", status="SUCCEEDED",
                  result={"candidates": [{"id": "done", "decision": "rejected"}]})
    newer_module = Job(case_id=case_id, mode="module", status="SUCCEEDED",
                       result={"module": "wallet"})
    db.add_all(old + [decided, newer_module])
    db.commit()
    first = client.get(f"/api/argus/cases/{case['id']}/jobs/pending-review",
                       params={"limit": 2, "offset": 0}).json()
    second = client.get(f"/api/argus/cases/{case['id']}/jobs/pending-review",
                        params={"limit": 2, "offset": 2}).json()
    assert first["total"] == 3
    assert len(first["items"]) == 2 and len(second["items"]) == 1
    assert {item["id"] for item in first["items"] + second["items"]} == {
        str(item.id) for item in old
    }


def test_csv_formula_neutralization_after_control_whitespace(client):
    case = _case(client)
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture", "content": "safe", "reliability": "B",
    }).json()
    attacks = ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\t=cmd", "\r\n+cmd", "\x1f@cmd"]
    for attack in attacks:
        report = client.post(f"/api/argus/cases/{case['id']}/reports", json={
            "title": attack, "body": attack, "citations": [evidence["id"]],
        }).json()
        exported = client.get(f"/api/argus/reports/{report['id']}/export",
                              params={"format": "csv"}).json()["content"]
        assert "'" + attack in exported


def test_json_predicates_compile_per_dialect_and_sqlite_matches(db):
    entity_id = uuid.uuid4()
    pg_evidence = str(select(Evidence.id).where(
        _evidence_entity_link_predicate("postgresql", entity_id)
    ).compile(dialect=postgresql.dialect()))
    sqlite_evidence = str(select(Evidence.id).where(
        _evidence_entity_link_predicate("sqlite", entity_id)
    ).compile(dialect=sqlite.dialect()))
    pg_pending = str(select(Job.id).where(
        _pending_candidate_predicate("postgresql")
    ).compile(dialect=postgresql.dialect()))
    sqlite_pending = str(select(Job.id).where(
        _pending_candidate_predicate("sqlite")
    ).compile(dialect=sqlite.dialect()))
    assert "@>" in pg_evidence and " LIKE " not in pg_evidence
    assert "json_each" in sqlite_evidence
    assert "jsonb_array_elements" in pg_pending
    assert "json_each" in sqlite_pending

    linked = Evidence(
        case_id=uuid.uuid4(), type="MANUAL", source="direct", content="x",
        collector_id=uuid.uuid4(), content_hash="a" * 64, reliability="B",
        entity_ids=[str(entity_id)],
    )
    unlinked = Evidence(
        case_id=linked.case_id, type="MANUAL", source="other", content="x",
        collector_id=uuid.uuid4(), content_hash="b" * 64, reliability="B",
        entity_ids=[str(uuid.uuid4())],
    )
    db.add_all([linked, unlinked])
    db.commit()
    assert list(db.scalars(select(Evidence.id).where(
        _evidence_entity_link_predicate("sqlite", entity_id)
    ))) == [linked.id]


def test_array_lists_reach_old_records_with_offsets(client, db):
    case = _case(client)
    entities = [client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "USERNAME", "value": f"ordered-{index}",
    }).json() for index in range(3)]
    evidence = [client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": f"source-{index}", "content": "x", "reliability": "B",
    }).json() for index in range(3)]
    reports = [client.post(f"/api/argus/cases/{case['id']}/reports", json={
        "title": f"report-{index}", "body": "x", "citations": [evidence[0]["id"]],
    }).json() for index in range(3)]
    jobs = [Job(case_id=uuid.UUID(case["id"]), mode="extract", status="QUEUED")
            for _ in range(3)]
    db.add_all(jobs)
    db.commit()

    paths = (
        (f"/api/argus/cases/{case['id']}/entities", entities),
        (f"/api/argus/cases/{case['id']}/evidence", evidence),
        (f"/api/argus/cases/{case['id']}/reports", reports),
        (f"/api/argus/cases/{case['id']}/jobs", jobs),
    )
    for path, created in paths:
        whole = client.get(path, params={"limit": 3, "offset": 0}).json()
        pages = [client.get(path, params={"limit": 1, "offset": offset}).json()[0]
                 for offset in range(3)]
        assert [item["id"] for item in pages] == [item["id"] for item in whole]
        assert {item["id"] for item in pages} == {
            str(item.id) if hasattr(item, "id") else item["id"] for item in created
        }
        assert client.get(path, params={"offset": -1}).status_code == 422


def test_nightglass_same_person_support_is_cited(client):
    seeded = client.post("/api/argus/seed")
    assert seeded.status_code == 201, seeded.text
    case_id = seeded.json()["id"]
    entities = client.get(f"/api/argus/cases/{case_id}/entities",
                          params={"limit": 500}).json()
    actor = next(item for item in entities if item["type"] == "ACTOR_HYPOTHESIS")
    profile = client.get(f"/api/argus/entities/{actor['id']}/profile").json()
    support = next(item for item in profile["actor_hypothesis"]["evidence_strength"]
                   if item["relationship_type"] == "SAME_PERSON_AS")
    assert support["evidence_ids"]
    assert set(support["evidence_ids"]) <= {item["id"] for item in profile["evidence"]}