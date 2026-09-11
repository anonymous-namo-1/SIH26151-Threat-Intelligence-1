import hashlib
from collections.abc import Generator
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from backend.app.api import routes
from backend.app.core.config import get_settings
from backend.app.database.base import Base
from backend.app.database.models import Entity, Ingestion
from backend.app.database.session import get_db
from backend.app.main import app
from backend.app.models.schemas import CaseCreate, ExtractionRequest, SourceType
from backend.app.services.persistence import DatabaseUnavailableError, PersistenceService


@pytest.fixture()
def client(tmp_path) -> Generator[TestClient, None, None]:
    database_url = f"sqlite:///{tmp_path / 'argus_test.db'}"
    engine = create_engine(
        database_url,
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


def create_case(client: TestClient, title: str = "Case One") -> dict:
    response = client.post(
        "/api/v1/cases",
        json={"title": title, "description": "Test case", "status": "open"},
    )
    assert response.status_code == 201
    return response.json()


def persist_ingestion(client: TestClient, case_id: str, text: str | None = None) -> dict:
    response = client.post(
        f"/api/v1/cases/{case_id}/ingestions",
        json={
            "source_type": "public_report",
            "platform": "Analyst Paste",
            "handle": None,
            "onion_url": None,
            "observed_at": "2026-09-01",
            "text": text
            or (
                "A public report links LockBit to T1486. "
                "IOC: 0x1111111111111111111111111111111111111111."
            ),
            "metadata": {"report": "unit-test"},
        },
    )
    assert response.status_code == 201
    return response.json()


def test_create_and_list_cases(client: TestClient):
    case = create_case(client)

    response = client.get("/api/v1/cases")

    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == case["id"]
    assert response.json()["pagination"]["total"] == 1


def test_persist_ingestion_stores_entities_links_and_hash(client: TestClient):
    case = create_case(client)
    persisted = persist_ingestion(client, case["id"])

    expected_hash = hashlib.sha256(
        persisted["ingestion"]["raw_text"].encode("utf-8")
    ).hexdigest()
    assert persisted["ingestion"]["content_sha256"] == expected_hash
    assert persisted["extraction"]["entities"]["wallets"]

    entities = client.get(f"/api/v1/cases/{case['id']}/entities").json()
    evidence = client.get(f"/api/v1/cases/{case['id']}/evidence").json()

    assert entities["pagination"]["total"] >= 3
    assert any(item["entity_type"] == "threat_actor" for item in entities["items"])
    assert evidence["pagination"]["total"] >= 3
    assert evidence["items"][0]["entity"]["case_id"] == case["id"]


def test_normalized_entity_deduplication_within_one_case(client: TestClient):
    case = create_case(client)
    persist_ingestion(client, case["id"], "LockBit used T1486.")
    persist_ingestion(client, case["id"], "lockbit used T1486 again.")

    entities = client.get(f"/api/v1/cases/{case['id']}/entities").json()["items"]
    threat_actor_entities = [
        item for item in entities if item["entity_type"] == "threat_actor"
    ]
    technique_entities = [
        item for item in entities if item["entity_type"] == "mitre_technique"
    ]

    assert len(threat_actor_entities) == 1
    assert len(technique_entities) == 1


def test_no_entity_deduplication_across_cases(client: TestClient):
    first_case = create_case(client, "First Case")
    second_case = create_case(client, "Second Case")
    persist_ingestion(client, first_case["id"], "LockBit used T1486.")
    persist_ingestion(client, second_case["id"], "LockBit used T1486.")

    first_entities = client.get(
        f"/api/v1/cases/{first_case['id']}/entities"
    ).json()["items"]
    second_entities = client.get(
        f"/api/v1/cases/{second_case['id']}/entities"
    ).json()["items"]

    first_actor_id = next(
        item["id"] for item in first_entities if item["entity_type"] == "threat_actor"
    )
    second_actor_id = next(
        item["id"] for item in second_entities if item["entity_type"] == "threat_actor"
    )
    assert first_actor_id != second_actor_id


def test_pagination_limits(client: TestClient):
    create_case(client)

    too_large = client.get("/api/v1/cases?limit=101")
    valid = client.get("/api/v1/cases?limit=1&offset=0")

    assert too_large.status_code == 422
    assert valid.status_code == 200
    assert valid.json()["pagination"]["limit"] == 1


def test_missing_case_handling(client: TestClient):
    response = client.post(
        f"/api/v1/cases/{uuid4()}/ingestions",
        json={"source_type": "public_report", "text": "LockBit T1486"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested record was not found."


def test_cross_case_ingestion_access_rejected(client: TestClient):
    first_case = create_case(client, "First Case")
    second_case = create_case(client, "Second Case")
    persisted = persist_ingestion(client, first_case["id"])

    response = client.get(
        f"/api/v1/cases/{second_case['id']}/ingestions/"
        f"{persisted['ingestion']['id']}"
    )

    assert response.status_code == 404


def test_enrichment_runs_list_endpoint(client: TestClient):
    case = create_case(client)

    response = client.get(f"/api/v1/cases/{case['id']}/enrichment-runs")

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_transaction_rollback_on_failure(tmp_path, monkeypatch):
    database_url = f"sqlite:///{tmp_path / 'rollback.db'}"
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    db = TestingSessionLocal()
    service = PersistenceService()
    case = service.create_case(db, CaseCreate(title="Rollback Case"))

    def fail_link(*args, **kwargs):
        raise SQLAlchemyError("forced test failure")

    monkeypatch.setattr(service, "_link_evidence", fail_link)

    with pytest.raises(DatabaseUnavailableError):
        service.persist_extraction(
            db,
            case.id,
            ExtractionRequest(
                source_type=SourceType.public_report,
                text="LockBit used T1486.",
            ),
        )

    assert db.scalars(select(Ingestion)).all() == []
    assert db.scalars(select(Entity)).all() == []
    db.close()


def test_database_unavailable_error_handling(client: TestClient, monkeypatch):
    def fail_create_case(*args, **kwargs):
        raise DatabaseUnavailableError()

    monkeypatch.setattr(routes.persistence_service, "create_case", fail_create_case)

    response = client.post("/api/v1/cases", json={"title": "Unavailable"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Database is unavailable."


def test_alembic_upgrade_on_clean_database(tmp_path, monkeypatch):
    db_path = tmp_path / "alembic_clean.db"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.connect() as connection:
        table_names = {
            row[0]
            for row in connection.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }

    assert {
        "cases",
        "ingestions",
        "entities",
        "evidence_entity_links",
        "enrichment_runs",
        "alembic_version",
    }.issubset(table_names)

    get_settings.cache_clear()

