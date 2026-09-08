from services.argus_analysis import compare_entities


def test_comparison_is_bounded_and_missing_factors_are_unknown() -> None:
    result = compare_entities(
        {"id": "a", "type": "PERSONA", "text": "alpha beta alpha"},
        {"id": "b", "type": "PERSONA", "text": "alpha beta"},
        [{"id": "ev", "entity_ids": ["a", "b"]}],
    )
    assert 0 <= result["correlation_score"] <= 1
    assert "pgp_overlap" in result["unknown_factors"]
    assert "wallet_overlap" in result["unknown_factors"]
    text_factor = next(f for f in result["factors"] if f["name"] == "text_lexical_similarity")
    assert 0 <= text_factor["score"] <= 1
    assert "NOT semantic" in text_factor["reason"]
