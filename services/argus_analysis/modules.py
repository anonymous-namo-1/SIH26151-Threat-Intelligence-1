"""Uniform public dispatcher for pure, bounded analysis modules."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .blockchain import analyze_wallets
from .comparison import DEFAULT_WEIGHTS, MODEL_VERSION, compare_entities
from .infrastructure import analyze_infrastructure
from .provenance import scalar_values, supporting_evidence
from .stylometry import compare_corpora
from .temporal import analyze_activity

MODULE_NAMES = frozenset({"persona", "stylometry", "temporal", "wallet", "infrastructure",
                          "alias", "relationship", "reliability", "contradiction", "timeline"})


def _factor(name: str, status: str, score: float | None, reason: str,
            evidence_ids: list[str] | None = None, weight: float = 0) -> dict[str, Any]:
    return {"name": name, "status": status, "score": score, "weight": weight,
            "contribution": round((score or 0) * weight, 2), "reason": reason,
            "evidence_ids": (evidence_ids or [])[:50]}


def _ids(items: list[dict]) -> list[str]:
    return [str(x["id"]) for x in items[:2000] if isinstance(x, dict) and x.get("id") is not None]


def _find(entities: list[dict], identifier: Any) -> dict | None:
    target = str(identifier)
    return next((x for x in entities[:2000] if isinstance(x, dict) and str(x.get("id")) == target), None)


def _alias(entities: list[dict], evidence: list[dict]) -> dict:
    groups: dict[str, list[str]] = {}
    for entity in entities[:2000]:
        if not isinstance(entity, dict) or entity.get("id") is None:
            continue
        values = []
        if str(entity.get("type", "")).upper() in {"ALIAS", "USERNAME"}:
            values.append(entity.get("value"))
        raw = entity.get("aliases", [])
        values.extend(raw if isinstance(raw, list) else [raw])
        metadata = entity.get("metadata", {})
        if isinstance(metadata, dict):
            raw = metadata.get("aliases", [])
            values.extend(raw if isinstance(raw, list) else [raw])
        for value in values:
            if value:
                groups.setdefault(str(value).strip().casefold(), []).append(str(entity["id"]))
    overlaps = [{"normalized_alias": name, "entity_ids": sorted(set(ids))}
                for name, ids in groups.items() if len(set(ids)) > 1]
    return {"aliases": [{"normalized_alias": k, "entity_ids": sorted(set(v))} for k, v in groups.items()][:500],
            "overlaps": overlaps[:200],
            "explanation": "Exact normalized alias reuse; aliases are non-unique and do not establish identity."}


def _relationship(relationships: list[dict], evidence: list[dict]) -> dict:
    valid = set(_ids(evidence))
    rows = []
    for rel in relationships[:2000]:
        if not isinstance(rel, dict):
            continue
        raw = rel.get("evidence_ids", [])
        cited = [str(x) for x in raw if str(x) in valid] if isinstance(raw, list) else []
        rows.append({"id": rel.get("id"), "source_entity_id": rel.get("source_entity_id", rel.get("source_id")),
                     "target_entity_id": rel.get("target_entity_id", rel.get("target_id")),
                     "type": rel.get("type"), "evidence_ids": cited,
                     "cited": bool(cited)})
    return {"edges": rows, "cited_edge_count": sum(x["cited"] for x in rows),
            "uncited_edge_count": sum(not x["cited"] for x in rows),
            "explanation": "Inventory of supplied relationships; uncited edges require investigator review."}


def _reliability(evidence: list[dict]) -> dict:
    rows, scores = [], []
    for item in evidence[:2000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        signals = [bool(item.get("source") or item.get("source_url")),
                   bool(item.get("hash") or item.get("content_hash")),
                   bool(item.get("observed_at") or item.get("published_at")),
                   bool(item.get("content") or item.get("text"))]
        score = round(100 * sum(signals) / len(signals), 2)
        scores.append(score)
        rows.append({"evidence_id": str(item["id"]), "score": score,
                     "warnings": [name for ok, name in zip(signals,
                         ("missing source", "missing integrity hash", "missing observation time", "missing content")) if not ok]})
    return {"items": rows, "average_score": round(sum(scores) / len(scores), 2) if scores else None,
            "explanation": "Completeness heuristic only; it does not verify that evidence is true."}


def _contradictions(entities: list[dict], relationships: list[dict], evidence: list[dict]) -> dict:
    valid = set(_ids(evidence))
    findings: list[dict[str, Any]] = []
    entity_map = {str(item["id"]): item for item in entities[:2000]
                  if isinstance(item, dict) and item.get("id") is not None}
    positive_claims: dict[frozenset[str], list[dict]] = {}
    negative_claims: dict[frozenset[str], list[dict]] = {}
    identity_types = {"SAME_AS", "SAME_PERSON_AS", "SAME_IDENTITY_AS", "ALIAS_OF"}
    denial_types = {"NOT_SAME_AS", "DISTINCT_FROM", "DENIES_IDENTITY"}
    for rel in relationships[:2000]:
        if not isinstance(rel, dict):
            continue
        raw = rel.get("evidence_ids", [])
        cited = [str(x) for x in raw if str(x) in valid] if isinstance(raw, list) else []
        source = str(rel.get("source_entity_id", rel.get("source_id")))
        target = str(rel.get("target_entity_id", rel.get("target_id")))
        pair = frozenset((source, target))
        kind = str(rel.get("type", "")).upper()
        if cited and kind in identity_types:
            positive_claims.setdefault(pair, []).append(rel)
        if cited and kind in denial_types:
            negative_claims.setdefault(pair, []).append(rel)
    for pair in positive_claims.keys() & negative_claims.keys():
        refs = sorted({str(x) for rel in positive_claims[pair] + negative_claims[pair]
                       for x in rel.get("evidence_ids", []) if str(x) in valid})
        findings.append({"kind": "conflicting_identity_claims", "entity_ids": sorted(pair),
                         "relationship_ids": [x.get("id") for x in
                                              positive_claims[pair] + negative_claims[pair]],
                         "evidence_ids": refs,
                         "reason": "Cited relationships assert both identity equivalence and distinction."})
    exclusive = ("pgp_fingerprint", "account_id", "birth_date", "timezone")
    for pair, claims in positive_claims.items():
        if len(pair) != 2:
            continue
        left_id, right_id = sorted(pair)
        left, right = entity_map.get(left_id), entity_map.get(right_id)
        if not left or not right:
            continue
        left_meta = left.get("metadata", {}) if isinstance(left.get("metadata"), dict) else {}
        right_meta = right.get("metadata", {}) if isinstance(right.get("metadata"), dict) else {}
        for field in exclusive:
            a, b = left_meta.get(field), right_meta.get(field)
            if a is None or b is None or str(a).casefold() == str(b).casefold():
                continue
            left_refs = supporting_evidence(left_id, scalar_values(a), evidence)
            right_refs = supporting_evidence(right_id, scalar_values(b), evidence)
            if left_refs and right_refs:
                claim_refs = {str(ref) for claim in claims for ref in claim.get("evidence_ids", [])
                              if str(ref) in valid}
                findings.append({
                    "kind": "timezone_hypothesis_conflict" if field == "timezone" else "exclusive_metadata_conflict",
                    "field": field, "entity_ids": [left_id, right_id],
                    "values": {left_id: a, right_id: b},
                    "relationship_ids": [x.get("id") for x in claims],
                    "evidence_ids": sorted(left_refs | right_refs | claim_refs),
                    "reason": ("Different cited timezone observations weaken the identity hypothesis but "
                               "do not prove distinct identity." if field == "timezone" else
                               "Different cited values conflict with the supplied identity claim."),
                })
    transactions: list[tuple[str, dict]] = []
    for entity_id, entity in entity_map.items():
        metadata = entity.get("metadata", {}) if isinstance(entity.get("metadata"), dict) else {}
        raw = [metadata] if str(entity.get("type", "")).upper() == "CRYPTO_TRANSACTION" else metadata.get("transactions", [])
        for tx in raw[:1000] if isinstance(raw, list) else []:
            if isinstance(tx, dict) and tx.get("hash"):
                transactions.append((entity_id, tx))
    by_hash: dict[str, list[tuple[str, dict]]] = {}
    for owner, tx in transactions:
        by_hash.setdefault(str(tx["hash"]).casefold(), []).append((owner, tx))
    for tx_hash, rows in by_hash.items():
        for index, (left_id, left_tx) in enumerate(rows):
            for right_id, right_tx in rows[index + 1:]:
                differing = [field for field in ("from_address", "to_address", "amount", "asset")
                             if left_tx.get(field) is not None and right_tx.get(field) is not None
                             and str(left_tx[field]).casefold() != str(right_tx[field]).casefold()]
                left_hash_refs = supporting_evidence(left_id, {tx_hash}, evidence)
                right_hash_refs = supporting_evidence(right_id, {tx_hash}, evidence)
                left_value_refs = supporting_evidence(
                    left_id, {str(left_tx[field]) for field in differing}, evidence)
                right_value_refs = supporting_evidence(
                    right_id, {str(right_tx[field]) for field in differing}, evidence)
                left_refs = left_hash_refs | left_value_refs
                right_refs = right_hash_refs | right_value_refs
                if (differing and left_hash_refs and right_hash_refs
                        and left_value_refs and right_value_refs):
                    findings.append({"kind": "transaction_field_conflict", "transaction_hash": tx_hash,
                                     "fields": differing, "entity_ids": sorted({left_id, right_id}),
                                     "evidence_ids": sorted(left_refs | right_refs),
                                     "reason": "The same cited transaction hash has differing supplied fields."})
    return {"findings": findings,
            "explanation": "Cited conflicting claims or supplied values; no factual ruling is made."}


def _base(name: str, data: dict, factors: list[dict], confidence: float | None,
          evidence_ids: list[str], explanation: str, unknown: list[str] | None = None) -> dict:
    return {"module": name, "model_version": MODEL_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(), "explanation": explanation,
            "evidence_ids": sorted(set(evidence_ids))[:200], "confidence": confidence,
            "positive_evidence": [x for x in factors if x["contribution"] > 0],
            "negative_evidence": [x for x in factors if x["contribution"] < 0],
            "unknown_factors": unknown if unknown is not None else
                [x["name"] for x in factors if x["status"] == "unknown"],
            "data": data}


def run_module(name: str, entities: list[dict], evidence: list[dict],
               relationships: list[dict], options: dict) -> dict:
    """Run one named module. Inputs are caller-supplied; no network or database is used."""
    if name not in MODULE_NAMES:
        raise ValueError(f"unknown analysis module: {name}")
    if not all(isinstance(x, list) for x in (entities, evidence, relationships)) or not isinstance(options, dict):
        raise TypeError("entities, evidence, relationships must be lists and options must be a dict")
    factors: list[dict] = []
    confidence: float | None = None

    if name == "persona":
        left, right = _find(entities, options.get("left_id")), _find(entities, options.get("right_id"))
        if left is None or right is None:
            raise ValueError("persona requires valid options.left_id and options.right_id")
        compared = compare_entities(left, right, evidence, options.get("rules"))
        return _base(name, compared, compared["factors"], compared["confidence"],
                     compared["evidence_ids"], compared["explanation"], compared["unknown_factors"])
    if name == "stylometry":
        data = compare_corpora(options.get("corpus_left", []), options.get("corpus_right", []))
        score = data["similarity"]
        factors = [_factor("offline_surface_similarity", "observed" if score is not None else "unknown",
                           None if score is None else score / 100, data["explanation"], [], 20)]
        return _base(name, data, factors, score, [], data["explanation"],
                     ["independent_text_samples"] if score is None else [])
    if name in {"temporal", "timeline"}:
        data = analyze_activity(entities, evidence, options)
        factors = [_factor("real_activity_timestamps", "observed" if data["observation_count"] else "unknown",
                           1 if data["observation_count"] else None,
                           data["warning"] or "Supplied posting/transaction timestamps analyzed",
                           data["evidence_ids"], 0)]
        return _base(name, data, factors, None, data["evidence_ids"],
                     "Descriptive UTC timeline; collection timestamps are excluded.")
    if name == "wallet":
        data = analyze_wallets(entities, evidence,
                               str(options["entity_id"]) if options.get("entity_id") is not None else None)
        factors = [_factor("supplied_transactions", "observed" if data["transaction_count"] else "unknown",
                           1 if data["transaction_count"] else None, data["explanation"],
                           data["evidence_ids"], 0)]
        return _base(name, data, factors, None, data["evidence_ids"], data["explanation"])
    if name == "infrastructure":
        data = analyze_infrastructure(entities, evidence)
        refs = data["evidence_ids"]
        factors = [_factor("evidence_backed_reuse", "observed" if data["reuse_paths"] else "unknown",
                           1 if data["reuse_paths"] else None, data["explanation"], refs, 15)]
        confidence = min(100.0, 15.0 * len(data["reuse_paths"])) if data["reuse_paths"] else None
        return _base(name, data, factors, confidence, refs, data["explanation"])
    if name == "alias":
        data = _alias(entities, evidence)
    elif name == "relationship":
        data = _relationship(relationships, evidence)
    elif name == "reliability":
        data = _reliability(evidence)
        confidence = data["average_score"]
    else:
        data = _contradictions(entities, relationships, evidence)
        refs = sorted({ref for finding in data["findings"] for ref in finding["evidence_ids"]})
        observed = bool(data["findings"])
        factors = [_factor("contradiction_observations", "observed" if observed else "unknown",
                           1 if observed else None, data["explanation"], refs, 0)]
        return _base(name, data, factors, None, refs, data["explanation"])
    observed = bool(data.get("overlaps") or data.get("edges") or data.get("items") or data.get("findings"))
    factors = [_factor(f"{name}_observations", "observed" if observed else "unknown",
                       1 if observed else None, data["explanation"], [], 0)]
    return _base(name, data, factors, confidence, [], data["explanation"])


__all__ = ["run_module", "DEFAULT_WEIGHTS", "MODEL_VERSION", "MODULE_NAMES"]