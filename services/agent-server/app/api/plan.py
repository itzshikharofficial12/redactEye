"""Plan endpoint for RedactEye Agent Server.

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
This endpoint receives only pre-sanitized browser context and outputs
structured action objects. Request bodies, tasks, and context structures
MUST NEVER be logged.
"""

from fastapi import APIRouter, HTTPException, status

from app.models.plan import PlanRequest, PlanResponse
from app.planner.mock import MockPlanner, PlannerError, validate_agent_action

router = APIRouter(tags=["plan"])
planner = MockPlanner()


@router.post(
    "/plan",
    response_model=PlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate next structured agent action from sanitized context",
)
async def generate_plan(request: PlanRequest) -> PlanResponse:
    """Generate a deterministic browser action from pre-sanitized context.

    PRIVACY CONTRACT:
    - Never log request payload, task, or context.
    - Operates only on sanitized DOM and redacted metadata.
    - Server does NOT execute actions; returns structured data for local browser execution.
    """
    try:
        action = planner.plan(request)
        validate_agent_action(action)
        return PlanResponse(action=action)
    except PlannerError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
