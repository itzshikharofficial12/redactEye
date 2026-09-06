# @redact-eye/action-schema

This package defines the controlled action vocabulary and runtime validation protocol governing communication between the remote agent server and the local browser extension.

## 1. Purpose

`@redact-eye/action-schema` establishes a strict, constrained contract of permitted browser interactions.

In an agentic browser architecture, the remote agent server operates across a network boundary and must be treated as potentially untrusted. Arbitrary script execution (`eval`, `executeScript`, raw DOM commands) is intentionally forbidden. Instead, the agent is restricted to a small, deterministic vocabulary of structured browser actions.

> **Note:** This package defines and validates actions only. It contains no browser automation or execution runtime logic. The browser extension (`apps/extension/`) is solely responsible for executing validated actions.

---

## 2. Interaction Architecture

```text
Agent Server (Person 3)
     │
     │ Generates proposed action
     ▼
Raw JSON Payload
     │
     │ Received over network
     ▼
validateAgentAction() (packages/action-schema)
     │
     │ Strict runtime safety validation
     ▼
AgentAction (Validated Schema)
     │
     │ Dispatched to local executor
     ▼
Browser Extension (Person 1)
     │
     │ Safely performs DOM event
     ▼
Browser Window
```

---

## 3. Supported Action Vocabulary

The schema supports 5 structured action types:

### 1. `click`
Clicks a resolved DOM element by ID or directly via viewport pixel coordinates:

```json
{
  "type": "click",
  "target": {
    "elementId": "login-button"
  }
}
```

Or via coordinates:

```json
{
  "type": "click",
  "target": {
    "x": 350,
    "y": 520
  }
}
```

### 2. `scroll`
Scrolls the active viewport vertically:

```json
{
  "type": "scroll",
  "direction": "down",
  "amount": 500
}
```

*Constraints:* `direction` must be `"up"` or `"down"`. `amount` must be positive and bounded to a maximum of 1000 pixels per action.

### 3. `type`
Enters text into a targeted input element:

```json
{
  "type": "type",
  "target": {
    "elementId": "search-input"
  },
  "value": "RedactEye documentation"
}
```

*Constraints:* `value` must be a string bounded to at most 10,000 characters.

### 4. `select`
Chooses an option in a selectable DOM element (e.g. dropdowns, radio controls):

```json
{
  "type": "select",
  "target": {
    "elementId": "country-dropdown"
  },
  "value": "India"
}
```

### 5. `navigate`
Navigates the browser to a destination URL:

```json
{
  "type": "navigate",
  "url": "https://example.com/dashboard"
}
```

*Constraints:* Only `http://` and `https://` URLs are accepted.

---

## 4. Security & Runtime Validation

### Why TypeScript Interfaces Alone Are Insufficient

TypeScript type assertions only exist at compile time. At runtime, actions arrive across the network as raw JSON objects. To prevent injection attacks, bypasses, or corrupted payloads from crashing or exploiting the browser extension, every incoming payload **must be validated at runtime before execution**:

```typescript
import { validateAgentAction } from "@redact-eye/action-schema";

function onServerMessage(untrustedPayload: unknown) {
  if (!validateAgentAction(untrustedPayload)) {
    console.error("Rejected unauthorized or malformed action payload:", untrustedPayload);
    return {
      status: "failure",
      errorCode: "INVALID_ACTION",
      message: "Action payload failed runtime schema validation."
    };
  }

  // untrustedPayload is now safely narrowed to AgentAction
  return executeActionSafely(untrustedPayload);
}
```

### Protocol Restrictions
- **No Arbitrary Code:** Actions like `executeScript`, `eval`, `runCode`, or arbitrary CSS selectors/XPaths are strictly rejected.
- **Protocol Allowlist:** `navigate` strictly permits `http:` and `https:`. Malicious schemes like `javascript:`, `data:`, `file:`, `chrome:`, and `extension:` are blocked.
- **Bounds Checking:** Scroll magnitudes and typing lengths are bounded to prevent denial-of-service or memory exhaustion.
