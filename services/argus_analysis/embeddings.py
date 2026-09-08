"""Small deterministic lexical vector utilities.

These vectors hash tokens into fixed buckets. They are useful for repeatable
lexical comparison, but are explicitly *not semantic embeddings*.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Sequence

_TOKEN = re.compile(r"[\w']+", re.UNICODE)


class TokenHashEmbedding:
    representation = "deterministic token-hash lexical vector (NOT semantic)"

    def __init__(self, dimensions: int = 256, max_chars: int = 50_000) -> None:
        if dimensions < 16:
            raise ValueError("dimensions must be at least 16")
        self.dimensions = dimensions
        self.max_chars = max_chars

    def embed(self, text: str) -> list[float]:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        vector = [0.0] * self.dimensions
        for token in _TOKEN.findall(text[: self.max_chars].casefold()):
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=9).digest()
            bucket = int.from_bytes(digest[:8], "big") % self.dimensions
            vector[bucket] += 1.0 if digest[8] & 1 else -1.0
        norm = math.sqrt(sum(value * value for value in vector))
        return [value / norm for value in vector] if norm else vector


class CosineSimilarity:
    """Non-negative cosine similarity, bounded to [0, 1] for display."""

    def similarity(self, left: Sequence[float], right: Sequence[float]) -> float:
        if len(left) != len(right):
            raise ValueError("vectors must have equal dimensions")
        if not left:
            return 0.0
        left_norm = math.sqrt(sum(float(x) ** 2 for x in left))
        right_norm = math.sqrt(sum(float(x) ** 2 for x in right))
        if left_norm == 0 or right_norm == 0:
            return 0.0
        cosine = sum(float(a) * float(b) for a, b in zip(left, right)) / (
            left_norm * right_norm
        )
        # Negative similarity is not useful evidence and is conservatively zeroed.
        return max(0.0, min(1.0, cosine))
