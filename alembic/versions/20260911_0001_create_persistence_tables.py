"""create persistence tables

Revision ID: 20260911_0001
Revises:
Create Date: 2026-09-11 00:01:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from backend.app.database.types import GUID, JSONDict, UTCDateTime


revision: str = "20260911_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("updated_at", UTCDateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cases_status_created_at",
        "cases",
        ["status", "created_at"],
        unique=False,
    )

    op.create_table(
        "ingestions",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("case_id", GUID(), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("platform", sa.String(length=200), nullable=True),
        sa.Column("handle", sa.String(length=200), nullable=True),
        sa.Column("onion_url", sa.String(length=500), nullable=True),
        sa.Column("observed_at", sa.Date(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("metadata", JSONDict, nullable=False),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_id", "id", name="uq_ingestions_case_id_id"),
    )
    op.create_index(
        "ix_ingestions_case_created_at",
        "ingestions",
        ["case_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ingestions_content_sha256",
        "ingestions",
        ["content_sha256"],
        unique=False,
    )

    op.create_table(
        "entities",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("case_id", GUID(), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("value", sa.String(length=1000), nullable=False),
        sa.Column("normalized_value", sa.String(length=1000), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("first_seen", UTCDateTime(), nullable=False),
        sa.Column("last_seen", UTCDateTime(), nullable=False),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("updated_at", UTCDateTime(), nullable=False),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_entities_confidence",
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_id", "id", name="uq_entities_case_id_id"),
        sa.UniqueConstraint(
            "case_id",
            "entity_type",
            "normalized_value",
            name="uq_entities_case_type_normalized",
        ),
    )
    op.create_index(
        "ix_entities_case_type",
        "entities",
        ["case_id", "entity_type"],
        unique=False,
    )
    op.create_index(
        "ix_entities_normalized_value",
        "entities",
        ["normalized_value"],
        unique=False,
    )

    op.create_table(
        "evidence_entity_links",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("case_id", GUID(), nullable=False),
        sa.Column("ingestion_id", GUID(), nullable=False),
        sa.Column("entity_id", GUID(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("source_field", sa.String(length=120), nullable=False),
        sa.Column("evidence_snippet", sa.Text(), nullable=False),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_evidence_links_confidence",
        ),
        sa.ForeignKeyConstraint(
            ["case_id", "entity_id"],
            ["entities.case_id", "entities.id"],
            ondelete="CASCADE",
            name="fk_evidence_links_case_entity",
        ),
        sa.ForeignKeyConstraint(
            ["case_id", "ingestion_id"],
            ["ingestions.case_id", "ingestions.id"],
            ondelete="CASCADE",
            name="fk_evidence_links_case_ingestion",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "ingestion_id",
            "entity_id",
            "source_field",
            "evidence_snippet",
            name="uq_evidence_links_ingestion_entity_field_snippet",
        ),
    )
    op.create_index(
        "ix_evidence_links_case_ingestion",
        "evidence_entity_links",
        ["case_id", "ingestion_id"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_links_entity",
        "evidence_entity_links",
        ["entity_id"],
        unique=False,
    )

    op.create_table(
        "enrichment_runs",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("case_id", GUID(), nullable=False),
        sa.Column("ingestion_id", GUID(), nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("request_payload", JSONDict, nullable=False),
        sa.Column("result_payload", JSONDict, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", UTCDateTime(), nullable=False),
        sa.Column("completed_at", UTCDateTime(), nullable=True),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["case_id", "ingestion_id"],
            ["ingestions.case_id", "ingestions.id"],
            ondelete="CASCADE",
            name="fk_enrichment_runs_case_ingestion",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_enrichment_runs_case_started",
        "enrichment_runs",
        ["case_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_enrichment_runs_provider_status",
        "enrichment_runs",
        ["provider", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_enrichment_runs_provider_status", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_case_started", table_name="enrichment_runs")
    op.drop_table("enrichment_runs")
    op.drop_index("ix_evidence_links_entity", table_name="evidence_entity_links")
    op.drop_index(
        "ix_evidence_links_case_ingestion",
        table_name="evidence_entity_links",
    )
    op.drop_table("evidence_entity_links")
    op.drop_index("ix_entities_normalized_value", table_name="entities")
    op.drop_index("ix_entities_case_type", table_name="entities")
    op.drop_table("entities")
    op.drop_index("ix_ingestions_content_sha256", table_name="ingestions")
    op.drop_index("ix_ingestions_case_created_at", table_name="ingestions")
    op.drop_table("ingestions")
    op.drop_index("ix_cases_status_created_at", table_name="cases")
    op.drop_table("cases")
