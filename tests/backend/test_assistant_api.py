from apps.api.auth import current_user
from apps.api.main import app
from apps.api.models import Audit, Role, User
from apps.api.routes.assistant import router as assistant_router
from services.argus_analysis.assistant import set_assistant_provider

# Keep this route test independently runnable while application composition is
# owned elsewhere. Avoid adding a duplicate once the main router is mounted.
if not any(
    getattr(route, "path", None) == "/api/argus/cases/{case_id}/assistant"
    for route in app.routes
):
    app.include_router(assistant_router, prefix="/api/argus")


class FixtureAssistant:
    model = "fixture-api-v1"

    async def ask(self, question, context):
        record = context["evidence"][0]
        return {
            "findings": [{
                "text": "The supplied record contains a test observation.",
                "evidence_ids": [record["id"]],
                "supporting_quotes": [{
                    "evidence_id": record["id"],
                    "quote": "test observation",
                }],
            }],
            "uncertainties": ["No corroborating record was supplied."],
        }


def create_case(client):
    response = client.post("/api/argus/cases", json={"title": "Assistant case"})
    assert response.status_code == 201
    return response.json()


def test_assistant_is_case_scoped_cited_and_audited_without_question(client, db):
    case = create_case(client)
    evidence = client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL",
        "source": "Fixture",
        "content": "A test observation appears here.",
        "reliability": "B",
    }).json()
    set_assistant_provider(FixtureAssistant())
    try:
        response = client.post(
            f"/api/argus/cases/{case['id']}/assistant",
            json={"question": "What does the record show?"},
        )
    finally:
        set_assistant_provider(None)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "untrusted_draft"
    assert body["evidence_ids"] == [evidence["id"]]
    assert body["findings"][0]["text"] == (
        f"- Evidence {evidence['id']} (unverified excerpt): “test observation”"
    ).removeprefix("- ")
    assert body["findings"][0]["quotes"] == [{
        "evidence_id": evidence["id"],
        "quote": "test observation",
    }]
    assert body["model_version"] == "fixture-api-v1"
    assert body["generated_at"]
    event = db.query(Audit).filter(Audit.action == "assistant.queried").one()
    assert "question" not in event.extra_metadata
    assert event.extra_metadata["evidence_count"] == 1


def test_assistant_requires_permission_and_case_visibility(client, db, user):
    case = create_case(client)
    user.role = Role.VIEWER
    assert client.post(
        f"/api/argus/cases/{case['id']}/assistant", json={"question": "Question"}
    ).status_code == 403

    outsider = User(clerk_sub="assistant_outsider", name="Other", role=Role.INVESTIGATOR)
    db.add(outsider)
    db.commit()
    from apps.api.main import app
    app.dependency_overrides[current_user] = lambda: outsider
    assert client.post(
        f"/api/argus/cases/{case['id']}/assistant", json={"question": "Question"}
    ).status_code == 404


def test_empty_case_does_not_require_ai_configuration(client):
    case = create_case(client)
    set_assistant_provider(None)
    response = client.post(
        f"/api/argus/cases/{case['id']}/assistant", json={"question": "What is known?"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "insufficient_evidence"


def test_question_limit_is_enforced(client):
    case = create_case(client)
    response = client.post(
        f"/api/argus/cases/{case['id']}/assistant", json={"question": "x" * 2001}
    )
    assert response.status_code == 422


def test_provider_timeout_is_explicit_retryable_503(client):
    class TimeoutAssistant:
        model = "timeout-fixture"

        async def ask(self, question, context):
            raise TimeoutError("fixture deadline")

    case = create_case(client)
    client.post(f"/api/argus/cases/{case['id']}/evidence", json={
        "type": "MANUAL",
        "source": "Fixture",
        "content": "Evidence requiring provider evaluation.",
        "reliability": "B",
    })
    set_assistant_provider(TimeoutAssistant())
    try:
        response = client.post(
            f"/api/argus/cases/{case['id']}/assistant",
            json={"question": "What is supported?"},
        )
    finally:
        set_assistant_provider(None)

    assert response.status_code == 503
    assert "retry" in response.json()["detail"].lower()