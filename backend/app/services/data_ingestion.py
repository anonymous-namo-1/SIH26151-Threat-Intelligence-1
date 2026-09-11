from uuid import UUID

from sqlalchemy.orm import Session

from backend.app.models.schemas import (
    ExtractionRequest,
    OnionMetadataIngestionRequest,
    PersistedExtractionResponse,
    ProfileIngestionRequest,
    ProfileParseRequest,
    PublicOsintIngestionRequest,
    SourceType,
    SyntheticIngestionRequest,
)
from backend.app.services.persistence import (
    BadRequestError,
    NotFoundError,
    PersistenceService,
)
from backend.app.services.profile_parser import ProfileParserService
from backend.app.services.synthetic_crawler import SyntheticCrawlerSimulator


class DataIngestionService:
    """Module 1/2 ingestion adapter for case-scoped persistence."""

    def __init__(
        self,
        persistence_service: PersistenceService,
        synthetic_crawler: SyntheticCrawlerSimulator,
        profile_parser: ProfileParserService | None = None,
    ) -> None:
        self.persistence_service = persistence_service
        self.synthetic_crawler = synthetic_crawler
        self.profile_parser = profile_parser or ProfileParserService()

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

    def ingest_profile(
        self,
        db: Session,
        case_id: UUID,
        request: ProfileIngestionRequest,
    ) -> PersistedExtractionResponse:
        parsed = self.profile_parser.parse(
            ProfileParseRequest(
                text=request.text,
                platform=request.platform,
                source_type=request.source_type.value,
                metadata=request.metadata,
            )
        )
        extraction_text = self._profile_extraction_text(request.text, parsed)
        metadata = {
            **request.metadata,
            "ingestion_module": "profile_text",
            "profile_parser": parsed.model_dump(mode="json"),
        }
        return self.persistence_service.persist_extraction(
            db=db,
            case_id=case_id,
            request=ExtractionRequest(
                text=extraction_text,
                source_type=request.source_type,
                platform=request.platform or parsed.platform or "Profile Text",
                handle=parsed.username,
                observed_at=request.observed_at,
                metadata=metadata,
            ),
        )

    def ingest_onion_metadata(
        self,
        db: Session,
        case_id: UUID,
        request: OnionMetadataIngestionRequest,
    ) -> PersistedExtractionResponse:
        extraction_text = self._onion_metadata_text(request)
        metadata = {
            **request.metadata,
            "ingestion_module": "onion_metadata",
            "title": request.title,
            "category": request.category,
            "language": request.language,
            "first_seen": request.first_seen.isoformat() if request.first_seen else None,
            "last_seen": request.last_seen.isoformat() if request.last_seen else None,
            "status": request.status,
            "mirrors": request.mirrors,
            "contacts": request.contacts,
            "banners": request.banners,
            "server_headers": request.server_headers,
            "network_access": False,
        }
        return self.persistence_service.persist_extraction(
            db=db,
            case_id=case_id,
            request=ExtractionRequest(
                text=extraction_text,
                source_type=SourceType.synthetic_onion_page,
                platform=request.title or "Onion Metadata",
                onion_url=request.onion_url,
                observed_at=request.last_seen or request.first_seen,
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

    def _profile_extraction_text(self, original_text: str, parsed) -> str:
        lines = [original_text]
        if parsed.username:
            lines.append(f"handle: {parsed.username}")
        for alias in parsed.aliases:
            lines.append(f"alias: {alias}")
        for contact in parsed.contact_handles:
            lines.append(f"contact: {contact}")
        for pgp_key in parsed.pgp_keys:
            lines.append(f"PGP: {pgp_key}")
        for wallet in parsed.wallets:
            lines.append(f"wallet: {wallet}")
        for profile_url in parsed.profile_urls:
            lines.append(f"profile url: {profile_url}")
        return "\n".join(lines)

    def _onion_metadata_text(self, request: OnionMetadataIngestionRequest) -> str:
        lines = [
            f"onion url: {request.onion_url}",
            f"title: {request.title or ''}",
            f"category: {request.category or ''}",
            f"language: {request.language or ''}",
            f"status: {request.status or ''}",
        ]
        for mirror in request.mirrors:
            lines.append(f"mirror: {mirror}")
        for contact in request.contacts:
            lines.append(f"contact: {contact}")
        for banner in request.banners:
            lines.append(f"banner: {banner}")
        for header, value in request.server_headers.items():
            lines.append(f"server header {header}: {value}")
        return "\n".join(lines)
