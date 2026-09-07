"""VLM provider interface and data models for RedactEye Agent Server.

===============================================================================
CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server or any VLM provider.
Only sanitized context (redacted DOM tokens, masked coordinates, and privacy
metadata) may be passed to any VLMProvider implementation.
===============================================================================
"""

from typing import Optional, Protocol, runtime_checkable
from pydantic import BaseModel, ConfigDict, Field

from app.models.plan import AgentAction, SanitizedContext


class VLMProviderError(Exception):
    """Exception raised when a VLM provider fails, times out, or produces invalid output."""


class VLMPlanOutput(BaseModel):
    """Structured planner output emitted by a VLM provider.

    Contains a candidate AgentAction adhering to packages/action-schema.
    Arbitrary Python code, JavaScript, shell commands, selectors, or XPath
    are strictly prohibited.
    """

    model_config = ConfigDict(extra="forbid")

    action: AgentAction
    explanation: Optional[str] = Field(
        default=None,
        description="Optional explanation or reasoning for the selected action (informational only; never executed).",
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional model confidence score between 0.0 and 1.0.",
    )


@runtime_checkable
class VLMProvider(Protocol):
    """Provider-agnostic interface for multimodal Vision-Language Models.

    Receives exclusively pre-sanitized browser context. Vendors (cloud or local)
    must implement this protocol to be used by VLMPlanner.
    """

    def generate_plan(self, context: SanitizedContext, task: str) -> VLMPlanOutput:
        """Generate a structured candidate action from sanitized context and task instruction."""
        ...
