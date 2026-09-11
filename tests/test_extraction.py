from backend.app.models.schemas import ExtractionRequest, SourceType
from backend.app.services.extraction import EntityExtractionService


def test_extracts_synthetic_dark_web_entities():
    service = EntityExtractionService()
    response = service.extract(
        ExtractionRequest(
            source_type=SourceType.synthetic_dark_forum,
            platform="LeakHub Market",
            handle="blackfalcon",
            text=(
                "Selling corporate access. Contact PGP: A1B2C3D4. "
                "BTC: bc1qfakewallet123. Visit http://leakhubfakeabcd.onion. "
                "Telegram: @falcon_drop."
            ),
        )
    )

    assert response.source_credibility == "synthetic"
    assert {entity.value for entity in response.entities.handles} >= {
        "blackfalcon",
        "falcon_drop",
    }
    assert [entity.value for entity in response.entities.wallets] == [
        "bc1qfakewallet123"
    ]
    assert [entity.value for entity in response.entities.pgp_keys] == ["A1B2C3D4"]
    assert response.entities.onion_urls[0].value == "http://leakhubfakeabcd.onion"
    assert response.warnings


def test_extracts_public_report_entities():
    service = EntityExtractionService()
    response = service.extract(
        ExtractionRequest(
            source_type=SourceType.public_report,
            text=(
                "A public report links LockBit activity to T1486 and "
                "CVE-2023-34362. IOCs include 198.51.100.10, evil.example, "
                "0x1111111111111111111111111111111111111111, and "
                "d41d8cd98f00b204e9800998ecf8427e."
            ),
        )
    )

    assert response.source_credibility == "high"
    assert response.entities.threat_actors[0].value == "LockBit"
    assert response.entities.mitre_techniques[0].value == "T1486"
    assert response.entities.cves[0].value == "CVE-2023-34362"
    assert response.entities.ips[0].value == "198.51.100.10"
    assert response.entities.domains[0].value == "evil.example"
    assert response.entities.wallets[0].entity_type == "wallet:eth"
    assert response.entities.hashes[0].entity_type == "file_hash"

