import asyncio

import pytest

import services.argus_analysis.assistant as assistant_module
from services.argus_analysis.assistant import ask_case_assistant, set_assistant_provider
from services.argus_analysis.errors import InvalidAIResponseError


class FixtureAssistant:
    model = "fixture-assistant-v1"

    def __init__(self, response):
        self.response = response
        self.calls = []

    async def ask(self, question, context):
        self.calls.append((question, context))
        return self.response


@pytest.fixture(autouse=True)
def clear_provider():
    yield
    set_assistant_provider(None)


@pytest.mark.asyncio
async def test_validates_exact_support_and_synthesizes_only_findings():
    provider = FixtureAssistant({
        "findings": [{
            "text": "The record reports a connection at 09:15.",
            "evidence_ids": ["ev-1"],
            "supporting_quotes": [{"evidence_id": "ev-1", "quote": "connected at 09:15"}],
        }],
        "uncertainties": ["The source was not independently corroborated."],
        "summary": "Unchecked prose must never become the answer.",
    })
    set_assistant_provider(provider)

    result = await ask_case_assistant(
        "What happened?",
        [{"id": "ev-1", "source": "log", "text": "Device connected at 09:15."}],
    )

    assert result["answer"] == (
        "- Evidence ev-1 (unverified excerpt): “connected at 09:15”"
    )
    assert result["evidence_ids"] == ["ev-1"]
    assert result["findings"][0]["quotes"] == [
        {"evidence_id": "ev-1", "quote": "connected at 09:15"}
    ]
    assert result["model_version"] == "fixture-assistant-v1"
    assert provider.calls[0][1]["evidence"][0]["id"] == "ev-1"


@pytest.mark.asyncio
async def test_provider_prose_and_factual_uncertainties_are_never_presented():
    provider = FixtureAssistant({
        "findings": [{
            "text": "The wallet is controlled by an unrelated named person.",
            "evidence_ids": ["ev-1"],
            "supporting_quotes": [{"evidence_id": "ev-1", "quote": "transaction at 10:00"}],
        }],
        "uncertainties": ["The named person also controls wallet 0xBAD."],
    })
    set_assistant_provider(provider)

    result = await ask_case_assistant(
        "What does the evidence show?",
        [{"id": "ev-1", "text": "Log records a transaction at 10:00."}],
    )

    rendered = f"{result['answer']} {result['findings']} {result['uncertainties']}"
    assert "unrelated named person" not in rendered
    assert "controls wallet 0xBAD" not in rendered
    assert "transaction at 10:00" in result["answer"]
    assert result["uncertainties"] == [
        "Evidence excerpts may be incomplete, misleading, or unverified; "
        "corroboration and human review are required."
    ]


@pytest.mark.asyncio
async def test_provider_uncertainty_claim_is_discarded_when_there_are_no_findings():
    set_assistant_provider(FixtureAssistant({
        "findings": [],
        "uncertainties": ["A named person controls wallet 0xBAD."],
    }))

    result = await ask_case_assistant(
        "Who controls the wallet?",
        [{"id": "ev-1", "text": "A transaction was observed."}],
    )

    assert result["status"] == "insufficient_evidence"
    assert "controls wallet" not in " ".join(result["uncertainties"])
    assert result["findings"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "finding",
    [
        {
            "text": "Unsupported",
            "evidence_ids": ["other-case-id"],
            "supporting_quotes": [{"evidence_id": "other-case-id", "quote": "text"}],
        },
        {
            "text": "Invented excerpt",
            "evidence_ids": ["ev-1"],
            "supporting_quotes": [{"evidence_id": "ev-1", "quote": "not in evidence"}],
        },
        {
            "text": "A is the same person as B",
            "evidence_ids": ["ev-1"],
            "supporting_quotes": [{"evidence_id": "ev-1", "quote": "text"}],
        },
    ],
)
async def test_rejects_cross_case_fabricated_or_identity_claims(finding):
    set_assistant_provider(FixtureAssistant({"findings": [finding], "uncertainties": []}))
    with pytest.raises(InvalidAIResponseError):
        await ask_case_assistant("Question", [{"id": "ev-1", "text": "text"}])


@pytest.mark.asyncio
async def test_empty_evidence_is_safe_and_skips_provider():
    provider = FixtureAssistant({})
    set_assistant_provider(provider)

    result = await ask_case_assistant("What is known?", [])

    assert result["status"] == "insufficient_evidence"
    assert result["findings"] == []
    assert provider.calls == []


@pytest.mark.asyncio
async def test_entire_injected_provider_call_has_a_hard_deadline(monkeypatch):
    class SlowAssistant:
        model = "slow-fixture"

        async def ask(self, question, context):
            await asyncio.sleep(1)
            return {"findings": [], "uncertainties": []}

    monkeypatch.setattr(assistant_module, "MAX_PROVIDER_SECONDS", 0.01)
    set_assistant_provider(SlowAssistant())

    with pytest.raises(TimeoutError):
        await ask_case_assistant(
            "Question",
            [{"id": "ev-1", "text": "Evidence text"}],
        )