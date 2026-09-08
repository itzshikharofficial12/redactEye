# Privacy Engine Package (`packages/privacy-engine`)

This package provides RedactEye's local, client-side PII detection, privacy rule evaluation, and privacy pipeline coordination.

## Architecture

The privacy engine is built as an extensible, multi-stage detection pipeline:

```
BrowserState (URL, Viewport, DOMSnapshot)
    ↓
PrivacyEngine
    ↓
PrivacyDetector[] (e.g. DomPrivacyDetector, future OcrPrivacyDetector, FaceDetector)
    ↓
Raw Detection[] (normalized type, bbox, confidence, sources: ["dom"])
    ↓
Deduplication & Conflict Resolution
    ↓
Final Detection[] (ready for future fusion & redaction passes)
```

## Detector API

### Primary Entry Point

```typescript
import { detectSensitiveRegions } from "@redact-eye/privacy-engine";

// Detect sensitive regions locally from BrowserState
const detections: Detection[] = detectSensitiveRegions(browserState);
```

### Extensible Pipeline Architecture

```typescript
import { PrivacyEngine, DomPrivacyDetector } from "@redact-eye/privacy-engine";

const engine = new PrivacyEngine([
  new DomPrivacyDetector(),
  // Future detectors can be registered here:
  // new OcrPrivacyDetector(),
  // new FacePrivacyDetector(),
]);

const detections = engine.detectSensitiveRegions(browserState);
```

## DOM Detection Rules

The engine implements deterministic, rule-based heuristics across DOM elements:

1. **Password (`type: "password"`):**
   - Flags elements with `inputType === "password"`, `sensitive === true`, or `autocomplete="current-password" / "new-password"`.
   - Keyword metadata matching `/(password|passwd|passphrase|pwd)/i`.
   - Confidence: `1.0` (explicit type/flag/autocomplete) or `0.9` (metadata match).

2. **Email (`type: "email"`):**
   - Flags elements with `inputType === "email"` or `autocomplete="email"`.
   - Semantic metadata (id, placeholder, aria-label) matching email patterns.
   - Confidence: `1.0` (explicit type/autocomplete) or `0.85` (semantic metadata).

3. **Phone (`type: "phone"`):**
   - Flags elements with `inputType === "tel"` or `autocomplete="tel" / "tel-*"`".
   - Semantic metadata matching phone/mobile/cell patterns.
   - Confidence: `1.0` (explicit type/autocomplete) or `0.85` (semantic metadata).

4. **Name (`type: "name"`):**
   - High-confidence semantic matches: `autocomplete="name"`, `"given-name"`, `"family-name"`, `"additional-name"`.
   - Explicit whole-word patterns (`full_name`, `first_name`, `last_name`) and phrases (`"Full Name"`, `"First Name"`, `"Your Name"`).
   - **False-Positive Safety:** Strictly excludes generic inputs (`Search`, `Title`, `Filter`, `Query`, `Comment`).
   - Confidence: `0.95` (autocomplete standards) or `0.85` (explicit name phrase).

## Bounding Boxes & Deduplication

- **Bounding Boxes:** Reuses `DOMElement.bbox` verbatim without coordinate transformation. Coordinates remain viewport-relative.
- **Deduplication:** When multiple signals detect the same element, the strongest confidence is retained. When conflicting PII types occur, priority resolution applies: `password > email > phone > name`.

## Privacy & Security Guarantees

- **Zero Input Value Ingestion:** Does NOT read or store `element.value` or `textarea.value`. The `text` field on detections is strictly `undefined`.
- **Zero Storage Access:** Does NOT access `document.cookie`, `localStorage`, or `sessionStorage`.
- **Zero Network Egress:** 100% client-side deterministic evaluation. Contains zero networking code (`fetch`, `XMLHttpRequest`, `WebSocket` are completely absent).

## Known Limitations

1. **DOM-Only Detection:** This checkpoint analyzes structured DOM metadata. Text rendered as pixel graphics, inside `<canvas>`, or within images is not inspected (OCR-based text detection will be integrated in a subsequent milestone).
2. **Name Heuristics:** Names are identified via standard HTML attributes (`autocomplete`, explicit placeholders, accessibility labels). Freeform text inputs without semantic name labels are not guessed to prevent false positives.
3. **Cross-Origin Iframes:** DOM extraction and privacy classification are limited to the accessible document frame hierarchy.
