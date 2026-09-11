import os
import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from backend.app.models.schemas import (
    EntityValue,
    MitreAttackEnrichmentRequest,
    MitreAttackEnrichmentResponse,
    MitreAttackGroupMatch,
    MitreAttackReference,
    MitreAttackSoftware,
    MitreAttackTechnique,
)


DEFAULT_ENTERPRISE_ATTACK_URL = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/"
    "enterprise-attack/enterprise-attack.json"
)
DATASET_URL_ENV = "MITRE_ATTACK_STIX_URL"
CACHE_TTL_ENV = "MITRE_ATTACK_CACHE_TTL_SECONDS"
CONNECT_TIMEOUT_ENV = "MITRE_ATTACK_CONNECT_TIMEOUT_SECONDS"
READ_TIMEOUT_ENV = "MITRE_ATTACK_READ_TIMEOUT_SECONDS"

APPROVED_HOSTS = {
    "raw.githubusercontent.com",
    "github.com",
    "attack.mitre.org",
}
APPROVED_GITHUB_PATH_PREFIXES = (
    "/mitre-attack/attack-stix-data/",
)
MAX_REDIRECTS = 3


class MitreAttackError(Exception):
    """Raised when the MITRE ATT&CK dataset cannot be safely retrieved or parsed."""


@dataclass(frozen=True)
class AttackObject:
    stix_id: str
    stix_type: str
    name: str
    mitre_id: str | None
    aliases: tuple[str, ...] = ()
    description: str | None = None
    modified: str | None = None
    references: tuple[MitreAttackReference, ...] = ()


@dataclass
class ParsedAttackDataset:
    groups_by_stix_id: dict[str, AttackObject] = field(default_factory=dict)
    groups_by_name: dict[str, AttackObject] = field(default_factory=dict)
    groups_by_alias: dict[str, AttackObject] = field(default_factory=dict)
    techniques_by_stix_id: dict[str, AttackObject] = field(default_factory=dict)
    techniques_by_mitre_id: dict[str, AttackObject] = field(default_factory=dict)
    software_by_stix_id: dict[str, AttackObject] = field(default_factory=dict)
    group_techniques: dict[str, set[str]] = field(default_factory=dict)
    group_software: dict[str, set[str]] = field(default_factory=dict)
    technique_groups: dict[str, set[str]] = field(default_factory=dict)
    dataset_version: str | None = None
    dataset_modified: str | None = None


@dataclass
class CachedAttackDataset:
    dataset: ParsedAttackDataset
    expires_at: float


class MitreAttackEnrichmentService:
    """Legal-public MITRE ATT&CK Enterprise STIX enrichment connector."""

    def __init__(self) -> None:
        self._cache: CachedAttackDataset | None = None

    async def enrich(
        self, request: MitreAttackEnrichmentRequest
    ) -> MitreAttackEnrichmentResponse:
        warnings = [
            "MITRE ATT&CK enrichment is public intelligence, not proof of attribution or real-world identity."
        ]
        try:
            dataset = await self._get_dataset()
        except MitreAttackError as error:
            return MitreAttackEnrichmentResponse(
                matches=[],
                warnings=[*warnings, str(error)],
            )

        matches = self._match_entities(request, dataset)
        if not matches:
            warnings.append(
                "No exact MITRE ATT&CK group or technique relationship matched the submitted entities."
            )

        return MitreAttackEnrichmentResponse(
            matches=matches,
            warnings=warnings,
            dataset_version=dataset.dataset_version,
            dataset_modified=dataset.dataset_modified,
        )

    async def _get_dataset(self) -> ParsedAttackDataset:
        now = time.time()
        if self._cache and self._cache.expires_at > now:
            return self._cache.dataset

        bundle = await self._retrieve_bundle()
        dataset = self._parse_bundle(bundle)
        self._cache = CachedAttackDataset(
            dataset=dataset,
            expires_at=now + self._cache_ttl_seconds(),
        )
        return dataset

    async def _retrieve_bundle(self) -> dict[str, Any]:
        url = self._dataset_url()
        self._validate_source_url(url)
        timeout = httpx.Timeout(
            connect=self._float_env(CONNECT_TIMEOUT_ENV, 3.0),
            read=self._float_env(READ_TIMEOUT_ENV, 10.0),
            write=3.0,
            pool=3.0,
        )
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            response = await self._get_with_safe_redirects(client, url)

        try:
            return response.json()
        except ValueError as error:
            raise MitreAttackError("MITRE ATT&CK response was not valid JSON.") from error

    async def _get_with_safe_redirects(
        self, client: httpx.AsyncClient, url: str
    ) -> httpx.Response:
        current_url = url
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = await client.get(current_url)
            except httpx.TimeoutException as error:
                raise MitreAttackError("MITRE ATT&CK dataset request timed out.") from error
            except httpx.RequestError as error:
                raise MitreAttackError(
                    "MITRE ATT&CK dataset could not be retrieved."
                ) from error

            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise MitreAttackError("MITRE ATT&CK redirect did not include a location.")
                redirected_url = urljoin(current_url, location)
                self._validate_source_url(redirected_url)
                current_url = redirected_url
                continue

            if response.status_code >= 400:
                raise MitreAttackError(
                    f"MITRE ATT&CK dataset returned HTTP {response.status_code}."
                )
            return response

        raise MitreAttackError("MITRE ATT&CK dataset redirected too many times.")

    def _parse_bundle(self, bundle: dict[str, Any]) -> ParsedAttackDataset:
        if bundle.get("type") != "bundle" or not isinstance(bundle.get("objects"), list):
            raise MitreAttackError("MITRE ATT&CK response was not a valid STIX bundle.")
        if bundle.get("spec_version") not in {None, "2.1"}:
            raise MitreAttackError("MITRE ATT&CK bundle was not STIX 2.1 compatible.")

        dataset = ParsedAttackDataset(dataset_version=bundle.get("id"))
        relationships: list[dict[str, Any]] = []

        for stix_object in bundle["objects"]:
            if not isinstance(stix_object, dict) or self._is_inactive(stix_object):
                continue

            stix_type = stix_object.get("type")
            if stix_type == "relationship":
                relationships.append(stix_object)
                continue
            if stix_type not in {"intrusion-set", "attack-pattern", "malware", "tool"}:
                continue

            attack_object = self._parse_attack_object(stix_object)
            if attack_object is None:
                continue

            dataset.dataset_modified = self._max_modified(
                dataset.dataset_modified, attack_object.modified
            )
            if stix_type == "intrusion-set":
                dataset.groups_by_stix_id[attack_object.stix_id] = attack_object
                dataset.groups_by_name[self._normalize(attack_object.name)] = attack_object
                for alias in attack_object.aliases:
                    dataset.groups_by_alias[self._normalize(alias)] = attack_object
            elif stix_type == "attack-pattern":
                dataset.techniques_by_stix_id[attack_object.stix_id] = attack_object
                if attack_object.mitre_id:
                    dataset.techniques_by_mitre_id[
                        self._normalize_technique_id(attack_object.mitre_id)
                    ] = attack_object
            else:
                dataset.software_by_stix_id[attack_object.stix_id] = attack_object

        for relationship in relationships:
            self._parse_relationship(dataset, relationship)

        return dataset

    def _parse_attack_object(self, stix_object: dict[str, Any]) -> AttackObject | None:
        stix_id = stix_object.get("id")
        stix_type = stix_object.get("type")
        name = stix_object.get("name")
        if not isinstance(stix_id, str) or not isinstance(name, str):
            return None

        return AttackObject(
            stix_id=stix_id,
            stix_type=stix_type,
            name=name,
            mitre_id=self._external_id(stix_object),
            aliases=tuple(
                alias
                for alias in stix_object.get("aliases", [])
                if isinstance(alias, str)
            ),
            description=stix_object.get("description"),
            modified=stix_object.get("modified"),
            references=tuple(self._references(stix_object)),
        )

    def _parse_relationship(
        self, dataset: ParsedAttackDataset, relationship: dict[str, Any]
    ) -> None:
        if self._is_inactive(relationship):
            return
        if relationship.get("relationship_type") != "uses":
            return
        source_ref = relationship.get("source_ref")
        target_ref = relationship.get("target_ref")
        if not isinstance(source_ref, str) or not isinstance(target_ref, str):
            return
        if source_ref not in dataset.groups_by_stix_id:
            return

        if target_ref in dataset.techniques_by_stix_id:
            dataset.group_techniques.setdefault(source_ref, set()).add(target_ref)
            dataset.technique_groups.setdefault(target_ref, set()).add(source_ref)
        elif target_ref in dataset.software_by_stix_id:
            dataset.group_software.setdefault(source_ref, set()).add(target_ref)

    def _match_entities(
        self,
        request: MitreAttackEnrichmentRequest,
        dataset: ParsedAttackDataset,
    ) -> list[MitreAttackGroupMatch]:
        matches: list[MitreAttackGroupMatch] = []
        seen: set[tuple[str, str, str]] = set()

        for entity in request.entities.threat_actors:
            normalized = self._normalize(entity.value)
            group = dataset.groups_by_name.get(normalized)
            matched_on = "group_name"
            if group is None:
                group = dataset.groups_by_alias.get(normalized)
                matched_on = "alias"
            if group is None:
                continue
            self._append_match(
                matches, seen, dataset, group, entity, matched_on, confidence=0.95
            )

        for entity in request.entities.mitre_techniques:
            technique = dataset.techniques_by_mitre_id.get(
                self._normalize_technique_id(entity.value)
            )
            if technique is None:
                continue
            for group_id in sorted(dataset.technique_groups.get(technique.stix_id, set())):
                group = dataset.groups_by_stix_id[group_id]
                self._append_match(
                    matches,
                    seen,
                    dataset,
                    group,
                    entity,
                    "technique",
                    confidence=0.82,
                )

        return matches

    def _append_match(
        self,
        matches: list[MitreAttackGroupMatch],
        seen: set[tuple[str, str, str]],
        dataset: ParsedAttackDataset,
        group: AttackObject,
        entity: EntityValue,
        matched_on: str,
        confidence: float,
    ) -> None:
        key = (entity.value.lower(), matched_on, group.stix_id)
        if key in seen:
            return
        seen.add(key)
        matches.append(
            MitreAttackGroupMatch(
                matched_input=entity.value,
                matched_on=matched_on,
                group_name=group.name,
                mitre_group_id=group.mitre_id,
                aliases=list(group.aliases),
                description=group.description,
                techniques_used=self._techniques_for_group(dataset, group.stix_id),
                malware_tools_used=self._software_for_group(dataset, group.stix_id),
                mitre_source_references=list(group.references),
                match_confidence=confidence,
                warnings=[
                    "Exact MITRE match only; aliases do not prove a real-world identity.",
                    "Use as public analytical context, not attribution proof.",
                ],
            )
        )

    def _techniques_for_group(
        self, dataset: ParsedAttackDataset, group_stix_id: str
    ) -> list[MitreAttackTechnique]:
        techniques = []
        for technique_id in sorted(dataset.group_techniques.get(group_stix_id, set())):
            technique = dataset.techniques_by_stix_id[technique_id]
            techniques.append(
                MitreAttackTechnique(
                    mitre_id=technique.mitre_id or technique.stix_id,
                    name=technique.name,
                    description=technique.description,
                    references=list(technique.references),
                )
            )
        return techniques

    def _software_for_group(
        self, dataset: ParsedAttackDataset, group_stix_id: str
    ) -> list[MitreAttackSoftware]:
        software_items = []
        for software_id in sorted(dataset.group_software.get(group_stix_id, set())):
            software = dataset.software_by_stix_id[software_id]
            software_items.append(
                MitreAttackSoftware(
                    mitre_id=software.mitre_id,
                    name=software.name,
                    software_type="malware" if software.stix_type == "malware" else "tool",
                    description=software.description,
                    references=list(software.references),
                )
            )
        return software_items

    def _validate_source_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            raise MitreAttackError("MITRE ATT&CK dataset URL must use HTTPS.")
        host = parsed.hostname or ""
        if host.endswith(".onion") or host not in APPROVED_HOSTS:
            raise MitreAttackError("MITRE ATT&CK dataset URL host is not approved.")
        if host in {"raw.githubusercontent.com", "github.com"} and not parsed.path.startswith(
            APPROVED_GITHUB_PATH_PREFIXES
        ):
            raise MitreAttackError("MITRE ATT&CK GitHub URL path is not approved.")

    def _dataset_url(self) -> str:
        return os.getenv(DATASET_URL_ENV, DEFAULT_ENTERPRISE_ATTACK_URL)

    def _cache_ttl_seconds(self) -> int:
        raw = os.getenv(CACHE_TTL_ENV, "86400")
        try:
            ttl = int(raw)
        except ValueError:
            return 86400
        return max(ttl, 1)

    def _float_env(self, name: str, default: float) -> float:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            value = float(raw)
        except ValueError:
            return default
        return max(value, 0.1)

    def _is_inactive(self, stix_object: dict[str, Any]) -> bool:
        return bool(stix_object.get("revoked") or stix_object.get("x_mitre_deprecated"))

    def _external_id(self, stix_object: dict[str, Any]) -> str | None:
        for reference in stix_object.get("external_references", []):
            if not isinstance(reference, dict):
                continue
            if reference.get("source_name") == "mitre-attack" and isinstance(
                reference.get("external_id"), str
            ):
                return reference["external_id"]
        return None

    def _references(self, stix_object: dict[str, Any]) -> list[MitreAttackReference]:
        references = []
        for reference in stix_object.get("external_references", []):
            if not isinstance(reference, dict):
                continue
            references.append(
                MitreAttackReference(
                    source_name=str(reference.get("source_name", "unknown")),
                    url=reference.get("url"),
                    external_id=reference.get("external_id"),
                )
            )
        return references

    def _normalize(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

    def _normalize_technique_id(self, value: str) -> str:
        return value.upper().strip()

    def _max_modified(self, current: str | None, candidate: str | None) -> str | None:
        if candidate is None:
            return current
        if current is None or candidate > current:
            return candidate
        return current

