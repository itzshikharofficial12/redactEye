"""Unit tests for the Planner interface, dependency injection, and MockPlanner (Checkpoint 3).

PRIVACY & SAFETY INVARIANTS:
1. All tests use synthetic DOM and context fixtures.
2. Planner must never return hardcoded IDs when context provides specific elements.
3. Password fields and sensitive fields must NEVER be selected for type actions.
4. Unsupported tasks must fail safely without executing or inventing arbitrary actions.
"""

from typing import List, Optional
import pytest

from app.models.plan import (
    AgentAction,
    BoundingBox,
    BrowserContext,
    ClickAction,
    DOMElement,
    DOMSnapshot,
    ElementTarget,
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
    get_planner,
    reset_planner,
    set_planner,
)
from app.planner.mock import MockPlanner


def make_context(elements: Optional[List[DOMElement]] = None) -> SanitizedContext:
    """Helper to create synthetic SanitizedContext."""
    return SanitizedContext(
        browser=BrowserContext(
            url="https://demo.redacteye.local/page",
            title="Synthetic Test Page",
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


def make_box() -> BoundingBox:
    return BoundingBox(x=10.0, y=10.0, width=100.0, height=30.0)


# ==============================================================================
# 1. Planner Interface & Protocol Compliance
# ==============================================================================

def test_mock_planner_implements_protocol() -> None:
    """Verify MockPlanner satisfies the Planner Protocol and BasePlanner ABC."""
    planner = MockPlanner()
    assert isinstance(planner, Planner)
    assert isinstance(planner, BasePlanner)


def test_planner_accepts_both_request_and_task_context_args() -> None:
    """Verify planner.plan() works with both PlanRequest and (task, context)."""
    btn = DOMElement(
        id="btn-login-dynamic",
        type="button",
        tagName="button",
        text="Log In",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = make_context([btn])

    planner = MockPlanner()

    # Form 1: PlanRequest object
    action1 = planner.plan(PlanRequest(task="Click the login button", context=context))
    assert isinstance(action1, ClickAction)
    assert action1.target.elementId == "btn-login-dynamic"

    # Form 2: task string + SanitizedContext
    action2 = planner.plan("Click the login button", context)
    assert isinstance(action2, ClickAction)
    assert action2.target.elementId == "btn-login-dynamic"


def test_planner_dependency_injection_provider() -> None:
    """Verify get_planner, set_planner, and reset_planner work as expected."""
    reset_planner()
    default_planner = get_planner()
    assert isinstance(default_planner, MockPlanner)

    # Custom dummy planner
    class CustomPlanner(BasePlanner):
        def plan(self, request, context=None) -> AgentAction:
            return ScrollAction(type="scroll", direction="down", amount=100.0)

    custom = CustomPlanner()
    set_planner(custom)
    assert get_planner() is custom

    reset_planner()
    assert isinstance(get_planner(), MockPlanner)


# ==============================================================================
# 2. Dynamic Element ID Selection (Login & Signup)
# ==============================================================================

def test_login_uses_dynamic_element_id_from_context() -> None:
    """Verify planner selects the elementId from the supplied context, NOT a hardcoded string."""
    dynamic_id = "btn-auth-custom-987"
    btn = DOMElement(
        id=dynamic_id,
        type="button",
        tagName="button",
        text="Login to Account",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = make_context([btn])
    planner = MockPlanner()

    action = planner.plan("Click login", context)
    assert isinstance(action, ClickAction)
    assert action.target.elementId == dynamic_id


def test_login_fails_when_no_element_found() -> None:
    """Verify planner fails safely with PlannerError when no login button exists."""
    context = make_context([])
    planner = MockPlanner()
    with pytest.raises(PlannerError, match="Target element for login not found"):
        planner.plan("Click the login button", context)


def test_signup_button_detection() -> None:
    """Verify planner identifies signup button variations from supplied context."""
    signup_id = "signup-btn-alpha"
    btn = DOMElement(
        id=signup_id,
        type="button",
        tagName="button",
        text="Sign Up Now",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = make_context([btn])
    planner = MockPlanner()

    # Variation 1: "Click the signup button"
    action1 = planner.plan("Click the signup button", context)
    assert isinstance(action1, ClickAction)
    assert action1.target.elementId == signup_id

    # Variation 2: "Click sign up"
    action2 = planner.plan("Click sign up", context)
    assert isinstance(action2, ClickAction)
    assert action2.target.elementId == signup_id

    # Variation 3: "Find the signup button"
    action3 = planner.plan("Find the signup button", context)
    assert isinstance(action3, ClickAction)
    assert action3.target.elementId == signup_id


# ==============================================================================
# 3. Generic Buttons by Visible Text (Continue, Submit, Search)
# ==============================================================================

@pytest.mark.parametrize(
    "label,task,element_id",
    [
        ("Continue", "Click the Continue button", "btn-continue-001"),
        ("Submit", "Click the Submit button", "btn-submit-002"),
        ("Search", "Click the Search button", "btn-search-003"),
        ("Save", "Click Save", "btn-save-004"),
    ],
)
def test_click_generic_buttons_by_visible_text(label: str, task: str, element_id: str) -> None:
    """Verify planner matches generic buttons by visible text/label."""
    btn = DOMElement(
        id=element_id,
        type="button",
        tagName="button",
        text=label,
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = make_context([btn])
    planner = MockPlanner()

    action = planner.plan(task, context)
    assert isinstance(action, ClickAction)
    assert action.target.elementId == element_id


# ==============================================================================
# 4. Scroll Actions with Bounded Values
# ==============================================================================

def test_scroll_actions_bounded() -> None:
    """Verify scroll tasks produce bounded safe scroll amounts."""
    context = make_context([])
    planner = MockPlanner()

    down = planner.plan("Scroll down", context)
    assert isinstance(down, ScrollAction)
    assert down.direction == "down"
    assert 0 < down.amount <= 1000

    up = planner.plan("Scroll up", context)
    assert isinstance(up, ScrollAction)
    assert up.direction == "up"
    assert 0 < up.amount <= 1000


# ==============================================================================
# 5. Select Actions
# ==============================================================================

def test_select_action_success() -> None:
    """Verify select task produces SelectAction when a select element exists."""
    select_el = DOMElement(
        id="country-selector",
        type="select",
        tagName="select",
        role="combobox",
        bbox=make_box(),
        visible=True,
        enabled=True,
    )
    context = make_context([select_el])
    planner = MockPlanner()

    action = planner.plan("Select India", context)
    assert isinstance(action, SelectAction)
    assert action.target.elementId == "country-selector"
    assert action.value == "India"


def test_select_action_fails_if_unavailable() -> None:
    """Verify select task raises PlannerError if no select element is present."""
    context = make_context([])
    planner = MockPlanner()
    with pytest.raises(PlannerError, match="No suitable select element found"):
        planner.plan("Select India", context)


# ==============================================================================
# 6. Type Actions & Strict Privacy Safeguards
# ==============================================================================

def test_type_action_success_on_safe_input() -> None:
    """Verify type action succeeds on visible, enabled, non-sensitive input."""
    input_el = DOMElement(
        id="search-input-field",
        type="input",
        tagName="input",
        placeholder="Search documentation...",
        inputType="text",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=False,
    )
    context = make_context([input_el])
    planner = MockPlanner()

    action = planner.plan("Type hello into the search field", context)
    assert isinstance(action, TypeAction)
    assert action.target.elementId == "search-input-field"
    assert action.value == "hello"


def test_type_action_refuses_password_field() -> None:
    """PRIVACY RULE: Verify planner refuses to type into password input fields."""
    pw_el = DOMElement(
        id="password-input",
        type="input",
        tagName="input",
        inputType="password",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=False,
    )
    context = make_context([pw_el])
    planner = MockPlanner()

    with pytest.raises(PlannerError, match="Refusing to type into password field"):
        planner.plan("Type secret123 into the password field", context)


def test_type_action_refuses_sensitive_field() -> None:
    """PRIVACY RULE: Verify planner refuses to type into fields marked sensitive."""
    sensitive_el = DOMElement(
        id="account-pin",
        type="input",
        tagName="input",
        inputType="text",
        bbox=make_box(),
        visible=True,
        enabled=True,
        sensitive=True,
    )
    context = make_context([sensitive_el])
    planner = MockPlanner()

    with pytest.raises(PlannerError, match="Refusing to type into sensitive field"):
        planner.plan("Type 9999 into the account field", context)


# ==============================================================================
# 7. Safe Failure on Unsupported Tasks
# ==============================================================================

def test_unsupported_task_fails_safely() -> None:
    """Verify unsupported tasks produce controlled PlannerError without inventing actions."""
    context = make_context([])
    planner = MockPlanner()

    with pytest.raises(PlannerError, match="Unsupported task instruction"):
        planner.plan("Delete my account permanently", context)

    with pytest.raises(PlannerError, match="Unsupported task instruction"):
        planner.plan("Execute arbitrary javascript", context)
