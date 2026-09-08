"""Deterministic extraction of public indicators from investigator-supplied text."""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

MAX_INPUT_CHARS = 100_000
MAX_RESULTS = 256


@dataclass(frozen=True)
class _Candidate:
    type: str
    value: str
    confidence: float
    reason: str
    start: int
    end: int


_URL = re.compile(r"(?i)\bhttps?://[^\s<>{}\"']+")
_EMAIL = re.compile(r"(?i)(?<![\w.+-])[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+")
_ONION = re.compile(r"(?i)\b(?:[a-z2-7]{16}|[a-z2-7]{56})\.onion\b")
_DOMAIN = re.compile(r"(?i)(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b")
_USERNAME = re.compile(r"(?<![\w@])@([A-Za-z0-9_][A-Za-z0-9_.-]{1,31})\b")
_PGP = re.compile(r"(?i)(?<![0-9a-f])(?:[0-9a-f]{4}[\s:-]?){9}[0-9a-f]{4}(?![0-9a-f])")
_HEX = re.compile(r"(?i)(?<![0-9a-f])(?:[0-9a-f]{128}|[0-9a-f]{64}|[0-9a-f]{40}|[0-9a-f]{32})(?![0-9a-f])")
_ETH = re.compile(r"(?i)(?<![0-9a-f])0x[0-9a-f]{40}(?![0-9a-f])")
_BTC = re.compile(r"(?i)\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b")
_MONERO = re.compile(r"\b[48][1-9A-HJ-NP-Za-km-z]{94}\b")
_SOLANA_CONTEXT = re.compile(
    r"(?i)\b(?:solana|sol(?:\s+wallet|\s+address))\s*[:=]?\s*([1-9A-HJ-NP-Za-km-z]{32,44})\b"
)
_IP_TOKEN = re.compile(r"(?<![\w])(?:\[[0-9A-Fa-f:.%]+\]|[0-9A-Fa-f:.%]{3,})(?![\w])")


def _overlaps(span: tuple[int, int], occupied: list[tuple[int, int]]) -> bool:
    return any(span[0] < end and start < span[1] for start, end in occupied)


def _normalize_url(value: str) -> str:
    value = value.rstrip(".,;:!?)]")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    if not host:
        return value
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError:
        pass
    if ":" in host:
        host = f"[{host}]"
    netloc = host
    if parsed.port:
        netloc += f":{parsed.port}"
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "", parsed.query, ""))


def extract_entities(text: str) -> list[dict]:
    """Return normalized candidates for human review.

    Confidence denotes extraction-pattern certainty, not reliability of the
    source and never the probability that a person committed wrongdoing.
    Input and output are bounded to avoid accidental resource exhaustion.
    """
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    text = text[:MAX_INPUT_CHARS]
    candidates: list[_Candidate] = []
    occupied: list[tuple[int, int]] = []

    def add(kind: str, value: str, confidence: float, reason: str, start: int, end: int) -> None:
        candidates.append(_Candidate(kind, value, confidence, reason, start, end))
        occupied.append((start, end))

    for match in _URL.finditer(text):
        normalized = _normalize_url(match.group())
        parsed = urlsplit(normalized)
        if parsed.hostname:
            add("URL", normalized, 0.99, "HTTP(S) URL syntax matched; content was not fetched", *match.span())

    for match in _EMAIL.finditer(text):
        local, domain = match.group().rsplit("@", 1)
        add("EMAIL", f"{local}@{domain.lower()}", 0.99, "Email address syntax matched", *match.span())

    for match in _ONION.finditer(text):
        add("ONION_SERVICE", match.group().lower(), 0.99, "Valid-length v2/v3 onion hostname syntax matched; service was not contacted", *match.span())

    for match in _PGP.finditer(text):
        nearby = text[max(0, match.start() - 24) : match.start()].casefold()
        if not re.search(r"[\s:-]", match.group()) and not any(
            label in nearby for label in ("pgp", "fingerprint")
        ):
            # A bare 40-hex value is normally a SHA-1 digest; PGP requires context.
            continue
        value = re.sub(r"[\s:-]", "", match.group()).upper()
        add("PGP_FINGERPRINT", value, 0.98, "40-hex OpenPGP fingerprint syntax matched", *match.span())

    wallet_patterns = [
        (_ETH, "ETHEREUM_WALLET", "Ethereum 0x address syntax matched"),
        (_BTC, "BITCOIN_WALLET", "Bitcoin Base58/Bech32 address syntax matched"),
        (_MONERO, "MONERO_WALLET", "Monero standard address syntax matched"),
    ]
    for pattern, kind, reason in wallet_patterns:
        for match in pattern.finditer(text):
            if not _overlaps(match.span(), occupied):
                add(kind, match.group(), 0.96, reason, *match.span())
    for match in _SOLANA_CONTEXT.finditer(text):
        start, end = match.span(1)
        add("SOLANA_WALLET", match.group(1), 0.88, "Base58 address appeared with explicit Solana context", start, end)

    for match in _HEX.finditer(text):
        if _overlaps(match.span(), occupied):
            continue
        length = len(match.group())
        algorithm = {32: "MD5", 40: "SHA-1", 64: "SHA-256", 128: "SHA-512"}[length]
        add("FILE_HASH", match.group().lower(), 0.93, f"{algorithm}-length hexadecimal digest syntax matched", *match.span())

    for match in _IP_TOKEN.finditer(text):
        raw = match.group().strip("[]").rstrip(".,;:")
        try:
            address = ipaddress.ip_address(raw.split("%", 1)[0])
        except ValueError:
            continue
        if not _overlaps(match.span(), occupied):
            add("IP_ADDRESS", address.compressed, 0.99, f"Valid IPv{address.version} address syntax matched", *match.span())

    for match in _DOMAIN.finditer(text):
        if not _overlaps(match.span(), occupied):
            value = match.group().lower().rstrip(".")
            add("DOMAIN", value, 0.95, "DNS hostname syntax matched; domain was not resolved", *match.span())

    for match in _USERNAME.finditer(text):
        if not _overlaps(match.span(), occupied):
            add("USERNAME", match.group(1), 0.78, "Explicit @handle syntax matched; platform and ownership are unknown", *match.span())

    deduplicated: dict[tuple[str, str], _Candidate] = {}
    for candidate in sorted(candidates, key=lambda c: (c.start, -c.confidence, c.type)):
        key = (candidate.type, candidate.value.casefold())
        deduplicated.setdefault(key, candidate)
        if len(deduplicated) >= MAX_RESULTS:
            break
    return [
        {"type": c.type, "value": c.value, "confidence": c.confidence, "reason": c.reason}
        for c in deduplicated.values()
    ]
