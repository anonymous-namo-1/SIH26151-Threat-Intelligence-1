"""Conservative, evidence-backed relationship drafting."""

from __future__ import annotations

from typing import Any

_STRONG_TYPES = {
    "EMAIL", "DOMAIN", "IP_ADDRESS", "ONION_SERVICE", "URL", "PGP_FINGERPRINT",
    "PGP_KEY", "FILE_HASH", "BITCOIN_WALLET", "ETHEREUM_WALLET",
    "MONERO_WALLET", "SOLANA_WALLET", "CRYPTO_WALLET",
}
_HUMAN_TYPES = {"PERSON", "PERSONA", "ACTOR", "ACTOR_HYPOTHESIS", "USERNAME", "ALIAS"}


def _entity_ids(item: dict[str, Any]) -> set[str]:
    values = item.get("entity_ids", item.get("related_entity_ids", item.get("entities", [])))
    if not isinstance(values, list):
        return set()
    return {str(v.get("id") if isinstance(v, dict) else v) for v in values}


def correlate(entities: list[dict], evidence: list[dict]) -> list[dict]:
    """Draft links only for duplicate strong indicators jointly cited by evidence.

    This never merges people/personas or creates identity claims. A draft means
    only that two records contain the same normalized indicator.
    """
    if not isinstance(entities, list) or not isinstance(evidence, list):
        raise TypeError("entities and evidence must be lists")
    valid_evidence = {
        str(item["id"]): item for item in evidence[:1000]
        if isinstance(item, dict) and item.get("id") is not None
    }
    drafts: list[dict] = []
    for index, left in enumerate(entities[:500]):
        if not isinstance(left, dict) or left.get("id") is None:
            continue
        left_type = str(left.get("type", "")).upper()
        left_value = str(left.get("value", "")).strip().casefold()
        if left_type not in _STRONG_TYPES or left_type in _HUMAN_TYPES or not left_value:
            continue
        for right in entities[index + 1 : 500]:
            if not isinstance(right, dict) or right.get("id") is None:
                continue
            right_type = str(right.get("type", "")).upper()
            if right_type != left_type or str(right.get("value", "")).strip().casefold() != left_value:
                continue
            left_id, right_id = str(left["id"]), str(right["id"])
            if left_id == right_id:
                continue
            citations = [
                evidence_id for evidence_id, item in valid_evidence.items()
                if {left_id, right_id}.issubset(_entity_ids(item))
            ]
            if not citations:
                continue
            drafts.append({
                "source_entity_id": left_id,
                "target_entity_id": right_id,
                "type": "SAME_INDICATOR_AS",
                "confidence": 0.92,
                "evidence_ids": citations[:20],
                "reason": (
                    f"Both records contain the same normalized {left_type} indicator and "
                    "supplied evidence references both records. This is not an identity claim."
                ),
                "attribution": "algorithm",
            })
            if len(drafts) >= 200:
                return drafts
    return drafts
