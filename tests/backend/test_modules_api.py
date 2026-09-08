import uuid

from sqlalchemy import select

from apps.api.models import Case, Entity, Evidence, Job, Role, User


def make_case(db, user):
    case = Case(title="Module validation", created_by_id=user.id, priority="CRITICAL")
    db.add(case)
    db.flush()
    evidence = Evidence(case_id=case.id, type="TEXT", source="Supplied test record",
                        content="A supplied fictional transaction abc123",
                        content_hash="a" * 64, collector_id=user.id)
    db.add(evidence)
    db.commit()
    return case, evidence


def test_all_module_routes_and_history(client, db, user):
    case, evidence = make_case(db, user)
    a = Entity(case_id=case.id, type="PERSONA", value="Alpha")
    b = Entity(case_id=case.id, type="PERSONA", value="Beta")
    db.add_all([a, b])
    db.commit()
    for name in ("persona", "stylometry", "temporal", "wallet", "infrastructure",
                 "alias", "relationship", "reliability", "contradiction", "timeline"):
        payload = {"module": name}
        if name == "persona":
            payload.update(left_id=str(a.id), right_id=str(b.id))
        if name == "stylometry":
            payload.update(corpus_left="Supplied sample. " * 200, corpus_right="Another sample. " * 200)
        response = client.post(f"/api/argus/cases/{case.id}/modules", json=payload)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["module"] == name and result["model_version"] and result["generated_at"]
        assert set(result["evidence_ids"]).issubset({str(evidence.id)})
        assert result["job_id"]
        assert db.get(Job, uuid.UUID(result["job_id"])).status == "SUCCEEDED"
    jobs = client.get(f"/api/argus/cases/{case.id}/jobs").json()
    assert len([job for job in jobs if job["mode"] == "module"]) == 10


def test_case_scope_permissions_and_rules(client, db, user):
    case, evidence = make_case(db, user)
    other = User(clerk_sub="module-outsider", name="Other", role=Role.INVESTIGATOR)
    db.add(other)
    db.flush()
    hidden = Case(title="Private", created_by_id=other.id)
    db.add(hidden)
    db.commit()
    path = f"/api/argus/cases/{case.id}"
    assert client.post(f"/api/argus/cases/{hidden.id}/modules", json={"module": "wallet"}).status_code == 404
    assert client.post(path + "/modules", json={"module": "wallet", "entity_id": str(uuid.uuid4())}).status_code == 404
    before = client.get(path + "/scoring-rules").json()
    saved = client.put(path + "/scoring-rules", json={"weights": {"pgp_overlap": 42}})
    assert saved.status_code == 200, saved.text
    assert saved.json()["model_version"] != before["model_version"]
    assert client.get(path + "/scoring-rules").json()["weights"]["pgp_overlap"] == 42
    assert client.put(path + "/scoring-rules", json={"weights": {"conflicting_timezone": 8}}).status_code == 422
    assert client.put(path + "/scoring-rules", json={"weights": {"made_up": 20}}).status_code == 422
    assert client.post(path + "/modules", json={"module": "temporal", "start": "2026-09-09T00:00:00Z",
                                              "end": "2026-09-01T00:00:00Z"}).status_code == 422
    user.role = Role.VIEWER
    db.commit()
    assert client.post(path + "/modules", json={"module": "wallet"}).status_code == 403
    assert client.put(path + "/scoring-rules", json={"weights": {"pgp_overlap": 40}}).status_code == 403


def test_transaction_import_precision_duplicates_and_timeline(client, db, user):
    case, evidence = make_case(db, user)
    path = f"/api/argus/cases/{case.id}"
    row = {"hash": "abc123", "from_address": "fictional-A", "to_address": "fictional-B",
           "amount": "0.123456789123456789", "asset": "TEST",
           "timestamp": "2026-09-08T12:00:00Z", "labels": ["fictional supplied record"]}
    payload = {"evidence_id": str(evidence.id), "transactions": [row]}
    first = client.post(path + "/transactions/import", json=payload)
    assert first.status_code == 201, first.text
    assert first.json()["created"] == 1
    retry = client.post(path + "/transactions/import", json=payload)
    assert retry.json()["created"] == 0 and retry.json()["existing"] == 1
    result = client.post(path + "/modules", json={"module": "wallet"}).json()
    assert result["data"]["transaction_count"] == 1
    assert result["data"]["totals_by_asset"]["TEST"] == row["amount"]
    assert result["evidence_ids"] == [str(evidence.id)]
    temporal = client.post(path + "/modules", json={"module": "temporal"}).json()
    assert temporal["data"]["observation_count"] == 1
    assert temporal["data"]["posting_hour_distribution"][12] == 1
    payload["transactions"][0]["amount"] = "10"
    assert client.post(path + "/transactions/import", json=payload).status_code == 409
    assert len(list(db.scalars(select(Entity).where(Entity.type == "CRYPTO_TRANSACTION")))) == 1
    payload["evidence_id"] = str(uuid.uuid4())
    assert client.post(path + "/transactions/import", json=payload).status_code == 404


def test_dashboard_pending_counts_and_scoped_analysis_input(client, db, user):
    case, evidence = make_case(db, user)
    job = Job(case_id=case.id, mode="extract", status="SUCCEEDED", result={
        "review_required": True, "candidates": [{"id": "a"}, {"id": "b", "decision": "rejected"}]})
    db.add(job)
    db.commit()
    response = client.get("/api/argus/dashboard")
    assert response.status_code == 200, response.text
    assert response.json()["critical_cases"] == 1
    assert response.json()["pending_reviews"] == 1
    queued = client.post(f"/api/argus/cases/{case.id}/analyze",
                         json={"mode": "extract", "evidence_ids": [str(evidence.id)]})
    assert queued.status_code == 202
    assert queued.json()["result"]["input"]["evidence_ids"] == [str(evidence.id)]
    assert client.post(f"/api/argus/cases/{case.id}/analyze",
                       json={"mode": "extract", "evidence_ids": [str(uuid.uuid4())]}).status_code == 422


def test_maximum_decimal_precision_and_timezone_normalization(client, db, user):
    case, evidence = make_case(db, user)
    path = f"/api/argus/cases/{case.id}"
    amount = "123456789012345678901234567890.123456789123456789"
    rows = [{"hash": f"precision-{i}", "from_address": "fictional-A",
             "to_address": "fictional-B", "amount": amount, "asset": "TEST",
             "timestamp": "2026-09-08T23:30:00-05:00"} for i in range(2)]
    imported = client.post(path + "/transactions/import",
                           json={"evidence_id": str(evidence.id), "transactions": rows})
    assert imported.status_code == 201, imported.text
    stored = db.get(Entity, uuid.UUID(imported.json()["entity_ids"][0]))
    assert stored.extra_metadata["amount"] == amount
    wallet = client.post(path + "/modules", json={"module": "wallet"}).json()
    assert wallet["data"]["totals_by_asset"]["TEST"] == "246913578024691357802469135780.246913578246913578"
    timeline = client.post(path + "/modules", json={"module": "temporal"}).json()
    assert timeline["data"]["posting_hour_distribution"][4] == 2
    assert timeline["data"]["posting_hour_distribution"][23] == 0