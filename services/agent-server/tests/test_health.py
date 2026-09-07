"""Unit tests for RedactEye Agent Server endpoints.

CRITICAL PRIVACY INVARIANT:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
This test suite verifies baseline service availability and structural schemas
without introducing or validating sensitive data payloads.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_endpoint() -> None:
    """Verify GET / returns HTTP 200, valid structure, and correct service status."""
    response = client.get("/")

    # Verify HTTP status
    assert response.status_code == 200

    # Verify expected JSON structure
    data = response.json()
    assert "service" in data
    assert "version" in data
    assert "status" in data

    # Verify values
    assert data["service"] == "redact-eye-agent-server"
    assert data["version"] == "0.1.0"
    assert data["status"] == "ok"


def test_health_endpoint() -> None:
    """Verify GET /api/health returns HTTP 200, valid structure, and service health."""
    response = client.get("/api/health")

    # Verify HTTP status
    assert response.status_code == 200

    # Verify expected JSON structure
    data = response.json()
    assert "status" in data
    assert "service" in data

    # Verify values
    assert data["status"] == "ok"
    assert data["service"] == "redact-eye-agent-server"
