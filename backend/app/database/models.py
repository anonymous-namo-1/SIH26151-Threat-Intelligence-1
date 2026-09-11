from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database.base import Base
from backend.app.database.types import GUID, JSONDict, UTCDateTime


def utcnow() -> datetime:
    return datetime.now(UTC)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow, onupdate=utcnow
    )

    ingestions: Mapped[list["Ingestion"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        passive_deletes=True,
        overlaps="enrichment_runs",
    )
    entities: Mapped[list["Entity"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    enrichment_runs: Mapped[list["EnrichmentRun"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_cases_status_created_at", "status", "created_at"),
    )


class Ingestion(Base):
    __tablename__ = "ingestions"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(200))
    handle: Mapped[str | None] = mapped_column(String(200))
    onion_url: Mapped[str | None] = mapped_column(String(500))
    observed_at: Mapped[date | None] = mapped_column(Date)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONDict, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow
    )

    case: Mapped[Case] = relationship(back_populates="ingestions")
    evidence_links: Mapped[list["EvidenceEntityLink"]] = relationship(
        back_populates="ingestion",
        cascade="all, delete-orphan",
        passive_deletes=True,
        overlaps="entity,evidence_links",
    )
    enrichment_runs: Mapped[list["EnrichmentRun"]] = relationship(
        back_populates="ingestion",
        passive_deletes=True,
        overlaps="case,enrichment_runs",
    )

    __table_args__ = (
        UniqueConstraint("case_id", "id", name="uq_ingestions_case_id_id"),
        Index("ix_ingestions_case_created_at", "case_id", "created_at"),
        Index("ix_ingestions_content_sha256", "content_sha256"),
    )


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[str] = mapped_column(String(1000), nullable=False)
    normalized_value: Mapped[str] = mapped_column(String(1000), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow, onupdate=utcnow
    )

    case: Mapped[Case] = relationship(back_populates="entities")
    evidence_links: Mapped[list["EvidenceEntityLink"]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
        passive_deletes=True,
        overlaps="evidence_links,ingestion",
    )

    __table_args__ = (
        UniqueConstraint(
            "case_id",
            "entity_type",
            "normalized_value",
            name="uq_entities_case_type_normalized",
        ),
        UniqueConstraint("case_id", "id", name="uq_entities_case_id_id"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_entities_confidence"),
        Index("ix_entities_case_type", "case_id", "entity_type"),
        Index("ix_entities_normalized_value", "normalized_value"),
    )


class EvidenceEntityLink(Base):
    __tablename__ = "evidence_entity_links"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    ingestion_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(GUID(), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    source_field: Mapped[str] = mapped_column(String(120), nullable=False, default="text")
    evidence_snippet: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow
    )

    ingestion: Mapped[Ingestion] = relationship(
        back_populates="evidence_links",
        overlaps="entity,evidence_links",
    )
    entity: Mapped[Entity] = relationship(
        back_populates="evidence_links",
        overlaps="evidence_links,ingestion",
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["case_id", "ingestion_id"],
            ["ingestions.case_id", "ingestions.id"],
            ondelete="CASCADE",
            name="fk_evidence_links_case_ingestion",
        ),
        ForeignKeyConstraint(
            ["case_id", "entity_id"],
            ["entities.case_id", "entities.id"],
            ondelete="CASCADE",
            name="fk_evidence_links_case_entity",
        ),
        UniqueConstraint(
            "ingestion_id",
            "entity_id",
            "source_field",
            "evidence_snippet",
            name="uq_evidence_links_ingestion_entity_field_snippet",
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_evidence_links_confidence",
        ),
        Index("ix_evidence_links_case_ingestion", "case_id", "ingestion_id"),
        Index("ix_evidence_links_entity", "entity_id"),
    )


class EnrichmentRun(Base):
    __tablename__ = "enrichment_runs"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(
        GUID(), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    ingestion_id: Mapped[UUID | None] = mapped_column(GUID())
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    request_payload: Mapped[dict] = mapped_column(JSONDict, nullable=False, default=dict)
    result_payload: Mapped[dict | None] = mapped_column(JSONDict)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, default=utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    case: Mapped[Case] = relationship(
        back_populates="enrichment_runs",
        overlaps="enrichment_runs",
    )
    ingestion: Mapped[Ingestion | None] = relationship(
        back_populates="enrichment_runs",
        overlaps="case,enrichment_runs",
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["case_id", "ingestion_id"],
            ["ingestions.case_id", "ingestions.id"],
            ondelete="CASCADE",
            name="fk_enrichment_runs_case_ingestion",
        ),
        Index("ix_enrichment_runs_case_started", "case_id", "started_at"),
        Index("ix_enrichment_runs_provider_status", "provider", "status"),
    )
