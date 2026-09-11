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
        f"sqlite:///{tmp_path / 'graph_intelligence.db'}",
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
        json={"title": "Graph case", "status": "open"},
    )
    assert response.status_code == 201
    return response.json()


def persist_text(
    client: TestClient,
    case_id: str,
    handle: str,
    text: str,
    platform: str = "Synthetic Forum",
    observed_at: str = "2026-09-01",
) -> dict:
    response = client.post(
        f"/api/v1/cases/{case_id}/ingestions",
        json={
            "source_type": "synthetic_dark_forum",
            "platform": platform,
            "handle": handle,
            "observed_at": observed_at,
            "text": text,
            "metadata": {"synthetic": True},
        },
    )
    assert response.status_code == 201
    return response.json()


def graph(client: TestClient, case_id: str) -> dict:
    response = client.get(f"/api/v1/cases/{case_id}/graph")
    assert response.status_code == 200
    return response.json()


def test_invalid_case_returns_404(client: TestClient):
    response = client.get(f"/api/v1/cases/{uuid4()}/graph")

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested record was not found."


def test_empty_case_returns_empty_graph(client: TestClient):
    case = create_case(client)

    payload = graph(client, case["id"])

    assert payload["nodes"] == []
    assert payload["edges"] == []
    assert "evidence-backed analytical links" in payload["warnings"][0]


def test_graph_includes_core_node_types_and_evidence_edges(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "blackfalcon",
        (
            "Handle: blackfalcon. Contact: @shared_support. "
            "PGP: A1B2C3D4E5F60708. "
            "ETH: 0x1111111111111111111111111111111111111111. "
            "Visit http://samplemetadataabcd.onion and evil.example."
        ),
        platform="LeakHub Synthetic",
    )

    payload = graph(client, case["id"])
    node_types = {node["type"] for node in payload["nodes"]}
    edge_types = {edge["type"] for edge in payload["edges"]}

    assert {"handle", "telegram", "wallet", "pgp_key", "onion_url", "domain"}.issubset(
        node_types
    )
    assert {"source", "ingestion"}.issubset(node_types)
    assert "mentioned_in" in edge_types
    assert "observed_in_source" in edge_types
    assert "uses_wallet" in edge_types
    assert "uses_pgp" in edge_types
    assert "has_contact" in edge_types
    assert "hosted_on" in edge_types


def test_wallet_and_pgp_edges_are_high_confidence_and_animated(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "zeroledger",
        (
            "Vendor handle: zeroledger. PGP: A1B2C3D4E5F60708. "
            "BTC: bc1qfakewallet123abcxyz."
        ),
    )

    payload = graph(client, case["id"])
    high_edges = [
        edge
        for edge in payload["edges"]
        if edge["type"] in {"uses_wallet", "uses_pgp"}
    ]

    assert high_edges
    assert all(edge["confidence"] >= 0.95 for edge in high_edges)
    assert all(edge["weight"] == 5 for edge in high_edges)
    assert all(edge["animated"] is True for edge in high_edges)
    assert all(edge["style_hint"] == "high_confidence" for edge in high_edges)


def test_resolution_candidate_edge_is_added(client: TestClient):
    case = create_case(client)
    wallet = "0x2222222222222222222222222222222222222222"
    persist_text(
        client,
        case["id"],
        "alphaaccess",
        f"Profile says ETH: {wallet}.",
        platform="Forum A",
        observed_at="2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "betabroker",
        f"Vendor note lists wallet: {wallet}.",
        platform="Forum B",
        observed_at="2026-09-05",
    )

    payload = graph(client, case["id"])
    resolution_edges = [
        edge for edge in payload["edges"] if edge["type"] == "resolved_candidate"
    ]

    assert resolution_edges
    assert resolution_edges[0]["confidence"] >= 0.95
    assert resolution_edges[0]["animated"] is True
    assert resolution_edges[0]["rule_hits"][0]["rule"] == "same_wallet"


def test_graph_output_is_stably_sorted(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "alphaaccess",
        "Handle: alphaaccess. Contact: shared_support. Domain: alpha.example.",
        platform="Forum A",
    )
    persist_text(
        client,
        case["id"],
        "betabroker",
        "Handle: betabroker. Contact: shared_support. Domain: beta.example.",
        platform="Forum B",
    )

    first = graph(client, case["id"])
    second = graph(client, case["id"])

    assert [node["id"] for node in first["nodes"]] == sorted(
        node["id"] for node in first["nodes"]
    )
    assert [edge["id"] for edge in first["edges"]] == sorted(
        edge["id"] for edge in first["edges"]
    )
    assert [node["id"] for node in first["nodes"]] == [
        node["id"] for node in second["nodes"]
    ]
    assert [edge["id"] for edge in first["edges"]] == [
        edge["id"] for edge in second["edges"]
    ]

