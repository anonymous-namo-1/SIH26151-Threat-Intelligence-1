import httpx

from backend.app.models.schemas import (
    EntityValue,
    ExtractedEntities,
    MitreAttackEnrichmentRequest,
)
from backend.app.services.mitre_attack import MitreAttackEnrichmentService


APPROVED_TEST_URL = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/"
    "enterprise-attack/enterprise-attack.json"
)


def entity(value: str, entity_type: str = "threat_actor") -> EntityValue:
    return EntityValue(value=value, entity_type=entity_type, confidence=0.95)


def stix_bundle() -> dict:
    return {
        "type": "bundle",
        "id": "bundle--test-enterprise-attack",
        "spec_version": "2.1",
        "objects": [
            {
                "type": "intrusion-set",
                "id": "intrusion-set--alpha",
                "name": "APT Alpha",
                "aliases": ["Alpha Alias", "TA-Alpha"],
                "description": "A public test intrusion set.",
                "modified": "2026-01-01T00:00:00.000Z",
                "external_references": [
                    {
                        "source_name": "mitre-attack",
                        "external_id": "G0001",
                        "url": "https://attack.mitre.org/groups/G0001/",
                    }
                ],
            },
            {
                "type": "intrusion-set",
                "id": "intrusion-set--revoked",
                "name": "Revoked Group",
                "revoked": True,
                "external_references": [
                    {"source_name": "mitre-attack", "external_id": "G9998"}
                ],
            },
            {
                "type": "intrusion-set",
                "id": "intrusion-set--deprecated",
                "name": "Deprecated Group",
                "x_mitre_deprecated": True,
                "external_references": [
                    {"source_name": "mitre-attack", "external_id": "G9999"}
                ],
            },
            {
                "type": "attack-pattern",
                "id": "attack-pattern--encrypt",
                "name": "Data Encrypted for Impact",
                "description": "Encrypts data to interrupt availability.",
                "modified": "2026-01-02T00:00:00.000Z",
                "external_references": [
                    {
                        "source_name": "mitre-attack",
                        "external_id": "T1486",
                        "url": "https://attack.mitre.org/techniques/T1486/",
                    }
                ],
            },
            {
                "type": "attack-pattern",
                "id": "attack-pattern--revoked",
                "name": "Revoked Technique",
                "revoked": True,
                "external_references": [
                    {"source_name": "mitre-attack", "external_id": "T9999"}
                ],
            },
            {
                "type": "malware",
                "id": "malware--alpha",
                "name": "AlphaLoader",
                "description": "Public test malware object.",
                "external_references": [
                    {
                        "source_name": "mitre-attack",
                        "external_id": "S0001",
                        "url": "https://attack.mitre.org/software/S0001/",
                    }
                ],
            },
            {
                "type": "tool",
                "id": "tool--alpha",
                "name": "AlphaTool",
                "description": "Public test tool object.",
                "external_references": [
                    {
                        "source_name": "mitre-attack",
                        "external_id": "S0002",
                        "url": "https://attack.mitre.org/software/S0002/",
                    }
                ],
            },
            {
                "type": "relationship",
                "id": "relationship--group-technique",
                "relationship_type": "uses",
                "source_ref": "intrusion-set--alpha",
                "target_ref": "attack-pattern--encrypt",
            },
            {
                "type": "relationship",
                "id": "relationship--group-malware",
                "relationship_type": "uses",
                "source_ref": "intrusion-set--alpha",
                "target_ref": "malware--alpha",
            },
            {
                "type": "relationship",
                "id": "relationship--group-tool",
                "relationship_type": "uses",
                "source_ref": "intrusion-set--alpha",
                "target_ref": "tool--alpha",
            },
            {
                "type": "relationship",
                "id": "relationship--revoked-technique",
                "relationship_type": "uses",
                "source_ref": "intrusion-set--alpha",
                "target_ref": "attack-pattern--revoked",
            },
        ],
    }


class MockAsyncClient:
    calls: list[str] = []
    responses: list[httpx.Response | Exception] = []

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        pass

    async def get(self, url: str) -> httpx.Response:
        self.calls.append(url)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def install_mock_client(monkeypatch, responses: list[httpx.Response | Exception]) -> None:
    MockAsyncClient.calls = []
    MockAsyncClient.responses = responses
    monkeypatch.setattr(
        "backend.app.services.mitre_attack.httpx.AsyncClient",
        MockAsyncClient,
    )
    monkeypatch.setenv("MITRE_ATTACK_STIX_URL", APPROVED_TEST_URL)


def run_enrichment(
    service: MitreAttackEnrichmentService,
    entities: ExtractedEntities,
):
    import anyio

    return anyio.run(
        service.enrich,
        MitreAttackEnrichmentRequest(entities=entities),
    )


def test_exact_group_name_match(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(threat_actors=[entity("APT Alpha")]),
    )

    assert response.matches[0].matched_on == "group_name"
    assert response.matches[0].group_name == "APT Alpha"
    assert response.matches[0].mitre_group_id == "G0001"
    assert response.matches[0].match_confidence == 0.95
    assert response.matches[0].techniques_used[0].mitre_id == "T1486"
    assert {item.name for item in response.matches[0].malware_tools_used} == {
        "AlphaLoader",
        "AlphaTool",
    }
    assert response.dataset_modified == "2026-01-02T00:00:00.000Z"


def test_alias_match(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(threat_actors=[entity("alpha alias")]),
    )

    assert response.matches[0].matched_on == "alias"
    assert response.matches[0].group_name == "APT Alpha"
    assert "aliases do not prove a real-world identity" in response.matches[0].warnings[0]


def test_technique_match_returns_groups_using_technique(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(mitre_techniques=[entity("T1486", "mitre_technique")]),
    )

    assert response.matches[0].matched_on == "technique"
    assert response.matches[0].matched_input == "T1486"
    assert response.matches[0].group_name == "APT Alpha"
    assert response.matches[0].match_confidence == 0.82


def test_revoked_and_deprecated_objects_are_excluded(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(
            threat_actors=[
                entity("Revoked Group"),
                entity("Deprecated Group"),
            ],
            mitre_techniques=[entity("T9999", "mitre_technique")],
        ),
    )

    assert response.matches == []
    assert "No exact MITRE ATT&CK" in response.warnings[-1]


def test_malformed_stix_response_returns_warning(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json={"type": "not-bundle"})])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(threat_actors=[entity("APT Alpha")]),
    )

    assert response.matches == []
    assert "valid STIX bundle" in response.warnings[-1]


def test_network_timeout_returns_warning(monkeypatch):
    request = httpx.Request("GET", APPROVED_TEST_URL)
    install_mock_client(
        monkeypatch,
        [httpx.ReadTimeout("timed out", request=request)],
    )
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(threat_actors=[entity("APT Alpha")]),
    )

    assert response.matches == []
    assert "timed out" in response.warnings[-1]


def test_cache_reuse(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    service = MitreAttackEnrichmentService()

    first = run_enrichment(
        service,
        ExtractedEntities(threat_actors=[entity("APT Alpha")]),
    )
    second = run_enrichment(
        service,
        ExtractedEntities(mitre_techniques=[entity("T1486", "mitre_technique")]),
    )

    assert first.matches
    assert second.matches
    assert MockAsyncClient.calls == [APPROVED_TEST_URL]


def test_no_match_response(monkeypatch):
    install_mock_client(monkeypatch, [httpx.Response(200, json=stix_bundle())])
    response = run_enrichment(
        MitreAttackEnrichmentService(),
        ExtractedEntities(threat_actors=[entity("Unknown Group")]),
    )

    assert response.matches == []
    assert response.dataset_version == "bundle--test-enterprise-attack"
    assert "No exact MITRE ATT&CK" in response.warnings[-1]

