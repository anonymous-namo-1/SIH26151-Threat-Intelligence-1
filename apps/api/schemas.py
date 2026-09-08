import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from .models import CaseStatus, Role


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class NonNullPatch(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, value):
        if isinstance(value, dict):
            null_fields = sorted(key for key, item in value.items() if item is None)
            if null_fields:
                raise ValueError(f"PATCH fields cannot be null: {', '.join(null_fields)}")
        return value


class UserOut(ORMModel):
    id: uuid.UUID
    clerk_sub: str
    name: str
    role: Role
    active: bool
    created_at: datetime


class CaseInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=10000)
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    classification: Literal["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL"] = "UNCLASSIFIED"
    notes: str = Field("", max_length=20000)
    tags: list[str] = Field(default_factory=list, max_length=50)
    assignment_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class CaseUpdate(NonNullPatch):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=10000)
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] | None = None
    status: CaseStatus | None = None
    classification: Literal["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL"] | None = None
    notes: str | None = Field(None, max_length=20000)
    tags: list[str] | None = Field(None, max_length=50)
    assignment_ids: list[uuid.UUID] | None = Field(None, max_length=100)


class CaseOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str
    priority: str
    status: CaseStatus
    classification: str
    notes: str
    tags: list[str]
    created_by: UserOut
    assignments: list[UserOut]
    created_at: datetime
    updated_at: datetime


ENTITY_TYPES = Literal["ACTOR_HYPOTHESIS", "PERSONA", "USERNAME", "EMAIL", "PGP_KEY", "CRYPTO_WALLET", "DOMAIN", "IP_ADDRESS", "ONION_SERVICE", "URL", "POST", "MESSAGE", "DOCUMENT", "MARKETPLACE", "FORUM", "ORGANIZATION", "INFRASTRUCTURE", "FILE_HASH", "CRYPTO_TRANSACTION", "LOCATION_INDICATOR", "DEVICE_INDICATOR", "DATE", "CERTIFICATE", "DNS_RECORD", "HOSTING", "SERVICE"]


class EntityInput(BaseModel):
    type: ENTITY_TYPES
    value: str = Field(min_length=1, max_length=2000)
    aliases: list[str] = Field(default_factory=list, max_length=100)
    description: str = Field("", max_length=10000)
    source: str = Field("", max_length=2000)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    confidence: float = Field(0.5, ge=0, le=1)
    tags: list[str] = Field(default_factory=list, max_length=50)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntityUpdate(NonNullPatch):
    value: str | None = Field(None, min_length=1, max_length=2000)
    aliases: list[str] | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=10000)
    source: str | None = Field(None, max_length=2000)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    confidence: float | None = Field(None, ge=0, le=1)
    tags: list[str] | None = Field(None, max_length=50)
    metadata: dict[str, Any] | None = None


class EntityOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    type: str
    value: str
    aliases: list[str]
    description: str
    source: str
    first_seen: datetime | None
    last_seen: datetime | None
    confidence: float
    tags: list[str]
    metadata: dict[str, Any] = Field(validation_alias="extra_metadata")
    created_at: datetime
    updated_at: datetime


class EvidenceInput(BaseModel):
    type: Literal["MANUAL", "DOCUMENT", "PUBLIC_SOURCE", "DATASET", "API_IMPORT", "SCREENSHOT_METADATA", "TEXT", "CRYPTO_DATA", "INFRASTRUCTURE_DATA"]
    source: str = Field(min_length=1, max_length=2000)
    source_url: HttpUrl | None = None
    collected_at: datetime | None = None
    content: str = Field(min_length=1, max_length=1_000_000)
    notes: str = Field("", max_length=20000)
    reliability: Literal["A", "B", "C", "D", "E", "F", "UNKNOWN", "LOW", "MEDIUM", "HIGH", "VERIFIED"]
    entity_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)


class EvidenceUpdate(NonNullPatch):
    notes: str | None = Field(None, max_length=20000)
    reliability: Literal["A", "B", "C", "D", "E", "F", "UNKNOWN", "LOW", "MEDIUM", "HIGH", "VERIFIED"] | None = None
    entity_ids: list[uuid.UUID] | None = Field(None, max_length=500)


class EvidenceOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    type: str
    source: str
    source_url: str | None
    collected_at: datetime
    collector_id: uuid.UUID
    content_hash: str
    notes: str
    reliability: str
    entity_ids: list
    object_path: str | None
    content: str | None
    created_at: datetime


class RelationshipInput(BaseModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    type: str = Field(min_length=1, max_length=40)
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    explanation: str = Field(min_length=1, max_length=10000)
    attribution: Literal["HUMAN"]

    @field_validator("target_id")
    @classmethod
    def different_target(cls, value: uuid.UUID, info):
        if value == info.data.get("source_id"):
            raise ValueError("source and target must differ")
        return value


class RelationshipUpdate(NonNullPatch):
    type: str | None = Field(None, min_length=1, max_length=40)
    confidence: float | None = Field(None, ge=0, le=1)
    evidence_ids: list[uuid.UUID] | None = Field(None, min_length=1, max_length=100)
    explanation: str | None = Field(None, min_length=1, max_length=10000)


class RelationshipOut(ORMModel):
    id: uuid.UUID
    case_id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    type: str
    confidence: float
    evidence_ids: list
    explanation: str
    attribution: str
    created_by: uuid.UUID
    created_at: datetime


class ProfileNote(BaseModel):
    source: Literal["entity.description", "entity.metadata"]
    key: str | None = None
    value: Any


class ActorHypothesisProfile(BaseModel):
    reviewable_hypothesis: Literal[True] = True
    caution: str
    analyst_assigned_confidence: float
    personas: list[EntityOut]
    indicator_groups: dict[str, list[EntityOut]]
    evidence_strength: list[dict[str, Any]]
    contradictions: list[dict[str, Any]]
    evidence_ids: list[uuid.UUID]


class EntityProfile(BaseModel):
    entity: EntityOut
    confidence: float
    metadata: dict[str, Any]
    relationships: list[RelationshipOut]
    evidence: list[EvidenceOut]
    timeline: list[dict[str, Any]]
    activity: list[dict[str, Any]]
    related_entities: list[EntityOut]
    related_cases: list[dict[str, Any]]
    notes: list[ProfileNote]
    notes_storage: Literal["Entity description and metadata; no separate note table."]
    actor_hypothesis: ActorHypothesisProfile | None = None