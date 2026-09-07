"""Application configuration for RedactEye Agent Server.

===============================================================================
CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
===============================================================================
This server operates strictly downstream of the local RedactEye privacy engine
and will eventually receive ONLY pre-sanitized context (e.g., anonymized DOM text,
bounding box coordinates, and masked/blurred visual features).

Under NO circumstances should:
- Raw, unredacted screenshots be ingested or handled by this server.
- Raw PII or personal secrets be processed or transmitted to external LLM/VLM APIs.
- Request bodies containing context payloads be dumped or logged into application logs.
- Sensitive parameters be written to telemetry or persistence layers.
"""

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    """Runtime configuration settings loaded from environment variables with safe defaults."""

    # Application identification
    APP_NAME: str = os.getenv("APP_NAME", "redact-eye-agent-server")
    APP_VERSION: str = os.getenv("APP_VERSION", "0.1.0")

    # Networking / Bindings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Logging configuration
    # NOTE: Request bodies and sensitive context payloads MUST NEVER be logged at any level.
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton instance of runtime Settings."""
    return Settings()
