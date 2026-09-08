import uuid
import base64
import hashlib
import hmac
import json
import time
import secrets
from datetime import datetime, timedelta, timezone

from apps.api.auth import current_user
from apps.api.models import Entity, Job, Relationship, Role, User


def create_case(client, title="Investigation"):
    response = client.post("/api/argus/cases", json={"title": title})
    assert response.status_code == 201, response.text
    return response.json()


def signed_headers(method, path, body: bytes, scope="broker"):
    identity = {
        "sub": "clerk_test_owner", "name": "Owner", "exp": int(time.time()) + 30,
        "method": method, "path": path, "scope": scope,
        "body_sha256": hashlib.sha256(body).hexdigest(),
        "nonce": secrets.token_urlsafe(24),
        "request_id": str(uuid.uuid4()),
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(identity, separators=(",", ":")).encode()
    ).decode().rstrip("=")
    signature = hmac.new(b"test-only-session-secret", encoded.encode(), hashlib.sha256).hexdigest()
    return {"x-argus-identity": encoded, "x-argus-signature": signature,
            "x-request-id": identity["request_id"],
            "content-type": "application/json"}


def test_injection_text_is_data(client):
    case = create_case(client, "'; DROP TABLE argus_cases; --")
    response = client.get("/api/argus/search", params={"q": "DROP TABLE"})
    assert response.status_code == 200
    assert response.json()["cases"][0]["id"] == case["id"]


def test_viewer_cannot_mutate(client, user):
    user.role = Role.VIEWER
    response = client.post("/api/argus/cases", json={"title": "Denied"})
    assert response.status_code == 403


def test_cross_user_case_denial(client, db, user):
    case = create_case(client)
    outsider = User(clerk_sub="clerk_outsider", name="Other", role=Role.INVESTIGATOR)
    db.add(outsider); db.commit()
    from apps.api.main import app
    app.dependency_overrides[current_user] = lambda: outsider
    assert client.get(f"/api/argus/cases/{case['id']}").status_code == 404


def test_relationship_requires_same_case_evidence(client):
    first, second = create_case(client, "First"), create_case(client, "Second")
    entity_ids = []
    for value in ("alice", "bob"):
        result = client.post(f"/api/argus/cases/{first['id']}/entities",
                             json={"type": "USERNAME", "value": value})
        entity_ids.append(result.json()["id"])
    evidence = client.post(f"/api/argus/cases/{second['id']}/evidence", json={
        "type": "MANUAL", "source": "Authorized note", "content": "test", "reliability": "B"
    }).json()
    result = client.post(f"/api/argus/cases/{first['id']}/relationships", json={
        "source_id": entity_ids[0], "target_id": entity_ids[1], "type": "LINKED_TO",
        "confidence": 0.5, "evidence_ids": [evidence["id"]],
        "explanation": "Training hypothesis", "attribution": "HUMAN"
    })
    assert result.status_code == 422


def test_breadth_first_shortest_path(client):
    case = create_case(client)
    entities = [client.post(f"/api/argus/cases/{case['id']}/entities",
                            json={"type": "USERNAME", "value": str(i)}).json() for i in range(3)]
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Training graph", "content": "edges", "reliability": "B"
    }).json()
    for left, right in ((0, 1), (1, 2)):
        assert client.post(f"/api/argus/cases/{case['id']}/relationships", json={
            "source_id": entities[left]["id"], "target_id": entities[right]["id"],
            "type": "LINKED_TO", "confidence": .9, "evidence_ids": [evidence["id"]],
            "explanation": "Evidence-backed training edge", "attribution": "HUMAN"
        }).status_code == 201
    path = client.get(f"/api/argus/cases/{case['id']}/path", params={
        "source": entities[0]["id"], "target": entities[2]["id"], "min_confidence": .5
    }).json()
    assert path["found"] is True
    assert len(path["edges"]) == 2


def test_report_citations_and_html_escape(client):
    case = create_case(client)
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Training", "content": "safe", "reliability": "B"
    }).json()
    report = client.post(f"/api/argus/cases/{case['id']}/reports", json={
        "title": "<script>alert(1)</script>", "body": "<img src=x onerror=alert(1)>",
        "citations": [evidence["id"]]
    }).json()
    exported = client.get(f"/api/argus/reports/{report['id']}/export", params={"format": "html"}).json()
    assert "<script>" not in exported["content"]
    assert "&lt;script&gt;" in exported["content"]


def test_analysis_comparison_shape_is_mapped_to_contract(client):
    case = create_case(client)
    left = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "PERSONA", "value": "Fictional Alpha", "description": "shared training words"
    }).json()
    right = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "PERSONA", "value": "Fictional Beta", "description": "shared training words"
    }).json()
    response = client.get(f"/api/argus/cases/{case['id']}/compare", params={
        "left": left["id"], "right": right["id"]
    })
    assert response.status_code == 200, response.text
    comparison = response.json()
    assert 0 <= comparison["similarity"] <= 1
    assert 0 <= comparison["uncertainty"] <= 1
    assert comparison["hypothesis"]
    assert all({"factor", "score", "explanation", "evidence_ids"} <= set(item)
               for item in comparison["factors"])


def test_seed_builds_diverse_evidence_backed_graph(client):
    seeded = client.post("/api/argus/seed")
    assert seeded.status_code == 201, seeded.text
    case_id = seeded.json()["id"]
    graph = client.get(f"/api/argus/cases/{case_id}/graph").json()
    types = {node["type"] for node in graph["nodes"]}
    assert {"PERSONA", "ACTOR_HYPOTHESIS", "CRYPTO_WALLET", "DOMAIN", "PGP_KEY"} <= types
    assert graph["edges"]
    assert all(edge["evidence_ids"] and edge["explanation"] for edge in graph["edges"])


def test_uploads_require_broker_scope_and_exact_body_hash(client):
    case = create_case(client)
    path = "/api/argus/uploads"
    payload = {"case_id": case["id"], "object_path": "/incoming/test", "name": "test.txt",
               "size": 4, "content_type": "text/plain"}
    body = json.dumps(payload, separators=(",", ":")).encode()
    public = client.post(path, content=body, headers=signed_headers("POST", path, body, "public"))
    assert public.status_code == 403
    bad_body = body + b" "
    mismatch = client.post(path, content=bad_body, headers=signed_headers("POST", path, body))
    assert mismatch.status_code == 401
    accepted_headers = signed_headers("POST", path, body)
    accepted = client.post(path, content=body, headers=accepted_headers)
    assert accepted.status_code == 201, accepted.text
    replayed = client.post(path, content=body, headers=accepted_headers)
    assert replayed.status_code == 401
    assert replayed.json()["detail"] == "Replayed gateway identity"
    upload_id = accepted.json()["id"]
    finalize_path = f"/api/argus/uploads/{upload_id}/finalize"
    finalize_payload = {
        "content": "parsed PDF text differs from original bytes",
        "content_hash": "a" * 64,
        "sealed_object_path": f"/objects/sealed/{uuid.uuid4()}",
        "source": "Broker upload", "source_url": "https://evidence.example.invalid/item/1",
        "collected_at": "2023-06-15T12:00:00Z", "reliability": "B",
    }
    finalize_body = json.dumps(finalize_payload, separators=(",", ":")).encode()
    first = client.post(finalize_path, content=finalize_body,
                        headers=signed_headers("POST", finalize_path, finalize_body))
    assert first.status_code == 201, first.text
    repeated = client.post(finalize_path, content=finalize_body,
                           headers=signed_headers("POST", finalize_path, finalize_body))
    assert repeated.status_code == 201
    assert repeated.json()["id"] == first.json()["id"]
    assert first.json()["content_hash"] == "a" * 64
    assert first.json()["source_url"] == "https://evidence.example.invalid/item/1"
    assert first.json()["collected_at"].startswith("2023-06-15T12:00:00")


def test_last_admin_cannot_be_removed(client, db, user):
    user.role = Role.ADMIN
    db.commit()
    response = client.patch(f"/api/argus/users/{user.id}", json={
        "role": "VIEWER", "active": True
    })
    assert response.status_code == 409
    db.refresh(user)
    assert user.role == Role.ADMIN


def test_evidence_patch_serializes_uuids_and_rejects_null(client, db):
    case = create_case(client)
    entity = client.post(f"/api/argus/cases/{case['id']}/entities", json={
        "type": "DOMAIN", "value": "fixture.example.invalid"
    }).json()
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture", "content": "text", "reliability": "B"
    }).json()
    updated = client.patch(f"/api/argus/evidence/{evidence['id']}", json={
        "entity_ids": [entity["id"]]
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["entity_ids"] == [entity["id"]]
    assert client.patch(f"/api/argus/evidence/{evidence['id']}", json={"notes": None}).status_code == 422
    assert client.patch(f"/api/argus/cases/{case['id']}", json={"title": None}).status_code == 422


def test_expired_running_job_is_recovered_with_new_fence(client, db):
    case = create_case(client)
    old_token = uuid.uuid4()
    job = Job(case_id=uuid.UUID(case["id"]), mode="extract", status="RUNNING",
              attempts=1, max_attempts=3, lease_token=old_token,
              lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(job); db.commit(); job_id = job.id
    from apps.api.worker import claim_one, process
    claimed = claim_one()
    assert claimed is not None
    assert claimed[0] == job_id
    assert claimed[1] != old_token
    db.expire_all()
    recovered = db.get(Job, job_id)
    assert recovered.status == "RUNNING"
    assert recovered.attempts == 2
    assert recovered.lease_token == claimed[1]
    process(job_id, old_token)
    db.expire_all()
    assert db.get(Job, job_id).lease_token == claimed[1]


def test_extract_and_correlate_jobs_only_create_stable_review_candidates(client, db):
    case = create_case(client)
    case_id = uuid.UUID(case["id"])
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL", "source": "Fixture", "content": "repeat.example.invalid",
        "reliability": "B"
    }).json()
    from apps.api.worker import process

    def run(mode):
        token = uuid.uuid4()
        job = Job(case_id=case_id, mode=mode, status="RUNNING", attempts=1,
                  lease_token=token, lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5))
        db.add(job); db.commit()
        process(job.id, token)
        db.expire_all()
        return db.get(Job, job.id).result

    first = run("extract")
    second = run("extract")
    db.expire_all()
    extracted = list(db.query(Entity).filter(
        Entity.case_id == case_id, Entity.type == "DOMAIN",
        Entity.value == "repeat.example.invalid"
    ))
    assert extracted == []
    assert first["review_required"] is True
    assert first["candidates"][0]["id"] == second["candidates"][0]["id"]
    assert first["candidates"][0]["evidence_ids"] == [evidence["id"]]

    left = Entity(case_id=case_id, type="DOMAIN", value="repeat.example.invalid",
                  source="Fixture duplicate", confidence=.5)
    right = Entity(case_id=case_id, type="DOMAIN", value="repeat.example.invalid",
                   source="Fixture duplicate", confidence=.5)
    db.add_all([left, right]); db.commit()
    patched = client.patch(f"/api/argus/evidence/{evidence['id']}", json={
        "entity_ids": [str(left.id), str(right.id)]
    })
    assert patched.status_code == 200
    correlated = run("correlate")
    repeated = run("correlate")
    db.expire_all()
    algorithm_links = list(db.query(Relationship).filter(
        Relationship.case_id == case_id, Relationship.attribution == "ALGORITHM"
    ))
    assert algorithm_links == []
    assert correlated["candidates"][0]["id"] == repeated["candidates"][0]["id"]