from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from sqlalchemy.orm import Session

from backend.app.database.session import get_db
from backend.app.models.schemas import (
    BlockchainEnrichmentRequest,
    BlockchainEnrichmentResponse,
    CaseAiProfileResponse,
    CaseCreate,
    CaseEntityResolutionResponse,
    CaseGraphResponse,
    CaseListResponse,
    CaseResponse,
    DataCollectionCapability,
    DataCollectionStatusResponse,
    EntityListResponse,
    EnrichmentRunListResponse,
    EvidenceListResponse,
    EvidenceCardRequest,
    EvidenceCardResponse,
    ExtractionRequest,
    ExtractionResponse,
    IngestionListResponse,
    IngestionResponse,
    MitreAttackEnrichmentRequest,
    MitreAttackEnrichmentResponse,
    OsintEnrichmentRequest,
    OsintEnrichmentResponse,
    OnionMetadataIngestionRequest,
    PersistedExtractionResponse,
    ProfileIngestionRequest,
    ProfileParseRequest,
    ProfileParseResponse,
    PublicOsintIngestionRequest,
    SyntheticIngestionRequest,
    SyntheticSourceRecord,
)
from backend.app.services.ai_profiling import AiProfilingService
from backend.app.services.blockchain import BlockchainEnrichmentService
from backend.app.services.data_ingestion import DataIngestionService
from backend.app.services.entity_resolution import EntityResolutionService
from backend.app.services.evidence import EvidenceCardService
from backend.app.services.extraction import EntityExtractionService
from backend.app.services.graph_intelligence import GraphIntelligenceService
from backend.app.services.mitre_attack import MitreAttackEnrichmentService
from backend.app.services.osint import OsintEnrichmentService
from backend.app.services.persistence import PersistenceError, PersistenceService
from backend.app.services.profile_parser import ProfileParserService
from backend.app.services.synthetic_crawler import SyntheticCrawlerSimulator


router = APIRouter(tags=["collection"])

extractor = EntityExtractionService()
osint_service = OsintEnrichmentService()
mitre_attack_service = MitreAttackEnrichmentService()
blockchain_service = BlockchainEnrichmentService()
evidence_service = EvidenceCardService()
profile_parser_service = ProfileParserService()
synthetic_crawler = SyntheticCrawlerSimulator()
persistence_service = PersistenceService(extractor=extractor)
data_ingestion_service = DataIngestionService(
    persistence_service=persistence_service,
    synthetic_crawler=synthetic_crawler,
    profile_parser=profile_parser_service,
)
entity_resolution_service = EntityResolutionService()
graph_intelligence_service = GraphIntelligenceService(
    resolution_service=entity_resolution_service
)
ai_profiling_service = AiProfilingService(
    resolution_service=entity_resolution_service,
    graph_service=graph_intelligence_service,
)


def persistence_http_error(error: PersistenceError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.public_message)


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


@router.post("/profile/parse", response_model=ProfileParseResponse)
def parse_profile(request: ProfileParseRequest) -> ProfileParseResponse:
    return profile_parser_service.parse(request)


@router.get(
    "/data-collection/status",
    response_model=DataCollectionStatusResponse,
    tags=["collection"],
)
def data_collection_status() -> DataCollectionStatusResponse:
    capabilities = [
        ("synthetic_crawler_simulator", "Synthetic crawler simulator"),
        ("public_osint_ingestion", "Public OSINT ingestion"),
        ("pgp_extraction", "PGP key extraction"),
        ("wallet_extraction", "Wallet address extraction"),
        ("handle_extraction", "Handle extraction"),
        ("profile_parser_ingestion", "Profile parser and ingestion"),
        ("onion_metadata_ingestion", "Onion metadata ingestion"),
        ("persistence", "Case-scoped persistence"),
        ("mitre_enrichment_available", "MITRE ATT&CK enrichment available"),
        ("blockchain_enrichment_available", "Blockchain enrichment available"),
    ]
    return DataCollectionStatusResponse(
        module="Module 1: Data Collection Layer",
        implemented=True,
        capabilities=[
            DataCollectionCapability(key=key, label=label, implemented=True)
            for key, label in capabilities
        ],
        safety_warnings=[
            "No Tor access is implemented.",
            "No live onion crawling or fetching is implemented.",
            "Synthetic dark-web data and legal public OSINT only; illegal content ingestion is out of scope.",
        ],
    )


@router.get("/synthetic-sources", response_model=list[SyntheticSourceRecord])
def list_synthetic_sources() -> list[SyntheticSourceRecord]:
    return synthetic_crawler.load_records()


@router.post("/cases", response_model=CaseResponse, status_code=201, tags=["cases"])
def create_case(request: CaseCreate, db: Session = Depends(get_db)) -> CaseResponse:
    try:
        return persistence_service.create_case(db, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get("/cases", response_model=CaseListResponse, tags=["cases"])
def list_cases(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CaseListResponse:
    try:
        return persistence_service.list_cases(db, limit=limit, offset=offset)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get("/cases/{case_id}", response_model=CaseResponse, tags=["cases"])
def get_case(case_id: UUID, db: Session = Depends(get_db)) -> CaseResponse:
    try:
        return persistence_service.get_case(db, case_id)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.post(
    "/cases/{case_id}/ingestions",
    response_model=PersistedExtractionResponse,
    status_code=201,
    tags=["cases"],
)
def create_case_ingestion(
    case_id: UUID,
    request: ExtractionRequest,
    db: Session = Depends(get_db),
) -> PersistedExtractionResponse:
    try:
        return persistence_service.persist_extraction(db, case_id, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.post(
    "/cases/{case_id}/ingest/synthetic",
    response_model=PersistedExtractionResponse,
    status_code=201,
    tags=["cases"],
)
def ingest_synthetic_source(
    case_id: UUID,
    request: SyntheticIngestionRequest,
    db: Session = Depends(get_db),
) -> PersistedExtractionResponse:
    try:
        return data_ingestion_service.ingest_synthetic(db, case_id, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.post(
    "/cases/{case_id}/ingest/osint",
    response_model=PersistedExtractionResponse,
    status_code=201,
    tags=["cases"],
)
def ingest_public_osint(
    case_id: UUID,
    request: PublicOsintIngestionRequest,
    db: Session = Depends(get_db),
) -> PersistedExtractionResponse:
    try:
        return data_ingestion_service.ingest_osint(db, case_id, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.post(
    "/cases/{case_id}/ingest/profile",
    response_model=PersistedExtractionResponse,
    status_code=201,
    tags=["cases"],
)
def ingest_profile(
    case_id: UUID,
    request: ProfileIngestionRequest,
    db: Session = Depends(get_db),
) -> PersistedExtractionResponse:
    try:
        return data_ingestion_service.ingest_profile(db, case_id, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.post(
    "/cases/{case_id}/ingest/onion-metadata",
    response_model=PersistedExtractionResponse,
    status_code=201,
    tags=["cases"],
)
def ingest_onion_metadata(
    case_id: UUID,
    request: OnionMetadataIngestionRequest,
    db: Session = Depends(get_db),
) -> PersistedExtractionResponse:
    try:
        return data_ingestion_service.ingest_onion_metadata(db, case_id, request)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/ingestions",
    response_model=IngestionListResponse,
    tags=["cases"],
)
def list_case_ingestions(
    case_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> IngestionListResponse:
    try:
        return persistence_service.list_ingestions(
            db, case_id=case_id, limit=limit, offset=offset
        )
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/ingestions/{ingestion_id}",
    response_model=IngestionResponse,
    tags=["cases"],
)
def get_case_ingestion(
    case_id: UUID,
    ingestion_id: UUID,
    db: Session = Depends(get_db),
) -> IngestionResponse:
    try:
        return persistence_service.get_ingestion(db, case_id, ingestion_id)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/entities",
    response_model=EntityListResponse,
    tags=["cases"],
)
def list_case_entities(
    case_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> EntityListResponse:
    try:
        return persistence_service.list_entities(
            db, case_id=case_id, limit=limit, offset=offset
        )
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/evidence",
    response_model=EvidenceListResponse,
    tags=["cases"],
)
def list_case_evidence(
    case_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> EvidenceListResponse:
    try:
        return persistence_service.list_evidence(
            db, case_id=case_id, limit=limit, offset=offset
        )
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/enrichment-runs",
    response_model=EnrichmentRunListResponse,
    tags=["cases"],
)
def list_case_enrichment_runs(
    case_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> EnrichmentRunListResponse:
    try:
        return persistence_service.list_enrichment_runs(
            db, case_id=case_id, limit=limit, offset=offset
        )
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/resolution/candidates",
    response_model=CaseEntityResolutionResponse,
    tags=["cases"],
)
def list_case_resolution_candidates(
    case_id: UUID,
    db: Session = Depends(get_db),
) -> CaseEntityResolutionResponse:
    try:
        return entity_resolution_service.resolve_case(db, case_id)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/graph",
    response_model=CaseGraphResponse,
    tags=["cases"],
)
def get_case_graph(
    case_id: UUID,
    db: Session = Depends(get_db),
) -> CaseGraphResponse:
    try:
        return graph_intelligence_service.build_case_graph(db, case_id)
    except PersistenceError as error:
        raise persistence_http_error(error) from error


@router.get(
    "/cases/{case_id}/ai-profile",
    response_model=CaseAiProfileResponse,
    tags=["cases"],
)
def get_case_ai_profile(
    case_id: UUID,
    db: Session = Depends(get_db),
) -> CaseAiProfileResponse:
    try:
        return ai_profiling_service.build_case_profile(db, case_id)
    except PersistenceError as error:
        raise persistence_http_error(error) from error
