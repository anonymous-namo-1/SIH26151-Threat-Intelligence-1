import json
from functools import lru_cache
from pathlib import Path

from backend.app.models.schemas import (
    EntityValue,
    OsintEnrichmentRequest,
    OsintEnrichmentResponse,
    OsintMatch,
)


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "public_osint_catalog.json"


class OsintEnrichmentService:
    """Offline legal-public OSINT matcher with future connector hints."""

    def enrich(self, request: OsintEnrichmentRequest) -> OsintEnrichmentResponse:
        catalog = self._catalog()
        matches = []

        for entity in self._flatten_entities(request):
            key = entity.value.lower()
            for record in catalog:
                aliases = [alias.lower() for alias in record.get("aliases", [])]
                indicators = [indicator.lower() for indicator in record.get("indicators", [])]
                techniques = [technique.lower() for technique in record.get("mitre_techniques", [])]
                names = [record.get("name", "").lower(), *aliases, *indicators, *techniques]
                if key not in names:
                    continue
                matches.append(
                    OsintMatch(
                        entity_type=entity.entity_type,
                        value=entity.value,
                        matched_source=record["source"],
                        summary=record["summary"],
                        confidence=record.get("confidence", 0.8),
                        references=record.get("references", []),
                    )
                )

        connector_hints = []
        if request.include_connector_hints:
            connector_hints = [
                "MITRE ATT&CK connector for technique and actor enrichment",
                "CISA/NVD connector for CVE and advisory enrichment",
                "OTX/MISP/OpenCTI connector for public IOC enrichment",
                "URLScan/AbuseIPDB connector for domain and IP reputation",
            ]

        return OsintEnrichmentResponse(
            matches=self._dedupe(matches),
            connector_hints=connector_hints,
        )

    def _flatten_entities(self, request: OsintEnrichmentRequest) -> list[EntityValue]:
        flattened = []
        for values in request.entities.model_dump().values():
            flattened.extend(EntityValue(**value) for value in values)
        return flattened

    def _dedupe(self, matches: list[OsintMatch]) -> list[OsintMatch]:
        seen = set()
        deduped = []
        for match in matches:
            key = (match.entity_type, match.value.lower(), match.matched_source)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(match)
        return deduped

    @lru_cache(maxsize=1)
    def _catalog(self) -> list[dict]:
        with CATALOG_PATH.open("r", encoding="utf-8") as file:
            return json.load(file)

