import ipaddress
import re
from collections.abc import Iterable

from backend.app.models.schemas import (
    EntityValue,
    ExtractedEntities,
    ExtractionRequest,
    ExtractionResponse,
    SourceType,
)


EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
DOMAIN_RE = re.compile(r"\b(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}\b")
IP_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
ONION_RE = re.compile(r"\b(?:https?://)?[a-zA-Z0-9-]{8,64}\.onion(?:/[^\s]*)?\b")
BTC_RE = re.compile(r"\b(?:bc1[a-zA-Z0-9]{8,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b")
ETH_RE = re.compile(r"\b0x[a-fA-F0-9]{40}\b")
PGP_ID_RE = re.compile(r"\b(?:PGP|GPG|key(?:\s*id)?):?\s*([A-Fa-f0-9]{8,40})\b")
PGP_FINGERPRINT_RE = re.compile(
    r"\b(?:PGP\s*)?(?:fingerprint|finger print):?\s*([A-Fa-f0-9][A-Fa-f0-9\s]{14,78}[A-Fa-f0-9])\b",
    re.IGNORECASE,
)
PGP_BLOCK_RE = re.compile(
    r"-----BEGIN PGP PUBLIC KEY BLOCK-----.*?-----END PGP PUBLIC KEY BLOCK-----",
    re.DOTALL,
)
HASH_RE = re.compile(r"\b(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\b")
MITRE_RE = re.compile(r"\bT\d{4}(?:\.\d{3})?\b")
CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
HANDLE_RE = re.compile(
    r"(?:(?:handle|username|user|vendor|actor|alias|known as|telegram|signal|jabber|contact)\s*[:=]\s*|@)([A-Za-z0-9_][A-Za-z0-9_.-]{2,63})\b",
    re.IGNORECASE,
)
TELEGRAM_RE = re.compile(r"\b(?:t\.me|telegram\.me)/([A-Za-z0-9_]{3,32})\b", re.IGNORECASE)

MALWARE_NAMES = {
    "akira",
    "blackcat",
    "cobalt strike",
    "clop",
    "conti",
    "emotet",
    "lockbit",
    "qakbot",
    "revil",
    "trickbot",
    "wannacry",
}

THREAT_ACTORS = {
    "apt28",
    "apt29",
    "blackcat",
    "darkside",
    "fin7",
    "lazarus",
    "lockbit",
    "revil",
    "scattered spider",
}


class EntityExtractionService:
    """Deterministic first-pass extractor for analyst and API workflows."""

    def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        text_parts = [
            request.text,
            request.platform or "",
            request.handle or "",
            request.onion_url or "",
            " ".join(str(value) for value in request.metadata.values()),
        ]
        text = "\n".join(part for part in text_parts if part)

        entities = ExtractedEntities(
            handles=self._extract_handles(text, request),
            wallets=self._extract_wallets(text),
            pgp_keys=self._extract_pgp(text),
            onion_urls=self._regex_entities(ONION_RE, text, "onion_url", 0.93),
            domains=self._extract_domains(text),
            ips=self._extract_ips(text),
            emails=self._regex_entities(EMAIL_RE, text, "email", 0.96),
            hashes=self._regex_entities(HASH_RE, text, "file_hash", 0.97),
            malware_names=self._keyword_entities(MALWARE_NAMES, text, "malware_name"),
            mitre_techniques=self._regex_entities(MITRE_RE, text, "mitre_technique", 0.98),
            cves=self._regex_entities(CVE_RE, text, "cve", 0.98),
            threat_actors=self._keyword_entities(THREAT_ACTORS, text, "threat_actor"),
        )

        return ExtractionResponse(
            source_type=request.source_type,
            source_credibility=self._credibility_for(request.source_type),
            entities=entities,
            evidence_snippets=self._snippets(text, self._all_values(entities)),
            warnings=self._warnings_for(request.source_type),
        )

    def _extract_wallets(self, text: str) -> list[EntityValue]:
        wallets = self._regex_entities(BTC_RE, text, "wallet:btc", 0.9)
        wallets.extend(self._regex_entities(ETH_RE, text, "wallet:eth", 0.98))
        return self._dedupe(wallets)

    def _extract_pgp(self, text: str) -> list[EntityValue]:
        entities = self._regex_entities(PGP_BLOCK_RE, text, "pgp_public_key_block", 0.95)
        for match in PGP_ID_RE.finditer(text):
            entities.append(
                EntityValue(
                    value=match.group(1).upper(),
                    entity_type="pgp_key_id",
                    confidence=0.88,
                    evidence=self._window(text, match.start(), match.end()),
                )
            )
        for match in PGP_FINGERPRINT_RE.finditer(text):
            fingerprint = re.sub(r"\s+", "", match.group(1)).upper()
            if len(fingerprint) < 16:
                continue
            entities.append(
                EntityValue(
                    value=fingerprint,
                    entity_type="pgp_fingerprint",
                    confidence=0.9,
                    evidence=self._window(text, match.start(), match.end()),
                )
            )
        return self._dedupe(entities)

    def _extract_domains(self, text: str) -> list[EntityValue]:
        excluded = {email.split("@", 1)[1].lower() for email in EMAIL_RE.findall(text)}
        excluded.update(match.lower().replace("http://", "").replace("https://", "").split("/")[0] for match in ONION_RE.findall(text))
        domains = []
        for entity in self._regex_entities(DOMAIN_RE, text, "domain", 0.9):
            value = entity.value.lower()
            if value.endswith(".onion") or value in excluded:
                continue
            domains.append(entity)
        return self._dedupe(domains)

    def _extract_ips(self, text: str) -> list[EntityValue]:
        entities = []
        for match in IP_RE.finditer(text):
            try:
                ipaddress.ip_address(match.group(0))
            except ValueError:
                continue
            entities.append(
                EntityValue(
                    value=match.group(0),
                    entity_type="ip_address",
                    confidence=0.97,
                    evidence=self._window(text, match.start(), match.end()),
                )
            )
        return self._dedupe(entities)

    def _extract_handles(
        self, text: str, request: ExtractionRequest
    ) -> list[EntityValue]:
        entities = []
        if request.handle:
            entities.append(
                EntityValue(
                    value=request.handle,
                    entity_type="handle",
                    confidence=0.96,
                    source_field="handle",
                )
            )
        for regex in (HANDLE_RE, TELEGRAM_RE):
            for match in regex.finditer(text):
                entities.append(
                    EntityValue(
                        value=match.group(1),
                        entity_type="handle",
                        confidence=0.84,
                        evidence=self._window(text, match.start(), match.end()),
                    )
                )
        return self._dedupe(entities)

    def _regex_entities(
        self, regex: re.Pattern[str], text: str, entity_type: str, confidence: float
    ) -> list[EntityValue]:
        return self._dedupe(
            [
                EntityValue(
                    value=match.group(0),
                    entity_type=entity_type,
                    confidence=confidence,
                    evidence=self._window(text, match.start(), match.end()),
                )
                for match in regex.finditer(text)
            ]
        )

    def _keyword_entities(
        self, keywords: set[str], text: str, entity_type: str
    ) -> list[EntityValue]:
        entities = []
        lowered = text.lower()
        for keyword in sorted(keywords, key=len, reverse=True):
            pattern = re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE)
            for match in pattern.finditer(lowered):
                entities.append(
                    EntityValue(
                        value=text[match.start() : match.end()],
                        entity_type=entity_type,
                        confidence=0.86,
                        evidence=self._window(text, match.start(), match.end()),
                    )
                )
        return self._dedupe(entities)

    def _snippets(self, text: str, values: Iterable[str]) -> list[str]:
        snippets = []
        lowered = text.lower()
        for value in values:
            index = lowered.find(value.lower())
            if index == -1:
                continue
            snippets.append(self._window(text, index, index + len(value)))
        return list(dict.fromkeys(snippets))[:8]

    def _window(self, text: str, start: int, end: int, radius: int = 72) -> str:
        left = max(start - radius, 0)
        right = min(end + radius, len(text))
        return " ".join(text[left:right].split())

    def _all_values(self, entities: ExtractedEntities) -> list[str]:
        values = []
        for value in entities.model_dump().values():
            values.extend(entity["value"] for entity in value)
        return values

    def _dedupe(self, entities: list[EntityValue]) -> list[EntityValue]:
        seen = set()
        deduped = []
        for entity in entities:
            key = (entity.entity_type, entity.value.lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(entity)
        return deduped

    def _credibility_for(
        self, source_type: SourceType
    ) -> str:
        if source_type.value.startswith("synthetic_"):
            return "synthetic"
        if source_type in {SourceType.public_advisory, SourceType.public_report}:
            return "high"
        if source_type == SourceType.public_indicator:
            return "medium"
        return "low"

    def _warnings_for(self, source_type: SourceType) -> list[str]:
        if source_type.value.startswith("synthetic_"):
            return [
                "Synthetic dark-web record: use for demonstration only, not attribution."
            ]
        return []
