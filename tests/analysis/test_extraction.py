from services.argus_analysis import extract_entities
from services.argus_analysis.normalization import canonicalize_indicator


def test_extracts_and_normalizes_public_indicators() -> None:
    text = (
        "Contact Analyst@Example.COM, visit https://EXAMPLE.com/path, IPs 192.0.2.4 "
        "and 2001:db8::1; onion "
        + ("a" * 56)
        + ".onion; ETH 0x52908400098527886E0F7030069857D2E4169EE7 "
        "PGP fingerprint 0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567 "
        "@review_handle observed on 2025-01-17"
    )
    result = extract_entities(text)
    pairs = {(item["type"], item["value"]) for item in result}
    assert ("EMAIL", "Analyst@example.com") in pairs
    assert ("URL", "https://example.com/path") in pairs
    assert ("IP_ADDRESS", "192.0.2.4") in pairs
    assert ("IP_ADDRESS", "2001:db8::1") in pairs
    assert any(kind == "ETHEREUM_WALLET" for kind, _ in pairs)
    assert any(kind == "PGP_FINGERPRINT" for kind, _ in pairs)
    assert ("USERNAME", "review_handle") in pairs
    assert ("DATE", "2025-01-17") in pairs


def test_deduplicates_and_avoids_common_false_positives() -> None:
    result = extract_entities(
        "version 1.2.3, time 12:30, example.com example.com and "
        "0123456789abcdef0123456789abcdef01234567"
    )
    assert sum(item["type"] == "DOMAIN" for item in result) == 1
    assert not any(item["type"] == "IP_ADDRESS" for item in result)
    assert any(item["type"] == "FILE_HASH" for item in result)
    assert not any(item["type"] == "PGP_FINGERPRINT" for item in result)


def test_case_sensitive_identifiers_and_url_paths_are_not_merged() -> None:
    result = extract_entities(
        "https://Example.com/Path https://example.com/path "
        "CaseSensitive@Example.com casesensitive@example.com "
        "0x52908400098527886E0F7030069857D2E4169EE7 "
        "0x52908400098527886e0f7030069857d2e4169ee7"
    )
    pairs = {(item["type"], item["value"]) for item in result}
    assert ("URL", "https://example.com/Path") in pairs
    assert ("URL", "https://example.com/path") in pairs
    assert ("EMAIL", "CaseSensitive@example.com") in pairs
    assert ("EMAIL", "casesensitive@example.com") in pairs
    assert len([item for item in result if item["type"] == "ETHEREUM_WALLET"]) == 2
    assert canonicalize_indicator("DOMAIN", "Example.COM.") == "example.com"
    assert canonicalize_indicator("URL", "HTTPS://EXAMPLE.COM/Path") != canonicalize_indicator(
        "URL", "https://example.com/path"
    )
