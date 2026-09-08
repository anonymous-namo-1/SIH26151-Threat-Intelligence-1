import uuid
from datetime import datetime, timedelta, timezone

from apps.api.models import Audit, Entity, Evidence, Job, Relationship
from apps.api.worker import process


def _case(client):
    response = client.post("/api/argus/cases", json={
        "title": "Review fixture", "description": "", "priority": "MEDIUM",
        "classification": "UNCLASSIFIED",
    })
    assert response.status_code == 201
    return response.json()


def _extract_job(db, case_id):
    token = uuid.uuid4()
    job = Job(
        case_id=case_id, mode="extract", status="RUNNING", attempts=1,
        lease_token=token,
        lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(job)
    db.commit()
    process(job.id, token)
    db.expire_all()
    return db.get(Job, job.id)


def test_review_accept_is_idempotent_and_uses_server_citations(client, db):
    case = _case(client)
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture",
        "content": "Contact review@example.invalid", "reliability": "B",
    }).json()
    job = _extract_job(db, uuid.UUID(case["id"]))
    candidate = next(item for item in job.result["candidates"] if item["kind"] == "entity")

    payload = {"decisions": [{
        "candidate_id": candidate["id"], "action": "accept",
        "value": "edited@example.invalid",
    }]}
    first = client.post(f"/api/argus/jobs/{job.id}/review", json=payload)
    assert first.status_code == 200, first.text
    second = client.post(f"/api/argus/jobs/{job.id}/review", json=payload)
    assert second.status_code == 200, second.text

    entities = list(db.query(Entity).filter(Entity.case_id == uuid.UUID(case["id"])))
    assert len(entities) == 1
    assert entities[0].value == "edited@example.invalid"
    db.refresh(db.get(Evidence, uuid.UUID(evidence["id"])))
    assert str(entities[0].id) in db.get(Evidence, uuid.UUID(evidence["id"])).entity_ids
    assert db.query(Audit).filter(Audit.action == "analysis.candidate.accepted").count() >= 1


def test_relationship_candidate_requires_accepted_entity_refs(client, db):
    case = _case(client)
    client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture",
        "content": "review@example.invalid and 192.0.2.10", "reliability": "B",
    })
    job = _extract_job(db, uuid.UUID(case["id"]))
    relationship = next(item for item in job.result["candidates"] if item["kind"] == "relationship")
    rejected = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": relationship["id"], "action": "accept"}],
    })
    assert rejected.status_code == 422
    assert db.query(Relationship).count() == 0

    refs = [relationship["source_ref"], relationship["target_ref"]]
    partial = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": refs[0], "action": "accept",
                       "value": "reviewed-partial-value"}],
    })
    assert partial.status_code == 200, partial.text
    still_blocked = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": relationship["id"], "action": "accept"}],
    })
    assert still_blocked.status_code == 422

    second_entity = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": refs[1], "action": "accept"}],
    })
    assert second_entity.status_code == 200, second_entity.text
    relationship_payload = {"decisions": [{
        "candidate_id": relationship["id"], "action": "accept",
        "type": "RELATED_TO", "explanation": "Reviewed co-mention",
    }]}
    accepted = client.post(f"/api/argus/jobs/{job.id}/review", json=relationship_payload)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["result"]["review_required"] is False
    retried = client.post(f"/api/argus/jobs/{job.id}/review", json=relationship_payload)
    assert retried.status_code == 200, retried.text
    assert db.query(Relationship).count() == 1


def test_rejected_candidate_cannot_later_be_accepted(client, db):
    case = _case(client)
    client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture",
        "content": "reject-me.example.invalid", "reliability": "B",
    })
    job = _extract_job(db, uuid.UUID(case["id"]))
    candidate = next(item for item in job.result["candidates"] if item["kind"] == "entity")
    rejected = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": candidate["id"], "action": "reject"}],
    })
    assert rejected.status_code == 200, rejected.text
    retried = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": candidate["id"], "action": "reject"}],
    })
    assert retried.status_code == 200, retried.text
    conflict = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{"candidate_id": candidate["id"], "action": "accept"}],
    })
    assert conflict.status_code == 409
    assert db.query(Entity).filter(Entity.case_id == uuid.UUID(case["id"])).count() == 0


def test_review_snapshot_is_persisted_when_entity_is_deduplicated(client, db):
    case = _case(client)
    case_id = uuid.UUID(case["id"])
    existing = Entity(
        case_id=case_id, type="DOMAIN", value="edited.example",
        source="Existing reviewed record", confidence=0.8,
    )
    db.add(existing)
    db.commit()
    client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture",
        "content": "original.example", "reliability": "B",
    })
    job = _extract_job(db, case_id)
    candidate = next(item for item in job.result["candidates"] if item["kind"] == "entity")
    original_value = candidate["value"]
    response = client.post(f"/api/argus/jobs/{job.id}/review", json={
        "decisions": [{
            "candidate_id": candidate["id"], "action": "accept",
            "type": "DOMAIN", "value": "EDITED.EXAMPLE",
            "explanation": "Reviewed against the existing domain record",
        }],
    })
    assert response.status_code == 200, response.text
    reviewed = next(
        item for item in response.json()["result"]["candidates"]
        if item["id"] == candidate["id"]
    )
    assert reviewed["value"] == original_value
    assert reviewed["reason"] == candidate["reason"]
    assert reviewed["reviewed_type"] == "DOMAIN"
    assert reviewed["reviewed_value"] == "EDITED.EXAMPLE"
    assert reviewed["reviewed_explanation"] == "Reviewed against the existing domain record"
    assert reviewed["entity_id"] == str(existing.id)
    assert db.query(Entity).filter(Entity.case_id == case_id).count() == 1
    db.refresh(existing)
    provenance = existing.extra_metadata["analysis_reviews"][0]
    assert provenance["original_value"] == original_value
    assert provenance["reviewed_value"] == "EDITED.EXAMPLE"
    assert provenance["reviewed_explanation"] == "Reviewed against the existing domain record"


def test_worker_preserves_case_sensitive_candidate_distinctions_without_saving(client, db):
    case = _case(client)
    case_id = uuid.UUID(case["id"])
    client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture",
        "content": (
            "https://example.invalid/Path https://example.invalid/path "
            "CaseSensitive@example.invalid casesensitive@example.invalid"
        ),
        "reliability": "B",
    })
    job = _extract_job(db, case_id)
    entities = [item for item in job.result["candidates"] if item["kind"] == "entity"]
    assert len([item for item in entities if item["type"] == "URL"]) == 2
    assert len([item for item in entities if item["type"] == "EMAIL"]) == 2
    assert len({item["id"] for item in entities}) == len(entities)
    assert db.query(Entity).filter(Entity.case_id == case_id).count() == 0