# RedactEye Agent Server (`services/agent-server`)

The **RedactEye Agent Server** is a minimal, production-oriented FastAPI backend service. In the RedactEye architecture, this service is responsible for downstream reasoning and planning: it receives pre-sanitized context from the local client extension and generates validated, structured browser actions.

> **CRITICAL PRIVACY BOUNDARY:**
>
> **RAW SCREENSHOT / RAW PII MUST NEVER be sent to this server.**
> **Only sanitized context may be provided to a VLM provider.**
>
> All redaction, face blurring, text masking, and PII anonymization occur strictly on the client side (in-browser) before any payload leaves the client. This server operates exclusively downstream of the local privacy engine. Under no circumstances will raw screenshots, unmasked DOM trees, or sensitive PII ever be received, stored, or logged by this server or forwarded to any VLM provider.

---

## Current Status & Checkpoint

This service currently implements **Checkpoint 4: VLM Planner Architecture**, introducing a vendor-agnostic vision-language model provider interface, `VLMPlanner`, and `MockVLMProvider`.

### Architectural Hierarchy

```
Planner (app/planner/base.py)
 ├── MockPlanner (app/planner/mock.py: deterministic local planner, default)
 └── VLMPlanner (app/planner/vlm.py: multimodal reasoning delegate)
       └── VLMProvider (app/vlm/base.py: provider interface)
             └── MockVLMProvider (app/vlm/mock.py: deterministic mock provider)
```

---

## Architecture & Data Flow

```
POST /api/plan
    ↓
Planner interface (app/planner/base.py: Planner Protocol)
    ↓
VLMPlanner (or MockPlanner)
    ↓
VLMProvider (generate_plan)
    ↓
structured AgentAction
    ↓
Action validation (defense-in-depth safety guardrail)
    ↓
Client Browser Extension (local execution)
```

### Key Architectural Rules

1. **Only Sanitized Context May Reach Providers:** Both `MockPlanner` and `VLMPlanner` (via `VLMProvider`) operate strictly on `SanitizedContext`. Raw screenshots, image byte arrays, unredacted passwords, cookies, session tokens, and raw DOM values are forbidden by the contract (`extra="forbid"`).
2. **Provider Agnostic:** `VLMProvider` is an abstract protocol with a single method: `generate_plan(context: SanitizedContext, task: str) -> VLMPlanOutput`. It is completely decoupled from specific AI vendors (Gemini, OpenAI, Anthropic, Qwen, etc.).
3. **Structured Output Only:** Providers return `VLMPlanOutput`, containing a candidate `AgentAction` and optional informational metadata (`explanation`, `confidence`). Free-form code, JavaScript, and shell commands are prohibited.
4. **Defense-in-Depth Action Validation:** All candidate actions emitted by any planner or provider are validated against the DOM and run through `validate_agent_action`.
5. **Default Production Planner:** `MockPlanner` remains the default planner at runtime to ensure rock-solid stability and zero external network calls. `VLMPlanner` with `MockVLMProvider` is fully supported and injectible via FastAPI dependency injection or `set_planner`.
6. **Real Provider Milestone:** Concrete cloud/local VLM connections (e.g. cloud multimodal APIs or ONNX Runtime inference) will be added in a subsequent checkpoint.

---

## Supported Task Patterns (MockPlanner & MockVLMProvider)

Both planners handle deterministic task patterns dynamically from the supplied sanitized DOM:

1. **Click Login:**
   - Tasks: `"Click the login button"`, `"Find the login button and click it"`, `"Click login"`
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="<matched_id>"))`.
2. **Click Signup:**
   - Tasks: `"Click the signup button"`, `"Click sign up"`, `"Find the signup button"`
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="<matched_id>"))`.
3. **Click Button by Visible Text:**
   - Tasks: `"Click the Continue button"`, `"Click the Submit button"`, `"Click Search"`, `"Click Save"`
   - Emits: `ClickAction(type="click", target=ElementTarget(elementId="<matched_id>"))`.
4. **Bounded Scroll:**
   - Tasks: `"Scroll down"`, `"Scroll up"`
   - Emits: `ScrollAction(type="scroll", direction="down"|"up", amount=500.0)`.
5. **Select Option:**
   - Tasks: `"Select India"`, `"Select option US"`
   - Emits: `SelectAction(type="select", target=ElementTarget(elementId="<select_id>"), value="India")`.
6. **Type (Non-Sensitive Input Only):**
   - Tasks: `"Type hello into the search field"`, `"Type into the name field"`
   - Emits: `TypeAction(type="type", target=ElementTarget(elementId="<input_id>"), value="...")`.
   - **PRIVACY RULE:** Refuses to type into password fields (`inputType="password"`) or elements marked `sensitive=True`.

---

## Safe Failure Behavior & Security

1. **No Guessing or Invented Targets:** If a targeted element does not exist or is disabled/hidden in the sanitized DOM, the planner raises a controlled `PlannerError` (HTTP 422 Unprocessable Entity).
2. **Unsupported Tasks:** Unsupported instructions (e.g. `"Delete my account"`, `"Transfer funds"`) fail safely with a controlled HTTP 422 error.
3. **No Arbitrary Script Execution:** The schema and validator strictly prohibit `executeScript`, `eval`, `shell`, `command`, CSS selectors, and XPath execution.
4. **Protocol Whitelist:** Navigation actions are restricted strictly to `http://` and `https://` schemes (`javascript:`, `data:`, `file:` are rejected).
5. **Zero Execution on Server:** The server ONLY returns structured action JSON. The browser extension executes actions locally in the active tab.

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

### Example: Click Button by Visible Text

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
