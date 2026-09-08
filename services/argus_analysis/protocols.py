"""Replaceable provider contracts used by the ARGUS analysis package."""

from __future__ import annotations

from typing import Any, Protocol, Sequence, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Produces a vector representation. Implementations must describe its meaning."""

    def embed(self, text: str) -> list[float]: ...

    @property
    def representation(self) -> str: ...


@runtime_checkable
class SimilarityProvider(Protocol):
    """Compares two vectors and returns a bounded similarity."""

    def similarity(self, left: Sequence[float], right: Sequence[float]) -> float: ...


@runtime_checkable
class EntityExtractor(Protocol):
    """Extracts reviewable entity candidates from supplied text."""

    def extract(self, text: str) -> list[dict[str, Any]]: ...


@runtime_checkable
class TextClassifier(Protocol):
    """Classifies supplied text without treating a label as an allegation."""

    def classify(self, text: str) -> dict[str, Any]: ...


@runtime_checkable
class Summarizer(Protocol):
    """Creates an untrusted, evidence-citing summary draft."""

    async def summarize(self, evidence: list[dict[str, Any]]) -> dict[str, Any]: ...


@runtime_checkable
class BlockchainProvider(Protocol):
    """Read-only source of public or explicitly fictional transaction records."""

    def transactions(self, address: str) -> list[dict[str, Any]]: ...
