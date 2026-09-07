"""Planner interface and abstraction for RedactEye Agent Server.

Architectural Rule:
API layer
    ↓
Planner interface
    ↓
Concrete planner (MockPlanner, VLMPlanner, etc.)

The API layer does not know whether the planner is a mock, a VLM, local, or remote.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional, Protocol, Union, runtime_checkable

from app.models.plan import AgentAction, PlanRequest, SanitizedContext


class PlannerError(Exception):
    """Exception raised when planning fails or an unsupported task is encountered."""


@runtime_checkable
class Planner(Protocol):
    """Protocol defining the interface for all RedactEye agent planners.

    Accepts either a PlanRequest or a (task, context) pair, and returns a validated AgentAction.
    """

    def plan(
        self,
        request: Union[PlanRequest, str],
        context: Optional[SanitizedContext] = None,
    ) -> AgentAction:
        """Generate a validated AgentAction from user task instruction and sanitized context."""
        ...


class BasePlanner(ABC):
    """Abstract base class for planners enforcing the Planner protocol."""

    @abstractmethod
    def plan(
        self,
        request: Union[PlanRequest, str],
        context: Optional[SanitizedContext] = None,
    ) -> AgentAction:
        """Generate a validated AgentAction from user task instruction and sanitized context."""
        pass


_current_planner: Optional[Planner] = None


def get_planner() -> Planner:
    """Return the currently configured Planner instance for FastAPI dependency injection.

    Defaults to MockPlanner if no custom planner has been registered.
    """
    global _current_planner
    if _current_planner is None:
        from app.planner.mock import MockPlanner

        _current_planner = MockPlanner()
    return _current_planner


def set_planner(planner: Optional[Planner]) -> None:
    """Set or override the active Planner instance (e.g. for testing or future VLM integration)."""
    global _current_planner
    _current_planner = planner


def reset_planner() -> None:
    """Reset the active planner back to default (lazy initialization)."""
    global _current_planner
    _current_planner = None


def create_vlm_planner(provider: Optional[Any] = None) -> Planner:
    """Factory creating a VLMPlanner instance with an optional custom provider."""
    from app.planner.vlm import VLMPlanner

    return VLMPlanner(provider=provider)

