from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.app.database.base import Base
from backend.app.database.session import get_db
from backend.app.main import app


@pytest.fixture()
def client(tmp_path) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'infrastructure_analysis.db'}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def create_case(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/cases",
        json={"title": "Infrastructure case", "status": "open"},
    )
    assert response.status_code == 201
    return response.json()


def ingest_infrastructure(
    client: TestClient,
    case_id: str,
    payload: dict,
) -> dict:
    response = client.post(
        f"/api/v1/cases/{case_id}/ingest/infrastructure",
        json=payload,
    )
    assert response.status_code == 201
    return response.json()


def findings(client: TestClient, case_id: str) -> dict:
    response = client.get(f"/api/v1/cases/{case_id}/infrastructure/findings")
    assert response.status_code == 200
    return response.json()


def finding_types(payload: dict) -> set[str]:
    return {finding["finding_type"] for finding in payload["findings"]}


def test_invalid_case_returns_404(client: TestClient):
    missing_case_id = uuid4()

    post_response = client.post(
        f"/api/v1/cases/{missing_case_id}/ingest/infrastructure",
        json={"domain": "example.test", "source_label": "Analyst Metadata"},
    )
    get_response = client.get(
        f"/api/v1/cases/{missing_case_id}/infrastructure/findings"
    )

    assert post_response.status_code == 404
    assert get_response.status_code == 404
    assert post_response.json()["detail"] == "Requested record was not found."


def test_infrastructure_ingestion_persists_safely(client: TestClient):
    case = create_case(client)

    payload = ingest_infrastructure(
        client,
        case["id"],
        {
            "url": "https://portal.example.test/login",
            "domain": "portal.example.test",
            "ip_address": "203.0.113.10",
            "page_title": "Example Portal",
            "server_header": "nginx/1.25",
            "powered_by_header": "Express",
            "http_status": 200,
            "open_ports": [443, 80, 443],
            "observed_at": "2026-09-01",
            "source_label": "Analyst Infrastructure Paste",
            "notes": "Metadata supplied by analyst; no scanning.",
        },
    )

    assert payload["ingestion"]["metadata"]["ingestion_module"] == (
        "infrastructure_observation"
    )
    assert payload["ingestion"]["metadata"]["network_access"] is False
    assert payload["ingestion"]["metadata"]["open_ports"] == [80, 443]

    entities = client.get(f"/api/v1/cases/{case['id']}/entities?limit=100").json()
    extracted = {(item["entity_type"], item["normalized_value"]) for item in entities["items"]}
    assert ("domain", "portal example test") in extracted
    assert ("ip_address", "203 0 113 10") in extracted


def test_shared_certificate_fingerprint_creates_strong_finding(client: TestClient):
    case = create_case(client)
    fingerprint = (
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )
    ingest_infrastructure(
        client,
        case["id"],
        {
            "domain": "alpha.example.test",
            "page_title": "Alpha Portal",
            "certificate_fingerprint": fingerprint,
            "source_label": "Forum A",
        },
    )
    ingest_infrastructure(
        client,
        case["id"],
        {
            "onion_url": "http://alphaabcd1234.onion",
            "page_title": "Alpha Portal Onion",
            "certificate_fingerprint": fingerprint,
            "source_label": "Onion Metadata",
        },
    )

    payload = findings(client, case["id"])
    shared_cert = next(
        finding
        for finding in payload["findings"]
        if finding["finding_type"] == "shared_certificate_fingerprint"
    )

    assert shared_cert["severity"] == "high"
    assert shared_cert["confidence"] == 0.95
    assert shared_cert["matched_values"] == [fingerprint]
    assert payload["risk_score"] >= 30


def test_shared_server_header_creates_medium_finding(client: TestClient):
    case = create_case(client)
    ingest_infrastructure(
        client,
        case["id"],
        {
            "domain": "alpha.example.test",
            "server_header": "nginx/1.25.3",
            "source_label": "Alpha Source",
        },
    )
    ingest_infrastructure(
        client,
        case["id"],
        {
            "domain": "beta.example.test",
            "server_header": "nginx/1.25.3",
            "source_label": "Beta Source",
        },
    )

    payload = findings(client, case["id"])
    shared_header = next(
        finding
        for finding in payload["findings"]
        if finding["finding_type"] == "shared_server_header"
    )

    assert shared_header["severity"] == "medium"
    assert "server:nginx/1.25.3" in shared_header["matched_values"]
    assert len(shared_header["source_ingestion_ids"]) == 2


def test_onion_and_clearnet_title_similarity_creates_signal(client: TestClient):
    case = create_case(client)
    ingest_infrastructure(
        client,
        case["id"],
        {
            "domain": "mirror.example.test",
            "page_title": "Falcon Market Login",
            "source_label": "Clearnet Mirror Metadata",
        },
    )
    ingest_infrastructure(
        client,
        case["id"],
        {
            "onion_url": "http://falconmarketabcd.onion",
            "page_title": "Falcon Market Login",
            "source_label": "Onion Metadata",
        },
    )

    payload = findings(client, case["id"])

    assert "clearnet_onion_title_similarity" in finding_types(payload)
    assert payload["risk_score"] >= 20


def test_leaked_powered_by_header_affects_risk_score(client: TestClient):
    case = create_case(client)
    ingest_infrastructure(
        client,
        case["id"],
        {
            "domain": "portal.example.test",
            "powered_by_header": "Express 4.18.2",
            "source_label": "Header Paste",
        },
    )

    payload = findings(client, case["id"])

    assert "leaked_powered_by_header" in finding_types(payload)
    assert payload["risk_score"] == 10
    assert payload["risk_level"] == "low"


def test_descriptor_inconsistency_is_detected(client: TestClient):
    case = create_case(client)
    ingest_infrastructure(
        client,
        case["id"],
        {
            "onion_url": "http://brandoneabcd.onion",
            "page_title": "Brand One Login",
            "source_label": "Onion Metadata",
            "notes": (
                "Onion title: Brand One Login. "
                "Clearnet mirror: Different Brand Portal."
            ),
        },
    )

    payload = findings(client, case["id"])
    inconsistency = next(
        finding
        for finding in payload["findings"]
        if finding["finding_type"] == "descriptor_inconsistency"
    )

    assert inconsistency["severity"] == "medium"
    assert len(inconsistency["matched_values"]) >= 2
    assert payload["risk_score"] >= 10


def test_empty_case_returns_low_risk_and_warning(client: TestClient):
    case = create_case(client)

    payload = findings(client, case["id"])

    assert payload["findings"] == []
    assert payload["signals"] == []
    assert payload["risk_score"] == 0
    assert payload["risk_level"] == "low"
    assert any("No persisted infrastructure observations" in warning for warning in payload["warnings"])


def test_no_live_network_calls_are_made(client: TestClient, monkeypatch):
    def fail_network(*args, **kwargs):
        raise AssertionError("network calls are not allowed")

    monkeypatch.setattr("socket.create_connection", fail_network)
    case = create_case(client)
    ingest_infrastructure(
        client,
        case["id"],
        {
            "url": "https://network-not-called.example.test",
            "domain": "network-not-called.example.test",
            "source_label": "Offline Metadata",
        },
    )

    payload = findings(client, case["id"])

    assert payload["risk_score"] == 0
    assert any("No live host scanning" in warning for warning in payload["warnings"])


def test_output_is_deterministic_except_timestamp(client: TestClient):
    case = create_case(client)
    fingerprint = (
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )
    shared_payload = {
        "server_header": "Apache/2.4.57",
        "certificate_fingerprint": fingerprint,
        "powered_by_header": "PHP/8.2",
    }
    ingest_infrastructure(
        client,
        case["id"],
        {
            **shared_payload,
            "domain": "alpha.example.test",
            "source_label": "Alpha Metadata",
        },
    )
    ingest_infrastructure(
        client,
        case["id"],
        {
            **shared_payload,
            "domain": "beta.example.test",
            "source_label": "Beta Metadata",
        },
    )

    first = findings(client, case["id"])
    second = findings(client, case["id"])
    first_without_time = {key: value for key, value in first.items() if key != "generated_at"}
    second_without_time = {key: value for key, value in second.items() if key != "generated_at"}

    assert first_without_time == second_without_time
