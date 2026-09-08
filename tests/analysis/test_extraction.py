from services.argus_analysis import extract_entities


def test_extracts_and_normalizes_public_indicators() -> None:
    text = (
        "Contact Analyst@Example.COM, visit https://EXAMPLE.com/path, IPs 192.0.2.4 "
        "and 2001:db8::1; onion "
        + ("a" * 56)
        + ".onion; ETH 0x52908400098527886E0F7030069857D2E4169EE7 "
        "PGP fingerprint 0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567 "
        "@review_handle"
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


def test_deduplicates_and_avoids_common_false_positives() -> None:
    result = extract_entities(
        "version 1.2.3, time 12:30, example.com example.com and "
        "0123456789abcdef0123456789abcdef01234567"
    )
    assert sum(item["type"] == "DOMAIN" for item in result) == 1
    assert not any(item["type"] == "IP_ADDRESS" for item in result)
    assert any(item["type"] == "FILE_HASH" for item in result)
    assert not any(item["type"] == "PGP_FINGERPRINT" for item in result)
