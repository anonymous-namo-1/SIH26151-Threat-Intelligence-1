"""Passive analysis of infrastructure observations supplied by the caller."""

from __future__ import annotations
from collections import defaultdict
import json
from typing import Any

from .provenance import scalar_values, supporting_evidence

_KEY_ALIASES = {
    "domains": ("domain", "domains"),
    "ips": ("ip", "ips", "ip_address", "ip_addresses"),
    "certificates": ("certificate", "certificates"),
    "hosting": ("host", "hosting", "hosting_data"),
    "dns_records": ("dns", "dns_record", "dns_records"),
    "services": ("service", "services", "service_metadata"),
}


def _normalized(value: Any) -> str:
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).casefold()
    return str(value).strip().casefold()


def analyze_infrastructure(entities: list[dict], evidence: list[dict]) -> dict[str, Any]:
    owners: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    citations: dict[str, dict[str, set[str]]] = defaultdict(dict)
    timestamps: list[dict[str, str]] = []
    for entity in entities[:2000]:
        if not isinstance(entity, dict) or entity.get("id") is None:
            continue
        eid = str(entity["id"])
        metadata = entity.get("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}
        for time_key in ("observed_at", "first_seen", "last_seen", "timestamp"):
            value = metadata.get(time_key, entity.get(time_key))
            if isinstance(value, str):
                timestamps.append({"entity_id": eid, "kind": time_key, "timestamp": value})
        for key, aliases in _KEY_ALIASES.items():
            for metadata_key in aliases:
                raw = metadata.get(metadata_key, [])
                for value in raw if isinstance(raw, list) else [raw]:
                    if value:
                        normalized = _normalized(value)
                        owners[key][normalized].add(eid)
                        citations[f"{key}:{normalized}"][eid] = supporting_evidence(
                            eid, scalar_values(value), evidence)
        typ = str(entity.get("type", "")).upper()
        key = {"DOMAIN": "domains", "IP": "ips", "IP_ADDRESS": "ips",
               "CERTIFICATE": "certificates", "DNS_RECORD": "dns_records",
               "HOSTING": "hosting", "SERVICE": "services",
               "INFRASTRUCTURE": "services"}.get(typ)
        if key and entity.get("value"):
            normalized = _normalized(entity["value"])
            owners[key][normalized].add(eid)
            citations[f"{key}:{normalized}"][eid] = supporting_evidence(
                eid, {normalized}, evidence)
    reuse = []
    for kind, values in owners.items():
        for value, ids in values.items():
            endpoint_refs = citations[f"{kind}:{value}"]
            refs = set().union(*(endpoint_refs.get(eid, set()) for eid in ids))
            if len(ids) > 1 and all(endpoint_refs.get(eid) for eid in ids):
                reuse.append({"kind": kind, "value": value, "entity_ids": sorted(ids),
                              "evidence_ids": sorted(refs)})
    return {"reuse_paths": reuse[:200],
            "observed_counts": {key: len(values) for key, values in owners.items()},
            "timestamps": timestamps[:2000],
            "evidence_ids": sorted({x for item in reuse for x in item["evidence_ids"]}),
            "explanation": "Passive correlation of supplied infrastructure only; reuse does not establish common control."}