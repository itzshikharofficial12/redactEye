# RedactEye Agent Server — Application Core (`app/`)

This directory contains the Python application code for the `redact-eye-agent-server` FastAPI service.

## Critical Privacy Boundary

> **IMPORTANT:**
> **RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.**

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
└── planner/
    ├── __init__.py   # Planner package marker
    └── mock.py       # Deterministic mock planner and server-side action validation
```

## Current Endpoints

- `GET /`: Service metadata, version, and operational status
- `GET /api/health`: Health status probe for container orchestration / liveness checks
- `POST /api/plan`: Ingestion of sanitized context and task to produce validated browser action
