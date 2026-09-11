from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SourceType(StrEnum):
    synthetic_dark_forum = "synthetic_dark_forum"
    synthetic_marketplace = "synthetic_marketplace"
    synthetic_ransom_chat = "synthetic_ransom_chat"
    synthetic_onion_page = "synthetic_onion_page"
    public_report = "public_report"
    public_advisory = "public_advisory"
    public_indicator = "public_indicator"
    analyst_submission = "analyst_submission"


class EntityValue(BaseModel):
    value: str
    entity_type: str
    confidence: float = Field(ge=0, le=1)
    source_field: str = "text"
    evidence: str | None = None


class ExtractedEntities(BaseModel):
    handles: list[EntityValue] = Field(default_factory=list)
    wallets: list[EntityValue] = Field(default_factory=list)
    pgp_keys: list[EntityValue] = Field(default_factory=list)
    onion_urls: list[EntityValue] = Field(default_factory=list)
    domains: list[EntityValue] = Field(default_factory=list)
    ips: list[EntityValue] = Field(default_factory=list)
    emails: list[EntityValue] = Field(default_factory=list)
    hashes: list[EntityValue] = Field(default_factory=list)
    malware_names: list[EntityValue] = Field(default_factory=list)
    mitre_techniques: list[EntityValue] = Field(default_factory=list)
    cves: list[EntityValue] = Field(default_factory=list)
    threat_actors: list[EntityValue] = Field(default_factory=list)


class ExtractionRequest(BaseModel):
    text: str = Field(min_length=1)
    source_type: SourceType = SourceType.analyst_submission
    platform: str | None = None
    handle: str | None = None
    onion_url: str | None = None
    observed_at: date | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExtractionResponse(BaseModel):
    source_type: SourceType
    source_credibility: Literal["synthetic", "low", "medium", "high"]
    entities: ExtractedEntities
    evidence_snippets: list[str]
    warnings: list[str] = Field(default_factory=list)


class OsintEnrichmentRequest(BaseModel):
    entities: ExtractedEntities
    include_connector_hints: bool = True


class OsintMatch(BaseModel):
    entity_type: str
    value: str
    matched_source: str
    summary: str
    confidence: float = Field(ge=0, le=1)
    references: list[str] = Field(default_factory=list)


class OsintEnrichmentResponse(BaseModel):
    matches: list[OsintMatch]
    connector_hints: list[str]
    warnings: list[str] = Field(default_factory=list)


class MitreAttackEnrichmentRequest(BaseModel):
    entities: ExtractedEntities


class MitreAttackReference(BaseModel):
    source_name: str
    url: str | None = None
    external_id: str | None = None


class MitreAttackTechnique(BaseModel):
    mitre_id: str
    name: str
    description: str | None = None
    references: list[MitreAttackReference] = Field(default_factory=list)


class MitreAttackSoftware(BaseModel):
    mitre_id: str | None = None
    name: str
    software_type: Literal["malware", "tool"]
    description: str | None = None
    references: list[MitreAttackReference] = Field(default_factory=list)


class MitreAttackGroupMatch(BaseModel):
    matched_input: str
    matched_on: Literal["group_name", "alias", "technique"]
    group_name: str
    mitre_group_id: str | None = None
    aliases: list[str] = Field(default_factory=list)
    description: str | None = None
    techniques_used: list[MitreAttackTechnique] = Field(default_factory=list)
    malware_tools_used: list[MitreAttackSoftware] = Field(default_factory=list)
    mitre_source_references: list[MitreAttackReference] = Field(default_factory=list)
    match_confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)


class MitreAttackEnrichmentResponse(BaseModel):
    matches: list[MitreAttackGroupMatch]
    warnings: list[str] = Field(default_factory=list)
    dataset_version: str | None = None
    dataset_modified: str | None = None


class BlockchainEnrichmentRequest(BaseModel):
    wallets: list[str] = Field(default_factory=list)

    @field_validator("wallets")
    @classmethod
    def strip_wallets(cls, wallets: list[str]) -> list[str]:
        return [wallet.strip() for wallet in wallets if wallet.strip()]


class WalletEnrichment(BaseModel):
    address: str
    chain: Literal["bitcoin", "ethereum", "unknown"]
    format_valid: bool
    risk_note: str
    public_explorer_urls: list[str] = Field(default_factory=list)


class BlockchainEnrichmentResponse(BaseModel):
    wallets: list[WalletEnrichment]
    warnings: list[str] = Field(default_factory=list)


class EvidenceCardRequest(BaseModel):
    title: str | None = None
    extraction: ExtractionResponse
    osint: OsintEnrichmentResponse | None = None
    blockchain: BlockchainEnrichmentResponse | None = None
    analyst_notes: str | None = None


class EvidenceCardResponse(BaseModel):
    evidence_id: str
    title: str
    generated_at: datetime
    source_credibility: Literal["synthetic", "low", "medium", "high"]
    key_findings: list[str]
    entities: ExtractedEntities
    evidence_snippets: list[str]
    enrichment_summary: list[str]
    analyst_notes: str | None = None


class SyntheticSourceRecord(BaseModel):
    source_type: SourceType
    platform: str
    handle: str
    post: str
    onion_url: str | None = None
    date: date
    metadata: dict[str, Any] = Field(default_factory=dict)


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: str = Field(default="open", min_length=1, max_length=40)


class CaseResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginationMeta(BaseModel):
    limit: int
    offset: int
    total: int


class CaseListResponse(BaseModel):
    items: list[CaseResponse]
    pagination: PaginationMeta


class IngestionResponse(BaseModel):
    id: UUID
    case_id: UUID
    source_type: SourceType
    platform: str | None = None
    handle: str | None = None
    onion_url: str | None = None
    observed_at: date | None = None
    raw_text: str
    content_sha256: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class IngestionListResponse(BaseModel):
    items: list[IngestionResponse]
    pagination: PaginationMeta


class EntityRecordResponse(BaseModel):
    id: UUID
    case_id: UUID
    entity_type: str
    value: str
    normalized_value: str
    confidence: float = Field(ge=0, le=1)
    first_seen: datetime
    last_seen: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EntityListResponse(BaseModel):
    items: list[EntityRecordResponse]
    pagination: PaginationMeta


class EvidenceEntityLinkResponse(BaseModel):
    id: UUID
    case_id: UUID
    ingestion_id: UUID
    entity_id: UUID
    confidence: float = Field(ge=0, le=1)
    source_field: str
    evidence_snippet: str
    created_at: datetime
    entity: EntityRecordResponse


class EvidenceListResponse(BaseModel):
    items: list[EvidenceEntityLinkResponse]
    pagination: PaginationMeta


class EnrichmentRunResponse(BaseModel):
    id: UUID
    case_id: UUID
    ingestion_id: UUID | None = None
    provider: str
    status: str
    request_payload: dict[str, Any] = Field(default_factory=dict)
    result_payload: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class EnrichmentRunListResponse(BaseModel):
    items: list[EnrichmentRunResponse]
    pagination: PaginationMeta


class PersistedExtractionResponse(BaseModel):
    ingestion: IngestionResponse
    extraction: ExtractionResponse
