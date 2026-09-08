class AnalysisError(RuntimeError):
    """Base class for explicit analysis failures."""


class MissingAIConfigurationError(AnalysisError):
    """No external summarization provider has been configured."""


class InvalidAIResponseError(AnalysisError):
    """The untrusted AI output failed shape or citation validation."""
