"""Evidence-only AI summarization and untrusted-output validation."""

from __future__ import annotations

import inspect
from typing import Any

from .errors import InvalidAIResponseError, MissingAIConfigurationError
from .protocols import Summarizer

_provider: Summarizer | None = None


def set_summarizer_provider(provider: Summarizer | None) -> None:
    """Configure an application-scoped provider; pass None to clear it."""
    global _provider
    _provider = provider


def _default_provider() -> Summarizer:
    from .providers import OpenAICompatibleSummarizer

    return OpenAICompatibleSummarizer()


def _validate_result(raw: Any, valid_ids: set[str]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise InvalidAIResponseError("AI summary must be a JSON object")
    summary = raw.get("summary")
    findings = raw.get("key_findings")
    uncertainties = raw.get("uncertainties")
    overall_ids = raw.get("evidence_ids")
    if not isinstance(summary, str) or not summary.strip():
        raise InvalidAIResponseError("AI summary requires non-empty 'summary'")
    if not isinstance(findings, list) or not isinstance(uncertainties, list):
        raise InvalidAIResponseError("'key_findings' and 'uncertainties' must be arrays")
    if not isinstance(overall_ids, list):
        raise InvalidAIResponseError("'evidence_ids' must be an array")

    def validated_ids(values: Any, location: str, *, required: bool = False) -> list[str]:
        if not isinstance(values, list):
            raise InvalidAIResponseError(f"{location} must be an array")
        ids = [str(value) for value in values]
        unsupported = set(ids) - valid_ids
        if unsupported:
            raise InvalidAIResponseError(
                f"{location} cites evidence IDs that were not supplied: {sorted(unsupported)}"
            )
        if required and not ids:
            raise InvalidAIResponseError(f"{location} requires at least one supplied evidence ID")
        return list(dict.fromkeys(ids))

    normalized_findings = []
    for index, finding in enumerate(findings[:50]):
        if not isinstance(finding, dict) or not isinstance(finding.get("text"), str):
            raise InvalidAIResponseError(f"key_findings[{index}] has an invalid shape")
        normalized_findings.append({
            "text": finding["text"].strip(),
            "evidence_ids": validated_ids(
                finding.get("evidence_ids"), f"key_findings[{index}].evidence_ids", required=True
            ),
        })
    if not all(isinstance(value, str) for value in uncertainties):
        raise InvalidAIResponseError("uncertainties must contain only strings")
    return {
        "summary": summary.strip(),
        "key_findings": normalized_findings,
        "uncertainties": [value.strip() for value in uncertainties[:50] if value.strip()],
        "evidence_ids": validated_ids(overall_ids, "evidence_ids", required=bool(findings)),
        "status": "untrusted_draft",
        "attribution": "ai",
        "requires_human_review": True,
        "uncertainty_notice": (
            "This AI-generated draft is constrained to supplied citations but may still "
            "misinterpret evidence. An investigator must verify every statement."
        ),
    }


async def summarize_evidence(evidence: list[dict]) -> dict:
    """Create and validate an AI draft; no silent rule-based fallback is used."""
    if not isinstance(evidence, list):
        raise TypeError("evidence must be a list")
    bounded = [
        dict(item) for item in evidence[:100]
        if isinstance(item, dict) and item.get("id") is not None
    ]
    if not bounded:
        raise ValueError("at least one evidence record with an id is required")
    provider = _provider or _default_provider()
    raw = provider.summarize(bounded)
    if inspect.isawaitable(raw):
        raw = await raw
    return _validate_result(raw, {str(item["id"]) for item in bounded})
