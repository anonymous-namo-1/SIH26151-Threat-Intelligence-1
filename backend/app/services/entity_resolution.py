import itertools
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from difflib import SequenceMatcher
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from backend.app.database.models import Case, Entity, EvidenceEntityLink, Ingestion
from backend.app.models.schemas import (
    CaseEntityResolutionResponse,
    EntityLinkCandidate,
    EntityRecordResponse,
    ResolutionRuleHit,
)
from backend.app.services.persistence import DatabaseUnavailableError, NotFoundError


ATTRIBUTION_WARNING = (
    "Candidate link is analytical correlation only, not proof of attribution or real-world identity."
)

RULE_SCORES = {
    "same_wallet": 0.95,
    "same_pgp": 0.95,
    "same_contact": 0.9,
    "same_handle_across_platforms": 0.8,
    "similar_username": 0.6,
    "shared_url_or_domain": 0.65,
    "similar_writing_pattern": 0.45,
    "shared_activity_date": 0.35,
}

STOPWORDS = {
    "about",
    "access",
    "actor",
    "again",
    "analyst",
    "contact",
    "domain",
    "handle",
    "market",
    "paste",
    "public",
    "report",
    "shared",
    "source",
    "telegram",
    "using",
    "wallet",
}


@dataclass
class EntityEvidence:
    entity: Entity
    ingestion_ids: set[UUID] = field(default_factory=set)
    evidence_snippets: list[str] = field(default_factory=list)
    source_fields: set[str] = field(default_factory=set)
    platforms: set[str] = field(default_factory=set)
    observed_dates: set[date] = field(default_factory=set)


@dataclass
class IngestionEvidence:
    ingestion: Ingestion
    entity_ids: set[UUID] = field(default_factory=set)
    primary_handle_ids: set[UUID] = field(default_factory=set)
    contact_handle_ids: set[UUID] = field(default_factory=set)
    support_entity_ids: set[UUID] = field(default_factory=set)
    text_tokens: set[str] = field(default_factory=set)


@dataclass
class CandidateBuilder:
    left: Entity
    right: Entity
    rule_hits: list[ResolutionRuleHit] = field(default_factory=list)

    def add(self, rule_hit: ResolutionRuleHit) -> None:
        key = (
            rule_hit.rule,
            rule_hit.matched_value,
            tuple(sorted(str(item) for item in rule_hit.source_ingestion_ids)),
        )
        for existing in self.rule_hits:
            existing_key = (
                existing.rule,
                existing.matched_value,
                tuple(sorted(str(item) for item in existing.source_ingestion_ids)),
            )
            if existing_key == key:
                return
        self.rule_hits.append(rule_hit)


class EntityResolutionService:
    """Deterministic, case-scoped candidate link generation."""

    def resolve_case(self, db: Session, case_id: UUID) -> CaseEntityResolutionResponse:
        try:
            if db.get(Case, case_id) is None:
                raise NotFoundError()

            ingestions = db.scalars(
                select(Ingestion).where(Ingestion.case_id == case_id)
            ).all()
            links = db.scalars(
                select(EvidenceEntityLink)
                .options(joinedload(EvidenceEntityLink.entity))
                .where(EvidenceEntityLink.case_id == case_id)
            ).all()
        except NotFoundError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

        entity_evidence, ingestion_evidence = self._build_evidence_context(
            ingestions, links
        )
        candidates = self._build_candidates(entity_evidence, ingestion_evidence)
        warnings = [ATTRIBUTION_WARNING]
        if not candidates:
            warnings.append("Not enough shared evidence to generate candidate links.")

        return CaseEntityResolutionResponse(
            case_id=case_id,
            generated_at=datetime.now(UTC),
            candidates=candidates,
            warnings=warnings,
        )

    def _build_evidence_context(
        self,
        ingestions: list[Ingestion],
        links: list[EvidenceEntityLink],
    ) -> tuple[dict[UUID, EntityEvidence], dict[UUID, IngestionEvidence]]:
        ingestion_evidence = {
            ingestion.id: IngestionEvidence(
                ingestion=ingestion,
                text_tokens=self._text_tokens(ingestion.raw_text),
            )
            for ingestion in ingestions
        }
        entity_evidence: dict[UUID, EntityEvidence] = {}

        for link in links:
            entity = link.entity
            ingestion = ingestion_evidence.get(link.ingestion_id)
            if ingestion is None:
                continue

            entity_context = entity_evidence.setdefault(
                entity.id,
                EntityEvidence(entity=entity),
            )
            entity_context.ingestion_ids.add(link.ingestion_id)
            entity_context.source_fields.add(link.source_field)
            entity_context.evidence_snippets.append(link.evidence_snippet)
            if ingestion.ingestion.platform:
                entity_context.platforms.add(ingestion.ingestion.platform)
            if ingestion.ingestion.observed_at:
                entity_context.observed_dates.add(ingestion.ingestion.observed_at)

            ingestion.entity_ids.add(entity.id)
            if self._is_primary_handle(entity, ingestion.ingestion, link):
                ingestion.primary_handle_ids.add(entity.id)
            elif self._is_contact_handle(entity, link):
                ingestion.contact_handle_ids.add(entity.id)
                ingestion.support_entity_ids.add(entity.id)
            elif self._is_support_entity(entity):
                ingestion.support_entity_ids.add(entity.id)

        return entity_evidence, ingestion_evidence

    def _build_candidates(
        self,
        entity_evidence: dict[UUID, EntityEvidence],
        ingestion_evidence: dict[UUID, IngestionEvidence],
    ) -> list[EntityLinkCandidate]:
        builders: dict[tuple[UUID, UUID], CandidateBuilder] = {}

        self._add_same_handle_across_platforms(builders, entity_evidence)
        self._add_shared_support_candidates(
            builders, entity_evidence, ingestion_evidence
        )
        self._add_similar_username_candidates(
            builders, entity_evidence, ingestion_evidence
        )
        self._add_text_pattern_candidates(builders, entity_evidence, ingestion_evidence)
        self._add_activity_date_candidates(builders, entity_evidence, ingestion_evidence)

        candidates = [self._candidate_from_builder(builder) for builder in builders.values()]
        return sorted(
            candidates,
            key=lambda item: (
                -item.confidence_score,
                item.left_entity.normalized_value,
                item.right_entity.normalized_value,
            ),
        )

    def _add_same_handle_across_platforms(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        entity_evidence: dict[UUID, EntityEvidence],
    ) -> None:
        for context in entity_evidence.values():
            if context.entity.entity_type != "handle":
                continue
            if len(context.platforms) < 2 or len(context.ingestion_ids) < 2:
                continue
            self._builder(builders, context.entity, context.entity).add(
                ResolutionRuleHit(
                    rule="same_handle_across_platforms",
                    description="Same normalized handle observed across multiple platforms.",
                    score=RULE_SCORES["same_handle_across_platforms"],
                    matched_value=context.entity.value,
                    evidence_snippets=self._unique(context.evidence_snippets),
                    source_ingestion_ids=sorted(context.ingestion_ids),
                )
            )

    def _add_shared_support_candidates(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        entity_evidence: dict[UUID, EntityEvidence],
        ingestion_evidence: dict[UUID, IngestionEvidence],
    ) -> None:
        support_to_handles: dict[UUID, set[UUID]] = {}
        support_to_ingestions: dict[UUID, set[UUID]] = {}

        for ingestion_id, context in ingestion_evidence.items():
            if not context.primary_handle_ids:
                continue
            for support_id in context.support_entity_ids:
                support_to_handles.setdefault(support_id, set()).update(
                    context.primary_handle_ids
                )
                support_to_ingestions.setdefault(support_id, set()).add(ingestion_id)

        for support_id, handle_ids in support_to_handles.items():
            if len(handle_ids) < 2 or support_id not in entity_evidence:
                continue
            support = entity_evidence[support_id].entity
            rule = self._support_rule(support)
            if rule is None:
                continue
            for left_id, right_id in itertools.combinations(sorted(handle_ids), 2):
                if left_id == right_id:
                    continue
                if left_id not in entity_evidence or right_id not in entity_evidence:
                    continue
                self._builder(
                    builders,
                    entity_evidence[left_id].entity,
                    entity_evidence[right_id].entity,
                ).add(
                    ResolutionRuleHit(
                        rule=rule,
                        description=self._rule_description(rule),
                        score=RULE_SCORES[rule],
                        matched_value=support.value,
                        evidence_snippets=self._unique(
                            [
                                *entity_evidence[support_id].evidence_snippets,
                                *entity_evidence[left_id].evidence_snippets,
                                *entity_evidence[right_id].evidence_snippets,
                            ]
                        ),
                        source_ingestion_ids=sorted(
                            support_to_ingestions.get(support_id, set())
                        ),
                    )
                )

    def _add_similar_username_candidates(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        entity_evidence: dict[UUID, EntityEvidence],
        ingestion_evidence: dict[UUID, IngestionEvidence],
    ) -> None:
        primary_handle_ids = self._primary_handle_ids(ingestion_evidence)
        for left_id, right_id in itertools.combinations(primary_handle_ids, 2):
            left = entity_evidence[left_id].entity
            right = entity_evidence[right_id].entity
            if left.normalized_value == right.normalized_value:
                continue
            if self._username_similarity(left.value, right.value) < 0.78:
                continue
            self._builder(builders, left, right).add(
                ResolutionRuleHit(
                    rule="similar_username",
                    description="Handle strings are similar by deterministic normalization.",
                    score=RULE_SCORES["similar_username"],
                    matched_value=f"{left.value} <> {right.value}",
                    evidence_snippets=self._unique(
                        [
                            *entity_evidence[left_id].evidence_snippets,
                            *entity_evidence[right_id].evidence_snippets,
                        ]
                    ),
                    source_ingestion_ids=sorted(
                        entity_evidence[left_id].ingestion_ids
                        | entity_evidence[right_id].ingestion_ids
                    ),
                )
            )

    def _add_text_pattern_candidates(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        entity_evidence: dict[UUID, EntityEvidence],
        ingestion_evidence: dict[UUID, IngestionEvidence],
    ) -> None:
        for left, right in itertools.combinations(ingestion_evidence.values(), 2):
            if not left.primary_handle_ids or not right.primary_handle_ids:
                continue
            shared_tokens = left.text_tokens & right.text_tokens
            if len(shared_tokens) < 3:
                continue
            for left_id, right_id in itertools.product(
                left.primary_handle_ids, right.primary_handle_ids
            ):
                if left_id == right_id:
                    continue
                self._builder(
                    builders,
                    entity_evidence[left_id].entity,
                    entity_evidence[right_id].entity,
                ).add(
                    ResolutionRuleHit(
                        rule="similar_writing_pattern",
                        description="Ingestion texts share deterministic keyword/style markers.",
                        score=RULE_SCORES["similar_writing_pattern"],
                        matched_value=", ".join(sorted(shared_tokens)[:8]),
                        evidence_snippets=self._unique(
                            [
                                self._snippet_for_tokens(left.ingestion.raw_text, shared_tokens),
                                self._snippet_for_tokens(right.ingestion.raw_text, shared_tokens),
                            ]
                        ),
                        source_ingestion_ids=sorted(
                            {left.ingestion.id, right.ingestion.id}
                        ),
                    )
                )

    def _add_activity_date_candidates(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        entity_evidence: dict[UUID, EntityEvidence],
        ingestion_evidence: dict[UUID, IngestionEvidence],
    ) -> None:
        for left, right in itertools.combinations(ingestion_evidence.values(), 2):
            if (
                not left.primary_handle_ids
                or not right.primary_handle_ids
                or left.ingestion.observed_at is None
                or right.ingestion.observed_at is None
            ):
                continue
            days_apart = abs((left.ingestion.observed_at - right.ingestion.observed_at).days)
            if days_apart > 1:
                continue
            for left_id, right_id in itertools.product(
                left.primary_handle_ids, right.primary_handle_ids
            ):
                if left_id == right_id:
                    continue
                self._builder(
                    builders,
                    entity_evidence[left_id].entity,
                    entity_evidence[right_id].entity,
                ).add(
                    ResolutionRuleHit(
                        rule="shared_activity_date",
                        description="Primary handles were observed within one day of each other.",
                        score=RULE_SCORES["shared_activity_date"],
                        matched_value=f"{left.ingestion.observed_at} / {right.ingestion.observed_at}",
                        evidence_snippets=[],
                        source_ingestion_ids=sorted(
                            {left.ingestion.id, right.ingestion.id}
                        ),
                    )
                )

    def _candidate_from_builder(self, builder: CandidateBuilder) -> EntityLinkCandidate:
        rule_scores = [rule_hit.score for rule_hit in builder.rule_hits]
        max_score = max(rule_scores) if rule_scores else 0
        confidence = min(max_score + (0.03 * (len(rule_scores) - 1)), 0.99)
        evidence_snippets = self._unique(
            snippet
            for rule_hit in builder.rule_hits
            for snippet in rule_hit.evidence_snippets
        )
        ingestion_ids = {
            ingestion_id
            for rule_hit in builder.rule_hits
            for ingestion_id in rule_hit.source_ingestion_ids
        }
        return EntityLinkCandidate(
            left_entity=EntityRecordResponse.model_validate(builder.left),
            right_entity=EntityRecordResponse.model_validate(builder.right),
            confidence_score=round(confidence, 2),
            rule_hits=sorted(
                builder.rule_hits,
                key=lambda rule_hit: (-rule_hit.score, rule_hit.rule),
            ),
            evidence_snippets=evidence_snippets,
            source_ingestion_ids=sorted(ingestion_ids),
            warnings=[ATTRIBUTION_WARNING],
        )

    def _builder(
        self,
        builders: dict[tuple[UUID, UUID], CandidateBuilder],
        left: Entity,
        right: Entity,
    ) -> CandidateBuilder:
        if str(left.id) <= str(right.id):
            key = (left.id, right.id)
            left_entity = left
            right_entity = right
        else:
            key = (right.id, left.id)
            left_entity = right
            right_entity = left
        builder = builders.get(key)
        if builder is None:
            builder = CandidateBuilder(left=left_entity, right=right_entity)
            builders[key] = builder
        return builder

    def _primary_handle_ids(
        self, ingestion_evidence: dict[UUID, IngestionEvidence]
    ) -> list[UUID]:
        ids = {
            handle_id
            for context in ingestion_evidence.values()
            for handle_id in context.primary_handle_ids
        }
        return sorted(ids)

    def _is_primary_handle(
        self, entity: Entity, ingestion: Ingestion, link: EvidenceEntityLink
    ) -> bool:
        if entity.entity_type != "handle":
            return False
        if link.source_field == "handle":
            return True
        if ingestion.handle and entity.normalized_value == self._normalize(ingestion.handle):
            return True
        return self._looks_like_primary_handle(link.evidence_snippet)

    def _is_contact_handle(self, entity: Entity, link: EvidenceEntityLink) -> bool:
        if entity.entity_type != "handle":
            return False
        return self._looks_like_contact(link.evidence_snippet)

    def _is_support_entity(self, entity: Entity) -> bool:
        return (
            entity.entity_type.startswith("wallet:")
            or entity.entity_type.startswith("pgp")
            or entity.entity_type in {"email", "domain", "onion_url"}
        )

    def _support_rule(self, entity: Entity) -> str | None:
        if entity.entity_type.startswith("wallet:"):
            return "same_wallet"
        if entity.entity_type.startswith("pgp"):
            return "same_pgp"
        if entity.entity_type == "email":
            return "same_contact"
        if entity.entity_type == "handle":
            return "same_contact"
        if entity.entity_type in {"domain", "onion_url"}:
            return "shared_url_or_domain"
        return None

    def _rule_description(self, rule: str) -> str:
        return {
            "same_wallet": "Same cryptocurrency wallet reused by multiple primary handles.",
            "same_pgp": "Same PGP key material reused by multiple primary handles.",
            "same_contact": "Same contact handle or email reused by multiple primary handles.",
            "shared_url_or_domain": "Same onion URL, domain, or profile URL domain observed with multiple primary handles.",
        }[rule]

    def _looks_like_primary_handle(self, snippet: str | None) -> bool:
        if not snippet:
            return False
        lowered = snippet.lower()
        if self._looks_like_contact(snippet):
            return False
        return any(marker in lowered for marker in ("handle", "username", "user", "vendor", "actor"))

    def _looks_like_contact(self, snippet: str | None) -> bool:
        if not snippet:
            return False
        lowered = snippet.lower()
        return any(
            marker in lowered
            for marker in ("contact", "telegram", "t.me/", "signal", "jabber")
        )

    def _username_similarity(self, left: str, right: str) -> float:
        compact_left = re.sub(r"[^a-z0-9]", "", left.casefold())
        compact_right = re.sub(r"[^a-z0-9]", "", right.casefold())
        if not compact_left or not compact_right:
            return 0
        return SequenceMatcher(None, compact_left, compact_right).ratio()

    def _text_tokens(self, text: str) -> set[str]:
        tokens = set(re.findall(r"\b[a-zA-Z][a-zA-Z0-9_-]{4,}\b", text.casefold()))
        return {token for token in tokens if token not in STOPWORDS}

    def _snippet_for_tokens(self, text: str, tokens: set[str]) -> str:
        lowered = text.casefold()
        for token in sorted(tokens):
            index = lowered.find(token)
            if index == -1:
                continue
            left = max(index - 60, 0)
            right = min(index + len(token) + 60, len(text))
            return " ".join(text[left:right].split())
        return ""

    def _normalize(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()

    def _unique(self, values) -> list[str]:
        seen = set()
        unique_values = []
        for value in values:
            if not value:
                continue
            key = str(value)
            if key in seen:
                continue
            seen.add(key)
            unique_values.append(value)
        return unique_values

