"""Small helpers for proving supplied values against linked evidence."""

from __future__ import annotations
from typing import Any


def related_ids(item: dict[str, Any]) -> set[str]:
    raw = item.get("entity_ids", item.get("related_entity_ids", []))
    return {str(x.get("id") if isinstance(x, dict) else x)
            for x in raw} if isinstance(raw, list) else set()


def scalar_values(value: Any, *, limit: int = 500, case_sensitive: bool = False) -> set[str]:
    output: set[str] = set()
    stack = [value]
    while stack and len(output) < limit:
        current = stack.pop()
        if isinstance(current, dict):
            stack.extend(current.values())
        elif isinstance(current, (list, tuple, set)):
            stack.extend(list(current)[:limit])
        elif current is not None and not isinstance(current, bool):
            text = str(current).strip()
            if not case_sensitive:
                text = text.casefold()
            if text:
                output.add(text)
    return output


def supporting_evidence(entity_id: str, values: set[str], evidence: list[dict], *,
                        case_sensitive: bool = False) -> set[str]:
    """Evidence linked to an entity that contains one of the asserted values."""
    if not values:
        return set()
    result: set[str] = set()
    needles = scalar_values(values, case_sensitive=case_sensitive)
    for item in evidence[:2000]:
        if not isinstance(item, dict) or item.get("id") is None or entity_id not in related_ids(item):
            continue
        # IDs themselves are excluded so an entity link alone cannot prove a factor.
        supplied = {key: value for key, value in item.items()
                    if key not in {"id", "entity_ids", "related_entity_ids"}}
        haystack = scalar_values(supplied, case_sensitive=case_sensitive)
        if any(needle in haystack or any(needle in value for value in haystack)
               for needle in needles):
            result.add(str(item["id"]))
    return result