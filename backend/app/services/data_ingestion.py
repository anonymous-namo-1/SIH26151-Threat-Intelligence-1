from uuid import UUID

from sqlalchemy.orm import Session

from backend.app.models.schemas import (
    ExtractionRequest,
    PersistedExtractionResponse,
    PublicOsintIngestionRequest,
    SyntheticIngestionRequest,
)
from backend.app.services.persistence import (
    BadRequestError,
    NotFoundError,
    PersistenceService,
)
from backend.app.services.synthetic_crawler import SyntheticCrawlerSimulator


class DataIngestionService:
    """Module 1/2 ingestion adapter for case-scoped persistence."""

    def __init__(
        self,
        persistence_service: PersistenceService,
        synthetic_crawler: SyntheticCrawlerSimulator,
    ) -> None:
        self.persistence_service = persistence_service
        self.synthetic_crawler = synthetic_crawler

    def ingest_synthetic(
        self,
        db: Session,
        case_id: UUID,
        request: SyntheticIngestionRequest,
    ) -> PersistedExtractionResponse:
        extraction_request = self._synthetic_to_extraction_request(request)
        return self.persistence_service.persist_extraction(
            db=db,
            case_id=case_id,
            request=extraction_request,
        )

    def ingest_osint(
        self,
        db: Session,
        case_id: UUID,
        request: PublicOsintIngestionRequest,
    ) -> PersistedExtractionResponse:
        metadata = {
            **request.metadata,
            "ingestion_module": "public_osint_text",
            "source_name": request.source_name,
            "source_url": request.source_url,
            "published_at": request.published_at.isoformat()
            if request.published_at
            else None,
        }
        return self.persistence_service.persist_extraction(
            db=db,
            case_id=case_id,
            request=ExtractionRequest(
                text=request.text,
                source_type=request.source_type,
                platform=request.source_name,
                observed_at=request.observed_at or request.published_at,
                metadata={key: value for key, value in metadata.items() if value is not None},
            ),
        )

    def _synthetic_to_extraction_request(
        self, request: SyntheticIngestionRequest
    ) -> ExtractionRequest:
        if request.synthetic_source_id:
            record = self.synthetic_crawler.get_record(request.synthetic_source_id)
            if record is None:
                raise NotFoundError("Synthetic source record was not found.")
            metadata = {
                **record.metadata,
                **request.metadata,
                "ingestion_module": "synthetic_crawler_simulator",
                "synthetic_source_id": record.id,
            }
            return ExtractionRequest(
                text=record.post,
                source_type=record.source_type,
                platform=record.platform,
                handle=record.handle,
                onion_url=record.onion_url,
                observed_at=request.observed_at or record.date,
                metadata=metadata,
            )

        if not request.text:
            raise BadRequestError(
                "Synthetic ingestion requires synthetic_source_id or pasted text."
            )

        metadata = {
            **request.metadata,
            "ingestion_module": "synthetic_pasted_text",
            "synthetic": True,
        }
        return ExtractionRequest(
            text=request.text,
            source_type=request.source_type,
            platform=request.platform or "Synthetic Analyst Paste",
            handle=request.handle,
            onion_url=request.onion_url,
            observed_at=request.observed_at,
            metadata=metadata,
        )

