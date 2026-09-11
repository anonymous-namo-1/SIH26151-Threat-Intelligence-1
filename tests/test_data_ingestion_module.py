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

