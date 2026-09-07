"""FastAPI application entry point for RedactEye Agent Server.

===============================================================================
CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
===============================================================================
The RedactEye Agent Server operates downstream of the local client-side
privacy engine. It receives exclusively sanitized context payloads (redacted
DOM and masked bounding boxes).

Operational Safety Rules:
1. RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
2. Endpoints MUST NOT accept raw screen captures or unredacted files.
3. Request bodies MUST NEVER be logged to standard output or storage.
4. Potentially sensitive context or user identifying metadata MUST NEVER be logged.
"""

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from app.api.health import router as health_router
from app.api.plan import router as plan_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="RedactEye Agent Server - Reasoning and Planning Service for Sanitized Context",
    docs_url="/docs",
    redoc_url="/redoc",
)


class RootResponse(BaseModel):
    """Response model for the root service discovery endpoint."""

    service: str
    version: str
    status: str = "ok"

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "service": "redact-eye-agent-server",
                "version": "0.1.0",
                "status": "ok",
            }
        }
    )


@app.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    """Root endpoint returning service identity, version, and operational status."""
    return RootResponse(
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        status="ok",
    )


# Register API routers
# Health endpoint is mounted under /api/health
app.include_router(health_router, prefix="/api")
# Planning endpoint is mounted under /api/plan
app.include_router(plan_router, prefix="/api")


def start() -> None:
    """Entry point for running the server programmatically."""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
        reload=False,
    )


if __name__ == "__main__":
    start()
