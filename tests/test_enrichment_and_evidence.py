from backend.app.models.schemas import (
    BlockchainEnrichmentRequest,
    EvidenceCardRequest,
    ExtractionRequest,
    OsintEnrichmentRequest,
    SourceType,
)
from backend.app.services.blockchain import BlockchainEnrichmentService
from backend.app.services.evidence import EvidenceCardService
from backend.app.services.extraction import EntityExtractionService
from backend.app.services.osint import OsintEnrichmentService


def test_osint_enrichment_matches_local_catalog():
    extraction = EntityExtractionService().extract(
        ExtractionRequest(
            source_type=SourceType.public_report,
            text="LockBit activity used T1486 against a public-sector target.",
        )
    )

    response = OsintEnrichmentService().enrich(
        OsintEnrichmentRequest(entities=extraction.entities)
    )

    assert {match.value.lower() for match in response.matches} >= {"lockbit", "t1486"}
    assert response.connector_hints


def test_blockchain_enrichment_classifies_wallets():
    response = BlockchainEnrichmentService().enrich(
        BlockchainEnrichmentRequest(
            wallets=[
                "0x1111111111111111111111111111111111111111",
                "bc1qfakewallet123",
                "not-a-wallet",
            ]
        )
    )

    assert response.wallets[0].chain == "ethereum"
    assert response.wallets[0].format_valid is True
    assert response.wallets[1].chain == "bitcoin"
    assert response.wallets[2].chain == "unknown"


def test_evidence_card_summarizes_extraction_and_enrichment():
    extractor = EntityExtractionService()
    extraction = extractor.extract(
        ExtractionRequest(
            source_type=SourceType.synthetic_dark_forum,
            handle="blackfalcon",
            text="PGP: A1B2C3D4 BTC: bc1qfakewallet123 LockBit T1486",
        )
    )
    osint = OsintEnrichmentService().enrich(
        OsintEnrichmentRequest(entities=extraction.entities)
    )
    blockchain = BlockchainEnrichmentService().enrich(
        BlockchainEnrichmentRequest(
            wallets=[wallet.value for wallet in extraction.entities.wallets]
        )
    )

    card = EvidenceCardService().generate(
        EvidenceCardRequest(
            title="Synthetic dark-web evidence",
            extraction=extraction,
            osint=osint,
            blockchain=blockchain,
        )
    )

    assert card.evidence_id
    assert card.source_credibility == "synthetic"
    assert any("wallet" in finding for finding in card.key_findings)
    assert card.enrichment_summary

