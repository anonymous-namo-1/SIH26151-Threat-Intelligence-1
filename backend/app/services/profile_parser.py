import re
from datetime import UTC, datetime

from backend.app.models.schemas import ProfileParseRequest, ProfileParseResponse


FIELD_PATTERNS = {
    "username": re.compile(
        r"(?:username|user|handle)[:\s]+[\"']?([A-Za-z0-9_.-]{3,64})[\"']?",
        re.IGNORECASE,
    ),
    "joined_date": re.compile(
        r"(?:joined|member since|registered)[:\s]+"
        r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        re.IGNORECASE,
    ),
    "reputation": re.compile(
        r"(?:reputation|rep|trust score)[:\s]+(\d+(?:\.\d+)?%?)",
        re.IGNORECASE,
    ),
    "sales_count": re.compile(
        r"(?:sales|deals completed)[:\s]+(\d+)",
        re.IGNORECASE,
    ),
    "posts_count": re.compile(
        r"(?:posts|post count)[:\s]+(\d+)",
        re.IGNORECASE,
    ),
    "last_active": re.compile(
        r"(?:last active|last seen|last login)[:\s]+"
        r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        re.IGNORECASE,
    ),
}

ALIAS_PATTERN = re.compile(
    r"(?:alias|a\.?k\.?a\.?|known as)[:\s]+[\"']?([A-Za-z0-9_.-]{3,64})[\"']?",
    re.IGNORECASE,
)
CONTACT_HANDLE_PATTERN = re.compile(
    r"(?:contact|telegram|signal|jabber)\s*:\s*"
    r"(?:(?:telegram|signal|jabber)\s*:\s*)?"
    r"[\"']?([A-Za-z0-9_@.-]{3,80})[\"']?",
    re.IGNORECASE,
)
PGP_PATTERN = re.compile(r"\b(?:PGP|GPG)[:\s]+([A-Fa-f0-9]{8,40})\b")
WALLET_PATTERN = re.compile(
    r"\b(?:BTC|ETH|wallet)[:\s]+"
    r"(bc1[a-zA-Z0-9]{8,90}|0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b",
    re.IGNORECASE,
)
PROFILE_URL_PATTERN = re.compile(
    r"\b(?:profile url|source|url)[:\s]+(https?://\S+)",
    re.IGNORECASE,
)


class ProfileParserService:
    """Parses pasted synthetic or public profile text without network access."""

    def parse(self, request: ProfileParseRequest) -> ProfileParseResponse:
        text = request.text
        single_value_fields = {
            field: self._first_match(pattern, text)
            for field, pattern in FIELD_PATTERNS.items()
        }

        return ProfileParseResponse(
            platform=request.platform,
            source_type=request.source_type,
            extracted_at=datetime.now(UTC),
            username=single_value_fields["username"],
            aliases=self._unique(ALIAS_PATTERN.findall(text)),
            joined_date=single_value_fields["joined_date"],
            reputation=single_value_fields["reputation"],
            sales_count=self._optional_int(single_value_fields["sales_count"]),
            posts_count=self._optional_int(single_value_fields["posts_count"]),
            last_active=single_value_fields["last_active"],
            pgp_keys=self._unique(match.upper() for match in PGP_PATTERN.findall(text)),
            wallets=self._unique(WALLET_PATTERN.findall(text)),
            profile_urls=self._unique(
                url.rstrip(".,)") for url in PROFILE_URL_PATTERN.findall(text)
            ),
            contact_handles=self._unique(CONTACT_HANDLE_PATTERN.findall(text)),
            metadata=request.metadata,
            warnings=[
                "Profile parser only processes supplied text; it does not scrape websites or use network access."
            ],
        )

    def _first_match(self, pattern: re.Pattern[str], text: str) -> str | None:
        match = pattern.search(text)
        return match.group(1) if match else None

    def _optional_int(self, value: str | None) -> int | None:
        if value is None:
            return None
        return int(value)

    def _unique(self, values) -> list[str]:
        seen = set()
        unique_values = []
        for value in values:
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            unique_values.append(value)
        return unique_values

