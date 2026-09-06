# @redact-eye/shared-types

This package contains the common data contracts and type definitions used across the RedactEye system.

## 1. Purpose

`@redact-eye/shared-types` serves as the single source of truth for interfaces and data models shared between:
1. **Browser Extension** (`apps/extension/` & `packages/browser-utils/` — owned by Person 1)
2. **Local Vision & Privacy Engine** (`packages/vision-engine/` & `packages/privacy-engine/` — owned by Person 2)
3. **Agent Server & Evaluation** (`services/agent-server/` & `evaluation/` — owned by Person 3)

By establishing a rigid, typed contract at project inception, all three team members can develop their respective components concurrently with minimal Git conflicts and without waiting on other components.

> **Note:** This package defines type interfaces and contracts **only**. It contains no runtime detection models, OCR, face detection, redaction execution, browser automation, or agent server code.

---

## 2. What This Package Contains

| Module | Key Exports | Description |
|---|---|---|
| [`src/geometry.ts`](src/geometry.ts) | `BoundingBox`, `Point`, `Viewport` | 2D coordinates, element bounds, and viewport dimensions. |
| [`src/dom.ts`](src/dom.ts) | `DOMElement`, `DOMElementType`, `DOMSnapshot` | Extracted DOM interactive elements, layout bounds, and page structure snapshots. |
| [`src/browser.ts`](src/browser.ts) | `BrowserState` | Current active page URL, title, scroll offsets, viewport, and DOM snapshot (excludes raw image binaries). |
| [`src/detection.ts`](src/detection.ts) | `Detection`, `DetectionType`, `DetectionSource` | Perception outputs from OCR, face detection, UI models, regex heuristics, and detection fusion. |
| [`src/privacy.ts`](src/privacy.ts) | `SanitizedContext`, `SensitiveRegion`, `PrivacyStatistics`, `RedactionMethod` | Safe network egress context, redacted region coordinates, and privacy enforcement telemetry. |

---

## 3. Data Flow & Communication Contract

```text
Browser Extension (Person 1)
     │
     │ Extracts DOM + captures viewport
     ▼
BrowserState (packages/shared-types)
     │
     │ Analyzed locally on client
     ▼
Local Vision & Privacy Engine (Person 2)
     │
     │ Detects PII, masks faces, sanitizes DOM
     ▼
SanitizedContext (packages/shared-types)
     │
     │ Transmitted over network (strictly safe data)
     ▼
Agent Server / VLM (Person 3)
```

---

## 4. Fundamental Privacy Principle

> **CRITICAL RULE:**
>
> **RAW SCREENSHOT / RAW PII MUST NEVER BE SENT TO THE REMOTE AGENT.**

- `BrowserState` and `DOMElement` represent client-side page state. Form `value` attributes may temporarily exist on the client for perception, but must never be transmitted remotely without validation and sanitization.
- Screenshots and raw visual images are handled separately as client-side image streams and are strictly filtered by the local privacy engine.
- `SanitizedContext` contains strictly non-sensitive metadata, sanitized DOM elements, and masked region coordinates. It deliberately excludes `rawScreenshot`, `originalScreenshot`, `rawImage`, or `piiText` fields.

---

## 5. Usage Example

To import and use these shared types in other packages or services:

```typescript
import type {
  BrowserState,
  Detection,
  SensitiveRegion,
  SanitizedContext,
} from "@redact-eye/shared-types";

// Example: typing an outgoing sanitized context payload
function prepareSafePayload(context: SanitizedContext): string {
  return JSON.stringify(context);
}
```
