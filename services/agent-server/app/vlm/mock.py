"""Deterministic Mock VLM Provider for RedactEye Agent Server.

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to or handled by this provider.
Operates exclusively on SanitizedContext.
"""

import re
from typing import List, Optional

from app.models.plan import (
    ClickAction,
    DOMElement,
    ElementTarget,
    SanitizedContext,
    ScrollAction,
    SelectAction,
    TypeAction,
)
from app.vlm.base import VLMPlanOutput, VLMProvider, VLMProviderError


def _is_button(el: DOMElement) -> bool:
    return (
        el.type in ("button", "link")
        or el.tagName.lower() in ("button", "a")
        or (el.role is not None and el.role.lower() in ("button", "link"))
    )


def _is_input(el: DOMElement) -> bool:
    return (
        el.type in ("input", "textarea")
        or el.tagName.lower() in ("input", "textarea")
        or (el.role is not None and el.role.lower() in ("textbox", "searchbox"))
    )


def _is_select(el: DOMElement) -> bool:
    return (
        el.type == "select"
        or el.tagName.lower() == "select"
        or (el.role is not None and el.role.lower() in ("combobox", "listbox", "select"))
    )


class MockVLMProvider(VLMProvider):
    """Deterministic mock implementation of VLMProvider for development and testing."""

    def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
        """Generate structured candidate action using sanitized DOM context."""
        task_clean = task.strip()
        task_lower = task_clean.lower()
        dom = context.sanitizedDom
        elements: List[DOMElement] = dom.elements if dom and dom.elements else []

        # 1. Scroll actions
        if "scroll down" in task_lower:
            return VLMPlanOutput(
                action=ScrollAction(type="scroll", direction="down", amount=500.0),
                explanation="Detected scroll down intent",
                confidence=0.95,
            )

        if "scroll up" in task_lower:
            return VLMPlanOutput(
                action=ScrollAction(type="scroll", direction="up", amount=500.0),
                explanation="Detected scroll up intent",
                confidence=0.95,
            )

        # 2. Click login button
        if "login" in task_lower and any(w in task_lower for w in ("click", "find", "press", "tap")):
            el = self._find_login_element(elements)
            if not el:
                raise VLMProviderError("Target element for login not found in sanitized DOM.")
            return VLMPlanOutput(
                action=ClickAction(type="click", target=ElementTarget(elementId=el.id)),
                explanation=f"Identified login element '{el.id}'",
                confidence=0.98,
            )

        # 3. Click signup button
        if any(term in task_lower for term in ("signup", "sign up", "register")) and any(
            w in task_lower for w in ("click", "find", "press", "tap")
        ):
            el = self._find_signup_element(elements)
            if not el:
                raise VLMProviderError("Target element for signup not found in sanitized DOM.")
            return VLMPlanOutput(
                action=ClickAction(type="click", target=ElementTarget(elementId=el.id)),
                explanation=f"Identified signup element '{el.id}'",
                confidence=0.97,
            )

        # 4. Click button by visible text / label (e.g. "Click the Continue button", "Click Submit")
        btn_match = re.match(
            r"^(?:click|find|press|tap)\s+(?:the\s+)?(.+?)(?:\s+button)?(?:\s+and\s+click\s+it)?$",
            task_lower,
        )
        if btn_match:
            label = btn_match.group(1).strip()
            if label and label not in ("it", "button", "link"):
                el = self._find_button_by_label(elements, label)
                if not el:
                    raise VLMProviderError(f"Target button matching '{label}' not found in sanitized DOM.")
                return VLMPlanOutput(
                    action=ClickAction(type="click", target=ElementTarget(elementId=el.id)),
                    explanation=f"Identified button '{el.id}' matching label '{label}'",
                    confidence=0.96,
                )

        # 5. Select action (e.g. "Select India", "Select option US")
        select_match = re.match(r"^select\s+(?:option\s+)?(.+)$", task_clean, re.IGNORECASE)
        if select_match:
            value = select_match.group(1).strip()
            el = self._find_select_element(elements)
            if not el:
                raise VLMProviderError("No suitable select element found in sanitized DOM.")
            return VLMPlanOutput(
                action=SelectAction(type="select", target=ElementTarget(elementId=el.id), value=value),
                explanation=f"Identified dropdown element '{el.id}' for selection",
                confidence=0.94,
            )

        # 6. Type action (e.g. "Type hello into the search field", "Type into the name field")
        type_match = re.match(
            r"^type\s+(?:['\"]?)(.+?)(?:['\"]?)\s+(?:into|in)\s+(?:the\s+)?(.+)$",
            task_clean,
            re.IGNORECASE,
        )
        if type_match:
            val = type_match.group(1)
            target_desc = type_match.group(2).strip()
            el = self._find_input_element(elements, target_desc)
            if not el:
                raise VLMProviderError(f"No input field matching '{target_desc}' found in sanitized DOM.")
            return VLMPlanOutput(
                action=TypeAction(type="type", target=ElementTarget(elementId=el.id), value=val),
                explanation=f"Identified input element '{el.id}' for typing",
                confidence=0.93,
            )

        # Fallback for generic "Type into the <target> field" without value specified
        type_into_match = re.match(
            r"^type\s+into\s+(?:the\s+)?(.+?)(?:\s+field|\s+input|\s+box)?$",
            task_clean,
            re.IGNORECASE,
        )
        if type_into_match:
            target_desc = type_into_match.group(1).strip()
            el = self._find_input_element(elements, target_desc)
            if not el:
                raise VLMProviderError(f"No input field matching '{target_desc}' found in sanitized DOM.")
            default_val = "Jane Doe" if "name" in target_desc.lower() else "synthetic_query"
            return VLMPlanOutput(
                action=TypeAction(type="type", target=ElementTarget(elementId=el.id), value=default_val),
                explanation=f"Identified input element '{el.id}' for typing",
                confidence=0.90,
            )

        raise VLMProviderError(f"MockVLMProvider unsupported task pattern: '{task}'")

    def _find_login_element(self, elements: List[DOMElement]) -> Optional[DOMElement]:
        for el in elements:
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if "login" in text or "log in" in text or "login" in aria or "log in" in aria or "login" in el_id:
                return el
        return None

    def _find_signup_element(self, elements: List[DOMElement]) -> Optional[DOMElement]:
        for el in elements:
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if any(term in text or term in aria or term in el_id for term in ("signup", "sign up", "register")):
                return el
        return None

    def _find_button_by_label(self, elements: List[DOMElement], label: str) -> Optional[DOMElement]:
        for el in elements:
            if not _is_button(el):
                continue
            text = (el.text or "").lower()
            aria = (el.ariaLabel or "").lower()
            el_id = el.id.lower()
            if label in text or label in aria or label in el_id:
                return el
        return None

    def _find_select_element(self, elements: List[DOMElement]) -> Optional[DOMElement]:
        for el in elements:
            if _is_select(el):
                return el
        return None

    def _find_input_element(self, elements: List[DOMElement], target_desc: str) -> Optional[DOMElement]:
        cleaned = re.sub(r"\b(the|field|input|box)\b", "", target_desc, flags=re.IGNORECASE).strip().lower()
        if not cleaned:
            cleaned = target_desc.lower()

        for el in elements:
            if not _is_input(el):
                continue
            el_id = el.id.lower()
            placeholder = (el.placeholder or "").lower()
            aria = (el.ariaLabel or "").lower()
            input_type = (el.inputType or "").lower()

            if cleaned in el_id or cleaned in placeholder or cleaned in aria or cleaned in input_type:
                return el

        # Fallback to first input element if general description
        for el in elements:
            if _is_input(el):
                return el
        return None
