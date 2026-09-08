"""Explainable, non-identifying persona comparison."""

from __future__ import annotations

from datetime import datetime, timezone
from difflib import SequenceMatcher
import json
import re
from typing import Any, Mapping

from .embeddings import CosineSimilarity, TokenHashEmbedding
from .provenance import related_ids, scalar_values, supporting_evidence

MODEL_VERSION = "argus-rules-2.0"
DEFAULT_WEIGHTS: dict[str, float] = {
    "username_similarity": 8, "shared_aliases": 8, "pgp_overlap": 35,
    "wallet_overlap": 20, "infrastructure_overlap": 15,
    "posting_patterns": 8, "language_patterns": 8, "activity_schedule": 8,
    "phrase_similarity": 10, "topic_similarity": 5, "behavioral_features": 5,
    "conflicting_timezone": -6,
}

_TYPES = {
    "pgp_overlap": {"PGP_KEY", "PGP_FINGERPRINT"},
    "wallet_overlap": {"CRYPTO_WALLET", "BITCOIN_WALLET", "ETHEREUM_WALLET",
                       "MONERO_WALLET", "SOLANA_WALLET"},
    "infrastructure_overlap": {"DOMAIN", "IP", "IP_ADDRESS", "CERTIFICATE"},
    "shared_aliases": {"ALIAS", "USERNAME"},
}
_WORDS = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)
_FUNCTION_WORDS = {"a", "an", "and", "at", "for", "from", "in", "is", "of", "on",
                   "or", "that", "the", "this", "to", "with"}


def _values(entity: dict[str, Any], accepted: set[str]) -> set[str]:
    found: set[str] = set()
    # Base58 and other wallet formats can carry meaningful case. Their exact
    # overlap must not inherit case-insensitive prose/alias comparison behavior.
    def normalize(value: Any) -> str:
        text = str(value).strip()
        return text if any("WALLET" in kind for kind in accepted) else text.casefold()
    if str(entity.get("type", "")).upper() in accepted and entity.get("value"):
        found.add(normalize(entity["value"]))
    if accepted & {"ALIAS", "USERNAME"}:
        aliases = entity.get("aliases", [])
        found.update(normalize(v) for v in
                     (aliases if isinstance(aliases, list) else [aliases]) if v)
    for key in ("indicators", "entities", "attributes"):
        for item in entity.get(key, []) if isinstance(entity.get(key), list) else []:
            if isinstance(item, dict) and str(item.get("type", "")).upper() in accepted and item.get("value"):
                found.add(normalize(item["value"]))
    metadata = entity.get("metadata")
    if isinstance(metadata, dict):
        for key, value in metadata.items():
            if any(token in str(key).upper() for token in accepted):
                values = value if isinstance(value, list) else [value]
                found.update(normalize(v) for v in values if v)
    return found


def _text(entity: dict[str, Any]) -> str:
    return "\n".join(entity[k] for k in ("text", "content", "description")
                     if isinstance(entity.get(k), str))[:50_000]


def _citations(left_id: str | None, right_id: str | None, evidence: list[dict]) -> list[str]:
    result: list[str] = []
    for item in evidence[:1000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        raw = item.get("entity_ids", item.get("related_entity_ids", []))
        ids = {str(v.get("id") if isinstance(v, dict) else v) for v in raw} if isinstance(raw, list) else set()
        if left_id and right_id and {left_id, right_id}.issubset(ids):
            result.append(str(item["id"]))
    return result[:50]


def _factor_citations(left_id: str | None, right_id: str | None, left_values: set[str],
                      right_values: set[str], evidence: list[dict], *, case_sensitive: bool = False) -> list[str]:
    if not left_id or not right_id:
        return []
    left_refs = supporting_evidence(left_id, left_values, evidence, case_sensitive=case_sensitive)
    right_refs = supporting_evidence(right_id, right_values, evidence, case_sensitive=case_sensitive)
    return sorted(left_refs | right_refs)[:50] if left_refs and right_refs else []


def _independent_text(entity_id: str | None, other_id: str | None, evidence: list[dict]) -> tuple[str, list[str]]:
    samples, refs = [], []
    if not entity_id:
        return "", []
    for item in evidence[:1000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        ids = related_ids(item)
        text = item.get("content", item.get("text"))
        if entity_id in ids and other_id not in ids and isinstance(text, str) and text.strip():
            samples.append(text[:20_000])
            refs.append(str(item["id"]))
    return "\n".join(samples)[:50_000], refs[:50]


def _phrase_score(left: str, right: str) -> float | None:
    """Jaccard overlap of word trigrams; distinct from token-frequency style features."""
    a_words = [x.casefold() for x in _WORDS.findall(left)]
    b_words = [x.casefold() for x in _WORDS.findall(right)]
    if len(a_words) < 3 or len(b_words) < 3:
        return None
    a = set(zip(a_words, a_words[1:], a_words[2:]))
    b = set(zip(b_words, b_words[1:], b_words[2:]))
    union = a | b
    return len(a & b) / len(union) if union else None


def _style_score(left: str, right: str) -> float | None:
    """Surface-style similarity from function words, punctuation, case, and word length."""
    a_words, b_words = _WORDS.findall(left), _WORDS.findall(right)
    if len(a_words) < 5 or len(b_words) < 5:
        return None
    components: list[float] = []
    for chars in (".,!?;:",):
        a_total = sum(left.count(char) for char in chars)
        b_total = sum(right.count(char) for char in chars)
        if a_total or b_total:
            distance = sum(abs(left.count(char) / max(1, a_total) -
                               right.count(char) / max(1, b_total)) for char in chars) / 2
            components.append(max(0.0, 1.0 - distance))
    a_low, b_low = [x.casefold() for x in a_words], [x.casefold() for x in b_words]
    a_function = sum(x in _FUNCTION_WORDS for x in a_low)
    b_function = sum(x in _FUNCTION_WORDS for x in b_low)
    components.append(1 - min(1.0, abs(a_function / len(a_low) - b_function / len(b_low))))
    components.append(1 - min(1.0, abs(sum(map(len, a_words)) / len(a_words) -
                                       sum(map(len, b_words)) / len(b_words)) / 10))
    components.append(1 - abs(sum(x[:1].isupper() for x in a_words) / len(a_words) -
                              sum(x[:1].isupper() for x in b_words) / len(b_words)))
    return sum(components) / len(components)


def _weights(rules: Mapping[str, Any] | None) -> dict[str, float]:
    result = dict(DEFAULT_WEIGHTS)
    if isinstance(rules, str):
        try:
            decoded = json.loads(rules)
        except json.JSONDecodeError as exc:
            raise ValueError("rules must be a JSON object") from exc
        if not isinstance(decoded, dict):
            raise TypeError("rules JSON must decode to an object")
        rules = decoded
    if rules is not None and not isinstance(rules, Mapping):
        raise TypeError("rules must be a weight mapping or JSON object string")
    if rules:
        for name, value in rules.items():
            if name in result and isinstance(value, (int, float)) and not isinstance(value, bool):
                result[name] = max(-50.0, min(50.0, float(value)))
    return result


def compare_entities(left: dict, right: dict, evidence: list[dict],
                     rules: Mapping[str, Any] | None = None) -> dict:
    """Return a bounded, inspectable hypothesis; never an identity assertion."""
    if not isinstance(left, dict) or not isinstance(right, dict) or not isinstance(evidence, list):
        raise TypeError("left/right must be dictionaries and evidence must be a list")
    weights = _weights(rules)
    left_id = str(left["id"]) if left.get("id") is not None else None
    right_id = str(right["id"]) if right.get("id") is not None else None
    factors: list[dict[str, Any]] = []

    def add(name: str, status: str, score: float | None, reason: str,
            cited: list[str] | None = None) -> None:
        # A claimed observation without a source is deliberately unknown.
        if score is None:
            status = "unknown"
        elif not cited:
            status, score, reason = ("unknown", None,
                                     reason + "; no value-specific evidence supports both records")
        contribution = 0.0 if score is None else round(weights[name] * score, 2)
        factors.append({"name": name, "status": status, "score": score,
                        "weight": weights[name], "contribution": contribution,
                        "reason": reason, "evidence_ids": cited or []})

    for name, accepted in _TYPES.items():
        a, b = _values(left, accepted), _values(right, accepted)
        if not a or not b:
            add(name, "unknown", None, "Indicator missing from one or both records")
        elif a & b:
            refs = _factor_citations(left_id, right_id, a & b, a & b, evidence,
                                    case_sensitive=name == "wallet_overlap")
            add(name, "supports", 1.0, "Exact normalized supplied indicator overlap", refs)
        else:
            refs = _factor_citations(left_id, right_id, a, b, evidence,
                                    case_sensitive=name == "wallet_overlap")
            add(name, "contradicts", -0.35, "Supplied indicators differ; rotation or reuse remains possible", refs)

    usernames = ({str(left.get("username", left.get("value", ""))).casefold()} -
                 {""})
    other = ({str(right.get("username", right.get("value", ""))).casefold()} - {""})
    if usernames and other:
        similarity = SequenceMatcher(None, next(iter(usernames)), next(iter(other))).ratio()
        refs = _factor_citations(left_id, right_id, usernames, other, evidence)
        add("username_similarity", "supports" if similarity >= .75 else "observed",
            round(similarity, 4), "Character-sequence similarity of supplied usernames", refs)
    else:
        add("username_similarity", "unknown", None, "Comparable usernames are missing")

    lt, rt = _text(left), _text(right)
    descriptive = (CosineSimilarity().similarity(TokenHashEmbedding().embed(lt), TokenHashEmbedding().embed(rt))
                   if lt and rt and lt.strip() != rt.strip() else None)
    independent_left, left_text_refs = _independent_text(left_id, right_id, evidence)
    independent_right, right_text_refs = _independent_text(right_id, left_id, evidence)
    style = _style_score(independent_left, independent_right)
    phrase = _phrase_score(independent_left, independent_right)
    text_reason = "Deterministic token-hash lexical similarity (NOT semantic or proof of identity)"
    # Legacy descriptive field remains numeric when entity text exists, but carries no points or observation claim.
    factors.append({"name": "text_lexical_similarity", "status": "unknown",
                    "score": round(descriptive, 4) if descriptive is not None else None,
                    "weight": 0.0, "contribution": 0.0,
                    "reason": text_reason + "; entity text lacks independent factor provenance",
                    "evidence_ids": []})
    refs = sorted(set(left_text_refs + right_text_refs))
    add("language_patterns", "observed", round(style, 4) if style is not None else None,
        ("Function-word, punctuation, capitalization, and word-length pattern similarity; "
         "surface features only, not a semantic or identity model") if style is not None else
        "Independent text observations with at least five comparable words per side are missing", refs)
    add("phrase_similarity", "observed", round(phrase, 4) if phrase is not None else None,
        ("Word-trigram overlap from the same independent samples; distinct metric but statistically "
         "dependent on the language-pattern factor, so review together") if phrase is not None else
        "Independent text observations with at least three comparable words per side are missing", refs)
    for name, reason in (
        ("posting_patterns", "Multiple independently sourced posting timestamps are required"),
        ("activity_schedule", "Multiple independently sourced activity timestamps are required"),
        ("topic_similarity", "No semantic topic model is used by this offline engine"),
        ("behavioral_features", "No independently evidenced behavioral features were supplied"),
    ):
        add(name, "unknown", None, reason)
    left_metadata = left.get("metadata", {}) if isinstance(left.get("metadata"), dict) else {}
    right_metadata = right.get("metadata", {}) if isinstance(right.get("metadata"), dict) else {}
    left_timezone, right_timezone = left_metadata.get("timezone"), right_metadata.get("timezone")
    if left_timezone is None or right_timezone is None:
        add("conflicting_timezone", "unknown", None,
            "No independently evidenced timezone observations were supplied")
    else:
        timezone_refs = _factor_citations(
            left_id, right_id, {str(left_timezone)}, {str(right_timezone)}, evidence)
        if str(left_timezone).casefold() != str(right_timezone).casefold():
            add("conflicting_timezone", "contradicts", 1.0,
                "Different cited timezone observations weaken the hypothesis but do not prove distinct identity",
                timezone_refs)
        else:
            add("conflicting_timezone", "observed", 0.0,
                "Supplied cited timezone observations agree; this contributes no points",
                timezone_refs)

    points = sum(float(f["contribution"]) for f in factors)
    confidence = round(max(0.0, min(100.0, points)), 2)
    unknown = [f["name"] for f in factors if f["status"] == "unknown"]
    contradictions = [f["name"] for f in factors if f["status"] == "contradicts"]
    return {
        "correlation_score": confidence / 100,
        "confidence": confidence,
        "factors": factors,
        "positive_evidence": [f for f in factors if f["contribution"] > 0],
        "negative_evidence": [f for f in factors if f["contribution"] < 0],
        "evidence_ids": sorted({i for f in factors for i in f["evidence_ids"]}),
        "contradictions": contradictions, "unknown_factors": unknown,
        "explanation": "Reviewable similarity hypothesis only; confidence is a heuristic, not identity probability.",
        "uncertainty": "Missing factors contribute no score; resemblance and indicator reuse can occur by chance.",
        "model_version": MODEL_VERSION, "generated_at": datetime.now(timezone.utc).isoformat(),
        "attribution": "algorithm",
    }