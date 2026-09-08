import json

import pytest

from services.argus_analysis.blockchain import MockBlockchainProvider
from services.argus_analysis.comparison import compare_entities
from services.argus_analysis.modules import MODULE_NAMES, run_module


def test_every_module_has_uniform_json_shape() -> None:
    entities = [
        {"id": "a", "type": "PERSONA", "username": "northstar", "text": "One short sentence."},
        {"id": "b", "type": "PERSONA", "username": "north-star", "text": "Another short phrase!"},
    ]
    evidence = [{"id": "ev-1", "entity_ids": ["a", "b"], "source": "public archive",
                 "content_hash": "abc", "observed_at": "2025-01-01T01:00:00Z", "text": "record",
                 "posted_at": "2024-12-31T23:00:00Z"}]
    options = {"left_id": "a", "right_id": "b", "corpus_left": ["A short sample."],
               "corpus_right": ["A different sample."], "entity_id": "a"}
    required = {"module", "model_version", "generated_at", "explanation", "evidence_ids",
                "confidence", "positive_evidence", "negative_evidence", "unknown_factors", "data"}
    for name in MODULE_NAMES:
        result = run_module(name, entities, evidence, [], options)
        assert set(result) == required
        assert result["confidence"] is None or 0 <= result["confidence"] <= 100
        json.dumps(result)


def test_wallet_comparison_preserves_case_and_requires_exact_evidence():
    left = {"id": "a", "type": "CRYPTO_WALLET", "value": "AbCWallet"}
    right = {"id": "b", "type": "CRYPTO_WALLET", "value": "abcWallet"}
    evidence = [{"id": "ea", "entity_ids": ["a"], "content": "AbCWallet observed."},
                {"id": "eb", "entity_ids": ["b"], "content": "abcWallet observed."}]
    compared = compare_entities(left, right, evidence)
    wallet = next(f for f in compared["factors"] if f["name"] == "wallet_overlap")
    assert wallet["status"] != "supports" and wallet["contribution"] <= 0
    right["value"] = "AbCWallet"
    compared = compare_entities(left, right, evidence)
    wallet = next(f for f in compared["factors"] if f["name"] == "wallet_overlap")
    assert wallet["status"] == "unknown"


def test_persona_observations_need_joint_citation_and_weights_are_bounded() -> None:
    left = {"id": "a", "type": "PGP_FINGERPRINT", "value": "ABC"}
    right = {"id": "b", "type": "PGP_FINGERPRINT", "value": "abc"}
    uncited = compare_entities(left, right, [], {"pgp_overlap": 500})
    pgp = next(x for x in uncited["factors"] if x["name"] == "pgp_overlap")
    assert pgp["status"] == "unknown"
    assert pgp["weight"] == 50
    cited = compare_entities(left, right, [{"id": "ev", "entity_ids": ["a", "b"],
                                            "content": "Fingerprint ABC observed."}])
    pgp = next(x for x in cited["factors"] if x["name"] == "pgp_overlap")
    assert pgp["status"] == "supports"
    assert pgp["evidence_ids"] == ["ev"]


def test_temporal_ignores_collection_time_and_wallet_does_not_invent_balance() -> None:
    evidence = [{"id": "collection", "entity_ids": ["a"], "collected_at": "2025-01-01T00:00:00Z"}]
    temporal = run_module("temporal", [{"id": "a"}], evidence, [], {"entity_id": "a"})
    assert temporal["data"]["observation_count"] == 0
    entity = {"id": "w", "metadata": {"transactions": [{
        "hash": "fictional-hash", "from_address": "safe-a", "to_address": "safe-b",
        "amount": 2, "asset": "TEST", "timestamp": "2025-01-01T00:00:00Z", "labels": ["fixture"]
    }]}}
    wallet = run_module("wallet", [entity], [], [], {})
    assert wallet["data"]["totals_by_asset"] == {"TEST": "2"}
    assert wallet["data"]["balances"] is None


def test_mock_blockchain_requires_explicit_fictional_mode() -> None:
    with pytest.raises(ValueError):
        MockBlockchainProvider({})
    provider = MockBlockchainProvider({"safe-wallet": [{"hash": "fixture"}]}, fictional=True)
    assert provider.transactions("safe-wallet")[0]["fixture_label"] == "fictional"


def test_top_level_aliases_and_direct_transaction_metadata() -> None:
    aliases = run_module("alias", [
        {"id": "a", "type": "PERSONA", "aliases": ["SharedHandle"]},
        {"id": "b", "type": "PERSONA", "aliases": ["sharedhandle"]},
    ], [], [], {})
    assert aliases["data"]["overlaps"][0]["entity_ids"] == ["a", "b"]

    transaction = {"id": "tx-1", "type": "CRYPTO_TRANSACTION", "metadata": {
        "hash": "hash-1", "from_address": "wallet-a", "to_address": "wallet-b",
        "amount": "0.100000000000000001", "asset": "TEST",
        "timestamp": "2025-02-03T04:00:00Z", "labels": ["fixture"],
    }}
    evidence = [{"id": "ev-tx", "entity_ids": ["tx-1"]}]
    wallet = run_module("wallet", [transaction], evidence, [], {})
    assert wallet["data"]["totals_by_asset"]["TEST"] == "0.100000000000000001"
    assert wallet["data"]["counterparty_graph"]["edges"][0]["evidence_ids"] == ["ev-tx"]
    temporal = run_module("temporal", [transaction], evidence, [], {"entity_id": "tx-1"})
    assert temporal["data"]["observation_count"] == 1
    assert temporal["evidence_ids"] == ["ev-tx"]


def test_unrelated_comention_does_not_prove_indicator_or_infrastructure_reuse() -> None:
    left = {"id": "a", "type": "PGP_KEY", "value": "FINGERPRINT-ONE"}
    right = {"id": "b", "type": "PGP_KEY", "value": "FINGERPRINT-ONE"}
    result = compare_entities(left, right, [
        {"id": "unrelated", "entity_ids": ["a", "b"], "content": "These records were reviewed."}
    ])
    assert next(x for x in result["factors"] if x["name"] == "pgp_overlap")["status"] == "unknown"

    entities = [{"id": "a", "type": "DOMAIN", "value": "shared.example"},
                {"id": "b", "type": "DOMAIN", "value": "shared.example"}]
    one_sided = [{"id": "ev-a", "entity_ids": ["a"], "content": "shared.example"}]
    assert run_module("infrastructure", entities, one_sided, [], {})["data"]["reuse_paths"] == []
    both = one_sided + [{"id": "ev-b", "entity_ids": ["b"], "content": "shared.example"}]
    assert run_module("infrastructure", entities, both, [], {})["data"]["reuse_paths"][0]["evidence_ids"] == [
        "ev-a", "ev-b"]


def test_independent_text_uses_distinct_style_and_phrase_metrics() -> None:
    entities = [{"id": "a", "type": "PERSONA", "text": "shared words"},
                {"id": "b", "type": "PERSONA", "text": "shared words again"}]
    evidence = [
        {"id": "a-text", "entity_ids": ["a"],
         "content": "A small independent writing sample repeats the blue phrase clearly."},
        {"id": "b-text", "entity_ids": ["b"],
         "content": "Another independent writing sample repeats the blue phrase clearly!"},
    ]
    result = compare_entities(entities[0], entities[1], evidence)
    language = next(x for x in result["factors"] if x["name"] == "language_patterns")
    phrase = next(x for x in result["factors"] if x["name"] == "phrase_similarity")
    assert language["contribution"] > 0
    assert phrase["status"] == "observed"
    assert phrase["contribution"] > 0
    assert phrase["score"] != language["score"]
    assert "dependent" in phrase["reason"]


def test_phrase_and_style_unknown_without_independent_corpora() -> None:
    result = compare_entities(
        {"id": "a", "text": "same shared text"}, {"id": "b", "text": "same shared text"},
        [{"id": "joint", "entity_ids": ["a", "b"], "content": "a joint quotation"}],
    )
    factors = {item["name"]: item for item in result["factors"]}
    assert factors["language_patterns"]["status"] == "unknown"
    assert factors["phrase_similarity"]["status"] == "unknown"


def test_stylometry_unicode_and_no_token_handling() -> None:
    unicode_result = run_module(
        "stylometry", [], [], [], {"corpus_left": ["Привет мир. Это текст."],
                                   "corpus_right": ["Привет мир! Другой текст."]})
    assert unicode_result["data"]["features"]["left"]["words"] > 0
    assert unicode_result["data"]["similarity"] is not None
    unsupported = run_module(
        "stylometry", [], [], [], {"corpus_left": ["😀 🔒"], "corpus_right": ["🌍 ✨"]})
    assert unsupported["confidence"] is None
    assert unsupported["data"]["similarity"] is None
    assert unsupported["unknown_factors"] == ["independent_text_samples"]


def test_temporal_bins_are_utc_and_wallet_selection_is_exact_decimal() -> None:
    entities = [
        {"id": "wallet-a", "type": "CRYPTO_WALLET", "value": "address-a"},
        {"id": "wallet-b", "type": "CRYPTO_WALLET", "value": "address-b"},
        {"id": "tx-a", "type": "CRYPTO_TRANSACTION", "metadata": {
            "hash": "ha", "from_address": "address-a", "to_address": "elsewhere",
            "amount": "123456789012345678901234567890.123456789012345678",
            "asset": "TEST", "timestamp": "2025-01-01T01:00:00+02:00", "labels": []}},
        {"id": "tx-b", "type": "CRYPTO_TRANSACTION", "metadata": {
            "hash": "hb", "from_address": "address-b", "to_address": "elsewhere",
            "amount": "2", "asset": "TEST", "timestamp": "2025-01-01T02:00:00Z", "labels": []}},
    ]
    wallet = run_module("wallet", entities, [], [], {"entity_id": "wallet-a"})
    assert wallet["data"]["transaction_count"] == 1
    assert wallet["data"]["totals_by_asset"]["TEST"] == (
        "123456789012345678901234567890.123456789012345678")
    temporal = run_module("temporal", [entities[2]], [], [], {"entity_id": "tx-a"})
    assert temporal["data"]["posting_hour_distribution"][23] == 1
    assert temporal["data"]["first_seen"].endswith("+00:00")


def test_contradictions_derive_from_cited_supported_claims() -> None:
    entities = [
        {"id": "a", "metadata": {"timezone": "UTC"}},
        {"id": "b", "metadata": {"timezone": "UTC+09:00"}},
    ]
    relationships = [{"id": "same", "source_id": "a", "target_id": "b",
                      "type": "SAME_AS", "evidence_ids": ["claim"]}]
    evidence = [
        {"id": "claim", "entity_ids": ["a", "b"], "content": "same identity claim"},
        {"id": "tz-a", "entity_ids": ["a"], "content": "timezone UTC"},
        {"id": "tz-b", "entity_ids": ["b"], "content": "timezone UTC+09:00"},
    ]
    findings = run_module("contradiction", entities, evidence, relationships, {})["data"]["findings"]
    assert findings[0]["kind"] == "timezone_hypothesis_conflict"
    assert "do not prove" in findings[0]["reason"]


def test_transaction_and_identity_claim_conflicts_are_cited() -> None:
    entities = [
        {"id": "tx-a", "type": "CRYPTO_TRANSACTION", "metadata": {
            "hash": "same-hash", "from_address": "a", "to_address": "b",
            "amount": "1", "asset": "TEST"}},
        {"id": "tx-b", "type": "CRYPTO_TRANSACTION", "metadata": {
            "hash": "same-hash", "from_address": "a", "to_address": "b",
            "amount": "2", "asset": "TEST"}},
    ]
    evidence = [
        {"id": "ev-a", "entity_ids": ["tx-a"], "content": "same-hash amount 1"},
        {"id": "ev-b", "entity_ids": ["tx-b"], "content": "same-hash amount 2"},
        {"id": "same-ev", "entity_ids": ["tx-a", "tx-b"], "content": "same identity"},
        {"id": "different-ev", "entity_ids": ["tx-a", "tx-b"], "content": "distinct identities"},
    ]
    relationships = [
        {"id": "same", "source_id": "tx-a", "target_id": "tx-b", "type": "SAME_AS",
         "evidence_ids": ["same-ev"]},
        {"id": "different", "source_id": "tx-a", "target_id": "tx-b", "type": "DISTINCT_FROM",
         "evidence_ids": ["different-ev"]},
    ]
    result = run_module("contradiction", entities, evidence, relationships, {})
    kinds = {finding["kind"] for finding in result["data"]["findings"]}
    assert kinds == {"conflicting_identity_claims", "transaction_field_conflict"}
    assert set(result["evidence_ids"]) == {"different-ev", "ev-a", "ev-b", "same-ev"}