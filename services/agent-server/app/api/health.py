"""Health check endpoints for RedactEye Agent Server.

===============================================================================
CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
===============================================================================
This module provides lightweight liveness and operational probes.
No sensitive context or raw data ingestion endpoints are permitted here.
"""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.core.config import get_settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Response model for health check probe."""

    status: str = "ok"
    service: str

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "ok",
                "service": "redact-eye-agent-server",
            }
        }
    )


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """Return health status of the agent server."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.APP_NAME,
    )
