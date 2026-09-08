"""Explainable, non-identifying entity comparison."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .embeddings import CosineSimilarity, TokenHashEmbedding

_PGP_TYPES = {"PGP_KEY", "PGP_FINGERPRINT"}
_WALLET_TYPES = {
    "CRYPTO_WALLET", "BITCOIN_WALLET", "ETHEREUM_WALLET",
    "MONERO_WALLET", "SOLANA_WALLET",
}


def _values(entity: dict[str, Any], accepted_types: set[str]) -> set[str]:
    found: set[str] = set()
    if str(entity.get("type", "")).upper() in accepted_types and entity.get("value"):
        found.add(str(entity["value"]).strip().casefold())
    for key in ("indicators", "entities", "attributes"):
        items = entity.get(key, [])
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and str(item.get("type", "")).upper() in accepted_types:
                    if item.get("value"):
                        found.add(str(item["value"]).strip().casefold())
    metadata = entity.get("metadata")
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            key_upper = str(key).upper()
            if any(token in key_upper for token in accepted_types):
                values = value if isinstance(value, list) else [value]
                found.update(str(v).strip().casefold() for v in values if v)
    return found


def _text(entity: dict[str, Any]) -> str:
    chunks = []
    for key in ("text", "content", "description"):
        if isinstance(entity.get(key), str):
            chunks.append(entity[key])
    return "\n".join(chunks)[:50_000]


def _timestamp(entity: dict[str, Any]) -> datetime | None:
    for key in ("timestamp", "observed_at", "created_at", "first_seen"):
        value = entity.get(key)
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def _supporting_ids(left_id: str | None, right_id: str | None, evidence: list[dict]) -> list[str]:
    if not left_id or not right_id:
        return []
    result = []
    for item in evidence[:1000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        values = item.get("entity_ids", item.get("related_entity_ids", []))
        if isinstance(values, list) and {left_id, right_id}.issubset(
            {str(v.get("id") if isinstance(v, dict) else v) for v in values}
        ):
            result.append(str(item["id"]))
    return result[:50]


def compare_entities(left: dict, right: dict, evidence: list[dict]) -> dict:
    """Return a bounded factor breakdown, not a same-person determination."""
    if not isinstance(left, dict) or not isinstance(right, dict) or not isinstance(evidence, list):
        raise TypeError("left/right must be dictionaries and evidence must be a list")
    left_id = str(left["id"]) if left.get("id") is not None else None
    right_id = str(right["id"]) if right.get("id") is not None else None
    citations = _supporting_ids(left_id, right_id, evidence)
    factors: list[dict[str, Any]] = []

    def indicator_factor(name: str, accepted: set[str], weight: float) -> None:
        a, b = _values(left, accepted), _values(right, accepted)
        if not a or not b:
            factors.append({"name": name, "status": "unknown", "score": None, "weight": weight,
                            "reason": "Indicator is missing from one or both records", "evidence_ids": []})
        elif a & b:
            factors.append({"name": name, "status": "supports", "score": 1.0, "weight": weight,
                            "reason": "Exact normalized indicator overlap", "evidence_ids": citations})
        else:
            factors.append({"name": name, "status": "contradicts", "score": 0.0, "weight": weight,
                            "reason": "Supplied indicators differ; reuse or rotation remains possible",
                            "evidence_ids": citations})

    indicator_factor("pgp_overlap", _PGP_TYPES, 0.35)
    indicator_factor("wallet_overlap", _WALLET_TYPES, 0.25)

    left_text, right_text = _text(left), _text(right)
    if left_text and right_text:
        lexical = CosineSimilarity().similarity(
            TokenHashEmbedding().embed(left_text), TokenHashEmbedding().embed(right_text)
        )
        factors.append({
            "name": "text_lexical_similarity", "status": "observed", "score": round(lexical, 4),
            "weight": 0.2, "reason": "Deterministic token-hash lexical similarity (NOT semantic or proof of identity)",
            "evidence_ids": citations,
        })
    else:
        factors.append({"name": "text_lexical_similarity", "status": "unknown", "score": None,
                        "weight": 0.2, "reason": "Comparable text is missing", "evidence_ids": []})

    left_time, right_time = _timestamp(left), _timestamp(right)
    if left_time and right_time:
        hour_distance = abs(left_time.hour - right_time.hour)
        hour_distance = min(hour_distance, 24 - hour_distance)
        temporal = max(0.0, 1.0 - hour_distance / 12)
        factors.append({"name": "activity_time_similarity", "status": "observed",
                        "score": round(temporal, 4), "weight": 0.2,
                        "reason": "UTC hour-of-day proximity from one timestamp per record; limited reliability",
                        "evidence_ids": citations})
    else:
        factors.append({"name": "activity_time_similarity", "status": "unknown", "score": None,
                        "weight": 0.2, "reason": "Comparable timestamps are missing", "evidence_ids": []})

    weighted = sum(f["score"] * f["weight"] for f in factors if f["score"] is not None)
    score = round(max(0.0, min(1.0, weighted)), 4)
    contradictions = [f["name"] for f in factors if f["status"] == "contradicts"]
    unknown = [f["name"] for f in factors if f["status"] == "unknown"]
    return {
        "correlation_score": score,
        "factors": factors,
        "evidence_ids": citations,
        "contradictions": contradictions,
        "unknown_factors": unknown,
        "explanation": "Reviewable similarity hypothesis only; this score does not establish identity or wrongdoing.",
        "uncertainty": (
            "Missing factors remain unknown and contribute no score. Text and time resemblance can occur by chance."
        ),
        "model_version": "argus-rules-1.0",
        "attribution": "algorithm",
    }
