# RedactEye Agent Server — Application Core (`app/`)

This directory contains the Python application code for the `redact-eye-agent-server` FastAPI service.

## Critical Privacy Boundary

> **IMPORTANT:**
> **RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.**
> **Only sanitized context may be provided to a VLM provider.**

The RedactEye Agent Server is strictly designed to operate downstream of the client-side privacy engine (`packages/privacy-engine` and `packages/vision-engine`). All visual and textual inputs received by this service must be pre-sanitized on the client device:
- No raw screenshots or unmasked pixel data
- No unredacted DOM text or PII (credentials, tokens, card numbers, values)
- No arbitrary file upload endpoints
- **Zero-body logging:** Request bodies and context payloads must never be dumped into log streams or persistent logs

## Module Structure

```
app/
├── __init__.py       # Package marker
├── main.py           # FastAPI application instantiation, root route, and server runner
├── api/
│   ├── __init__.py   # API package marker
│   ├── health.py     # Health probe endpoint (GET /api/health)
│   └── plan.py       # Planning endpoint (POST /api/plan)
├── core/
│   ├── __init__.py   # Core package marker
│   └── config.py     # Environment configuration and privacy boundary declarations
├── models/
│   ├── __init__.py   # Models package marker
│   └── plan.py       # Pydantic schemas for SanitizedContext, PlanRequest, and AgentAction
├── planner/
│   ├── __init__.py   # Planner package marker and exports
│   ├── base.py       # Planner Protocol, BasePlanner ABC, and dependency injection provider
│   ├── mock.py       # Deterministic mock planner and server-side action validation
│   └── vlm.py        # VLMPlanner delegating to VLMProvider
└── vlm/
    ├── __init__.py   # VLM package marker and exports
    ├── base.py       # VLMProvider Protocol, VLMPlanOutput model, and VLMProviderError
    └── mock.py       # Deterministic MockVLMProvider
```

## Planner & VLM Architecture

```
Planner
 ├── MockPlanner
 └── VLMPlanner
       └── VLMProvider
             └── MockVLMProvider
```

- **`Planner` Protocol:** High-level planning interface consumed by the API layer (`POST /api/plan`).
- **`MockPlanner`:** Deterministic baseline planner.
- **`VLMPlanner`:** Planner implementation that delegates multimodal reasoning to a `VLMProvider` and runs defense-in-depth safety checks.
- **`VLMProvider` Protocol:** Vendor-agnostic interface for vision-language models. Accepts strictly `SanitizedContext`.
- **`MockVLMProvider`:** Deterministic provider for development and testing. Real cloud/local VLM providers will be added in a subsequent checkpoint.

## Current Endpoints

- `GET /`: Service metadata, version, and operational status
- `GET /api/health`: Health status probe for container orchestration / liveness checks
- `POST /api/plan`: Ingestion of sanitized context and task to produce validated browser action
