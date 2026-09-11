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
        f"sqlite:///{tmp_path / 'data_ingestion_module.db'}",
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
        json={"title": "Module ingestion case", "status": "open"},
    )
    assert response.status_code == 201
    return response.json()


def list_entities(client: TestClient, case_id: str) -> list[dict]:
    response = client.get(f"/api/v1/cases/{case_id}/entities?limit=100")
    assert response.status_code == 200
    return response.json()["items"]


def test_synthetic_source_record_ingestion_persists_entities(client: TestClient):
    case = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case['id']}/ingest/synthetic",
        json={
            "synthetic_source_id": "synthetic-forum-leakhub-blackfalcon-20260901"
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ingestion"]["source_type"] == "synthetic_dark_forum"
    assert payload["ingestion"]["metadata"]["synthetic_source_id"] == (
        "synthetic-forum-leakhub-blackfalcon-20260901"
    )

    entities = list_entities(client, case["id"])
    assert any(
        item["entity_type"] == "handle" and item["normalized_value"] == "blackfalcon"
        for item in entities
    )
    assert any(item["entity_type"] == "wallet:btc" for item in entities)
    assert any(item["entity_type"] == "pgp_key_id" for item in entities)

    evidence = client.get(f"/api/v1/cases/{case['id']}/evidence?limit=100")
    assert evidence.status_code == 200
    assert evidence.json()["pagination"]["total"] >= 3


def test_synthetic_pasted_text_ingestion_persists_entities(client: TestClient):
    case = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case['id']}/ingest/synthetic",
        json={
            "source_type": "synthetic_marketplace",
            "platform": "Analyst Synthetic Paste",
            "handle": "zeroledger",
            "text": (
                "Vendor handle: zeroledger. Contact PGP: 9988AABBCCDD0011. "
                "ETH 0x1111111111111111111111111111111111111111."
            ),
            "metadata": {"scenario": "unit-test"},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ingestion"]["metadata"]["ingestion_module"] == (
        "synthetic_pasted_text"
    )
    assert payload["extraction"]["entities"]["handles"]
    assert payload["extraction"]["entities"]["wallets"]


def test_osint_ingestion_persists_core_public_indicators(client: TestClient):
    case = create_case(client)
    sha256_hash = (
        "0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef"
    )

    response = client.post(
        f"/api/v1/cases/{case['id']}/ingest/osint",
        json={
            "source_name": "CISA Public Advisory",
            "source_url": "https://example.test/public-advisory",
            "published_at": "2026-09-01",
            "observed_at": "2026-09-02",
            "source_type": "public_advisory",
            "text": (
                "A public advisory references CVE-2023-34362, technique T1486, "
                "domain evil.example, IP 203.0.113.10, and file hash "
                f"{sha256_hash}."
            ),
            "metadata": {"collection": "manual"},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ingestion"]["platform"] == "CISA Public Advisory"
    assert payload["ingestion"]["metadata"]["source_url"] == (
        "https://example.test/public-advisory"
    )

    entities = list_entities(client, case["id"])
    extracted = {(item["entity_type"], item["normalized_value"]) for item in entities}
    assert ("cve", "cve 2023 34362") in extracted
    assert ("mitre_technique", "t1486") in extracted
    assert ("domain", "evil example") in extracted
    assert ("ip_address", "203 0 113 10") in extracted
    assert ("file_hash", sha256_hash) in extracted


def test_duplicate_entities_are_deduped_by_case(client: TestClient):
    case = create_case(client)
    request = {
        "source_name": "Public Report",
        "text": "LockBit used T1486 against evil.example.",
    }

    first = client.post(f"/api/v1/cases/{case['id']}/ingest/osint", json=request)
    second = client.post(f"/api/v1/cases/{case['id']}/ingest/osint", json=request)

    assert first.status_code == 201
    assert second.status_code == 201
    entities = list_entities(client, case["id"])
    matching = [
        item
        for item in entities
        if item["entity_type"] == "mitre_technique"
        and item["normalized_value"] == "t1486"
    ]
    assert len(matching) == 1


def test_invalid_case_returns_404(client: TestClient):
    response = client.post(
        f"/api/v1/cases/{uuid4()}/ingest/osint",
        json={
            "source_name": "Public Report",
            "text": "Public OSINT text mentioning CVE-2023-34362.",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested record was not found."


def test_profile_ingestion_persists_profile_entities(client: TestClient):
    case = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case['id']}/ingest/profile",
        json={
            "platform": "Synthetic Profile Paste",
            "source_type": "synthetic_marketplace",
            "text": (
                "Username: blackfalcon\n"
                "Alias: BlackFalcon_Ops\n"
                "Contact: @black_falcon_chat\n"
                "Contact: telegram: blackfalcon_market\n"
                "PGP: A1B2C3D4E5F60708\n"
                "BTC: bc1qfakewallet123abcxyz\n"
                "Profile URL: http://example-synthetic-market.test/vendor/blackfalcon"
            ),
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ingestion"]["metadata"]["ingestion_module"] == "profile_text"

    entities = list_entities(client, case["id"])
    extracted = {(item["entity_type"], item["normalized_value"]) for item in entities}
    assert ("handle", "blackfalcon") in extracted
    assert ("handle", "blackfalcon ops") in extracted
    assert ("handle", "black falcon chat") in extracted
    assert ("handle", "blackfalcon market") in extracted
    assert ("pgp_key_id", "a1b2c3d4e5f60708") in extracted
    assert ("wallet:btc", "bc1qfakewallet123abcxyz") in extracted
    assert ("domain", "example synthetic market test") in extracted


def test_onion_metadata_ingestion_persists_metadata_entities(client: TestClient):
    case = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case['id']}/ingest/onion-metadata",
        json={
            "onion_url": "http://samplemetadataabcd.onion",
            "title": "Synthetic Onion Metadata",
            "category": "forum",
            "language": "en",
            "first_seen": "2026-08-01",
            "last_seen": "2026-09-01",
            "status": "offline-demo",
            "mirrors": ["http://mirrorabcd1234.onion"],
            "contacts": [
                "@onion_admin",
                "admin@example.test",
                "PGP: A1B2C3D4E5F60708",
                "wallet: 0x1111111111111111111111111111111111111111",
            ],
            "banners": ["Server: nginx 1.25 on 198.51.100.12"],
            "server_headers": {"x-contact": "telegram: onion_meta"},
            "metadata": {"analyst_supplied": True},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["ingestion"]["metadata"]["network_access"] is False
    assert payload["ingestion"]["onion_url"] == "http://samplemetadataabcd.onion"

    entities = list_entities(client, case["id"])
    extracted = {(item["entity_type"], item["normalized_value"]) for item in entities}
    assert ("onion_url", "http samplemetadataabcd onion") in extracted
    assert ("onion_url", "http mirrorabcd1234 onion") in extracted
    assert ("handle", "onion admin") in extracted
    assert ("email", "admin example test") in extracted
    assert ("pgp_key_id", "a1b2c3d4e5f60708") in extracted
    assert ("wallet:eth", "0x1111111111111111111111111111111111111111") in extracted
    assert ("ip_address", "198 51 100 12") in extracted


def test_profile_and_onion_invalid_case_return_404(client: TestClient):
    missing_case_id = uuid4()

    profile_response = client.post(
        f"/api/v1/cases/{missing_case_id}/ingest/profile",
        json={"text": "Username: missing_case_profile"},
    )
    onion_response = client.post(
        f"/api/v1/cases/{missing_case_id}/ingest/onion-metadata",
        json={"onion_url": "http://missingcaseabcd.onion"},
    )

    assert profile_response.status_code == 404
    assert onion_response.status_code == 404


def test_data_collection_status_endpoint(client: TestClient):
    response = client.get("/api/v1/data-collection/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["module"] == "Module 1: Data Collection Layer"
    capabilities = {item["key"]: item["implemented"] for item in payload["capabilities"]}
    assert capabilities["synthetic_crawler_simulator"] is True
    assert capabilities["public_osint_ingestion"] is True
    assert capabilities["profile_parser_ingestion"] is True
    assert capabilities["onion_metadata_ingestion"] is True
    assert capabilities["persistence"] is True
    assert any("No Tor" in warning for warning in payload["safety_warnings"])
