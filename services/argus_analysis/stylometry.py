"""Bounded, offline descriptive stylometry."""

from __future__ import annotations

from collections import Counter
import re
from typing import Any

_WORDS = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)
_SENTENCES = re.compile(r"[.!?]+")
_FUNCTION = {"the", "and", "a", "to", "of", "in", "is", "it", "that", "for", "on", "with"}


def _features(texts: list[str]) -> dict[str, Any]:
    text = "\n".join(str(x) for x in texts)[:200_000]
    words = _WORDS.findall(text)
    low = [w.casefold() for w in words]
    sentences = max(1, len(_SENTENCES.findall(text)))
    punct = Counter(c for c in text if c in ".,!?;:-")
    bigrams = Counter(zip(low, low[1:]))
    return {
        "characters": len(text), "words": len(words),
        "average_sentence_length": round(len(words) / sentences, 3),
        "average_word_length": round(sum(map(len, words)) / max(1, len(words)), 3),
        "word_length_distribution": dict(Counter(map(len, words)).most_common(12)),
        "punctuation_habits": dict(punct), "vocabulary": set(low),
        "common_ngrams": [" ".join(x) for x, _ in bigrams.most_common(10)],
        "function_word_frequency": {w: round(low.count(w) / max(1, len(low)), 4) for w in sorted(_FUNCTION)},
        "capitalization_rate": round(sum(w[:1].isupper() for w in words) / max(1, len(words)), 4),
        "symbol_count": sum(not c.isalnum() and not c.isspace() for c in text),
        "spelling_patterns": dict(Counter(w for w in low if len(w) >= 12).most_common(10)),
        "lexical_diversity": round(len(set(low)) / max(1, len(low)), 4),
    }


def compare_corpora(left: list[str], right: list[str]) -> dict[str, Any]:
    if not isinstance(left, list) or not isinstance(right, list):
        raise TypeError("corpora must be lists of strings")
    a, b = _features(left), _features(right)
    union = a["vocabulary"] | b["vocabulary"]
    vocab = len(a["vocabulary"] & b["vocabulary"]) / len(union) if union else 0
    sentence = 1 - min(1, abs(a["average_sentence_length"] - b["average_sentence_length"]) /
                       max(1, a["average_sentence_length"], b["average_sentence_length"]))
    word_len = 1 - min(1, abs(a["average_word_length"] - b["average_word_length"]) / 5)
    minimum = min(a["words"], b["words"])
    score = round(100 * (.5 * vocab + .3 * sentence + .2 * word_len), 2) if minimum else None
    reliability = "high" if minimum >= 1000 else "medium" if minimum >= 250 else "low"
    warning = (None if minimum >= 250 else
               "No comparable word tokens were found." if minimum == 0 else
               "Small samples make lexical measurements unstable.")
    for value in (a, b):
        value["vocabulary_size"] = len(value.pop("vocabulary"))
    return {"similarity": score, "reliability": reliability, "sample_size_warning": warning,
            "features": {"left": a, "right": b, "vocabulary_jaccard": round(vocab, 4),
                         "sentence_length_similarity": round(sentence, 4),
                         "word_length_similarity": round(word_len, 4)},
            "explanation": "Offline surface-form comparison; it is not semantic analysis and cannot prove identity."}