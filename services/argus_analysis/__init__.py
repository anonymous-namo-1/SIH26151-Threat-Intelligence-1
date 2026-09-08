"""ARGUS safe, evidence-first intelligence analysis.

Public functions return JSON-serializable dictionaries. Confidence values
describe extraction/correlation support and are not probabilities of guilt.
"""

from .comparison import compare_entities
from .comparison import DEFAULT_WEIGHTS, MODEL_VERSION
from .modules import run_module
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
    "run_module",
    "DEFAULT_WEIGHTS",
    "MODEL_VERSION",
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
