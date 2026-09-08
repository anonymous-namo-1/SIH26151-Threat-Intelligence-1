import pytest

from services.argus_analysis import (
    InvalidAIResponseError,
    set_summarizer_provider,
    summarize_evidence,
)


class MockSummarizer:
    def __init__(self, response):
        self.response = response

    async def summarize(self, evidence):
        return self.response


@pytest.mark.asyncio
async def test_rejects_hallucinated_citation() -> None:
    set_summarizer_provider(MockSummarizer({
        "summary": "Draft",
        "key_findings": [{"text": "Claim", "evidence_ids": ["not-supplied"]}],
        "uncertainties": [],
        "evidence_ids": ["not-supplied"],
    }))
    try:
        with pytest.raises(InvalidAIResponseError):
            await summarize_evidence([{"id": "ev-1", "content": "supplied"}])
    finally:
        set_summarizer_provider(None)


@pytest.mark.asyncio
async def test_valid_ai_output_is_marked_untrusted() -> None:
    set_summarizer_provider(MockSummarizer({
        "summary": "Evidence reports an observation.",
        "key_findings": [{"text": "Observation", "evidence_ids": ["ev-1"]}],
        "uncertainties": ["Source reliability was not independently verified."],
        "evidence_ids": ["ev-1"],
    }))
    try:
        result = await summarize_evidence([{"id": "ev-1", "content": "observation"}])
    finally:
        set_summarizer_provider(None)
    assert result["status"] == "untrusted_draft"
    assert result["requires_human_review"] is True