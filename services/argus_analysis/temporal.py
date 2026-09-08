"""Posting and transaction time analysis using supplied observation times."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

_POSTING_KEYS = ("posted_at", "published_at", "transaction_timestamp", "timestamp")


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        aware = result if result.tzinfo else result.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc)
    except ValueError:
        return None


def analyze_activity(entities: list[dict], evidence: list[dict], options: dict) -> dict:
    start, end = parse_time(options.get("start")), parse_time(options.get("end"))
    entity_id = str(options["entity_id"]) if options.get("entity_id") is not None else None
    observations: list[tuple[datetime, str, str | None]] = []
    evidence_by_entity: dict[str, list[str]] = {}
    for item in evidence[:5000]:
        if not isinstance(item, dict) or item.get("id") is None:
            continue
        related_ids = item.get("entity_ids", item.get("related_entity_ids", []))
        for related in related_ids if isinstance(related_ids, list) else []:
            key = str(related.get("id") if isinstance(related, dict) else related)
            evidence_by_entity.setdefault(key, []).append(str(item["id"]))
    for item in (entities + evidence)[:5000]:
        if not isinstance(item, dict):
            continue
        ids = item.get("entity_ids", item.get("related_entity_ids", []))
        ids = [str(x.get("id") if isinstance(x, dict) else x) for x in ids] if isinstance(ids, list) else []
        if entity_id and str(item.get("id")) != entity_id and entity_id not in ids:
            continue
        # created_at/collected_at are intentionally excluded.
        metadata = item.get("metadata", {})
        metadata = metadata if isinstance(metadata, dict) else {}
        dt = next((parse_time(item.get(k) or metadata.get(k))
                   for k in _POSTING_KEYS if parse_time(item.get(k) or metadata.get(k))), None)
        if not dt or (start and dt < start) or (end and dt > end):
            continue
        evidence_id = str(item["id"]) if item in evidence and item.get("id") is not None else ""
        if not evidence_id and item.get("id") is not None:
            linked = evidence_by_entity.get(str(item["id"]), [])
            evidence_id = linked[0] if linked else ""
        platform = item.get("platform", item.get("source_platform"))
        observations.append((dt, evidence_id, str(platform) if platform else None))
    observations.sort()
    hours = [0] * 24
    weekdays = [0] * 7
    for dt, _, _ in observations:
        hours[dt.hour] += 1
        weekdays[dt.weekday()] += 1
    gaps = []
    bursts = []
    migrations = []
    for (before, before_id, before_platform), (after, eid, after_platform) in zip(observations, observations[1:]):
        seconds = (after - before).total_seconds()
        if seconds >= 7 * 86400:
            gaps.append({"start": before.isoformat(), "end": after.isoformat(), "days": round(seconds / 86400, 2),
                         "evidence_ids": [eid] if eid else []})
        if seconds <= 3600:
            bursts.append({"at": after.isoformat(), "evidence_ids": [eid] if eid else []})
        if (before_platform and after_platform and before_platform != after_platform
                and seconds >= 86400 and before_id and eid):
            migrations.append({
                "from_platform": before_platform, "to_platform": after_platform,
                "window_start": before.isoformat(), "window_end": after.isoformat(),
                "evidence_ids": [before_id, eid],
                "reason": "Cautious candidate: supplied observations switch platforms after an activity gap.",
            })
    return {"posting_hour_distribution": hours, "weekday_distribution": weekdays,
            "first_seen": observations[0][0].isoformat() if observations else None,
            "last_seen": observations[-1][0].isoformat() if observations else None,
            "activity_bursts": bursts[:100], "inactive_periods": gaps[:100],
            "migration_candidates": migrations[:50], "observation_count": len(observations),
            "evidence_ids": sorted({eid for _, eid, _ in observations if eid}),
            "warning": None if observations else "No real posting or transaction timestamps were supplied."}