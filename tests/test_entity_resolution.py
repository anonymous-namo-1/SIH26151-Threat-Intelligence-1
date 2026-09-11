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
        f"sqlite:///{tmp_path / 'entity_resolution.db'}",
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
        json={"title": "Resolution case", "status": "open"},
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


def resolution_candidates(client: TestClient, case_id: str) -> list[dict]:
    response = client.get(f"/api/v1/cases/{case_id}/resolution/candidates")
    assert response.status_code == 200
    return response.json()["candidates"]


def find_candidate(candidates: list[dict], left_value: str, right_value: str) -> dict:
    wanted = {left_value, right_value}
    for candidate in candidates:
        actual = {
            candidate["left_entity"]["value"],
            candidate["right_entity"]["value"],
        }
        if actual == wanted:
            return candidate
    raise AssertionError(f"candidate not found for {wanted}")


def test_same_wallet_links_two_handles(client: TestClient):
    case = create_case(client)
    wallet = "0x1111111111111111111111111111111111111111"
    persist_text(
        client,
        case["id"],
        "alphaaccess",
        f"Escrow note lists ETH: {wallet}. Delivery phrase: silver-river.",
        "LeakHub Synthetic",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "betabroker",
        f"Vendor profile includes wallet: {wallet}. Delivery phrase: red-harbor.",
        "ShadowBazaar Synthetic",
        "2026-09-05",
    )

    candidate = find_candidate(
        resolution_candidates(client, case["id"]),
        "alphaaccess",
        "betabroker",
    )

    assert candidate["confidence_score"] == 0.95
    assert candidate["rule_hits"][0]["rule"] == "same_wallet"
    assert candidate["rule_hits"][0]["matched_value"] == wallet
    assert "not proof" in candidate["warnings"][0]


def test_same_pgp_links_two_handles(client: TestClient):
    case = create_case(client)
    pgp_key = "A1B2C3D4E5F60708"
    persist_text(
        client,
        case["id"],
        "nightinvoice",
        f"Ransom simulator message. PGP: {pgp_key}.",
        "RansomRoom Synthetic",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "invoiceops",
        f"Marketplace profile lists GPG: {pgp_key}.",
        "Forum Synthetic",
        "2026-09-04",
    )

    candidate = find_candidate(
        resolution_candidates(client, case["id"]),
        "nightinvoice",
        "invoiceops",
    )

    assert candidate["confidence_score"] == 0.95
    assert candidate["rule_hits"][0]["rule"] == "same_pgp"
    assert candidate["rule_hits"][0]["matched_value"] == pgp_key


def test_same_telegram_contact_links_two_handles(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "alphadrop",
        "Public contact line says telegram: shared_support.",
        "Forum A",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "betadrop",
        "Vendor contact says Contact: shared_support.",
        "Forum B",
        "2026-09-04",
    )

    candidate = find_candidate(
        resolution_candidates(client, case["id"]),
        "alphadrop",
        "betadrop",
    )

    assert candidate["confidence_score"] == 0.9
    assert candidate["rule_hits"][0]["rule"] == "same_contact"
    assert candidate["rule_hits"][0]["matched_value"] == "shared_support"


def test_similar_usernames_have_lower_confidence_than_wallet_or_pgp(client: TestClient):
    case = create_case(client)
    wallet = "0x2222222222222222222222222222222222222222"
    persist_text(
        client,
        case["id"],
        "blackfalcon",
        "Short post about synthetic access wording.",
        "Forum A",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "black_falcon",
        "Different profile text with unrelated wording.",
        "Forum B",
        "2026-09-05",
    )
    persist_text(
        client,
        case["id"],
        "walletalpha",
        f"Wallet reuse test ETH: {wallet}.",
        "Forum C",
        "2026-09-10",
    )
    persist_text(
        client,
        case["id"],
        "walletbeta",
        f"Another wallet reuse test ETH: {wallet}.",
        "Forum D",
        "2026-09-14",
    )

    candidates = resolution_candidates(client, case["id"])
    similar = find_candidate(candidates, "blackfalcon", "black_falcon")
    wallet_candidate = find_candidate(candidates, "walletalpha", "walletbeta")

    assert similar["confidence_score"] == 0.6
    assert similar["rule_hits"][0]["rule"] == "similar_username"
    assert wallet_candidate["confidence_score"] > similar["confidence_score"]


def test_unrelated_entities_do_not_produce_strong_links(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "redriver",
        "Unique phrase orchid delta seven.",
        "Forum A",
        "2026-09-01",
    )
    persist_text(
        client,
        case["id"],
        "blueharbor",
        "Separate phrase cobalt mirror nine.",
        "Forum B",
        "2026-09-10",
    )

    candidates = resolution_candidates(client, case["id"])

    assert all(candidate["confidence_score"] < 0.7 for candidate in candidates)


def test_invalid_case_returns_404(client: TestClient):
    response = client.get(f"/api/v1/cases/{uuid4()}/resolution/candidates")

    assert response.status_code == 404
    assert response.json()["detail"] == "Requested record was not found."


def test_empty_candidate_list_when_not_enough_evidence(client: TestClient):
    case = create_case(client)
    persist_text(
        client,
        case["id"],
        "singlehandle",
        "One isolated synthetic post with no shared evidence.",
        "Solo Forum",
        "2026-09-01",
    )

    response = client.get(f"/api/v1/cases/{case['id']}/resolution/candidates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["candidates"] == []
    assert "Not enough shared evidence" in payload["warnings"][1]

