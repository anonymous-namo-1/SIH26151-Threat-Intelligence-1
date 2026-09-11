from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models.schemas import ProfileParseRequest
from backend.app.services.profile_parser import ProfileParserService


def test_parses_synthetic_profile_text():
    text = """
    === Vendor Profile ===
    Username: blackfalcon
    Alias: BlackFalcon_Ops
    Joined: 2025-03-14
    Reputation: 92%
    Sales: 118
    Posts: 340
    Last active: 2026-09-01
    Contact: @black_falcon_chat
    Contact: telegram: blackfalcon_market
    PGP: A1B2C3D4E5F60708
    BTC: bc1qfakewallet123abcxyz
    Profile URL: http://example-synthetic-market.test/vendor/blackfalcon
    """

    response = ProfileParserService().parse(
        ProfileParseRequest(
            text=text,
            platform="LeakHub Market Synthetic",
            source_type="synthetic_profile",
            metadata={"synthetic": True},
        )
    )

    assert response.username == "blackfalcon"
    assert response.aliases == ["BlackFalcon_Ops"]
    assert response.joined_date == "2025-03-14"
    assert response.reputation == "92%"
    assert response.sales_count == 118
    assert response.posts_count == 340
    assert response.last_active == "2026-09-01"
    assert response.pgp_keys == ["A1B2C3D4E5F60708"]
    assert response.wallets == ["bc1qfakewallet123abcxyz"]
    assert response.contact_handles == ["@black_falcon_chat", "blackfalcon_market"]
    assert response.profile_urls == [
        "http://example-synthetic-market.test/vendor/blackfalcon"
    ]
    assert response.metadata == {"synthetic": True}


def test_parses_public_profile_text_without_network():
    text = """
    Public researcher profile
    User: threat_researcher
    Known as: malware-notes
    Member since: 01/15/2024
    Post count: 42
    Last seen: 09/01/2026
    Contact: researcher.public
    Source: https://example.test/profiles/threat_researcher
    """

    response = ProfileParserService().parse(
        ProfileParseRequest(
            text=text,
            platform="Public OSINT Forum",
            source_type="public_profile_text",
        )
    )

    assert response.username == "threat_researcher"
    assert response.aliases == ["malware-notes"]
    assert response.joined_date == "01/15/2024"
    assert response.posts_count == 42
    assert response.last_active == "09/01/2026"
    assert response.contact_handles == ["researcher.public"]
    assert response.profile_urls == ["https://example.test/profiles/threat_researcher"]
    assert response.wallets == []
    assert "does not scrape websites" in response.warnings[0]


def test_profile_parse_endpoint():
    client = TestClient(app)

    response = client.post(
        "/api/v1/profile/parse",
        json={
            "text": "Handle: public_actor Alias: public_alias Reputation: 77%",
            "platform": "Public Paste",
            "source_type": "public_profile_text",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "public_actor"
    assert payload["aliases"] == ["public_alias"]
    assert payload["reputation"] == "77%"

