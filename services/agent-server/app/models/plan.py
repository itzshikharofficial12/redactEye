"""Pydantic data models for RedactEye Agent Server planning and action schemas.

CRITICAL PRIVACY BOUNDARY:
RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.
These models represent downstream, pre-sanitized context payloads.
Raw input values (e.g. DOMElement.value), unmasked screenshots, image byte arrays,
and raw PII fields are strictly prohibited from this schema contract (enforced
via strict field definitions and extra='forbid').
"""

import math
from typing import Annotated, Any, List, Literal, Optional, Union
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ==============================================================================
# Context & Geometry Models
# ==============================================================================

class BoundingBox(BaseModel):
    """Standard 2D bounding box representing an element or detected region."""

    model_config = ConfigDict(extra="forbid")

    x: float
    y: float
    width: float
    height: float


class Viewport(BaseModel):
    """Viewport dimensions and scaling of the active browser window."""

    model_config = ConfigDict(extra="forbid")

    width: float = Field(gt=0, description="Positive viewport width in pixels")
    height: float = Field(gt=0, description="Positive viewport height in pixels")
    devicePixelRatio: Optional[float] = Field(
        default=None, gt=0, description="Optional positive device pixel ratio"
    )


DOMElementType = Literal[
    "button",
    "input",
    "textarea",
    "select",
    "checkbox",
    "radio",
    "link",
    "image",
    "text",
    "container",
    "unknown",
]


class DOMElement(BaseModel):
    """Sanitized representation of an extracted DOM element.

    CRITICAL PRIVACY INVARIANT:
    Raw element values ('value' attribute containing credentials, text inputs,
    credit card numbers, etc.) are strictly local-only and MUST NOT be accepted
    on the remote agent server.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, description="Non-empty element identifier")
    type: DOMElementType
    tagName: str = Field(min_length=1, description="Non-empty DOM tag name")
    role: Optional[str] = None
    text: Optional[str] = None
    ariaLabel: Optional[str] = None
    placeholder: Optional[str] = None
    inputType: Optional[str] = None
    bbox: BoundingBox
    visible: bool
    enabled: bool
    sensitive: Optional[bool] = None


class DOMSnapshot(BaseModel):
    """Snapshot of sanitized DOM elements."""

    model_config = ConfigDict(extra="forbid")

    elements: List[DOMElement]
    documentWidth: Optional[float] = None
    documentHeight: Optional[float] = None


class BrowserContext(BaseModel):
    """Active browser context state."""

    model_config = ConfigDict(extra="forbid")

    url: str
    title: str
    viewport: Viewport
    scrollX: float
    scrollY: float


class SensitiveRegion(BaseModel):
    """Classified sensitive region redacted by the client-side privacy engine."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, description="Non-empty identifier for detection")
    type: str
    bbox: BoundingBox
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence score between 0.0 and 1.0"
    )
    sources: List[str]
    redaction: Literal["blur", "mask", "remove"]


class PrivacyStatistics(BaseModel):
    """Aggregate statistics from the local privacy engine."""

    model_config = ConfigDict(extra="forbid")

    totalDetections: int = Field(ge=0)
    sensitiveDetections: int = Field(ge=0)
    redactedRegions: int = Field(ge=0)


class SanitizedContext(BaseModel):
    """Sanitized context payload safe for network transmission to the agent server.

    SECURITY / PRIVACY:
    Raw screenshots, image byte streams, and raw PII are strictly excluded.
    extra='forbid' ensures unauthorized fields are rejected immediately.
    """

    model_config = ConfigDict(extra="forbid")

    browser: BrowserContext
    sanitizedDom: Optional[DOMSnapshot] = None
    sensitiveRegions: List[SensitiveRegion] = Field(default_factory=list)
    statistics: PrivacyStatistics


class PlanRequest(BaseModel):
    """Request body for POST /api/plan."""

    model_config = ConfigDict(extra="forbid")

    task: str = Field(min_length=1, description="Non-empty task instruction")
    context: SanitizedContext

    @field_validator("task")
    @classmethod
    def validate_task_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Task cannot be empty or whitespace only")
        return trimmed


# ==============================================================================
# Action Models
# ==============================================================================

class ElementTarget(BaseModel):
    """Target referencing a DOM element by unique identifier."""

    model_config = ConfigDict(extra="forbid")

    elementId: str = Field(min_length=1, description="Non-empty element identifier")


class CoordinateTarget(BaseModel):
    """Target referencing explicit numeric viewport coordinates."""

    model_config = ConfigDict(extra="forbid")

    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def validate_finite_coordinate(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            raise ValueError("Coordinate values must be finite numbers")
        return v


ActionTarget = Union[ElementTarget, CoordinateTarget]


class ClickAction(BaseModel):
    """Click interaction targeting an element or viewport coordinate."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["click"] = "click"
    target: ActionTarget


class ScrollAction(BaseModel):
    """Scroll interaction specifying direction and displacement."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["scroll"] = "scroll"
    direction: Literal["up", "down"]
    amount: float = Field(gt=0, le=1000, description="Scroll displacement in pixels")


class TypeAction(BaseModel):
    """Text entry interaction targeting an input field."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["type"] = "type"
    target: ActionTarget
    value: str = Field(max_length=10000, description="Text value to enter")


class SelectAction(BaseModel):
    """Selection interaction targeting a selectable element."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["select"] = "select"
    target: ActionTarget
    value: str = Field(max_length=10000, description="Option value to select")


class NavigateAction(BaseModel):
    """Browser navigation action restricted to safe HTTP/HTTPS protocols."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["navigate"] = "navigate"
    url: str

    @field_validator("url")
    @classmethod
    def validate_safe_url(cls, v: str) -> str:
        trimmed = v.strip()
        parsed = urlparse(trimmed)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            raise ValueError(
                "Navigate URL must use http:// or https:// protocol with a valid host"
            )
        return trimmed


# Discriminated union of permissible agent actions
AgentAction = Annotated[
    Union[ClickAction, ScrollAction, TypeAction, SelectAction, NavigateAction],
    Field(discriminator="type"),
]


class PlanResponse(BaseModel):
    """Response returned by POST /api/plan."""

    model_config = ConfigDict(extra="forbid")

    action: AgentAction
