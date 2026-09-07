"""Deterministic mock planner for RedactEye Agent Server (Checkpoint 3).

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to or processed by this planner.
The planner operates exclusively on pre-sanitized context payloads.
No browser actions are executed on the server; structured action objects are
returned to the client for local execution in the browser.
"""

import re
from typing import List, Optional, Union
from urllib.parse import urlparse

from app.models.plan import (
    AgentAction,
    ClickAction,
    CoordinateTarget,
    DOMElement,
    ElementTarget,
    NavigateAction,
    PlanRequest,
    SanitizedContext,
    ScrollAction,
    SelectAction,
    TypeAction,
)
from app.planner.base import BasePlanner, PlannerError

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


def _is_button_like(el: DOMElement) -> bool:
    """Check if a sanitized DOM element has button-like semantics."""
    return (
        el.type in ("button", "link")
        or el.tagName.lower() in ("button", "a")
        or (el.role is not None and el.role.lower() in ("button", "link"))
    )


def _is_input_like(el: DOMElement) -> bool:
    """Check if a sanitized DOM element has input field semantics."""
    return (
        el.type in ("input", "textarea")
        or el.tagName.lower() in ("input", "textarea")
        or (el.role is not None and el.role.lower() in ("textbox", "searchbox"))
    )


def _is_select_like(el: DOMElement) -> bool:
    """Check if a sanitized DOM element has select/dropdown semantics."""
    return (
        el.type == "select"
        or el.tagName.lower() == "select"
        or (el.role is not None and el.role.lower() in ("combobox", "listbox", "select"))
    )


class MockPlanner(BasePlanner):
    """Deterministic mock planner implementing the Planner interface (Checkpoint 3)."""

    def plan(
        self,
        request: Union[PlanRequest, str],
        context: Optional[SanitizedContext] = None,
    ) -> AgentAction:
        """Produce a validated deterministic AgentAction from sanitized context."""
        plan_req = self._resolve_request(request, context)
        action = self._plan_internal(plan_req)
        validate_agent_action(action)
        return action

    def _resolve_request(
        self,
        request: Union[PlanRequest, str],
        context: Optional[SanitizedContext],
    ) -> PlanRequest:
        """Normalize input into a PlanRequest."""
        if isinstance(request, str):
            if context is None:
                raise PlannerError(
                    "SanitizedContext must be provided when task is passed as a string."
                )
            return PlanRequest(task=request, context=context)
        return request

    def _plan_internal(self, request: PlanRequest) -> AgentAction:
        """Internal dispatch for deterministic task handling."""
        task_clean = request.task.strip()
        task_lower = task_clean.lower()
        dom = request.context.sanitizedDom
        elements: List[DOMElement] = dom.elements if dom and dom.elements else []

        # ----------------------------------------------------------------------
        # Pattern 1: Scroll actions
        # ----------------------------------------------------------------------
        if task_lower in ("scroll down", "scroll down page") or task_lower.startswith("scroll down"):
            return ScrollAction(type="scroll", direction="down", amount=500.0)

        if task_lower in ("scroll up", "scroll up page") or task_lower.startswith("scroll up"):
            return ScrollAction(type="scroll", direction="up", amount=500.0)

        # ----------------------------------------------------------------------
        # Pattern 2: Click Login button
        # ----------------------------------------------------------------------
        if "login" in task_lower and any(w in task_lower for w in ("click", "find", "press", "tap")):
            return self._plan_click_login(elements)

        # ----------------------------------------------------------------------
        # Pattern 3: Click Signup button
        # ----------------------------------------------------------------------
        if any(term in task_lower for term in ("signup", "sign up", "register", "create account")) and any(
            w in task_lower for w in ("click", "find", "press", "tap")
        ):
            return self._plan_click_signup(elements)

        # ----------------------------------------------------------------------
        # Pattern 4: Click button by visible text / label
        # e.g. "Click the Continue button", "Click Submit", "Click Search"
        # ----------------------------------------------------------------------
        btn_match = re.match(
            r"^(?:click|find|press|tap)\s+(?:the\s+)?(.+?)(?:\s+button)?(?:\s+and\s+click\s+it)?$",
            task_lower,
        )
        if btn_match:
            label = btn_match.group(1).strip()
            # Avoid matching if label is empty or matches generic words
            if label and label not in ("it", "button", "link"):
                return self._plan_click_by_label(elements, label)

        # ----------------------------------------------------------------------
        # Pattern 5: Select action
        # e.g. "Select India", "Select option US"
        # ----------------------------------------------------------------------
        select_match = re.match(r"^select\s+(?:option\s+)?(.+)$", task_clean, re.IGNORECASE)
        if select_match:
            value_to_select = select_match.group(1).strip()
            return self._plan_select(elements, value_to_select)

        # ----------------------------------------------------------------------
        # Pattern 6: Type action
        # e.g. "Type hello into the search field", "Type test into username"
        # ----------------------------------------------------------------------
        type_match = re.match(
            r"^type\s+(?:['\"]?)(.+?)(?:['\"]?)\s+(?:into|in)\s+(?:the\s+)?(.+)$",
            task_clean,
            re.IGNORECASE,
        )
        if type_match:
            text_value = type_match.group(1)
            target_desc = type_match.group(2).strip()
            return self._plan_type(elements, text_value, target_desc)

        # ----------------------------------------------------------------------
        # Fallback: Unsupported task
        # ----------------------------------------------------------------------
        raise PlannerError(
            f"Unsupported task instruction: '{request.task}'. "
            "Deterministic mock planner only supports recognized click, scroll, select, and type patterns."
        )

    # --------------------------------------------------------------------------
    # Sub-handlers
    # --------------------------------------------------------------------------

    def _plan_click_login(self, elements: List[DOMElement]) -> ClickAction:
        """Find an appropriate login button in the supplied sanitized DOM."""
        candidates = []
        for el in elements:
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if "login" in text or "log in" in text or "login" in aria or "log in" in aria or "login" in el_id:
                candidates.append(el)

        if not candidates:
            raise PlannerError("Target element for login not found in sanitized DOM.")

        # Check visibility and enabled status
        for el in candidates:
            if not el.visible:
                raise PlannerError(f"Target element '{el.id}' for login is present in sanitized DOM but not visible.")
            if not el.enabled:
                raise PlannerError(f"Target element '{el.id}' for login is present in sanitized DOM but disabled.")
            return ClickAction(type="click", target=ElementTarget(elementId=el.id))

        raise PlannerError("Target element for login not found, not visible, or disabled in sanitized DOM.")

    def _plan_click_signup(self, elements: List[DOMElement]) -> ClickAction:
        """Find an appropriate signup/register button in the supplied sanitized DOM."""
        candidates = []
        for el in elements:
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if any(term in text or term in aria or term in el_id for term in ("signup", "sign up", "register")):
                candidates.append(el)

        if not candidates:
            raise PlannerError("Target element for signup not found in sanitized DOM.")

        for el in candidates:
            if not el.visible:
                raise PlannerError(f"Target element '{el.id}' for signup is present in sanitized DOM but not visible.")
            if not el.enabled:
                raise PlannerError(f"Target element '{el.id}' for signup is present in sanitized DOM but disabled.")
            return ClickAction(type="click", target=ElementTarget(elementId=el.id))

        raise PlannerError("Target element for signup not found, not visible, or disabled in sanitized DOM.")

    def _plan_click_by_label(self, elements: List[DOMElement], label: str) -> ClickAction:
        """Find a button matching visible text, aria-label, or id in supplied sanitized DOM."""
        candidates = []
        for el in elements:
            if not _is_button_like(el):
                continue
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if label in text or label in aria or label in el_id:
                candidates.append(el)

        if not candidates:
            raise PlannerError(f"Target button matching '{label}' not found in sanitized DOM.")

        for el in candidates:
            if not el.visible:
                raise PlannerError(f"Target button '{el.id}' matching '{label}' is not visible.")
            if not el.enabled:
                raise PlannerError(f"Target button '{el.id}' matching '{label}' is disabled.")
            return ClickAction(type="click", target=ElementTarget(elementId=el.id))

        raise PlannerError(f"Target button matching '{label}' not found, not visible, or disabled in sanitized DOM.")

    def _plan_select(self, elements: List[DOMElement], value: str) -> SelectAction:
        """Find a visible and enabled select element in the supplied sanitized DOM."""
        select_candidates = [el for el in elements if _is_select_like(el)]
        if not select_candidates:
            raise PlannerError("No suitable select element found in sanitized DOM.")

        for el in select_candidates:
            if not el.visible:
                continue
            if not el.enabled:
                continue
            if el.sensitive:
                continue
            return SelectAction(
                type="select",
                target=ElementTarget(elementId=el.id),
                value=value,
            )

        raise PlannerError("No suitable visible and enabled select element found in sanitized DOM.")

    def _plan_type(self, elements: List[DOMElement], value: str, target_desc: str) -> TypeAction:
        """Find a suitable non-sensitive input field in the supplied sanitized DOM.

        CRITICAL PRIVACY RULE:
        Never target password fields, sensitive fields, or leak sensitive values.
        """
        # Normalize target description keyword (strip words like "field", "input", "the", "box")
        cleaned_desc = re.sub(r"\b(the|field|input|box)\b", "", target_desc, flags=re.IGNORECASE).strip().lower()
        if not cleaned_desc:
            cleaned_desc = target_desc.lower()

        # Find candidate input elements
        candidates = []
        for el in elements:
            if not _is_input_like(el):
                continue
            el_id = el.id.lower()
            placeholder = (el.placeholder or "").lower()
            aria = (el.ariaLabel or "").lower()
            input_type = (el.inputType or "").lower()

            if (
                cleaned_desc in el_id
                or cleaned_desc in placeholder
                or cleaned_desc in aria
                or cleaned_desc in input_type
            ):
                candidates.append(el)

        # If no specific keyword match, fallback to the first input element if generic
        if not candidates and any(g in target_desc.lower() for g in ("input", "field", "textbox")):
            candidates = [el for el in elements if _is_input_like(el)]

        if not candidates:
            raise PlannerError(f"No input field matching '{target_desc}' found in sanitized DOM.")

        target_el = candidates[0]

        # Enforce strict privacy checks: REFUSE password or sensitive fields
        if target_el.sensitive:
            raise PlannerError("Refusing to type into sensitive field.")

        if (target_el.inputType or "").lower() == "password" or "password" in target_el.id.lower():
            raise PlannerError("Refusing to type into password field.")

        if not target_el.visible:
            raise PlannerError(f"Input field '{target_el.id}' is present in sanitized DOM but not visible.")

        if not target_el.enabled:
            raise PlannerError(f"Input field '{target_el.id}' is present in sanitized DOM but disabled.")

        return TypeAction(
            type="type",
            target=ElementTarget(elementId=target_el.id),
            value=value,
        )
