# RedactEye Agent Server (`services/agent-server`)

The **RedactEye Agent Server** is a minimal, production-oriented FastAPI backend service. In the RedactEye architecture, this service is responsible for downstream reasoning and planning: it receives pre-sanitized context from the local client extension and generates validated, structured browser actions.

> **CRITICAL PRIVACY BOUNDARY:**
>
> **RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.**
>
> All redaction, face blurring, text masking, and PII anonymization occur strictly on the client side (in-browser) before any payload leaves the client. This server operates exclusively downstream of the local privacy engine. Under no circumstances will raw screenshots, unmasked DOM trees, or sensitive PII ever be received, stored, or logged by this server.

---

## Current Status & Checkpoint

This service currently implements **Checkpoint 2**: the foundational agent-planning API with Pydantic request validation, a deterministic mock planner, server-side action validation, and health endpoints.

### Current Endpoints

- **`GET /`**
  Returns service identification, version, and operational status.
  ```json
  {
    "service": "redact-eye-agent-server",
    "version": "0.1.0",
    "status": "ok"
  }
  ```

- **`GET /api/health`**
  Liveness and health check endpoint for monitoring and container orchestration.
  ```json
  {
    "status": "ok",
    "service": "redact-eye-agent-server"
  }
  ```

- **`POST /api/plan`**
  Receives a sanitized browser context and task instruction, and returns the next structured browser action.
  - **Request Body:** `PlanRequest` (`task: str`, `context: SanitizedContext`)
  - **Response Body:** `PlanResponse` (`action: AgentAction`)

---

## Architecture & Data Flow

```
Local Browser / Extension (Client)
   │  1. Extract DOM & Capture Screen
   │  2. Local Privacy Engine sanitizes DOM and blurs visual PII
   ▼
SanitizedContext (Strictly zero raw PII / zero raw screenshots)
   │
   ▼ HTTP POST /api/plan
RedactEye Agent Server
   ├── 1. Pydantic schema validation (extra="forbid" rejects raw fields)
   ├── 2. Planner reasoning (Deterministic mock planner in Checkpoint 2)
   ├── 3. Server-side action safety check (blocks arbitrary scripts/schemes)
   └── 4. Returns structured AgentAction (JSON)
   │
   ▼
Local Browser Extension
   └── Local Browser Action Executor executes action locally (click, scroll, type, etc.)
```

### Important Architectural Rules

1. **Only Sanitized Context Reaches the Server:** Raw screenshots, binary image buffers, DOMElement `.value` fields, and raw PII are strictly excluded by the schema contract (`extra="forbid"`).
2. **Current Planner is Deterministic / Mock:** In Checkpoint 2, a deterministic mock planner is used to prove end-to-end contract compliance. A real Vision-Language Model (VLM) will be integrated in subsequent milestones.
3. **Structured Data Only:** The server generates and returns structured action JSON. It does **NOT** execute any browser action or script on the server.
4. **Local Browser Execution:** The client-side browser extension remains entirely responsible for executing the returned action locally in the browser tab.

---

## Privacy & Security Architecture

1. **No Raw Media Endpoints:** The server does not expose endpoints that accept raw image files, arbitrary file uploads, or multipart screen captures.
2. **Zero-Body Logging:** Request bodies containing sanitized context are never dumped to stdout, stderr, or persistent log stores.
3. **Strict Action Guardrails:** Prohibits dangerous actions (`executeScript`, `eval`, `shell`, CSS/XPath execution) and restricts navigation URLs strictly to `http://` and `https://` protocols.
4. **Downstream Isolation:** The server processes only sanitized abstractions (`SanitizedContext`: redacted text tokens, bounding boxes, and detection metadata).

---

## Future Responsibilities (Planned for Subsequent Milestones)

The following components and capabilities are planned for future checkpoints and are **NOT** implemented yet:

- **Vision-Language Model (VLM) Integration:** Connecting to hosted/cloud multimodal VLMs to reason over blurred screenshots and structured DOM features.
- **Dynamic Multi-Step Agent Planning:** Dynamic reasoning loops that decompose complex multi-page workflows into action sequences.
- **Evaluation Pipeline:** Benchmarks and automated testing against `evaluation/` datasets to quantify accuracy, token usage, latency, and privacy compliance.

---

## Installation & Setup

### Prerequisites

- Python 3.10+
- Virtual environment tool (`venv`)

### 1. Create and Activate a Virtual Environment

From `services/agent-server`:

```bash
cd services/agent-server
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

Install the minimal production and test dependencies:

```bash
pip install -r requirements.txt
```

---

## Running Locally

### Development Server with Uvicorn

From `services/agent-server`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or run via the Python entry point:

```bash
python -m app.main
```

The interactive OpenAPI documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Configuration Options

Configuration is managed via standard environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `redact-eye-agent-server` | Service identifier |
| `APP_VERSION` | `0.1.0` | Service version string |
| `HOST` | `0.0.0.0` | Host binding interface |
| `PORT` | `8000` | Port binding |
| `LOG_LEVEL` | `INFO` | Application log level (body logging prohibited) |

Example:

```bash
PORT=8080 LOG_LEVEL=DEBUG uvicorn app.main:app
```

---

## Testing `POST /api/plan` (Synthetic Example)

You can test the planner using the following synthetic `curl` command:

```bash
curl -X POST "http://127.0.0.1:8000/api/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Click the login button",
    "context": {
      "browser": {
        "url": "https://demo.redacteye.local/portal",
        "title": "Synthetic Demo Portal",
        "viewport": {
          "width": 1280.0,
          "height": 800.0,
          "devicePixelRatio": 1.0
        },
        "scrollX": 0.0,
        "scrollY": 0.0
      },
      "sanitizedDom": {
        "elements": [
          {
            "id": "login-button",
            "type": "button",
            "tagName": "button",
            "text": "Log In",
            "role": "button",
            "ariaLabel": "Log in to your synthetic account",
            "bbox": {
              "x": 120.0,
              "y": 340.0,
              "width": 100.0,
              "height": 36.0
            },
            "visible": true,
            "enabled": true,
            "sensitive": false
          }
        ],
        "documentWidth": 1280.0,
        "documentHeight": 1800.0
      },
      "sensitiveRegions": [
        {
          "id": "synth-mask-01",
          "type": "password",
          "bbox": {
            "x": 120.0,
            "y": 280.0,
            "width": 240.0,
            "height": 32.0
          },
          "confidence": 0.99,
          "sources": ["dom", "ui_model"],
          "redaction": "mask"
        }
      ],
      "statistics": {
        "totalDetections": 4,
        "sensitiveDetections": 1,
        "redactedRegions": 1
      }
    }
  }'
```

**Expected Response (HTTP 200):**

```json
{
  "action": {
    "type": "click",
    "target": {
      "elementId": "login-button"
    }
  }
}
```

---

## Running Tests

From `services/agent-server`, execute `pytest`:

```bash
pytest
```

Or with verbose output:

```bash
pytest -v
```
