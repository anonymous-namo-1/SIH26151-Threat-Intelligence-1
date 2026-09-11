import hashlib
import json
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from backend.app.database.models import (
    Case,
    Entity,
    EnrichmentRun,
    EvidenceEntityLink,
    Ingestion,
)
from backend.app.models.schemas import (
    CaseCreate,
    CaseListResponse,
    CaseResponse,
    EntityListResponse,
    EntityRecordResponse,
    EntityValue,
    EnrichmentRunListResponse,
    EnrichmentRunResponse,
    EvidenceEntityLinkResponse,
    EvidenceListResponse,
    ExtractedEntities,
    ExtractionRequest,
    IngestionListResponse,
    IngestionResponse,
    PaginationMeta,
    PersistedExtractionResponse,
)
from backend.app.services.extraction import EntityExtractionService


MAX_RAW_TEXT_CHARS = 200_000
MAX_METADATA_BYTES = 32_768
MAX_EVIDENCE_SNIPPET_CHARS = 2_000


class PersistenceError(Exception):
    status_code = 500
    public_message = "Persistence error."

    def __init__(self, public_message: str | None = None) -> None:
        if public_message:
            self.public_message = public_message
        super().__init__(self.public_message)


class BadRequestError(PersistenceError):
    status_code = 400
    public_message = "Invalid persistence request."


class NotFoundError(PersistenceError):
    status_code = 404
    public_message = "Requested record was not found."


class ConflictError(PersistenceError):
    status_code = 409
    public_message = "The request conflicts with existing persisted data."


class DatabaseUnavailableError(PersistenceError):
    status_code = 503
    public_message = "Database is unavailable."


class PersistenceService:
    def __init__(self, extractor: EntityExtractionService | None = None) -> None:
        self.extractor = extractor or EntityExtractionService()

    def create_case(self, db: Session, request: CaseCreate) -> CaseResponse:
        try:
            case = Case(
                title=request.title.strip(),
                description=request.description,
                status=request.status.strip(),
            )
            db.add(case)
            db.commit()
            db.refresh(case)
            return CaseResponse.model_validate(case)
        except IntegrityError as error:
            db.rollback()
            raise ConflictError() from error
        except SQLAlchemyError as error:
            db.rollback()
            raise DatabaseUnavailableError() from error

    def list_cases(self, db: Session, limit: int, offset: int) -> CaseListResponse:
        try:
            total = self._count(db, select(Case))
            cases = db.scalars(
                select(Case).order_by(Case.created_at.desc()).limit(limit).offset(offset)
            ).all()
            return CaseListResponse(
                items=[CaseResponse.model_validate(case) for case in cases],
                pagination=PaginationMeta(limit=limit, offset=offset, total=total),
            )
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def get_case(self, db: Session, case_id: UUID) -> CaseResponse:
        try:
            case = db.get(Case, case_id)
            if case is None:
                raise NotFoundError()
            return CaseResponse.model_validate(case)
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def persist_extraction(
        self, db: Session, case_id: UUID, request: ExtractionRequest
    ) -> PersistedExtractionResponse:
        self._validate_ingestion_request(request)
        extraction = self.extractor.extract(request)
        observed_at = self._observed_datetime(request)

        try:
            with db.begin():
                case = db.get(Case, case_id)
                if case is None:
                    raise NotFoundError()

                ingestion = Ingestion(
                    case_id=case.id,
                    source_type=request.source_type.value,
                    platform=request.platform,
                    handle=request.handle,
                    onion_url=request.onion_url,
                    observed_at=request.observed_at,
                    raw_text=request.text,
                    content_sha256=self._sha256(request.text),
                    metadata_=request.metadata,
                )
                db.add(ingestion)
                db.flush()

                for entity_value in self._flatten_entities(extraction.entities):
                    entity = self._upsert_entity(
                        db=db,
                        case_id=case.id,
                        entity_value=entity_value,
                        observed_at=observed_at,
                    )
                    self._link_evidence(db, case.id, ingestion.id, entity, entity_value)

            return PersistedExtractionResponse(
                ingestion=self._ingestion_response(ingestion),
                extraction=extraction,
            )
        except PersistenceError:
            raise
        except IntegrityError as error:
            db.rollback()
            raise ConflictError() from error
        except SQLAlchemyError as error:
            db.rollback()
            raise DatabaseUnavailableError() from error

    def list_ingestions(
        self, db: Session, case_id: UUID, limit: int, offset: int
    ) -> IngestionListResponse:
        try:
            self._require_case(db, case_id)
            statement = select(Ingestion).where(Ingestion.case_id == case_id)
            total = self._count(db, statement)
            ingestions = db.scalars(
                statement.order_by(Ingestion.created_at.desc()).limit(limit).offset(offset)
            ).all()
            return IngestionListResponse(
                items=[self._ingestion_response(ingestion) for ingestion in ingestions],
                pagination=PaginationMeta(limit=limit, offset=offset, total=total),
            )
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def get_ingestion(
        self, db: Session, case_id: UUID, ingestion_id: UUID
    ) -> IngestionResponse:
        try:
            ingestion = db.scalar(
                select(Ingestion).where(
                    Ingestion.case_id == case_id,
                    Ingestion.id == ingestion_id,
                )
            )
            if ingestion is None:
                raise NotFoundError()
            return self._ingestion_response(ingestion)
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def list_entities(
        self, db: Session, case_id: UUID, limit: int, offset: int
    ) -> EntityListResponse:
        try:
            self._require_case(db, case_id)
            statement = select(Entity).where(Entity.case_id == case_id)
            total = self._count(db, statement)
            entities = db.scalars(
                statement.order_by(Entity.entity_type, Entity.value).limit(limit).offset(offset)
            ).all()
            return EntityListResponse(
                items=[EntityRecordResponse.model_validate(entity) for entity in entities],
                pagination=PaginationMeta(limit=limit, offset=offset, total=total),
            )
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def list_evidence(
        self, db: Session, case_id: UUID, limit: int, offset: int
    ) -> EvidenceListResponse:
        try:
            self._require_case(db, case_id)
            statement = select(EvidenceEntityLink).where(
                EvidenceEntityLink.case_id == case_id
            )
            total = self._count(db, statement)
            links = db.scalars(
                statement.options(joinedload(EvidenceEntityLink.entity))
                .order_by(EvidenceEntityLink.created_at.desc())
                .limit(limit)
                .offset(offset)
            ).all()
            return EvidenceListResponse(
                items=[self._evidence_response(link) for link in links],
                pagination=PaginationMeta(limit=limit, offset=offset, total=total),
            )
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def list_enrichment_runs(
        self, db: Session, case_id: UUID, limit: int, offset: int
    ) -> EnrichmentRunListResponse:
        try:
            self._require_case(db, case_id)
            statement = select(EnrichmentRun).where(EnrichmentRun.case_id == case_id)
            total = self._count(db, statement)
            runs = db.scalars(
                statement.order_by(EnrichmentRun.started_at.desc())
                .limit(limit)
                .offset(offset)
            ).all()
            return EnrichmentRunListResponse(
                items=[EnrichmentRunResponse.model_validate(run) for run in runs],
                pagination=PaginationMeta(limit=limit, offset=offset, total=total),
            )
        except PersistenceError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

    def _upsert_entity(
        self,
        db: Session,
        case_id: UUID,
        entity_value: EntityValue,
        observed_at: datetime,
    ) -> Entity:
        normalized_value = self._normalize(entity_value.value)
        entity = db.scalar(
            select(Entity).where(
                Entity.case_id == case_id,
                Entity.entity_type == entity_value.entity_type,
                Entity.normalized_value == normalized_value,
            )
        )
        if entity is not None:
            entity.confidence = max(entity.confidence, entity_value.confidence)
            entity.last_seen = max(entity.last_seen, observed_at)
            return entity

        entity = Entity(
            case_id=case_id,
            entity_type=entity_value.entity_type,
            value=entity_value.value,
            normalized_value=normalized_value,
            confidence=entity_value.confidence,
            first_seen=observed_at,
            last_seen=observed_at,
        )
        db.add(entity)
        db.flush()
        return entity

    def _link_evidence(
        self,
        db: Session,
        case_id: UUID,
        ingestion_id: UUID,
        entity: Entity,
        entity_value: EntityValue,
    ) -> None:
        snippet = (entity_value.evidence or entity_value.value)[:MAX_EVIDENCE_SNIPPET_CHARS]
        existing = db.scalar(
            select(EvidenceEntityLink).where(
                EvidenceEntityLink.ingestion_id == ingestion_id,
                EvidenceEntityLink.entity_id == entity.id,
                EvidenceEntityLink.source_field == entity_value.source_field,
                EvidenceEntityLink.evidence_snippet == snippet,
            )
        )
        if existing is not None:
            return
        db.add(
            EvidenceEntityLink(
                case_id=case_id,
                ingestion_id=ingestion_id,
                entity_id=entity.id,
                confidence=entity_value.confidence,
                source_field=entity_value.source_field,
                evidence_snippet=snippet,
            )
        )

    def _require_case(self, db: Session, case_id: UUID) -> None:
        if db.get(Case, case_id) is None:
            raise NotFoundError()

    def _count(self, db: Session, statement: Select) -> int:
        return db.scalar(
            select(func.count()).select_from(statement.order_by(None).subquery())
        ) or 0

    def _validate_ingestion_request(self, request: ExtractionRequest) -> None:
        if len(request.text) > MAX_RAW_TEXT_CHARS:
            raise BadRequestError("Raw text exceeds the maximum allowed size.")
        metadata_size = len(json.dumps(request.metadata, default=str).encode("utf-8"))
        if metadata_size > MAX_METADATA_BYTES:
            raise BadRequestError("Metadata exceeds the maximum allowed size.")

    def _flatten_entities(self, entities: ExtractedEntities) -> list[EntityValue]:
        flattened = []
        for values in entities.model_dump().values():
            flattened.extend(EntityValue(**value) for value in values)
        return flattened

    def _ingestion_response(self, ingestion: Ingestion) -> IngestionResponse:
        return IngestionResponse(
            id=ingestion.id,
            case_id=ingestion.case_id,
            source_type=ingestion.source_type,
            platform=ingestion.platform,
            handle=ingestion.handle,
            onion_url=ingestion.onion_url,
            observed_at=ingestion.observed_at,
            raw_text=ingestion.raw_text,
            content_sha256=ingestion.content_sha256,
            metadata=ingestion.metadata_ or {},
            created_at=ingestion.created_at,
        )

    def _evidence_response(self, link: EvidenceEntityLink) -> EvidenceEntityLinkResponse:
        return EvidenceEntityLinkResponse(
            id=link.id,
            case_id=link.case_id,
            ingestion_id=link.ingestion_id,
            entity_id=link.entity_id,
            confidence=link.confidence,
            source_field=link.source_field,
            evidence_snippet=link.evidence_snippet,
            created_at=link.created_at,
            entity=EntityRecordResponse.model_validate(link.entity),
        )

    def _observed_datetime(self, request: ExtractionRequest) -> datetime:
        if request.observed_at is not None:
            return datetime.combine(request.observed_at, datetime.min.time(), tzinfo=UTC)
        return datetime.now(UTC)

    def _normalize(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()

    def _sha256(self, value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()
