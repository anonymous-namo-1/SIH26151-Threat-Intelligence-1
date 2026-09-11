import hashlib
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from backend.app.database.models import Case, Entity, EvidenceEntityLink, Ingestion
from backend.app.models.schemas import CaseGraphResponse, GraphEdge, GraphNode
from backend.app.services.entity_resolution import EntityResolutionService
from backend.app.services.persistence import DatabaseUnavailableError, NotFoundError


GRAPH_WARNING = (
    "Graph edges are evidence-backed analytical links, not proof of attribution or identity."
)


@dataclass
class IngestionContext:
    ingestion: Ingestion
    entities: list[Entity] = field(default_factory=list)
    links_by_entity_id: dict[UUID, list[EvidenceEntityLink]] = field(default_factory=dict)


class GraphIntelligenceService:
    """Builds graph-ready JSON from persisted case evidence and resolution candidates."""

    def __init__(self, resolution_service: EntityResolutionService | None = None) -> None:
        self.resolution_service = resolution_service or EntityResolutionService()

    def build_case_graph(self, db: Session, case_id: UUID) -> CaseGraphResponse:
        try:
            if db.get(Case, case_id) is None:
                raise NotFoundError()

            ingestions = db.scalars(
                select(Ingestion)
                .where(Ingestion.case_id == case_id)
                .order_by(Ingestion.created_at, Ingestion.id)
            ).all()
            links = db.scalars(
                select(EvidenceEntityLink)
                .options(joinedload(EvidenceEntityLink.entity))
                .where(EvidenceEntityLink.case_id == case_id)
                .order_by(EvidenceEntityLink.created_at, EvidenceEntityLink.id)
            ).all()
        except NotFoundError:
            raise
        except SQLAlchemyError as error:
            raise DatabaseUnavailableError() from error

        nodes: dict[str, GraphNode] = {}
        edges: dict[str, GraphEdge] = {}
        contexts = self._contexts_by_ingestion(ingestions, links)

        for context in contexts.values():
            self._add_ingestion_and_source(nodes, edges, context.ingestion)
            for entity in context.entities:
                self._add_node(
                    nodes,
                    self._entity_node(
                        entity,
                        context.links_by_entity_id.get(entity.id, []),
                    ),
                )
                for link in context.links_by_entity_id.get(entity.id, []):
                    self._add_edge(
                        edges,
                        source=f"entity:{entity.id}",
                        target=f"ingestion:{context.ingestion.id}",
                        edge_type="mentioned_in",
                        label="mentioned in",
                        confidence=link.confidence,
                        evidence_snippets=[link.evidence_snippet],
                    )

            self._add_semantic_edges(edges, context)

        self._add_resolution_edges(db, case_id, edges)

        warnings = [
            GRAPH_WARNING,
            "No Neo4j, frontend graph UI, AI profiling, live crawling, or Tor access is used.",
        ]
        return CaseGraphResponse(
            case_id=case_id,
            generated_at=datetime.now(UTC),
            nodes=sorted(nodes.values(), key=lambda node: node.id),
            edges=sorted(edges.values(), key=lambda edge: edge.id),
            warnings=warnings,
        )

    def _contexts_by_ingestion(
        self,
        ingestions: list[Ingestion],
        links: list[EvidenceEntityLink],
    ) -> dict[UUID, IngestionContext]:
        contexts = {
            ingestion.id: IngestionContext(ingestion=ingestion)
            for ingestion in ingestions
        }
        seen_entities: dict[tuple[UUID, UUID], Entity] = {}
        for link in links:
            context = contexts.get(link.ingestion_id)
            if context is None:
                continue
            context.links_by_entity_id.setdefault(link.entity_id, []).append(link)
            seen_key = (link.ingestion_id, link.entity_id)
            if seen_key not in seen_entities:
                seen_entities[seen_key] = link.entity
                context.entities.append(link.entity)

        for context in contexts.values():
            context.entities.sort(key=lambda entity: (entity.entity_type, entity.value, str(entity.id)))
        return contexts

    def _add_ingestion_and_source(
        self,
        nodes: dict[str, GraphNode],
        edges: dict[str, GraphEdge],
        ingestion: Ingestion,
    ) -> None:
        ingestion_id = f"ingestion:{ingestion.id}"
        source_label = self._source_label(ingestion)
        source_id = f"source:{self._stable_id(source_label)}"

        self._add_node(
            nodes,
            GraphNode(
                id=ingestion_id,
                ingestion_id=ingestion.id,
                type="ingestion",
                label=source_label,
                value=str(ingestion.id),
                group="source",
                risk_level="low",
                confidence=1.0,
                metadata={
                    "source_type": ingestion.source_type,
                    "platform": ingestion.platform,
                    "observed_at": ingestion.observed_at.isoformat()
                    if ingestion.observed_at
                    else None,
                    "content_sha256": ingestion.content_sha256,
                },
            ),
        )
        self._add_node(
            nodes,
            GraphNode(
                id=source_id,
                type="source",
                label=source_label,
                value=source_label,
                group="source",
                risk_level="low",
                confidence=0.75,
                metadata={"source_type": ingestion.source_type},
            ),
        )
        self._add_edge(
            edges,
            source=ingestion_id,
            target=source_id,
            edge_type="observed_in_source",
            label="observed in source",
            confidence=0.75,
            evidence_snippets=[],
        )

    def _add_semantic_edges(
        self,
        edges: dict[str, GraphEdge],
        context: IngestionContext,
    ) -> None:
        primary_handles = [
            entity
            for entity in context.entities
            if entity.entity_type == "handle"
            and self._is_primary_handle(entity, context.ingestion, context.links_by_entity_id.get(entity.id, []))
        ]
        if not primary_handles:
            return

        for entity in context.entities:
            if entity.id in {handle.id for handle in primary_handles}:
                continue
            edge_type = self._semantic_edge_type(entity, context.links_by_entity_id.get(entity.id, []))
            if edge_type is None:
                continue
            for handle in primary_handles:
                self._add_edge(
                    edges,
                    source=f"entity:{handle.id}",
                    target=f"entity:{entity.id}",
                    edge_type=edge_type,
                    label=self._edge_label(edge_type),
                    confidence=self._semantic_confidence(edge_type, entity),
                    evidence_snippets=[
                        link.evidence_snippet
                        for link in context.links_by_entity_id.get(entity.id, [])
                    ],
                )

    def _add_resolution_edges(
        self,
        db: Session,
        case_id: UUID,
        edges: dict[str, GraphEdge],
    ) -> None:
        resolution = self.resolution_service.resolve_case(db, case_id)
        for candidate in resolution.candidates:
            self._add_edge(
                edges,
                source=f"entity:{candidate.left_entity.id}",
                target=f"entity:{candidate.right_entity.id}",
                edge_type="resolved_candidate",
                label="resolved candidate",
                confidence=candidate.confidence_score,
                evidence_snippets=candidate.evidence_snippets,
                rule_hits=candidate.rule_hits,
            )

    def _entity_node(
        self,
        entity: Entity,
        links: list[EvidenceEntityLink],
    ) -> GraphNode:
        node_type = self._node_type(entity, links)
        return GraphNode(
            id=f"entity:{entity.id}",
            entity_id=entity.id,
            type=node_type,
            label=self._node_label(node_type, entity),
            value=entity.value,
            group=self._node_group(node_type),
            risk_level=self._node_risk(node_type, entity.confidence),
            confidence=round(entity.confidence, 2),
            metadata={
                "entity_type": entity.entity_type,
                "normalized_value": entity.normalized_value,
                "first_seen": entity.first_seen.isoformat(),
                "last_seen": entity.last_seen.isoformat(),
            },
        )

    def _add_node(self, nodes: dict[str, GraphNode], node: GraphNode) -> None:
        nodes.setdefault(node.id, node)

    def _add_edge(
        self,
        edges: dict[str, GraphEdge],
        source: str,
        target: str,
        edge_type: str,
        label: str,
        confidence: float,
        evidence_snippets: list[str],
        rule_hits: list | None = None,
    ) -> None:
        edge_id = self._edge_id(source, target, edge_type)
        edge = GraphEdge(
            id=edge_id,
            source=source,
            target=target,
            type=edge_type,
            label=label,
            confidence=round(confidence, 2),
            weight=self._weight(confidence),
            animated=confidence >= 0.9,
            style_hint=self._style_hint(confidence),
            evidence_snippets=self._unique(evidence_snippets),
            rule_hits=rule_hits or [],
        )
        existing = edges.get(edge_id)
        if existing is None or edge.confidence > existing.confidence:
            edges[edge_id] = edge

    def _semantic_edge_type(
        self,
        entity: Entity,
        links: list[EvidenceEntityLink],
    ) -> str | None:
        if entity.entity_type.startswith("wallet:"):
            return "uses_wallet"
        if entity.entity_type.startswith("pgp"):
            return "uses_pgp"
        if entity.entity_type == "email":
            return "has_contact"
        if entity.entity_type == "handle" and self._is_contact_links(links):
            return "has_contact"
        if entity.entity_type in {"domain", "ip_address", "onion_url"}:
            return "hosted_on"
        if entity.entity_type in {"malware_name", "mitre_technique", "cve", "threat_actor"}:
            return "related_to"
        return None

    def _semantic_confidence(self, edge_type: str, entity: Entity) -> float:
        if edge_type in {"uses_wallet", "uses_pgp"}:
            return max(entity.confidence, 0.95)
        if edge_type == "has_contact":
            return max(entity.confidence, 0.9)
        if edge_type == "hosted_on":
            return max(entity.confidence, 0.65)
        return max(min(entity.confidence, 0.75), 0.5)

    def _is_primary_handle(
        self,
        entity: Entity,
        ingestion: Ingestion,
        links: list[EvidenceEntityLink],
    ) -> bool:
        if entity.entity_type != "handle":
            return False
        if ingestion.handle and entity.normalized_value == self._normalize(ingestion.handle):
            return True
        return any(
            link.source_field == "handle"
            or self._looks_like_primary_handle(link.evidence_snippet)
            for link in links
        )

    def _is_contact_links(self, links: list[EvidenceEntityLink]) -> bool:
        return any(self._looks_like_contact(link.evidence_snippet) for link in links)

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

    def _node_type(self, entity: Entity, links: list[EvidenceEntityLink]) -> str:
        if entity.entity_type.startswith("wallet:"):
            return "wallet"
        if entity.entity_type.startswith("pgp"):
            return "pgp_key"
        if entity.entity_type == "handle" and self._is_contact_links(links):
            return "telegram"
        if entity.entity_type == "malware_name":
            return "malware"
        if entity.entity_type == "ip_address":
            return "ip_address"
        if entity.entity_type in {"handle", "email", "domain", "onion_url", "mitre_technique", "cve"}:
            return entity.entity_type
        return "alias" if entity.entity_type == "threat_actor" else "source"

    def _node_label(self, node_type: str, entity: Entity) -> str:
        if node_type == "wallet":
            return "ETH Wallet" if entity.entity_type == "wallet:eth" else "BTC Wallet"
        return {
            "handle": "Handle",
            "alias": "Alias",
            "pgp_key": "PGP Key",
            "telegram": "Telegram",
            "email": "Email",
            "domain": "Domain",
            "ip_address": "IP Address",
            "onion_url": "Onion URL",
            "malware": "Malware",
            "mitre_technique": "MITRE Technique",
            "cve": "CVE",
            "source": "Source",
            "ingestion": "Ingestion",
        }.get(node_type, "Entity")

    def _node_group(self, node_type: str) -> str:
        if node_type in {"handle", "alias"}:
            return "identity"
        if node_type == "wallet":
            return "crypto"
        if node_type == "pgp_key":
            return "security_key"
        if node_type in {"telegram", "email"}:
            return "contact"
        if node_type in {"domain", "ip_address", "onion_url"}:
            return "infrastructure"
        if node_type in {"malware", "mitre_technique", "cve"}:
            return "threat_context"
        return "source"

    def _node_risk(self, node_type: str, confidence: float) -> str:
        if node_type in {"wallet", "pgp_key"}:
            return "high"
        if node_type in {"domain", "ip_address", "onion_url", "email", "telegram"} and confidence >= 0.65:
            return "medium"
        return "low"

    def _edge_label(self, edge_type: str) -> str:
        return {
            "mentioned_in": "mentioned in",
            "uses_wallet": "uses wallet",
            "uses_pgp": "uses PGP",
            "has_contact": "has contact",
            "hosted_on": "hosted on",
            "observed_in_source": "observed in source",
            "resolved_candidate": "resolved candidate",
            "shared_indicator": "shared indicator",
            "related_to": "related to",
        }[edge_type]

    def _weight(self, confidence: float) -> int:
        if confidence >= 0.9:
            return 5
        if confidence >= 0.75:
            return 4
        if confidence >= 0.6:
            return 3
        if confidence >= 0.4:
            return 2
        return 1

    def _style_hint(self, confidence: float) -> str:
        if confidence >= 0.9:
            return "high_confidence"
        if confidence >= 0.65:
            return "medium_confidence"
        return "low_confidence"

    def _source_label(self, ingestion: Ingestion) -> str:
        metadata = ingestion.metadata_ or {}
        return (
            metadata.get("source_name")
            or ingestion.platform
            or metadata.get("source_url")
            or ingestion.source_type
        )

    def _edge_id(self, source: str, target: str, edge_type: str) -> str:
        return f"edge:{source}:{target}:{edge_type}"

    def _stable_id(self, value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]

    def _normalize(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()

    def _unique(self, values) -> list[str]:
        seen = set()
        unique_values = []
        for value in values:
            if not value:
                continue
            if value in seen:
                continue
            seen.add(value)
            unique_values.append(value)
        return unique_values
