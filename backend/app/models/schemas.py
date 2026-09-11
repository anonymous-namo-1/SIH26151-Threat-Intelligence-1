from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


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

