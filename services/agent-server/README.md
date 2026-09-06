# RedactEye Agent Server (`services/agent-server`)

This service directory houses the backend server responsible for receiving sanitized browser context, executing Vision-Language Model (VLM) reasoning, and issuing structured browser actions.

## Ownership
- **Primary Owner:** Person 3 — Server / Agent / Evaluation

## Eventual Responsibilities
- FastAPI application backend and routing
- Ingestion and schema validation of sanitized context payloads (strictly no raw PII)
- Integration with cloud and hosted Vision-Language Models (VLMs) and LLMs
- Multi-step agent reasoning, task breakdown, and planning loops
- Structured action generation adhering strictly to `packages/action-schema`
- Action pre-validation and safety checks prior to client transmission
- Telemetry, latency logging, and execution observability
