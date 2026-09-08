"""ARGUS safe, evidence-first intelligence analysis.

Public functions return JSON-serializable dictionaries. Confidence values
describe extraction/correlation support and are not probabilities of guilt.
"""

from .comparison import compare_entities
from .correlation import correlate
from .embeddings import CosineSimilarity, TokenHashEmbedding
from .errors import AnalysisError, InvalidAIResponseError, MissingAIConfigurationError
from .extraction import extract_entities
from .protocols import (
    EmbeddingProvider,
    EntityExtractor,
    SimilarityProvider,
    Summarizer,
    TextClassifier,
)
from .providers import OpenAICompatibleSummarizer
from .summarization import set_summarizer_provider, summarize_evidence

__all__ = [
    "extract_entities",
    "correlate",
    "compare_entities",
    "summarize_evidence",
    "set_summarizer_provider",
    "EmbeddingProvider",
    "SimilarityProvider",
    "EntityExtractor",
    "TextClassifier",
    "Summarizer",
    "TokenHashEmbedding",
    "CosineSimilarity",
    "OpenAICompatibleSummarizer",
    "AnalysisError",
    "InvalidAIResponseError",
    "MissingAIConfigurationError",
]
