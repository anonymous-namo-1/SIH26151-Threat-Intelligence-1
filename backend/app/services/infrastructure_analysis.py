import itertools
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from difflib import SequenceMatcher
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from backend.app.database.models import Case, EvidenceEntityLink, Ingestion
from backend.app.models.schemas import (
    CaseInfrastructureResponse,
    ExtractionRequest,
    InfrastructureFinding,
    InfrastructureObservationRequest,
    InfrastructureSignal,
    PersistedExtractionResponse,
    SourceType,
)
from backend.app.services.persistence import (
    DatabaseUnavailableError,
    NotFoundError,
    PersistenceService,
)


INFRASTRUCTURE_WARNING = (
    "Infrastructure findings are metadata-only investigative signals, not proof of "
    "attribution or real-world identity."
)

INFRASTRUCTURE_MODULES = {"infrastructure_observation", "onion_metadata"}
INCONSISTENCY_WORDS = {"brand", "claim", "claims", "claiming", "mirror", "title"}
SENSITIVE_WORDS = {"admin", "debug", "dev", "staging", "test"}


@dataclass(frozen=True)
class InfrastructureObservation:
    ingestion: Ingestion
    url: str | None
    onion_url: str | None
    domain: str | None
    ip_address: str | None
    page_title: str | None
    server_header: str | None
    powered_by_header: str | None
    tls_issuer: str | None
    tls_subject: str | None
    tls_serial: str | None
    certificate_fingerprint: str | None
    http_status: int | None
    open_ports: list[int]
    source_label: str | None
    notes: str | None
    headers: dict[str, str]
    evidence_snippet: str
    related_handles: tuple[str, ...]


class InfrastructureAnalysisService:
    """Module 5 metadata-only infrastructure ingestion and analysis."""

    def __init__(self, persistence_service: PersistenceService | None = None) -> None:
        self.persistence_service = persistence_service or PersistenceService()

    def ingest_observation(
        self,
        db: Session,
        case_id: UUID,
        request: InfrastructureObservationRequest,
    ) -> PersistedExtractionResponse:
        metadata = self._observation_metadata(request)
        return self.persistence_service.persist_extraction(
            db=db,
            case_id=case_id,
            request=ExtractionRequest(
                text=self._observation_text(request),
                source_type=SourceType.public_indicator,
                platform=request.source_label or "Infrastructure Observation",
                onion_url=request.onion_url,
                observed_at=request.observed_at,
                metadata=metadata,
            ),
        )

    def analyze_case(self, db: Session, case_id: UUID) -> CaseInfrastructureResponse:
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

        observations = self._observations(ingestions, evidence_links)
        findings = self._findings(observations)
        signals = self._signals(observations, evidence_links)
        risk_score = self._risk_score(findings)
        warnings = [
            INFRASTRUCTURE_WARNING,
            "No live host scanning, Tor access, onion crawling, or external network lookup is performed.",
        ]
        if not observations:
            warnings.append("No persisted infrastructure observations are available.")

        return CaseInfrastructureResponse(
            case_id=case_id,
            generated_at=datetime.now(UTC),
            findings=findings,
            signals=signals,
            risk_score=risk_score,
            risk_level=self._risk_level(risk_score),
            warnings=warnings,
        )

    def _observation_metadata(
        self, request: InfrastructureObservationRequest
    ) -> dict:
        certificate = request.certificate.model_dump() if request.certificate else {}
        metadata = {
            **request.metadata,
            "ingestion_module": "infrastructure_observation",
            "network_access": False,
            "url": request.url,
            "onion_url": request.onion_url,
            "domain": request.domain,
            "ip_address": request.ip_address,
            "page_title": request.page_title,
            "server_header": request.server_header,
            "powered_by_header": request.powered_by_header,
            "tls_issuer": request.tls_issuer or certificate.get("issuer"),
            "tls_subject": request.tls_subject or certificate.get("subject"),
            "tls_serial": request.tls_serial or certificate.get("serial"),
            "certificate_fingerprint": request.certificate_fingerprint
            or certificate.get("fingerprint"),
            "http_status": request.http_status,
            "open_ports": request.open_ports,
            "source_label": request.source_label,
            "notes": request.notes,
            "headers": [header.model_dump() for header in request.headers],
        }
        return {key: value for key, value in metadata.items() if value not in (None, "", [])}

    def _observation_text(self, request: InfrastructureObservationRequest) -> str:
        lines = [
            "Infrastructure observation supplied by analyst; network_access: false",
            f"url: {request.url or ''}",
            f"onion url: {request.onion_url or ''}",
            f"domain: {request.domain or ''}",
            f"ip address: {request.ip_address or ''}",
            f"page title: {request.page_title or ''}",
            f"server header: {request.server_header or ''}",
            f"powered-by header: {request.powered_by_header or ''}",
            f"tls issuer: {request.tls_issuer or ''}",
            f"tls subject: {request.tls_subject or ''}",
            f"tls serial: {request.tls_serial or ''}",
            f"certificate fingerprint: {request.certificate_fingerprint or ''}",
            f"http status: {request.http_status or ''}",
            f"open ports: {', '.join(str(port) for port in request.open_ports)}",
            f"source label: {request.source_label or ''}",
            f"notes: {request.notes or ''}",
        ]
        if request.certificate:
            certificate = request.certificate
            lines.extend(
                [
                    f"certificate issuer: {certificate.issuer or ''}",
                    f"certificate subject: {certificate.subject or ''}",
                    f"certificate serial: {certificate.serial or ''}",
                    f"certificate fingerprint: {certificate.fingerprint or ''}",
                ]
            )
        for header in request.headers:
            lines.append(f"header {header.name}: {header.value}")
        for key, value in request.metadata.items():
            lines.append(f"metadata {key}: {value}")
        return "\n".join(lines)

    def _observations(
        self,
        ingestions: list[Ingestion],
        evidence_links: list[EvidenceEntityLink],
    ) -> list[InfrastructureObservation]:
        evidence_by_ingestion: dict[UUID, list[EvidenceEntityLink]] = {}
        for link in evidence_links:
            evidence_by_ingestion.setdefault(link.ingestion_id, []).append(link)

        observations = []
        for ingestion in ingestions:
            metadata = ingestion.metadata_ or {}
            if not self._looks_like_infrastructure_observation(ingestion, metadata):
                continue
            headers = self._headers(metadata)
            observations.append(
                InfrastructureObservation(
                    ingestion=ingestion,
                    url=metadata.get("url"),
                    onion_url=metadata.get("onion_url") or ingestion.onion_url,
                    domain=metadata.get("domain"),
                    ip_address=metadata.get("ip_address"),
                    page_title=metadata.get("page_title") or metadata.get("title"),
                    server_header=metadata.get("server_header")
                    or self._named_header(headers, "server"),
                    powered_by_header=metadata.get("powered_by_header")
                    or self._named_header(headers, "x-powered-by"),
                    tls_issuer=metadata.get("tls_issuer"),
                    tls_subject=metadata.get("tls_subject"),
                    tls_serial=metadata.get("tls_serial"),
                    certificate_fingerprint=metadata.get("certificate_fingerprint"),
                    http_status=metadata.get("http_status"),
                    open_ports=metadata.get("open_ports", []),
                    source_label=metadata.get("source_label") or ingestion.platform,
                    notes=metadata.get("notes"),
                    headers=headers,
                    evidence_snippet=self._evidence_snippet(ingestion),
                    related_handles=self._related_handles(
                        ingestion,
                        evidence_by_ingestion.get(ingestion.id, []),
                    ),
                )
            )
        return observations

    def _findings(
        self, observations: list[InfrastructureObservation]
    ) -> list[InfrastructureFinding]:
        findings: list[InfrastructureFinding] = []
        findings.extend(self._shared_value_findings(
            observations,
            finding_type="shared_certificate_fingerprint",
            title="Shared certificate fingerprint",
            severity="high",
            confidence=0.95,
            values=lambda obs: [obs.certificate_fingerprint] if obs.certificate_fingerprint else [],
            description="Same TLS certificate fingerprint appears across multiple infrastructure observations.",
        ))
        findings.extend(self._shared_value_findings(
            observations,
            finding_type="shared_server_header",
            title="Shared server/header pattern",
            severity="medium",
            confidence=0.72,
            values=lambda obs: self._header_values(obs),
            description="Same server or HTTP header pattern appears across multiple handles, sources, or platforms.",
        ))
        findings.extend(self._shared_value_findings(
            observations,
            finding_type="shared_tls_identity",
            title="Shared TLS issuer and subject",
            severity="medium",
            confidence=0.7,
            values=lambda obs: [
                f"{obs.tls_issuer} | {obs.tls_subject}"
            ] if obs.tls_issuer and obs.tls_subject else [],
            description="Same TLS issuer and subject pair appears across multiple infrastructure observations.",
        ))
        findings.extend(self._title_similarity_findings(observations))
        findings.extend(self._powered_by_findings(observations))
        findings.extend(self._sensitive_descriptor_findings(observations))
        findings.extend(self._descriptor_inconsistency_findings(observations))
        findings.extend(self._shared_value_findings(
            observations,
            finding_type="repeated_ip_or_domain",
            title="Repeated IP/domain infrastructure",
            severity="medium",
            confidence=0.68,
            values=lambda obs: [value for value in (obs.ip_address, obs.domain) if value],
            description="Same IP address or domain appears in multiple infrastructure observations.",
        ))
        return sorted(
            findings,
            key=lambda finding: (
                self._severity_rank(finding.severity),
                -finding.confidence,
                finding.finding_type,
                finding.matched_values,
            ),
        )

    def _signals(
        self,
        observations: list[InfrastructureObservation],
        evidence_links: list[EvidenceEntityLink],
    ) -> list[InfrastructureSignal]:
        signals = []
        entity_counts = Counter(
            (link.entity.entity_type, link.entity.normalized_value)
            for link in evidence_links
            if link.entity.entity_type in {"domain", "ip_address", "onion_url"}
        )
        repeated_entities = [
            value
            for (entity_type, value), count in entity_counts.items()
            if count >= 2 and entity_type in {"domain", "ip_address", "onion_url"}
        ]
        if repeated_entities:
            signals.append(
                InfrastructureSignal(
                    signal_type="shared_infrastructure_correlation",
                    description="Persisted evidence links show repeated infrastructure indicators.",
                    confidence=0.68,
                    evidence_snippets=self._unique(
                        link.evidence_snippet
                        for link in evidence_links
                        if link.entity.entity_type in {"domain", "ip_address", "onion_url"}
                    )[:8],
                    source_ingestion_ids=sorted(
                        {
                            link.ingestion_id
                            for link in evidence_links
                            if link.entity.entity_type in {"domain", "ip_address", "onion_url"}
                        },
                        key=str,
                    ),
                    metadata={"normalized_values": repeated_entities[:10]},
                )
            )
        for observation in observations:
            if observation.open_ports:
                signals.append(
                    InfrastructureSignal(
                        signal_type="supplied_open_ports",
                        description="Open ports were supplied by the analyst as metadata.",
                        confidence=0.45,
                        evidence_snippets=[observation.evidence_snippet],
                        source_ingestion_ids=[observation.ingestion.id],
                        metadata={"open_ports": observation.open_ports},
                    )
                )
        return sorted(signals, key=lambda signal: (-signal.confidence, signal.signal_type))

    def _shared_value_findings(
        self,
        observations: list[InfrastructureObservation],
        finding_type: str,
        title: str,
        severity: str,
        confidence: float,
        values,
        description: str,
    ) -> list[InfrastructureFinding]:
        grouped: dict[str, list[tuple[str, InfrastructureObservation]]] = {}
        for observation in observations:
            for value in values(observation):
                normalized = self._normalize(value)
                if not normalized:
                    continue
                grouped.setdefault(normalized, []).append((value, observation))

        findings = []
        for grouped_values in grouped.values():
            unique_ingestions = {
                observation.ingestion.id for _, observation in grouped_values
            }
            if len(unique_ingestions) < 2:
                continue
            raw_values = self._unique(value for value, _ in grouped_values)
            related_observations = [observation for _, observation in grouped_values]
            findings.append(
                InfrastructureFinding(
                    finding_type=finding_type,
                    title=title,
                    severity=severity,
                    confidence=confidence,
                    description=description,
                    matched_values=raw_values[:8],
                    evidence_snippets=self._unique(
                        observation.evidence_snippet
                        for observation in related_observations
                    )[:8],
                    source_ingestion_ids=sorted(unique_ingestions, key=str),
                    related_handles=self._handles_for(related_observations),
                )
            )
        return findings

    def _title_similarity_findings(
        self, observations: list[InfrastructureObservation]
    ) -> list[InfrastructureFinding]:
        findings = []
        seen_pairs = set()
        for left, right in itertools.combinations(observations, 2):
            if not left.page_title or not right.page_title:
                continue
            if not self._is_onion_clearnet_pair(left, right):
                continue
            similarity = self._similarity(left.page_title, right.page_title)
            if similarity < 0.78:
                continue
            key = tuple(sorted([str(left.ingestion.id), str(right.ingestion.id)]))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            findings.append(
                InfrastructureFinding(
                    finding_type="clearnet_onion_title_similarity",
                    title="Clearnet/onion metadata similarity",
                    severity="medium",
                    confidence=round(similarity, 2),
                    description="Onion and clearnet observations share similar page-title metadata.",
                    matched_values=[left.page_title, right.page_title],
                    evidence_snippets=[left.evidence_snippet, right.evidence_snippet],
                    source_ingestion_ids=sorted(
                        [left.ingestion.id, right.ingestion.id], key=str
                    ),
                    related_handles=self._handles_for([left, right]),
                )
            )
        return findings

    def _powered_by_findings(
        self, observations: list[InfrastructureObservation]
    ) -> list[InfrastructureFinding]:
        findings = []
        for observation in observations:
            if not observation.powered_by_header:
                continue
            findings.append(
                InfrastructureFinding(
                    finding_type="leaked_powered_by_header",
                    title="Leaked powered-by technology header",
                    severity="medium",
                    confidence=0.55,
                    description="A supplied X-Powered-By style header exposes technology context.",
                    matched_values=[observation.powered_by_header],
                    evidence_snippets=[observation.evidence_snippet],
                    source_ingestion_ids=[observation.ingestion.id],
                    related_handles=list(observation.related_handles),
                )
            )
        return findings

    def _sensitive_descriptor_findings(
        self, observations: list[InfrastructureObservation]
    ) -> list[InfrastructureFinding]:
        findings = []
        for observation in observations:
            text = self._descriptor_text(observation)
            matched = sorted(
                word for word in SENSITIVE_WORDS if self._has_descriptor_word(text, word)
            )
            if not matched:
                continue
            findings.append(
                InfrastructureFinding(
                    finding_type="sensitive_descriptor",
                    title="Admin/debug/staging/test descriptor",
                    severity="medium",
                    confidence=0.65,
                    description="Supplied headers, title, or metadata include sensitive environment wording.",
                    matched_values=matched,
                    evidence_snippets=[observation.evidence_snippet],
                    source_ingestion_ids=[observation.ingestion.id],
                    related_handles=list(observation.related_handles),
                )
            )
        return findings

    def _descriptor_inconsistency_findings(
        self, observations: list[InfrastructureObservation]
    ) -> list[InfrastructureFinding]:
        findings = []
        for observation in observations:
            brands = self._declared_brands(observation)
            if len(brands) < 2:
                continue
            findings.append(
                InfrastructureFinding(
                    finding_type="descriptor_inconsistency",
                    title="Descriptor inconsistency",
                    severity="medium",
                    confidence=0.62,
                    description="Supplied metadata contains conflicting brand, title, or mirror descriptors.",
                    matched_values=brands[:8],
                    evidence_snippets=[observation.evidence_snippet],
                    source_ingestion_ids=[observation.ingestion.id],
                    related_handles=list(observation.related_handles),
                )
            )
        return findings

    def _looks_like_infrastructure_observation(
        self, ingestion: Ingestion, metadata: dict
    ) -> bool:
        if metadata.get("ingestion_module") in INFRASTRUCTURE_MODULES:
            return True
        if ingestion.onion_url:
            return True
        return any(
            key in metadata
            for key in (
                "url",
                "domain",
                "ip_address",
                "page_title",
                "server_header",
                "powered_by_header",
                "tls_issuer",
                "tls_subject",
                "certificate_fingerprint",
                "headers",
            )
        )

    def _headers(self, metadata: dict) -> dict[str, str]:
        headers: dict[str, str] = {}
        raw_headers = metadata.get("headers") or []
        if isinstance(raw_headers, dict):
            raw_headers = [{"name": key, "value": value} for key, value in raw_headers.items()]
        for header in raw_headers:
            if not isinstance(header, dict):
                continue
            name = str(header.get("name", "")).strip().casefold()
            value = str(header.get("value", "")).strip()
            if name and value:
                headers[name] = value
        raw_server_headers = metadata.get("server_headers") or {}
        if isinstance(raw_server_headers, dict):
            for name, value in raw_server_headers.items():
                cleaned_name = str(name).strip().casefold()
                cleaned_value = str(value).strip()
                if cleaned_name and cleaned_value:
                    headers[cleaned_name] = cleaned_value
        return headers

    def _named_header(self, headers: dict[str, str], name: str) -> str | None:
        return headers.get(name.casefold())

    def _header_values(self, observation: InfrastructureObservation) -> list[str]:
        values = []
        if observation.server_header:
            values.append(f"server:{observation.server_header}")
        values.extend(
            f"{name}:{value}"
            for name, value in observation.headers.items()
            if name in {"server", "x-powered-by", "x-generator", "via"}
        )
        return self._unique(values)

    def _evidence_snippet(self, ingestion: Ingestion) -> str:
        return " ".join(ingestion.raw_text.split())[:500]

    def _related_handles(
        self, ingestion: Ingestion, evidence_links: list[EvidenceEntityLink]
    ) -> tuple[str, ...]:
        handles = []
        if ingestion.handle:
            handles.append(ingestion.handle)
        for link in evidence_links:
            if link.entity.entity_type == "handle":
                handles.append(link.entity.value)
        return tuple(self._unique(handles))

    def _handles_for(self, observations: list[InfrastructureObservation]) -> list[str]:
        return self._unique(
            handle
            for observation in observations
            for handle in observation.related_handles
        )

    def _is_onion_clearnet_pair(
        self, left: InfrastructureObservation, right: InfrastructureObservation
    ) -> bool:
        left_onion = bool(left.onion_url)
        right_onion = bool(right.onion_url)
        left_clear = bool(left.url or left.domain or left.ip_address)
        right_clear = bool(right.url or right.domain or right.ip_address)
        return (left_onion and right_clear) or (right_onion and left_clear)

    def _similarity(self, left: str, right: str) -> float:
        normalized_left = self._normalize(left)
        normalized_right = self._normalize(right)
        if not normalized_left or not normalized_right:
            return 0
        return SequenceMatcher(None, normalized_left, normalized_right).ratio()

    def _descriptor_text(self, observation: InfrastructureObservation) -> str:
        parts = [
            observation.page_title,
            observation.server_header,
            observation.powered_by_header,
            observation.notes,
            json.dumps(observation.headers, sort_keys=True),
            json.dumps(observation.ingestion.metadata_ or {}, sort_keys=True, default=str),
        ]
        return " ".join(part for part in parts if part)

    def _declared_brands(self, observation: InfrastructureObservation) -> list[str]:
        text = self._descriptor_text(observation)
        if not any(word in text.casefold() for word in INCONSISTENCY_WORDS):
            return []
        matches = []
        patterns = [
            r"\bbrand\s*[:=]\s*([A-Za-z0-9_. -]{3,40})",
            r"\bclaims?\s+(?:brand\s+)?([A-Za-z0-9_. -]{3,40})",
            r"\bclaiming\s+(?:brand\s+)?([A-Za-z0-9_. -]{3,40})",
            r"\bclearnet\s+mirror\s*[:=]?\s*([A-Za-z0-9_. -]{3,40})",
            r"\bonion\s+title\s*[:=]\s*([A-Za-z0-9_. -]{3,40})",
            r"\bpage\s+title\s*[:=]\s*([A-Za-z0-9_. -]{3,40})",
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                value = self._clean_brand(match.group(1))
                if value:
                    matches.append(value)
        unique_matches = self._unique(matches)
        normalized = {self._normalize(value) for value in unique_matches}
        if len(normalized) < 2:
            return []
        return unique_matches

    def _clean_brand(self, value: str) -> str:
        value = re.split(r"[.;,\n\r]", value, maxsplit=1)[0].strip(" -_:")
        words = value.split()
        if len(words) > 4:
            value = " ".join(words[:4])
        return value

    def _has_descriptor_word(self, text: str, word: str) -> bool:
        return re.search(
            rf"(?<![.a-z0-9]){re.escape(word)}(?![a-z0-9])",
            text,
            re.IGNORECASE,
        ) is not None

    def _risk_score(self, findings: list[InfrastructureFinding]) -> int:
        finding_types = {finding.finding_type for finding in findings}
        score = 0
        if "shared_certificate_fingerprint" in finding_types:
            score += 30
        if {"shared_server_header", "shared_tls_identity"} & finding_types:
            score += 20
        if "clearnet_onion_title_similarity" in finding_types:
            score += 20
        if {"leaked_powered_by_header", "sensitive_descriptor"} & finding_types:
            score += 10
        if "descriptor_inconsistency" in finding_types:
            score += 10
        if "repeated_ip_or_domain" in finding_types:
            score += 10
        return min(score, 100)

    def _risk_level(self, score: int) -> str:
        if score >= 86:
            return "critical"
        if score >= 61:
            return "high"
        if score >= 31:
            return "medium"
        return "low"

    def _severity_rank(self, severity: str) -> int:
        return {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(severity, 4)

    def _normalize(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(value).casefold()).strip()

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
