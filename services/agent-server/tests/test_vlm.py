"""Comprehensive tests for VLM Planner and Provider architecture (Checkpoint 4).

CRITICAL PRIVACY & SECURITY INVARIANTS:
1. RAW SCREENSHOT / RAW PII MUST NEVER be sent to or handled by VLM providers.
2. VLMProvider interface operates exclusively on pre-sanitized context.
3. Candidate actions must be strictly validated against the sanitized DOM and action schema.
4. Password fields and sensitive fields must NEVER be selected for type actions.
5. Dangerous actions (executeScript, eval, javascript: URLs) must be strictly rejected.
"""

from typing import Any, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.plan import (
    AgentAction,
    BoundingBox,
    BrowserContext,
    ClickAction,
    CoordinateTarget,
    DOMElement,
    DOMSnapshot,
    ElementTarget,
    NavigateAction,
    PlanRequest,
    PrivacyStatistics,
    SanitizedContext,
    ScrollAction,
    SelectAction,
    TypeAction,
    Viewport,
)
from app.planner.base import (
    BasePlanner,
    Planner,
    PlannerError,
    create_vlm_planner,
    get_planner,
    reset_planner,
    set_planner,
)
from app.planner.mock import validate_agent_action
from app.planner.vlm import VLMPlanner
from app.vlm.base import VLMPlanOutput, VLMProvider, VLMProviderError
from app.vlm.mock import MockVLMProvider

client = TestClient(app)


def make_box() -> BoundingBox:
    return BoundingBox(x=10.0, y=10.0, width=120.0, height=35.0)


def build_synthetic_vlm_context(
    elements: Optional[List[DOMElement]] = None,
) -> SanitizedContext:
    """Construct a clean, synthetic SanitizedContext fixture for VLM testing."""
    return SanitizedContext(
        browser=BrowserContext(
            url="https://demo.redacteye.local/vlm-test",
            title="Synthetic VLM Test Portal",
            viewport=Viewport(width=1280.0, height=800.0, devicePixelRatio=1.0),
            scrollX=0.0,
            scrollY=0.0,
        ),
        sanitizedDom=DOMSnapshot(elements=elements or []),
        sensitiveRegions=[],
        statistics=PrivacyStatistics(
            totalDetections=len(elements or []),
            sensitiveDetections=0,
            redactedRegions=0,
        ),
    )


# ==============================================================================
# 1. Interface & Protocol Conformance
# ==============================================================================

def test_mock_vlm_provider_implements_protocol() -> None:
    """Verify MockVLMProvider satisfies the runtime-checkable VLMProvider protocol."""
    provider = MockVLMProvider()
    assert isinstance(provider, VLMProvider)


def test_vlm_planner_implements_planner_protocol() -> None:
    """Verify VLMPlanner satisfies the Planner Protocol and BasePlanner ABC."""
    planner = VLMPlanner(MockVLMProvider())
    assert isinstance(planner, Planner)
    assert isinstance(planner, BasePlanner)


def test_create_vlm_planner_factory() -> None:
    """Verify factory helper instantiates a valid VLMPlanner."""
    planner = create_vlm_planner()
    assert isinstance(planner, VLMPlanner)
    assert isinstance(planner.provider, MockVLMProvider)


# ==============================================================================
# 2. Functional Tasks with Dynamic IDs from Sanitized DOM
# ==============================================================================

def test_vlm_planner_click_action_dynamic_id() -> None:
    """Verify VLMPlanner identifies dynamic element ID from sanitized DOM."""
    dynamic_id = "btn-login-dynamic-999"
    btn = DOMElement(
        id=dynamic_id,
        type="button",
        tagName="button",
        text="Log In to Workspace",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = build_synthetic_vlm_context([btn])
    planner = VLMPlanner(MockVLMProvider())

    action = planner.plan("Click the login button", context)
    assert isinstance(action, ClickAction)
    assert action.target.elementId == dynamic_id


def test_vlm_planner_scroll_down_and_up() -> None:
    """Verify VLMPlanner produces valid bounded scroll actions."""
    context = build_synthetic_vlm_context([])
    planner = VLMPlanner(MockVLMProvider())

    down_action = planner.plan("Scroll down", context)
    assert isinstance(down_action, ScrollAction)
    assert down_action.direction == "down"
    assert 0 < down_action.amount <= 1000

    up_action = planner.plan("Scroll up", context)
    assert isinstance(up_action, ScrollAction)
    assert up_action.direction == "up"
    assert 0 < up_action.amount <= 1000


def test_vlm_planner_button_by_visible_text() -> None:
    """Verify VLMPlanner locates button by visible label."""
    continue_id = "btn-continue-flow"
    btn = DOMElement(
        id=continue_id,
        type="button",
        tagName="button",
        text="Continue",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = build_synthetic_vlm_context([btn])
    planner = VLMPlanner(MockVLMProvider())

    action = planner.plan("Click the Continue button", context)
    assert isinstance(action, ClickAction)
    assert action.target.elementId == continue_id


def test_vlm_planner_select_action() -> None:
    """Verify VLMPlanner produces a valid SelectAction when select element exists."""
    select_id = "country-dropdown"
    select_el = DOMElement(
        id=select_id,
        type="select",
        tagName="select",
        role="combobox",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = build_synthetic_vlm_context([select_el])
    planner = VLMPlanner(MockVLMProvider())

    action = planner.plan("Select India", context)
    assert isinstance(action, SelectAction)
    assert action.target.elementId == select_id
    assert action.value == "India"


def test_vlm_planner_safe_type_action() -> None:
    """Verify VLMPlanner produces valid TypeAction on a non-sensitive field."""
    name_id = "full-name-input"
    name_el = DOMElement(
        id=name_id,
        type="input",
        tagName="input",
        placeholder="Enter your full name",
        inputType="text",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=False,
    )
    context = build_synthetic_vlm_context([name_el])
    planner = VLMPlanner(MockVLMProvider())

    action = planner.plan("Type into the name field", context)
    assert isinstance(action, TypeAction)
    assert action.target.elementId == name_id
    assert action.value == "Jane Doe"


# ==============================================================================
# 3. Privacy Boundary Tests (Password & Sensitive Fields)
# ==============================================================================

def test_vlm_planner_refuses_password_field() -> None:
    """PRIVACY RULE: VLMPlanner must refuse candidate action targeting a password field."""
    pw_id = "user-password-input"
    pw_el = DOMElement(
        id=pw_id,
        type="input",
        tagName="input",
        inputType="password",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=False,
    )
    context = build_synthetic_vlm_context([pw_el])

    class StubPasswordVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            return VLMPlanOutput(
                action=TypeAction(type="type", target=ElementTarget(elementId=pw_id), value="secret123")
            )

    planner = VLMPlanner(StubPasswordVLMProvider())
    with pytest.raises(PlannerError, match="Refusing to type into password field"):
        planner.plan("Type secret123 into password", context)


def test_vlm_planner_refuses_sensitive_field() -> None:
    """PRIVACY RULE: VLMPlanner must refuse candidate action targeting a sensitive field."""
    sensitive_id = "tax-identifier"
    sensitive_el = DOMElement(
        id=sensitive_id,
        type="input",
        tagName="input",
        inputType="text",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=True,
    )
    context = build_synthetic_vlm_context([sensitive_el])

    class StubSensitiveVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            return VLMPlanOutput(
                action=TypeAction(type="type", target=ElementTarget(elementId=sensitive_id), value="000-00-0000")
            )

    planner = VLMPlanner(StubSensitiveVLMProvider())
    with pytest.raises(PlannerError, match="Refusing to type into sensitive field"):
        planner.plan("Type SSN into field", context)


# ==============================================================================
# 4. Safe Failure Tests (Missing / Disabled / Invalid Targets)
# ==============================================================================

def test_vlm_planner_nonexistent_target_fails_safely() -> None:
    """Verify VLMPlanner fails safely when provider targets an element absent in DOM."""
    context = build_synthetic_vlm_context([])

    class StubGhostTargetVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            return VLMPlanOutput(
                action=ClickAction(type="click", target=ElementTarget(elementId="ghost-element"))
            )

    planner = VLMPlanner(StubGhostTargetVLMProvider())
    with pytest.raises(PlannerError, match="Target element 'ghost-element' referenced by VLM action not found"):
        planner.plan("Click ghost", context)


def test_vlm_planner_disabled_target_fails_safely() -> None:
    """Verify VLMPlanner fails safely when targeted element is disabled."""
    disabled_id = "disabled-btn"
    disabled_el = DOMElement(
        id=disabled_id,
        type="button",
        tagName="button",
        text="Disabled Action",
        bbox=make_box(),
        visible=True,
        enabled=False,
    )
    context = build_synthetic_vlm_context([disabled_el])

    class StubDisabledTargetVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            return VLMPlanOutput(
                action=ClickAction(type="click", target=ElementTarget(elementId=disabled_id))
            )

    planner = VLMPlanner(StubDisabledTargetVLMProvider())
    with pytest.raises(PlannerError, match="present in sanitized DOM but disabled"):
        planner.plan("Click disabled", context)


def test_vlm_planner_invisible_target_fails_safely() -> None:
    """Verify VLMPlanner fails safely when targeted element is not visible."""
    invisible_id = "hidden-btn"
    invisible_el = DOMElement(
        id=invisible_id,
        type="button",
        tagName="button",
        text="Hidden Action",
        bbox=make_box(),
        visible=False,
        enabled=True,
    )
    context = build_synthetic_vlm_context([invisible_el])

    class StubHiddenTargetVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            return VLMPlanOutput(
                action=ClickAction(type="click", target=ElementTarget(elementId=invisible_id))
            )

    planner = VLMPlanner(StubHiddenTargetVLMProvider())
    with pytest.raises(PlannerError, match="present in sanitized DOM but not visible"):
        planner.plan("Click hidden", context)


def test_vlm_planner_invalid_provider_output_fails_safely() -> None:
    """Verify VLMPlanner handles missing or malformed provider output safely."""
    context = build_synthetic_vlm_context([])

    class StubEmptyOutputVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> Any:
            return None  # Invalid output

    planner = VLMPlanner(StubEmptyOutputVLMProvider())
    with pytest.raises(PlannerError, match="invalid or empty action output"):
        planner.plan("Do something", context)


def test_vlm_planner_provider_exception_fails_safely() -> None:
    """Verify VLMPlanner wraps provider exceptions in controlled PlannerError."""
    context = build_synthetic_vlm_context([])

    class StubCrashingVLMProvider(VLMProvider):
        def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
            raise VLMProviderError("Simulated VLM inference timeout")

    planner = VLMPlanner(StubCrashingVLMProvider())
    with pytest.raises(PlannerError, match="VLM provider planning failure"):
        planner.plan("Any task", context)


# ==============================================================================
# 5. Security & Injection Defense Tests
# ==============================================================================

def test_vlm_planner_arbitrary_javascript_action_rejected() -> None:
    """SECURITY: Disallowed actions (executeScript, eval, shell) must be rejected."""
    with pytest.raises(PlannerError, match="Prohibited or unsupported action type"):
        validate_agent_action({"type": "executeScript", "script": "alert(1)"})

    with pytest.raises(PlannerError, match="Prohibited or unsupported action type"):
        validate_agent_action({"type": "eval", "code": "console.log(1)"})


def test_vlm_planner_unsafe_navigation_rejected() -> None:
    """SECURITY: Dangerous URL schemes (javascript:, file:, data:) must be rejected."""
    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="javascript:alert(document.cookie)")

    with pytest.raises(ValidationError):
        NavigateAction(type="navigate", url="file:///etc/shadow")


def test_vlm_rejects_raw_screenshot_input() -> None:
    """PRIVACY RULE: Schema forbids rawScreenshot/rawImage in context payloads."""
    ctx_dict = build_synthetic_vlm_context([]).model_dump()
    ctx_dict["rawScreenshot"] = "data:image/png;base64,RAW_SCREENSHOT_BYTES"

    with pytest.raises(ValidationError):
        PlanRequest(task="Click login", context=ctx_dict)


def test_vlm_rejects_raw_dom_element_value() -> None:
    """PRIVACY RULE: Schema strictly forbids unredacted DOMElement 'value' attribute."""
    el_dict = {
        "id": "input-test",
        "type": "input",
        "tagName": "input",
        "bbox": {"x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0},
        "visible": True,
        "enabled": True,
        "value": "unredacted_private_secret",
    }
    with pytest.raises(ValidationError):
        DOMElement(**el_dict)


# ==============================================================================
# 6. API Integration with VLMPlanner via Dependency Injection
# ==============================================================================

def test_api_plan_integration_with_vlm_planner() -> None:
    """Verify POST /api/plan works seamlessly when VLMPlanner is injected."""
    btn = DOMElement(
        id="btn-vlm-api-login",
        type="button",
        tagName="button",
        text="Log In",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    vlm_planner_instance = VLMPlanner(MockVLMProvider())

    app.dependency_overrides[get_planner] = lambda: vlm_planner_instance
    try:
        ctx = build_synthetic_vlm_context([btn])
        response = client.post(
            "/api/plan",
            json={"task": "Click the login button", "context": ctx.model_dump()},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["action"]["type"] == "click"
        assert data["action"]["target"]["elementId"] == "btn-vlm-api-login"
    finally:
        app.dependency_overrides.pop(get_planner, None)
