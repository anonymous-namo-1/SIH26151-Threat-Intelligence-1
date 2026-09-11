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
    id: str
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


class ResolutionRuleHit(BaseModel):
    rule: str
    description: str
    score: float = Field(ge=0, le=1)
    matched_value: str | None = None
    evidence_snippets: list[str] = Field(default_factory=list)
    source_ingestion_ids: list[UUID] = Field(default_factory=list)


class EntityLinkCandidate(BaseModel):
    left_entity: EntityRecordResponse
    right_entity: EntityRecordResponse
    confidence_score: float = Field(ge=0, le=1)
    rule_hits: list[ResolutionRuleHit]
    evidence_snippets: list[str] = Field(default_factory=list)
    source_ingestion_ids: list[UUID] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EntityResolutionResponse(BaseModel):
    candidates: list[EntityLinkCandidate]
    warnings: list[str] = Field(default_factory=list)


class CaseEntityResolutionResponse(EntityResolutionResponse):
    case_id: UUID
    generated_at: datetime


class GraphNode(BaseModel):
    id: str
    entity_id: UUID | None = None
    ingestion_id: UUID | None = None
    type: Literal[
        "handle",
        "alias",
        "wallet",
        "pgp_key",
        "telegram",
        "email",
        "domain",
        "ip_address",
        "onion_url",
        "malware",
        "mitre_technique",
        "cve",
        "source",
        "ingestion",
    ]
    label: str
    value: str
    group: Literal[
        "identity",
        "crypto",
        "security_key",
        "contact",
        "infrastructure",
        "threat_context",
        "source",
    ]
    risk_level: Literal["low", "medium", "high"]
    confidence: float = Field(ge=0, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: Literal[
        "mentioned_in",
        "uses_wallet",
        "uses_pgp",
        "has_contact",
        "hosted_on",
        "observed_in_source",
        "resolved_candidate",
        "shared_indicator",
        "related_to",
    ]
    label: str
    confidence: float = Field(ge=0, le=1)
    weight: int = Field(ge=1, le=5)
    animated: bool
    style_hint: Literal["high_confidence", "medium_confidence", "low_confidence"]
    evidence_snippets: list[str] = Field(default_factory=list)
    rule_hits: list[ResolutionRuleHit] = Field(default_factory=list)


class CaseGraphResponse(BaseModel):
    case_id: UUID
    generated_at: datetime
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    warnings: list[str] = Field(default_factory=list)


class PersistedExtractionResponse(BaseModel):
    ingestion: IngestionResponse
    extraction: ExtractionResponse


class SyntheticIngestionRequest(BaseModel):
    synthetic_source_id: str | None = Field(default=None, min_length=1, max_length=120)
    text: str | None = Field(default=None, min_length=1, max_length=200_000)
    source_type: SourceType = SourceType.synthetic_dark_forum
    platform: str | None = Field(default=None, max_length=200)
    handle: str | None = Field(default=None, max_length=200)
    onion_url: str | None = Field(default=None, max_length=500)
    observed_at: date | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_type")
    @classmethod
    def require_synthetic_source_type(cls, source_type: SourceType) -> SourceType:
        if not source_type.value.startswith("synthetic_"):
            raise ValueError("Synthetic ingestion requires a synthetic source type")
        return source_type


class PublicOsintIngestionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    source_name: str = Field(min_length=1, max_length=200)
    source_url: str | None = Field(default=None, max_length=1000)
    published_at: date | None = None
    observed_at: date | None = None
    source_type: SourceType = SourceType.public_report
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_type")
    @classmethod
    def require_public_source_type(cls, source_type: SourceType) -> SourceType:
        allowed = {
            SourceType.public_report,
            SourceType.public_advisory,
            SourceType.public_indicator,
            SourceType.analyst_submission,
        }
        if source_type not in allowed:
            raise ValueError("OSINT ingestion requires a public or analyst source type")
        return source_type

    @field_validator("source_url")
    @classmethod
    def require_http_source_url(cls, source_url: str | None) -> str | None:
        if source_url is None:
            return source_url
        if not source_url.startswith(("https://", "http://")):
            raise ValueError("source_url must be an HTTP or HTTPS URL")
        return source_url


class ProfileParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    platform: str | None = Field(default=None, max_length=200)
    source_type: str = Field(default="analyst_profile_text", max_length=80)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProfileParseResponse(BaseModel):
    platform: str | None = None
    source_type: str
    extracted_at: datetime
    username: str | None = None
    aliases: list[str] = Field(default_factory=list)
    joined_date: str | None = None
    reputation: str | None = None
    sales_count: int | None = None
    posts_count: int | None = None
    last_active: str | None = None
    pgp_keys: list[str] = Field(default_factory=list)
    wallets: list[str] = Field(default_factory=list)
    profile_urls: list[str] = Field(default_factory=list)
    contact_handles: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ProfileIngestionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    platform: str | None = Field(default=None, max_length=200)
    source_type: SourceType = SourceType.analyst_submission
    observed_at: date | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_type")
    @classmethod
    def require_supported_profile_source_type(cls, source_type: SourceType) -> SourceType:
        allowed = {
            SourceType.synthetic_dark_forum,
            SourceType.synthetic_marketplace,
            SourceType.synthetic_onion_page,
            SourceType.public_report,
            SourceType.public_advisory,
            SourceType.public_indicator,
            SourceType.analyst_submission,
        }
        if source_type not in allowed:
            raise ValueError("Unsupported profile ingestion source type")
        return source_type


class OnionMetadataIngestionRequest(BaseModel):
    onion_url: str = Field(min_length=8, max_length=500)
    title: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, max_length=80)
    first_seen: date | None = None
    last_seen: date | None = None
    status: str | None = Field(default=None, max_length=80)
    mirrors: list[str] = Field(default_factory=list, max_length=20)
    contacts: list[str] = Field(default_factory=list, max_length=50)
    banners: list[str] = Field(default_factory=list, max_length=20)
    server_headers: dict[str, str] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("onion_url")
    @classmethod
    def require_onion_url(cls, onion_url: str) -> str:
        normalized = onion_url.strip()
        if ".onion" not in normalized.lower():
            raise ValueError("onion_url must contain a .onion host")
        return normalized

    @field_validator("mirrors")
    @classmethod
    def require_onion_mirrors(cls, mirrors: list[str]) -> list[str]:
        cleaned = [mirror.strip() for mirror in mirrors if mirror.strip()]
        invalid = [mirror for mirror in cleaned if ".onion" not in mirror.lower()]
        if invalid:
            raise ValueError("mirrors must contain only .onion URLs or hosts")
        return cleaned


class DataCollectionCapability(BaseModel):
    key: str
    label: str
    implemented: bool


class DataCollectionStatusResponse(BaseModel):
    module: str
    implemented: bool
    capabilities: list[DataCollectionCapability]
    safety_warnings: list[str]
