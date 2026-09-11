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
        f"sqlite:///{tmp_path / 'ai_profiling.db'}",
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
        json={"title": "AI profile case", "status": "open"},
    )
    assert response.status_code == 201
    return response.json()


def persist_text(
    client: TestClient,
    case_id: str,
    handle: str,
    text: str,
    platform: str,
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


def ai_profile(client: TestClient, case_id: str) -> dict:
    response = client.get(f"/api/v1/cases/{case_id}/ai-profile")
    assert response.status_code == 200
    return response.json()


def test_invalid_case_returns_404(client: TestClient):
    response = client.get(f"/api/v1/cases/{uuid4()}/ai-profile")

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested record was not found."


def test_empty_case_returns_low_risk_and_warnings(client: TestClient):
    case = create_case(client)

    payload = ai_profile(client, case["id"])

    assert payload["risk_score"] == 0
    assert payload["risk_level"] == "low"
    assert payload["profile_summary"] == "No persisted ingestions are available for profiling yet."
    assert payload["stylometry"] == []
    assert payload["behavior_patterns"] == []
    assert payload["attribution_explanations"] == []
    assert any("analyst support" in warning for warning in payload["warnings"])


def test_same_wallet_and_pgp_create_high_risk(client: TestClient):
    case = create_case(client)
    wallet = "0x1111111111111111111111111111111111111111"
    pgp_key = "A1B2C3D4E5F60708"
    persist_text(
        client,
        case["id"],
        "blackfalcon",
        (
            f"Handle: blackfalcon. PGP: {pgp_key}. ETH: {wallet}. "
            "Delivery phrase silver river escrow protocol."
        ),
        "LeakHub Synthetic",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "falcon_ops",
        (
            f"Vendor handle: falcon_ops. GPG: {pgp_key}. Wallet: {wallet}. "
            "Delivery phrase silver river escrow protocol."
        ),
        "ShadowBazaar Synthetic",
        "2026-09-02",
    )

    payload = ai_profile(client, case["id"])
    factors = {item["factor"]: item["points"] for item in payload["risk_breakdown"]["contributions"]}

    assert payload["risk_level"] == "high"
    assert payload["risk_score"] >= 65
    assert factors["same_wallet"] == 25
    assert factors["same_pgp"] == 25
    assert any(pattern["pattern"] == "same_wallet_reuse" for pattern in payload["behavior_patterns"])
    assert any(pattern["pattern"] == "same_pgp_reuse" for pattern in payload["behavior_patterns"])


def test_repeated_phrases_create_stylometry_signal(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "alphaaccess",
        "Vendor note repeats silver river escrow protocol for delivery.",
        "Forum A",
    )
    persist_text(
        client,
        case["id"],
        "betabroker",
        "Marketplace note repeats silver river escrow protocol for delivery.",
        "Forum B",
    )

    payload = ai_profile(client, case["id"])
    signals = [
        signal
        for signal in payload["stylometry"]
        if signal["signal_type"] == "shared_repeated_phrases"
    ]

    assert signals
    assert any(
        "silver river" in value
        for value in signals[0]["matched_values"]
    )
    assert len(signals[0]["source_ingestion_ids"]) == 2


def test_rebrand_wording_creates_rebrand_signal(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "falcon_ops",
        (
            "New handle falcon_ops, formerly blackfalcon. "
            "Moved to backup mirror, same vendor."
        ),
        "Synthetic Profile",
    )

    payload = ai_profile(client, case["id"])

    assert any(
        signal["signal_type"] == "migration_language"
        for signal in payload["rebrand_signals"]
    )
    assert any("falcon_ops" in signal["handles_or_aliases"] for signal in payload["rebrand_signals"])


def test_attribution_explanation_references_resolution_candidate_rules(client: TestClient):
    case = create_case(client)
    wallet = "0x2222222222222222222222222222222222222222"
    pgp_key = "9988AABBCCDD0011"
    persist_text(
        client,
        case["id"],
        "nightinvoice",
        f"Handle: nightinvoice. PGP: {pgp_key}. ETH: {wallet}.",
        "RansomRoom Synthetic",
    )
    persist_text(
        client,
        case["id"],
        "invoiceops",
        f"Vendor handle: invoiceops. GPG: {pgp_key}. Wallet: {wallet}.",
        "Forum Synthetic",
    )

    payload = ai_profile(client, case["id"])
    explanation = payload["attribution_explanations"][0]

    assert set(explanation["candidate_pair"]) == {"nightinvoice", "invoiceops"}
    assert {"same_wallet", "same_pgp"}.issubset(explanation["supporting_rules"])
    assert explanation["evidence_snippets"]
    assert explanation["source_ingestion_ids"]
    assert "not proof" in explanation["warning"]


def test_output_is_deterministic_except_timestamp(client: TestClient):
    case = create_case(client)
    wallet = "0x3333333333333333333333333333333333333333"
    persist_text(
        client,
        case["id"],
        "alphaaccess",
        f"Handle: alphaaccess. Contact: shared_support. ETH: {wallet}.",
        "Forum A",
    )
    persist_text(
        client,
        case["id"],
        "betaaccess",
        f"Vendor handle: betaaccess. Contact: shared_support. ETH: {wallet}.",
        "Forum B",
    )

    first = ai_profile(client, case["id"])
    second = ai_profile(client, case["id"])
    first_without_time = {key: value for key, value in first.items() if key != "generated_at"}
    second_without_time = {key: value for key, value in second.items() if key != "generated_at"}

    assert first_without_time == second_without_time
