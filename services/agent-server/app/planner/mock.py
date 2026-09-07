"""Deterministic mock planner for RedactEye Agent Server (Checkpoint 2).

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to or processed by this planner.
The planner operates exclusively on pre-sanitized context payloads.
No browser actions are executed on the server; structured action objects are
returned to the client for local execution in the browser.
"""

from typing import Union
from urllib.parse import urlparse

from app.models.plan import (
    AgentAction,
    ClickAction,
    CoordinateTarget,
    ElementTarget,
    NavigateAction,
    PlanRequest,
    ScrollAction,
    SelectAction,
    TypeAction,
)


class PlannerError(Exception):
    """Exception raised when planning fails or an unsupported task is encountered."""


DISALLOWED_ACTION_TYPES = frozenset([
    "executescript",
    "javascript",
    "eval",
    "shell",
    "command",
    "exec",
    "css_selector",
    "xpath",
])

ALLOWED_ACTION_TYPES = frozenset(["click", "scroll", "type", "select", "navigate"])


def validate_agent_action(action: Union[AgentAction, dict]) -> None:
    """Perform defense-in-depth structural validation on generated AgentAction.

    Canonical schema validation is defined in packages/action-schema; this function
    serves as server-side guardrail against injection and malformed outputs.
    """
    if isinstance(action, dict):
        action_type = str(action.get("type", "")).lower()
    else:
        action_type = str(getattr(action, "type", "")).lower()

    if action_type in DISALLOWED_ACTION_TYPES or action_type not in ALLOWED_ACTION_TYPES:
        raise PlannerError(
            f"Prohibited or unsupported action type: '{action_type}'. Arbitrary script/command execution is forbidden."
        )

    if isinstance(action, NavigateAction):
        parsed = urlparse(action.url)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            raise PlannerError(
                f"Navigation protocol '{parsed.scheme}' is prohibited. Only http and https are allowed."
            )

    if isinstance(action, ScrollAction):
        if action.direction not in ("up", "down"):
            raise PlannerError(f"Invalid scroll direction: '{action.direction}'")
        if action.amount <= 0 or action.amount > 1000:
            raise PlannerError(f"Scroll amount out of allowed bounds: {action.amount}")


class MockPlanner:
    """Deterministic mock planner for baseline tasks."""

    def plan(self, request: PlanRequest) -> AgentAction:
        """Produce a validated deterministic AgentAction from sanitized context."""
        task_normalized = request.task.strip().lower()

        # Task 1: "Click the login button"
        if task_normalized == "click the login button":
            dom = request.context.sanitizedDom
            if not dom:
                raise PlannerError(
                    "Cannot execute 'Click the login button': sanitized DOM snapshot is missing."
                )

            # Locate element with id="login-button" that is visible and enabled
            target_el = next(
                (el for el in dom.elements if el.id == "login-button"),
                None,
            )

            if not target_el:
                raise PlannerError(
                    "Target element 'login-button' not found in sanitized DOM."
                )

            if not target_el.visible:
                raise PlannerError(
                    "Target element 'login-button' is present in sanitized DOM but not visible."
                )

            if not target_el.enabled:
                raise PlannerError(
                    "Target element 'login-button' is present in sanitized DOM but disabled."
                )

            action = ClickAction(
                type="click",
                target=ElementTarget(elementId="login-button"),
            )
            validate_agent_action(action)
            return action

        # Task 2: "Scroll down"
        elif task_normalized == "scroll down":
            action = ScrollAction(
                type="scroll",
                direction="down",
                amount=500.0,
            )
            validate_agent_action(action)
            return action

        # Task 3: "Scroll up"
        elif task_normalized == "scroll up":
            action = ScrollAction(
                type="scroll",
                direction="up",
                amount=500.0,
            )
            validate_agent_action(action)
            return action

        # Controlled error for unsupported tasks
        else:
            raise PlannerError(
                f"Unsupported task instruction: '{request.task}'. "
                "Deterministic mock planner only supports 'Click the login button', 'Scroll down', and 'Scroll up'."
            )
