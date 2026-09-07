"""VLM-based planner implementation for RedactEye Agent Server (Checkpoint 4).

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to any VLM provider.
Only sanitized context may be forwarded downstream.
The planner performs defense-in-depth validation on candidate actions emitted by
the VLM provider before returning them to the client.
"""

from typing import List, Optional, Union

from app.models.plan import (
    AgentAction,
    DOMElement,
    ElementTarget,
    NavigateAction,
    PlanRequest,
    SanitizedContext,
    SelectAction,
    TypeAction,
)
from app.planner.base import BasePlanner, PlannerError
from app.planner.mock import validate_agent_action
from app.vlm.base import VLMPlanOutput, VLMProvider, VLMProviderError
from app.vlm.mock import MockVLMProvider


class VLMPlanner(BasePlanner):
    """Planner that delegates reasoning to a pluggable VLMProvider."""

    def __init__(self, provider: Optional[VLMProvider] = None) -> None:
        """Initialize VLMPlanner with a VLMProvider (defaults to MockVLMProvider)."""
        self.provider: VLMProvider = provider if provider is not None else MockVLMProvider()

    def plan(
        self,
        request: Union[PlanRequest, str],
        context: Optional[SanitizedContext] = None,
    ) -> AgentAction:
        """Generate a validated AgentAction by querying the VLMProvider and enforcing safety rules."""
        plan_req = self._resolve_request(request, context)
        action = self._plan_with_provider(plan_req)
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

    def _plan_with_provider(self, request: PlanRequest) -> AgentAction:
        """Invoke provider and apply strict semantic, context, and privacy validations."""
        try:
            output: VLMPlanOutput = self.provider.generate_plan(
                request.context,
                request.task,
            )
        except VLMProviderError as e:
            raise PlannerError(f"VLM provider planning failure: {e}") from e
        except Exception as e:
            raise PlannerError(f"Unexpected error in VLM provider: {e}") from e

        if not hasattr(output, "action") or output.action is None:
            raise PlannerError("VLM provider produced invalid or empty action output.")

        candidate_action: AgentAction = output.action

        # Validate target against sanitized DOM
        self._validate_dom_target(candidate_action, request.context)

        return candidate_action

    def _validate_dom_target(
        self,
        action: AgentAction,
        context: SanitizedContext,
    ) -> None:
        """Verify element existence, visibility, enabled status, and privacy constraints."""
        target = getattr(action, "target", None)
        if isinstance(target, ElementTarget):
            element_id = target.elementId
            dom = context.sanitizedDom
            elements: List[DOMElement] = dom.elements if dom and dom.elements else []

            target_el = next((el for el in elements if el.id == element_id), None)
            if not target_el:
                raise PlannerError(
                    f"Target element '{element_id}' referenced by VLM action not found in sanitized DOM."
                )

            if not target_el.visible:
                raise PlannerError(
                    f"Target element '{element_id}' referenced by VLM action is present in sanitized DOM but not visible."
                )

            if not target_el.enabled:
                raise PlannerError(
                    f"Target element '{element_id}' referenced by VLM action is present in sanitized DOM but disabled."
                )

            # Strict privacy check for TypeAction
            if isinstance(action, TypeAction):
                if target_el.sensitive:
                    raise PlannerError("Refusing to type into sensitive field.")
                if (target_el.inputType or "").lower() == "password" or "password" in target_el.id.lower():
                    raise PlannerError("Refusing to type into password field.")

            # Strict privacy check for SelectAction
            if isinstance(action, SelectAction):
                if target_el.sensitive:
                    raise PlannerError("Refusing to select sensitive element.")
