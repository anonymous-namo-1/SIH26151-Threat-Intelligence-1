from fastapi import APIRouter

from backend.app.models.schemas import (
    BlockchainEnrichmentRequest,
    BlockchainEnrichmentResponse,
    EvidenceCardRequest,
    EvidenceCardResponse,
    ExtractionRequest,
    ExtractionResponse,
    MitreAttackEnrichmentRequest,
    MitreAttackEnrichmentResponse,
    OsintEnrichmentRequest,
    OsintEnrichmentResponse,
    SyntheticSourceRecord,
)
from backend.app.services.blockchain import BlockchainEnrichmentService
from backend.app.services.evidence import EvidenceCardService
from backend.app.services.extraction import EntityExtractionService
from backend.app.services.mitre_attack import MitreAttackEnrichmentService
from backend.app.services.osint import OsintEnrichmentService
from backend.app.services.synthetic_crawler import SyntheticCrawlerSimulator


router = APIRouter(tags=["collection"])

extractor = EntityExtractionService()
osint_service = OsintEnrichmentService()
mitre_attack_service = MitreAttackEnrichmentService()
blockchain_service = BlockchainEnrichmentService()
evidence_service = EvidenceCardService()
synthetic_crawler = SyntheticCrawlerSimulator()


@router.post("/extract", response_model=ExtractionResponse)
def extract_entities(request: ExtractionRequest) -> ExtractionResponse:
    return extractor.extract(request)


@router.post("/enrich/osint", response_model=OsintEnrichmentResponse)
def enrich_osint(request: OsintEnrichmentRequest) -> OsintEnrichmentResponse:
    return osint_service.enrich(request)


@router.post("/enrich/mitre", response_model=MitreAttackEnrichmentResponse)
async def enrich_mitre(
    request: MitreAttackEnrichmentRequest,
) -> MitreAttackEnrichmentResponse:
    return await mitre_attack_service.enrich(request)


@router.post("/enrich/blockchain", response_model=BlockchainEnrichmentResponse)
def enrich_blockchain(
    request: BlockchainEnrichmentRequest,
) -> BlockchainEnrichmentResponse:
    return blockchain_service.enrich(request)


@router.post("/evidence-card", response_model=EvidenceCardResponse)
def generate_evidence_card(request: EvidenceCardRequest) -> EvidenceCardResponse:
    return evidence_service.generate(request)


@router.get("/synthetic-sources", response_model=list[SyntheticSourceRecord])
def list_synthetic_sources() -> list[SyntheticSourceRecord]:
    return synthetic_crawler.load_records()
