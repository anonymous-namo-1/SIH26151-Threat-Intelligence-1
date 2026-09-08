"""Type-aware canonicalization for indicator matching and deduplication."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlsplit, urlunsplit


def canonicalize_indicator(kind: str, value: str) -> str:
    """Return a comparison key without discarding meaningful identifier case."""
    kind = str(kind).strip().upper()
    value = str(value).strip()
    if kind == "DOMAIN":
        return value.rstrip(".").lower()
    if kind == "EMAIL":
        if "@" not in value:
            return value
        local, domain = value.rsplit("@", 1)
        return f"{local}@{domain.rstrip('.').lower()}"
    if kind == "URL":
        parsed = urlsplit(value)
        host = parsed.hostname
        if not host:
            return value
        normalized_host = host.lower()
        try:
            normalized_host = normalized_host.encode("idna").decode("ascii")
        except UnicodeError:
            pass
        if ":" in normalized_host:
            normalized_host = f"[{normalized_host}]"
        netloc = normalized_host
        try:
            if parsed.port is not None:
                netloc += f":{parsed.port}"
        except ValueError:
            return value
        return urlunsplit((
            parsed.scheme.lower(), netloc, parsed.path, parsed.query, parsed.fragment
        ))
    if kind == "IP_ADDRESS":
        try:
            return ipaddress.ip_address(value.split("%", 1)[0]).compressed
        except ValueError:
            return value
    if kind in {"PGP_KEY", "PGP_FINGERPRINT"}:
        return re.sub(r"[\s:-]", "", value).upper()
    if kind == "FILE_HASH":
        return value.lower()
    if kind == "ONION_SERVICE":
        return value.lower()
    # Wallets, URL paths, email local parts, usernames, and unknown identifiers
    # may be case-sensitive and are intentionally preserved.
    return value