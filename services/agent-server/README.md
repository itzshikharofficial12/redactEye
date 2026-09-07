# RedactEye Agent Server (`services/agent-server`)

The **RedactEye Agent Server** is a minimal, production-oriented FastAPI backend service. In the RedactEye architecture, this service is responsible for downstream reasoning and planning: it receives pre-sanitized context from the local client extension and generates validated, structured browser actions.

> **CRITICAL PRIVACY BOUNDARY:**
>
> **RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.**
>
> All redaction, face blurring, text masking, and PII anonymization occur strictly on the client side (in-browser) before any payload leaves the client. This server operates exclusively downstream of the local privacy engine. Under no circumstances will raw screenshots, unmasked DOM trees, or sensitive PII ever be received, stored, or logged by this server.

---

## Current Status & Checkpoint

This service currently implements **Checkpoint 3**: an extensible, interface-driven planner architecture with:
- Abstract `Planner` protocol and base class (`app/planner/base.py`)
- FastAPI dependency injection / provider decoupling the API from planner implementations
- Deterministic `MockPlanner` with dynamic context-aware target selection
- Expanded deterministic task support: login, signup, button by visible text, bounded scrolling, select, and privacy-guarded type
- Strict server-side action validation and security guardrails
- Comprehensive test coverage for planner unit behavior, API endpoints, and privacy boundaries

---

## Architecture & Planner Interface

The agent server architecture strictly separates the API layer, the planning engine, and action execution.

### Current Architecture (Checkpoint 3)

```
API (POST /api/plan)
      ↓
Planner interface (app/planner/base.py: Planner Protocol)
      ↓
MockPlanner (app/planner/mock.py: deterministic context-aware matching)
      ↓
AgentAction (Pydantic discriminated union)
      ↓
Action validation (defense-in-depth safety guardrail)
      ↓
Client Browser Extension (local execution)
```

### Future Architecture (VLM Integration)

```
API (POST /api/plan)
      ↓
Planner interface (app/planner/base.py: Planner Protocol)
      ↓
VLMPlanner (future multimodal vision-language model integration)
      ↓
AgentAction (Pydantic discriminated union)
      ↓
Action validation (defense-in-depth safety guardrail)
      ↓
Client Browser Extension (local execution)
```

By decoupling the API layer from the planner implementation via the `Planner` abstraction (`Depends(get_planner)`), a future `VLMPlanner` can seamlessly replace or complement `MockPlanner` without altering route handlers or request/response contracts.

---

## Supported Deterministic Tasks in MockPlanner

`MockPlanner` performs deterministic, context-aware matching against the supplied `SanitizedContext`. It extracts element IDs directly from the client DOM snapshot (never returning hardcoded IDs):

1. **Click Login:**
   - Tasks: `"Click the login button"`, `"Find the login button and click it"`, `"Click login"`
   - Inspects `sanitizedDom.elements` for a visible, enabled button matching "login" or "log in" in text, aria-label, or id.
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="..."))`.
2. **Click Signup:**
   - Tasks: `"Click the signup button"`, `"Click sign up"`, `"Find the signup button"`
   - Inspects `sanitizedDom.elements` for a visible, enabled button matching "signup", "sign up", or "register".
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="..."))`.
3. **Click Button by Visible Text:**
   - Tasks: `"Click the Continue button"`, `"Click the Submit button"`, `"Click the Search button"`, `"Click Save"`
   - Identifies visible and enabled buttons where the label matches element text, aria-label, or id.
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="..."))`.
4. **Scroll Actions (Bounded):**
   - Tasks: `"Scroll down"`, `"Scroll up"`
   - Emits: `ScrollAction(type="scroll", direction="down"|"up", amount=500.0)`.
   - Scroll amount is strictly bounded (between 1 and 1000 pixels).
5. **Select Action:**
   - Tasks: `"Select India"`, `"Select option US"`
   - Inspects DOM for a visible, enabled `<select>` or dropdown element and targets its dynamic ID.
   - Emits: `SelectAction(type="select", target=ElementTarget(elementId="..."), value="India")`.
   - Fails safely with HTTP 422 if no suitable select element is present.
6. **Type Action (Strict Privacy Guardrails):**
   - Tasks: `"Type hello into the search field"`, `"Type John into username"`
   - Inspects DOM for a non-sensitive `<input>` or `<textarea>`.
   - **CRITICAL PRIVACY RULE:** The planner strictly REFUSES to target password fields (`inputType="password"`) or elements flagged `sensitive=True`.
   - Never leaks sensitive values in planner output, logs, or error details.

---

## Safe Failure Behavior & Security

1. **No Guessing or Invented Elements:** If a targeted element does not exist or is disabled/hidden in the sanitized DOM, the planner raises a controlled `PlannerError` which maps to HTTP 422 Unprocessable Entity.
2. **Unsupported Tasks:** Unsupported instructions (e.g. `"Delete my account"`, `"Transfer funds"`) fail safely with a controlled HTTP 422 error.
3. **No Arbitrary Script Execution:** The server schema and validator strictly prohibit `executeScript`, `eval`, `shell`, CSS selectors, and XPath execution.
4. **Protocol Whitelist:** Navigation actions are restricted strictly to `http://` and `https://` schemes (`javascript:`, `data:`, `file:` are rejected).
5. **No Execution on Server:** The server ONLY returns structured action JSON. The browser extension retains sole responsibility for executing actions locally in the browser tab.

---

## API Endpoints

- **`GET /`**: Service discovery metadata, version, and status.
- **`GET /api/health`**: Health and liveness probe.
- **`POST /api/plan`**: Ingestion of `PlanRequest` (`task` and `SanitizedContext`), returning validated `PlanResponse` (`action: AgentAction`).

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

Interactive OpenAPI documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Configuration Options

| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `redact-eye-agent-server` | Service identifier |
| `APP_VERSION` | `0.1.0` | Service version string |
| `HOST` | `0.0.0.0` | Host binding interface |
| `PORT` | `8000` | Port binding |
| `LOG_LEVEL` | `INFO` | Application log level (body logging prohibited) |

---

## Testing `POST /api/plan` (Synthetic Examples)

### Example 1: Click Button by Visible Text

```bash
curl -X POST "http://127.0.0.1:8000/api/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Click the Continue button",
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
            "id": "btn-step2-continue",
            "type": "button",
            "tagName": "button",
            "text": "Continue",
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
        ]
      },
      "sensitiveRegions": [],
      "statistics": {
        "totalDetections": 1,
        "sensitiveDetections": 0,
        "redactedRegions": 0
      }
    }
  }'
```

**Response (HTTP 200):**

```json
{
  "action": {
    "type": "click",
    "target": {
      "elementId": "btn-step2-continue"
    }
  }
}
```

### Example 2: Type into Non-Sensitive Search Input

```bash
curl -X POST "http://127.0.0.1:8000/api/plan" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Type hello into the search field",
    "context": {
      "browser": {
        "url": "https://demo.redacteye.local/search",
        "title": "Search",
        "viewport": { "width": 1280, "height": 800 },
        "scrollX": 0,
        "scrollY": 0
      },
      "sanitizedDom": {
        "elements": [
          {
            "id": "search-box",
            "type": "input",
            "tagName": "input",
            "placeholder": "Search items...",
            "inputType": "text",
            "bbox": { "x": 10, "y": 10, "width": 200, "height": 30 },
            "visible": true,
            "enabled": true,
            "sensitive": false
          }
        ]
      },
      "sensitiveRegions": [],
      "statistics": { "totalDetections": 1, "sensitiveDetections": 0, "redactedRegions": 0 }
    }
  }'
```

**Response (HTTP 200):**

```json
{
  "action": {
    "type": "type",
    "target": {
      "elementId": "search-box"
    },
    "value": "hello"
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
