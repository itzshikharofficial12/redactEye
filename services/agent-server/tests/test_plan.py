"""Integration and unit tests for POST /api/plan and action models.

PRIVACY & SECURITY INVARIANTS:
1. RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
2. All tests use synthetic test fixtures (e.g. demo.redacteye.local, mock IDs).
3. Disallowed actions (executeScript, eval, shell) and unsafe schemes (javascript:)
   must be strictly rejected.
"""

from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.plan import (
    ClickAction,
    ElementTarget,
    NavigateAction,
    PlanRequest,
    ScrollAction,
)
from app.planner.mock import PlannerError, validate_agent_action

client = TestClient(app)


def build_synthetic_context(
    *,
    has_login_button: bool = True,
    login_visible: bool = True,
    login_enabled: bool = True,
) -> Dict[str, Any]:
    """Generate a clean, synthetic SanitizedContext fixture for testing."""
    elements = []
    if has_login_button:
        elements.append({
            "id": "login-button",
            "type": "button",
            "tagName": "button",
            "text": "Sign In",
            "role": "button",
            "ariaLabel": "Sign in to account",
            "bbox": {"x": 120.0, "y": 340.0, "width": 100.0, "height": 36.0},
            "visible": login_visible,
            "enabled": login_enabled,
            "sensitive": False,
        })

    return {
        "browser": {
            "url": "https://demo.redacteye.local/portal",
            "title": "Synthetic Demonstration Portal",
            "viewport": {
                "width": 1280.0,
                "height": 800.0,
                "devicePixelRatio": 1.0,
            },
            "scrollX": 0.0,
            "scrollY": 0.0,
        },
        "sanitizedDom": {
            "elements": elements,
            "documentWidth": 1280.0,
            "documentHeight": 1800.0,
        },
        "sensitiveRegions": [
            {
                "id": "mask-demo-synth-01",
                "type": "password",
                "bbox": {"x": 120.0, "y": 280.0, "width": 240.0, "height": 32.0},
                "confidence": 0.98,
                "sources": ["dom", "ui_model"],
                "redaction": "mask",
            }
        ],
        "statistics": {
            "totalDetections": 4,
            "sensitiveDetections": 1,
            "redactedRegions": 1,
        },
    }


# ==============================================================================
# 1. Valid "Click the login button" request
# ==============================================================================

def test_plan_click_login_button_success() -> None:
    """Verify 'Click the login button' returns HTTP 200 and click action targeting login-button."""
    payload = {
        "task": "Click the login button",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "action" in data
    action = data["action"]
    assert action["type"] == "click"
    assert "target" in action
    assert action["target"]["elementId"] == "login-button"


# ==============================================================================
# 2. Valid "Scroll down" and "Scroll up" requests
# ==============================================================================

def test_plan_scroll_down_success() -> None:
    """Verify 'Scroll down' returns HTTP 200 and safe scroll action down."""
    payload = {
        "task": "Scroll down",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "action" in data
    action = data["action"]
    assert action["type"] == "scroll"
    assert action["direction"] == "down"
    assert action["amount"] == 500.0


def test_plan_scroll_up_success() -> None:
    """Verify 'Scroll up' returns HTTP 200 and safe scroll action up."""
    payload = {
        "task": "Scroll up",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["action"]["type"] == "scroll"
    assert data["action"]["direction"] == "up"
    assert data["action"]["amount"] == 500.0


# ==============================================================================
# 3. Empty task validation error
# ==============================================================================

def test_plan_empty_task_fails() -> None:
    """Verify empty task string triggers a validation error (HTTP 422)."""
    payload = {
        "task": "",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 4. Whitespace-only task validation error
# ==============================================================================

def test_plan_whitespace_task_fails() -> None:
    """Verify whitespace-only task string triggers a validation error (HTTP 422)."""
    payload = {
        "task": "   \t\n   ",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 5. Missing context validation error
# ==============================================================================

def test_plan_missing_context_fails() -> None:
    """Verify payload without context triggers a validation error (HTTP 422)."""
    payload = {
        "task": "Scroll down",
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 6. Invalid viewport width/height validation error
# ==============================================================================

def test_plan_invalid_viewport_fails() -> None:
    """Verify non-positive viewport dimensions trigger validation error (HTTP 422)."""
    context = build_synthetic_context()
    context["browser"]["viewport"]["width"] = -500.0
    payload = {
        "task": "Scroll down",
        "context": context,
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422

    context["browser"]["viewport"]["width"] = 1280.0
    context["browser"]["viewport"]["height"] = 0.0
    response2 = client.post("/api/plan", json={"task": "Scroll down", "context": context})
    assert response2.status_code == 422


# ==============================================================================
# 7. Missing required DOM fields validation error
# ==============================================================================

def test_plan_missing_required_dom_fields_fails() -> None:
    """Verify DOM elements missing required fields (e.g. tagName, bbox) trigger HTTP 422."""
    context = build_synthetic_context()
    # Remove mandatory 'tagName'
    del context["sanitizedDom"]["elements"][0]["tagName"]

    payload = {
        "task": "Click the login button",
        "context": context,
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 8. Unsupported task returns controlled response
# ==============================================================================

def test_plan_unsupported_task_returns_controlled_error() -> None:
    """Verify unsupported task instructions produce a controlled error response (HTTP 422)."""
    payload = {
        "task": "Perform arbitrary external purchase",
        "context": build_synthetic_context(),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422
    assert "Unsupported task instruction" in response.json().get("detail", "")


def test_plan_login_button_missing_in_dom_returns_controlled_error() -> None:
    """Verify task fails safely when targeted element is not present in sanitized DOM."""
    payload = {
        "task": "Click the login button",
        "context": build_synthetic_context(has_login_button=False),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422
    assert "not found in sanitized DOM" in response.json().get("detail", "")


def test_plan_login_button_disabled_in_dom_returns_controlled_error() -> None:
    """Verify task fails safely when targeted element is disabled in sanitized DOM."""
    payload = {
        "task": "Click the login button",
        "context": build_synthetic_context(login_enabled=False),
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422
    assert "disabled" in response.json().get("detail", "")


# ==============================================================================
# 9. Request model rejects rawScreenshot / rawImage / rawPii / value fields
# ==============================================================================

def test_plan_rejects_raw_screenshot_fields() -> None:
    """Verify schema strictly forbids rawScreenshot or rawImage injection."""
    context = build_synthetic_context()
    context["rawScreenshot"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."

    payload = {
        "task": "Scroll down",
        "context": context,
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422

    # Test rawImage on root payload
    payload2 = {
        "task": "Scroll down",
        "context": build_synthetic_context(),
        "rawImage": "binary_content_mock",
    }
    response2 = client.post("/api/plan", json=payload2)
    assert response2.status_code == 422

    # Test rawPii field
    payload3 = {
        "task": "Scroll down",
        "context": build_synthetic_context(),
        "rawPii": {"ssn": "000-00-0000"},
    }
    response3 = client.post("/api/plan", json=payload3)
    assert response3.status_code == 422


def test_plan_rejects_dom_element_value_field() -> None:
    """Verify DOMElement rejects raw 'value' attribute (local-only privacy rule)."""
    context = build_synthetic_context()
    context["sanitizedDom"]["elements"][0]["value"] = "unredacted_password_secret"

    payload = {
        "task": "Click the login button",
        "context": context,
    }
    response = client.post("/api/plan", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 10. Navigation action URL safety (reject javascript:, data:, file:)
# ==============================================================================

def test_navigate_action_rejects_unsafe_urls() -> None:
    """Verify NavigateAction strictly allows only http:// and https:// schemes."""
    # Valid HTTPS
    valid_nav = NavigateAction(type="navigate", url="https://demo.redacteye.local/home")
    assert valid_nav.url == "https://demo.redacteye.local/home"

    # Valid HTTP
    valid_http = NavigateAction(type="navigate", url="http://demo.redacteye.local:8080/home")
    assert valid_http.url == "http://demo.redacteye.local:8080/home"

    # Invalid: javascript:
    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="javascript:alert(document.cookie)")

    # Invalid: data:
    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="data:text/html,<script>alert(1)</script>")

    # Invalid: file:
    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="file:///etc/passwd")

    # Invalid: scheme without host
    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="https://")


# ==============================================================================
# 11. Ensure executeScript and arbitrary commands cannot be returned
# ==============================================================================

def test_disallowed_actions_rejected_by_validator() -> None:
    """Verify validator strictly blocks executeScript, eval, shell, etc."""
    with pytest.raises(PlannerError, match="Prohibited or unsupported action type"):
        validate_agent_action({"type": "executeScript", "script": "console.log(1)"})

    with pytest.raises(PlannerError, match="Prohibited or unsupported action type"):
        validate_agent_action({"type": "eval", "code": "alert(1)"})

    with pytest.raises(PlannerError, match="Prohibited or unsupported action type"):
        validate_agent_action({"type": "shell", "cmd": "rm -rf /"})


# ==============================================================================
# 12. Pydantic Model Unit Validation
# ==============================================================================

def test_plan_request_model_strip_validation() -> None:
    """Verify PlanRequest strips leading/trailing spaces and preserves clean tasks."""
    req = PlanRequest(
        task="   Click the login button   ",
        context=build_synthetic_context(),  # type: ignore[arg-type]
    )
    assert req.task == "Click the login button"
