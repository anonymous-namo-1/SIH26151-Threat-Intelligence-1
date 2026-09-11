import itertools
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from backend.app.database.models import Case, EvidenceEntityLink, Ingestion
from backend.app.models.schemas import (
    AttributionExplanation,
    BehaviorPatternSignal,
    CaseAiProfileResponse,
    CaseEntityResolutionResponse,
    CaseGraphResponse,
    RebrandSignal,
    RiskScoreBreakdown,
    RiskScoreContribution,
    StylometrySignal,
)
from backend.app.services.entity_resolution import (
    ATTRIBUTION_WARNING,
    EntityResolutionService,
)
from backend.app.services.graph_intelligence import GraphIntelligenceService
from backend.app.services.persistence import DatabaseUnavailableError, NotFoundError


AI_PROFILE_WARNING = (
    "AI profiling output is deterministic analyst support only, not proof of attribution "
    "or real-world identity."
)

REBRAND_TERMS = {
    "backup",
    "formerly",
    "mirror",
    "moved to",
    "new handle",
    "rebrand",
    "same vendor",
}

SALES_TERMS = {
    "access",
    "buyer",
    "deal",
    "escrow",
    "market",
    "mirror",
    "slot",
    "vendor",
}

STOPWORDS = {
    "about",
    "again",
    "analyst",
    "contact",
    "forum",
    "handle",
    "market",
    "message",
    "profile",
    "public",
    "report",
    "source",
    "synthetic",
    "telegram",
    "using",
    "vendor",
    "wallet",
}


@dataclass(frozen=True)
class TextProfile:
    ingestion_id: UUID
    text: str
    avg_sentence_words: float
    dominant_punctuation: str | None
    tokens: set[str]
    phrases: set[str]
    contact_markers: set[str]
    sales_markers: set[str]


class AiProfilingService:
    """Deterministic profiling layer built from persisted evidence and graph context."""

    def __init__(
        self,
        resolution_service: EntityResolutionService | None = None,
        graph_service: GraphIntelligenceService | None = None,
    ) -> None:
        self.resolution_service = resolution_service or EntityResolutionService()
        self.graph_service = graph_service or GraphIntelligenceService(
            resolution_service=self.resolution_service
        )

    def build_case_profile(self, db: Session, case_id: UUID) -> CaseAiProfileResponse:
        try:
            if db.get(Case, case_id) is None:
                raise NotFoundError()
            ingestions = db.scalars(
                select(Ingestion)
                .where(Ingestion.case_id == case_id)
                .order_by(Ingestion.observed_at, Ingestion.created_at, Ingestion.id)
            ).all()
            evidence_links = db.scalars(
                select(EvidenceEntityLink)
                .options(joinedload(EvidenceEntityLink.entity))
                .where(EvidenceEntityLink.case_id == case_id)
                .order_by(EvidenceEntityLink.created_at, EvidenceEntityLink.id)
            ).all()
        except NotFoundError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

        resolution = self.resolution_service.resolve_case(db, case_id)
        graph = self.graph_service.build_case_graph(db, case_id)
        stylometry = self._stylometry_signals(ingestions)
        behavior_patterns = self._behavior_patterns(
            ingestions=ingestions,
            evidence_links=evidence_links,
            resolution=resolution,
            graph=graph,
        )
        rebrand_signals = self._rebrand_signals(ingestions, resolution)
        risk_breakdown = self._risk_breakdown(
            ingestions=ingestions,
            evidence_links=evidence_links,
            resolution=resolution,
            stylometry=stylometry,
        )

        return CaseAiProfileResponse(
            case_id=case_id,
            generated_at=datetime.now(UTC),
            profile_summary=self._profile_summary(
                ingestions=ingestions,
                resolution=resolution,
                graph=graph,
                risk_breakdown=risk_breakdown,
            ),
            risk_score=risk_breakdown.total,
            risk_level=risk_breakdown.level,
            risk_breakdown=risk_breakdown,
            stylometry=stylometry,
            behavior_patterns=behavior_patterns,
            rebrand_signals=rebrand_signals,
            attribution_explanations=self._attribution_explanations(resolution),
            recommended_next_steps=self._recommended_next_steps(
                evidence_links=evidence_links,
                resolution=resolution,
                graph=graph,
            ),
            warnings=self._warnings(ingestions),
        )

    def _stylometry_signals(self, ingestions: list[Ingestion]) -> list[StylometrySignal]:
        profiles = [self._text_profile(ingestion) for ingestion in ingestions]
        signals: list[StylometrySignal] = []
        if len(profiles) < 2:
            return signals

        shared_phrases = self._shared_values(profile.phrases for profile in profiles)
        if shared_phrases:
            signals.append(
                StylometrySignal(
                    signal_type="shared_repeated_phrases",
                    description="Multiple ingestions share repeated phrase patterns.",
                    confidence=0.55,
                    matched_values=shared_phrases[:8],
                    evidence_snippets=[
                        self._snippet_for_value(profile.text, shared_phrases[0])
                        for profile in profiles
                        if shared_phrases[0] in profile.text.casefold()
                    ],
                    source_ingestion_ids=sorted(
                        [
                            profile.ingestion_id
                            for profile in profiles
                            if profile.phrases & set(shared_phrases)
                        ],
                        key=str,
                    ),
                )
            )

        shared_tokens = self._shared_values(profile.tokens for profile in profiles)
        if len(shared_tokens) >= 3:
            signals.append(
                StylometrySignal(
                    signal_type="shared_uncommon_words",
                    description="Multiple ingestions reuse uncommon wording markers.",
                    confidence=0.5,
                    matched_values=shared_tokens[:10],
                    evidence_snippets=[
                        self._snippet_for_value(profile.text, shared_tokens[0])
                        for profile in profiles
                        if shared_tokens[0] in profile.text.casefold()
                    ],
                    source_ingestion_ids=sorted(
                        [
                            profile.ingestion_id
                            for profile in profiles
                            if profile.tokens & set(shared_tokens)
                        ],
                        key=str,
                    ),
                )
            )

        length_pairs = []
        for left, right in itertools.combinations(profiles, 2):
            if not left.avg_sentence_words or not right.avg_sentence_words:
                continue
            if abs(left.avg_sentence_words - right.avg_sentence_words) <= 2:
                length_pairs.append(f"{left.ingestion_id} <> {right.ingestion_id}")
        if length_pairs:
            signals.append(
                StylometrySignal(
                    signal_type="similar_average_sentence_length",
                    description="Observed texts have similar average sentence lengths.",
                    confidence=0.42,
                    matched_values=length_pairs[:5],
                    source_ingestion_ids=sorted(
                        {profile.ingestion_id for profile in profiles}, key=str
                    ),
                )
            )

        punctuation = [
            profile.dominant_punctuation
            for profile in profiles
            if profile.dominant_punctuation is not None
        ]
        if len(punctuation) >= 2 and Counter(punctuation).most_common(1)[0][1] >= 2:
            dominant = Counter(punctuation).most_common(1)[0][0]
            signals.append(
                StylometrySignal(
                    signal_type="similar_punctuation_style",
                    description="Multiple ingestions share a dominant punctuation pattern.",
                    confidence=0.4,
                    matched_values=[dominant],
                    source_ingestion_ids=sorted(
                        [
                            profile.ingestion_id
                            for profile in profiles
                            if profile.dominant_punctuation == dominant
                        ],
                        key=str,
                    ),
                )
            )

        shared_contact_markers = self._shared_values(
            profile.contact_markers for profile in profiles
        )
        if shared_contact_markers:
            signals.append(
                StylometrySignal(
                    signal_type="similar_contact_wording",
                    description="Contact instructions use similar deterministic wording.",
                    confidence=0.5,
                    matched_values=shared_contact_markers[:8],
                    evidence_snippets=[
                        self._snippet_for_value(profile.text, shared_contact_markers[0])
                        for profile in profiles
                        if shared_contact_markers[0] in profile.text.casefold()
                    ],
                    source_ingestion_ids=sorted(
                        [
                            profile.ingestion_id
                            for profile in profiles
                            if profile.contact_markers & set(shared_contact_markers)
                        ],
                        key=str,
                    ),
                )
            )

        shared_sales_markers = self._shared_values(
            profile.sales_markers for profile in profiles
        )
        if shared_sales_markers:
            signals.append(
                StylometrySignal(
                    signal_type="similar_marketplace_language",
                    description="Multiple ingestions reuse marketplace-style wording.",
                    confidence=0.45,
                    matched_values=shared_sales_markers[:8],
                    evidence_snippets=[
                        self._snippet_for_value(profile.text, shared_sales_markers[0])
                        for profile in profiles
                        if shared_sales_markers[0] in profile.text.casefold()
                    ],
                    source_ingestion_ids=sorted(
                        [
                            profile.ingestion_id
                            for profile in profiles
                            if profile.sales_markers & set(shared_sales_markers)
                        ],
                        key=str,
                    ),
                )
            )

        return sorted(signals, key=lambda signal: (-signal.confidence, signal.signal_type))

    def _behavior_patterns(
        self,
        ingestions: list[Ingestion],
        evidence_links: list[EvidenceEntityLink],
        resolution: CaseEntityResolutionResponse,
        graph: CaseGraphResponse,
    ) -> list[BehaviorPatternSignal]:
        signals: list[BehaviorPatternSignal] = []
        graph_edges_by_type = self._graph_edges_by_type(graph)
        rule_to_signal = {
            "same_wallet": (
                "same_wallet_reuse",
                "Multiple primary handles reuse the same cryptocurrency wallet.",
                0.95,
                "uses_wallet",
            ),
            "same_pgp": (
                "same_pgp_reuse",
                "Multiple primary handles reuse the same PGP key material.",
                0.95,
                "uses_pgp",
            ),
            "same_contact": (
                "same_contact_reuse",
                "Multiple primary handles reuse the same contact handle or email.",
                0.9,
                "has_contact",
            ),
            "shared_url_or_domain": (
                "shared_infrastructure",
                "Multiple primary handles share a domain, onion URL, or profile URL domain.",
                0.65,
                "hosted_on",
            ),
            "similar_writing_pattern": (
                "similar_activity_wording",
                "Resolution candidates share deterministic writing or activity wording.",
                0.45,
                "resolved_candidate",
            ),
            "shared_activity_date": (
                "close_activity_dates",
                "Primary handles were observed within one day of each other.",
                0.35,
                "resolved_candidate",
            ),
        }
        for rule, (pattern, description, confidence, graph_type) in rule_to_signal.items():
            matching_hits = [
                rule_hit
                for candidate in resolution.candidates
                for rule_hit in candidate.rule_hits
                if rule_hit.rule == rule
            ]
            if not matching_hits:
                continue
            signals.append(
                BehaviorPatternSignal(
                    pattern=pattern,
                    description=description,
                    confidence=confidence,
                    supporting_entities=self._unique(
                        hit.matched_value for hit in matching_hits if hit.matched_value
                    ),
                    evidence_snippets=self._unique(
                        snippet
                        for hit in matching_hits
                        for snippet in hit.evidence_snippets
                    )[:8],
                    source_ingestion_ids=sorted(
                        {
                            ingestion_id
                            for hit in matching_hits
                            for ingestion_id in hit.source_ingestion_ids
                        },
                        key=str,
                    ),
                    graph_edge_ids=graph_edges_by_type.get(graph_type, [])[:8],
                )
            )

        platforms = self._unique(
            ingestion.platform for ingestion in ingestions if ingestion.platform
        )
        if len(platforms) >= 2:
            signals.append(
                BehaviorPatternSignal(
                    pattern="multiple_platforms",
                    description="Case evidence spans multiple platforms or supplied sources.",
                    confidence=0.55,
                    supporting_entities=platforms,
                    source_ingestion_ids=sorted(
                        [ingestion.id for ingestion in ingestions], key=str
                    ),
                    graph_edge_ids=graph_edges_by_type.get("observed_in_source", [])[:8],
                )
            )

        repeated_source_types = [
            source_type
            for source_type, count in Counter(
                ingestion.source_type for ingestion in ingestions
            ).items()
            if count >= 2
        ]
        if repeated_source_types:
            signals.append(
                BehaviorPatternSignal(
                    pattern="repeated_source_types",
                    description="Multiple ingestions share the same source type.",
                    confidence=0.4,
                    supporting_entities=sorted(repeated_source_types),
                    source_ingestion_ids=sorted(
                        [ingestion.id for ingestion in ingestions], key=str
                    ),
                )
            )

        infrastructure = self._entities_by_type(
            evidence_links, {"domain", "ip_address", "onion_url"}
        )
        if infrastructure:
            signals.append(
                BehaviorPatternSignal(
                    pattern="infrastructure_mentions",
                    description="Case evidence includes domain, IP, or onion infrastructure indicators.",
                    confidence=0.55,
                    supporting_entities=infrastructure[:10],
                    evidence_snippets=self._snippets_for_entity_types(
                        evidence_links, {"domain", "ip_address", "onion_url"}
                    ),
                    source_ingestion_ids=self._ingestion_ids_for_entity_types(
                        evidence_links, {"domain", "ip_address", "onion_url"}
                    ),
                    graph_edge_ids=graph_edges_by_type.get("hosted_on", [])[:8],
                )
            )

        threat_context = self._entities_by_type(
            evidence_links, {"malware_name", "mitre_technique", "cve"}
        )
        if threat_context:
            signals.append(
                BehaviorPatternSignal(
                    pattern="threat_context_mentions",
                    description="Case evidence includes malware, ATT&CK technique, or CVE context.",
                    confidence=0.55,
                    supporting_entities=threat_context[:10],
                    evidence_snippets=self._snippets_for_entity_types(
                        evidence_links, {"malware_name", "mitre_technique", "cve"}
                    ),
                    source_ingestion_ids=self._ingestion_ids_for_entity_types(
                        evidence_links, {"malware_name", "mitre_technique", "cve"}
                    ),
                    graph_edge_ids=graph_edges_by_type.get("related_to", [])[:8],
                )
            )

        return sorted(signals, key=lambda signal: (-signal.confidence, signal.pattern))

    def _rebrand_signals(
        self,
        ingestions: list[Ingestion],
        resolution: CaseEntityResolutionResponse,
    ) -> list[RebrandSignal]:
        signals: list[RebrandSignal] = []
        keyword_hits: dict[str, list[Ingestion]] = {}
        for ingestion in ingestions:
            lowered = ingestion.raw_text.casefold()
            for term in sorted(REBRAND_TERMS):
                if term in lowered:
                    keyword_hits.setdefault(term, []).append(ingestion)
        if keyword_hits:
            matched_terms = sorted(keyword_hits)
            matched_ingestions = {
                ingestion
                for matches in keyword_hits.values()
                for ingestion in matches
            }
            signals.append(
                RebrandSignal(
                    signal_type="migration_language",
                    description="Source text contains analyst-visible rebrand or migration wording.",
                    confidence=0.6,
                    handles_or_aliases=self._unique(
                        ingestion.handle for ingestion in matched_ingestions if ingestion.handle
                    ),
                    evidence_snippets=[
                        self._snippet_for_value(ingestion.raw_text, matched_terms[0])
                        for ingestion in sorted(matched_ingestions, key=lambda item: str(item.id))
                    ][:8],
                    source_ingestion_ids=sorted(
                        [ingestion.id for ingestion in matched_ingestions], key=str
                    ),
                )
            )

        for candidate in resolution.candidates:
            if candidate.left_entity.id == candidate.right_entity.id:
                continue
            rules = {rule_hit.rule for rule_hit in candidate.rule_hits}
            if rules & {"same_wallet", "same_pgp", "same_contact"}:
                signals.append(
                    RebrandSignal(
                        signal_type="shared_identifier_different_handles",
                        description=(
                            "Different handles or aliases share a wallet, PGP key, or contact "
                            "identifier that may indicate migration or rebrand."
                        ),
                        confidence=0.75,
                        handles_or_aliases=[
                            candidate.left_entity.value,
                            candidate.right_entity.value,
                        ],
                        evidence_snippets=candidate.evidence_snippets[:8],
                        source_ingestion_ids=candidate.source_ingestion_ids,
                    )
                )
            if "similar_username" in rules:
                signals.append(
                    RebrandSignal(
                        signal_type="similar_username",
                        description="Different handles have similar deterministic username strings.",
                        confidence=0.6,
                        handles_or_aliases=[
                            candidate.left_entity.value,
                            candidate.right_entity.value,
                        ],
                        evidence_snippets=candidate.evidence_snippets[:8],
                        source_ingestion_ids=candidate.source_ingestion_ids,
                    )
                )

        return sorted(
            signals,
            key=lambda signal: (
                -signal.confidence,
                signal.signal_type,
                signal.handles_or_aliases,
            ),
        )

    def _risk_breakdown(
        self,
        ingestions: list[Ingestion],
        evidence_links: list[EvidenceEntityLink],
        resolution: CaseEntityResolutionResponse,
        stylometry: list[StylometrySignal],
    ) -> RiskScoreBreakdown:
        contributions: list[RiskScoreContribution] = []
        rules = {
            rule_hit.rule
            for candidate in resolution.candidates
            for rule_hit in candidate.rule_hits
        }

        self._add_risk(contributions, rules, "same_wallet", 25, "Wallet reuse")
        self._add_risk(contributions, rules, "same_pgp", 25, "PGP key reuse")
        self._add_risk(contributions, rules, "same_contact", 20, "Shared contact reuse")

        if self._has_entity_type(evidence_links, {"domain", "ip_address", "onion_url"}) or (
            "shared_url_or_domain" in rules
        ):
            contributions.append(
                RiskScoreContribution(
                    factor="onion_or_infrastructure_evidence",
                    points=10,
                    rationale="Domain, IP, onion URL, or shared infrastructure evidence is present.",
                    evidence_refs=self._graph_or_entity_refs(evidence_links, {"domain", "ip_address", "onion_url"}),
                )
            )

        platforms = {ingestion.platform for ingestion in ingestions if ingestion.platform}
        if len(platforms) >= 2:
            contributions.append(
                RiskScoreContribution(
                    factor="multiple_platforms",
                    points=10,
                    rationale="Evidence is observed across multiple platforms or supplied sources.",
                    evidence_refs=sorted(str(ingestion.id) for ingestion in ingestions),
                )
            )

        if self._has_entity_type(evidence_links, {"malware_name", "mitre_technique", "cve"}):
            contributions.append(
                RiskScoreContribution(
                    factor="malware_mitre_or_cve_context",
                    points=10,
                    rationale="Evidence includes malware, MITRE ATT&CK, or CVE references.",
                    evidence_refs=self._graph_or_entity_refs(
                        evidence_links, {"malware_name", "mitre_technique", "cve"}
                    ),
                )
            )

        if stylometry or rules & {"similar_writing_pattern", "shared_activity_date"}:
            contributions.append(
                RiskScoreContribution(
                    factor="weak_stylometry_or_activity_match",
                    points=5,
                    rationale="Weak deterministic stylometry or activity timing signal is present.",
                    evidence_refs=[signal.signal_type for signal in stylometry],
                )
            )

        total = min(sum(contribution.points for contribution in contributions), 100)
        return RiskScoreBreakdown(
            total=total,
            level=self._risk_level(total),
            contributions=contributions,
        )

    def _attribution_explanations(
        self, resolution: CaseEntityResolutionResponse
    ) -> list[AttributionExplanation]:
        explanations: list[AttributionExplanation] = []
        for candidate in resolution.candidates:
            if candidate.confidence_score < 0.85:
                continue
            if candidate.left_entity.id == candidate.right_entity.id:
                continue
            rules = [rule_hit.rule for rule_hit in candidate.rule_hits]
            explanations.append(
                AttributionExplanation(
                    candidate_pair=[
                        candidate.left_entity.value,
                        candidate.right_entity.value,
                    ],
                    confidence=candidate.confidence_score,
                    explanation=self._candidate_explanation(rules),
                    supporting_rules=rules,
                    evidence_snippets=candidate.evidence_snippets[:8],
                    source_ingestion_ids=candidate.source_ingestion_ids,
                    warning="This is not proof of real-world identity.",
                )
            )
        return sorted(
            explanations,
            key=lambda item: (-item.confidence, item.candidate_pair),
        )

    def _recommended_next_steps(
        self,
        evidence_links: list[EvidenceEntityLink],
        resolution: CaseEntityResolutionResponse,
        graph: CaseGraphResponse,
    ) -> list[str]:
        rules = {
            rule_hit.rule
            for candidate in resolution.candidates
            for rule_hit in candidate.rule_hits
        }
        steps = []
        if "same_wallet" in rules or self._has_entity_type(evidence_links, {"wallet:btc", "wallet:eth"}):
            steps.append("Verify wallet history through a legal public blockchain explorer.")
        if "same_pgp" in rules or self._has_prefix_entity_type(evidence_links, "pgp"):
            steps.append("Check whether the PGP key or fingerprint appears in legal public OSINT.")
        if graph.edges:
            steps.append("Inspect graph neighbors for evidence-backed shared identifiers.")
        steps.append("Review source credibility and preserve original evidence snippets.")
        steps.append("Collect more independent evidence before any attribution decision.")
        return self._unique(steps)

    def _profile_summary(
        self,
        ingestions: list[Ingestion],
        resolution: CaseEntityResolutionResponse,
        graph: CaseGraphResponse,
        risk_breakdown: RiskScoreBreakdown,
    ) -> str:
        if not ingestions:
            return "No persisted ingestions are available for profiling yet."
        strong_candidates = [
            candidate
            for candidate in resolution.candidates
            if candidate.confidence_score >= 0.85
        ]
        return (
            f"Profile generated from {len(ingestions)} persisted ingestion(s), "
            f"{len(graph.nodes)} graph node(s), {len(graph.edges)} evidence-backed edge(s), "
            f"and {len(resolution.candidates)} candidate link(s). "
            f"{len(strong_candidates)} candidate link(s) are high confidence. "
            f"Risk is {risk_breakdown.level} ({risk_breakdown.total}/100)."
        )

    def _warnings(self, ingestions: list[Ingestion]) -> list[str]:
        warnings = [
            AI_PROFILE_WARNING,
            "No live AI API, Tor access, onion crawling, or illegal-content scraping is used.",
        ]
        if not ingestions:
            warnings.append("Add persisted ingestions before relying on profiling output.")
        return warnings

    def _text_profile(self, ingestion: Ingestion) -> TextProfile:
        text = ingestion.raw_text
        lowered = text.casefold()
        words = re.findall(r"\b[a-zA-Z][a-zA-Z0-9_-]{2,}\b", lowered)
        tokens = {
            word
            for word in words
            if len(word) >= 5 and word not in STOPWORDS and not word.isdigit()
        }
        sentence_lengths = [
            len(re.findall(r"\b[a-zA-Z0-9_-]+\b", sentence))
            for sentence in re.split(r"[.!?]+", text)
            if sentence.strip()
        ]
        punctuation_counts = Counter(char for char in text if char in "!?;:.")
        dominant_punctuation = None
        if punctuation_counts and punctuation_counts.most_common(1)[0][1] >= 2:
            dominant_punctuation = punctuation_counts.most_common(1)[0][0]
        contact_markers = {
            marker
            for marker in {"contact", "telegram", "t.me", "pgp", "wallet"}
            if marker in lowered
        }
        sales_markers = {marker for marker in SALES_TERMS if marker in tokens}
        phrase_tokens = [
            word for word in words if len(word) >= 3 and word not in STOPWORDS
        ]
        phrases = {
            " ".join(phrase_tokens[index : index + size])
            for size in (2, 3)
            for index in range(0, max(len(phrase_tokens) - size + 1, 0))
        }
        return TextProfile(
            ingestion_id=ingestion.id,
            text=text,
            avg_sentence_words=(
                sum(sentence_lengths) / len(sentence_lengths)
                if sentence_lengths
                else 0
            ),
            dominant_punctuation=dominant_punctuation,
            tokens=tokens,
            phrases=phrases,
            contact_markers=contact_markers,
            sales_markers=sales_markers,
        )

    def _shared_values(self, value_sets) -> list[str]:
        counts: Counter[str] = Counter()
        for values in value_sets:
            counts.update(values)
        return sorted(
            (value for value, count in counts.items() if count >= 2),
            key=lambda value: (-len(value.split()), value),
        )

    def _candidate_explanation(self, rules: list[str]) -> str:
        descriptions = {
            "same_wallet": "reuse the same cryptocurrency wallet",
            "same_pgp": "reuse the same PGP key material",
            "same_contact": "reuse the same contact handle or email",
            "shared_url_or_domain": "share infrastructure or profile URL context",
            "similar_writing_pattern": "share deterministic writing-pattern markers",
            "shared_activity_date": "were observed around the same activity date",
            "similar_username": "use similar handle strings",
        }
        details = [descriptions.get(rule, rule.replace("_", " ")) for rule in rules]
        if not details:
            return "These entities have a deterministic candidate link."
        if len(details) == 1:
            return f"These handles are linked because they {details[0]}."
        return (
            "These handles are linked because they "
            f"{', '.join(details[:-1])}, and {details[-1]}."
        )

    def _add_risk(
        self,
        contributions: list[RiskScoreContribution],
        rules: set[str],
        rule: str,
        points: int,
        label: str,
    ) -> None:
        if rule not in rules:
            return
        contributions.append(
            RiskScoreContribution(
                factor=rule,
                points=points,
                rationale=f"{label} appears in Module 2 candidate rules.",
                evidence_refs=[rule],
            )
        )

    def _risk_level(self, score: int) -> str:
        if score >= 86:
            return "critical"
        if score >= 61:
            return "high"
        if score >= 31:
            return "medium"
        return "low"

    def _graph_edges_by_type(self, graph: CaseGraphResponse) -> dict[str, list[str]]:
        edges: dict[str, list[str]] = {}
        for edge in graph.edges:
            edges.setdefault(edge.type, []).append(edge.id)
        return {key: sorted(value) for key, value in edges.items()}

    def _entities_by_type(
        self, evidence_links: list[EvidenceEntityLink], entity_types: set[str]
    ) -> list[str]:
        return self._unique(
            link.entity.value
            for link in evidence_links
            if link.entity.entity_type in entity_types
        )

    def _snippets_for_entity_types(
        self, evidence_links: list[EvidenceEntityLink], entity_types: set[str]
    ) -> list[str]:
        return self._unique(
            link.evidence_snippet
            for link in evidence_links
            if link.entity.entity_type in entity_types
        )[:8]

    def _ingestion_ids_for_entity_types(
        self, evidence_links: list[EvidenceEntityLink], entity_types: set[str]
    ) -> list[UUID]:
        return sorted(
            {
                link.ingestion_id
                for link in evidence_links
                if link.entity.entity_type in entity_types
            },
            key=str,
        )

    def _has_entity_type(
        self, evidence_links: list[EvidenceEntityLink], entity_types: set[str]
    ) -> bool:
        return any(link.entity.entity_type in entity_types for link in evidence_links)

    def _has_prefix_entity_type(
        self, evidence_links: list[EvidenceEntityLink], prefix: str
    ) -> bool:
        return any(link.entity.entity_type.startswith(prefix) for link in evidence_links)

    def _graph_or_entity_refs(
        self, evidence_links: list[EvidenceEntityLink], entity_types: set[str]
    ) -> list[str]:
        return [
            str(link.id)
            for link in evidence_links
            if link.entity.entity_type in entity_types
        ][:8]

    def _snippet_for_value(self, text: str, value: str, radius: int = 72) -> str:
        index = text.casefold().find(value.casefold())
        if index == -1:
            return ""
        left = max(index - radius, 0)
        right = min(index + len(value) + radius, len(text))
        return " ".join(text[left:right].split())

    def _unique(self, values) -> list:
        seen = set()
        unique_values = []
        for value in values:
            if value is None or value == "":
                continue
            key = str(value)
            if key in seen:
                continue
            seen.add(key)
            unique_values.append(value)
        return unique_values
