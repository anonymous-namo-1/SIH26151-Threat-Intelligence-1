import hashlib
from datetime import UTC, datetime

from backend.app.models.schemas import EvidenceCardRequest, EvidenceCardResponse


class EvidenceCardService:
    """Builds a concise analyst evidence object for UI/report generation."""

    def generate(self, request: EvidenceCardRequest) -> EvidenceCardResponse:
        extraction = request.extraction
        material = extraction.model_dump_json()
        evidence_id = hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]

        key_findings = self._key_findings(request)
        enrichment_summary = []
        if request.osint:
            enrichment_summary.extend(
                f"{match.value}: {match.summary}" for match in request.osint.matches[:6]
            )
        if request.blockchain:
            enrichment_summary.extend(
                f"{wallet.address}: {wallet.risk_note}"
                for wallet in request.blockchain.wallets[:6]
            )

        return EvidenceCardResponse(
            evidence_id=evidence_id,
            title=request.title or "Threat Intelligence Evidence Card",
            generated_at=datetime.now(UTC),
            source_credibility=extraction.source_credibility,
            key_findings=key_findings,
            entities=extraction.entities,
            evidence_snippets=extraction.evidence_snippets,
            enrichment_summary=enrichment_summary,
            analyst_notes=request.analyst_notes,
        )

    def _key_findings(self, request: EvidenceCardRequest) -> list[str]:
        entities = request.extraction.entities
        findings = []
        counts = {
            "handles": len(entities.handles),
            "wallets": len(entities.wallets),
            "PGP keys": len(entities.pgp_keys),
            "onion URLs": len(entities.onion_urls),
            "domains": len(entities.domains),
            "IPs": len(entities.ips),
            "hashes": len(entities.hashes),
            "MITRE techniques": len(entities.mitre_techniques),
            "threat actors": len(entities.threat_actors),
        }
        for label, count in counts.items():
            if count:
                findings.append(f"Found {count} {label}.")
        if request.osint and request.osint.matches:
            findings.append(f"Matched {len(request.osint.matches)} legal public OSINT records.")
        if request.blockchain and request.blockchain.wallets:
            findings.append(f"Prepared {len(request.blockchain.wallets)} wallet enrichment records.")
        if not findings:
            findings.append("No high-confidence entities were extracted.")
        return findings

