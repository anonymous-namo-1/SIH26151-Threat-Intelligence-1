from services.argus_analysis import correlate


def test_requires_joint_evidence_for_strong_indicator() -> None:
    entities = [
        {"id": "a", "type": "DOMAIN", "value": "Example.COM"},
        {"id": "b", "type": "DOMAIN", "value": "example.com"},
    ]
    assert correlate(entities, []) == []
    drafts = correlate(entities, [{"id": "ev-1", "entity_ids": ["a", "b"]}])
    assert len(drafts) == 1
    assert drafts[0]["type"] == "SAME_INDICATOR_AS"
    assert drafts[0]["evidence_ids"] == ["ev-1"]
    assert drafts[0]["attribution"] == "algorithm"


def test_never_correlates_humans_or_alias_only_values() -> None:
    evidence = [{"id": "ev", "entity_ids": ["a", "b"]}]
    for kind in ("PERSONA", "USERNAME", "ALIAS"):
        entities = [
            {"id": "a", "type": kind, "value": "same"},
            {"id": "b", "type": kind, "value": "same"},
        ]
        assert correlate(entities, evidence) == []
