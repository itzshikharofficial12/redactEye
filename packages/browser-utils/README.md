# Browser Utilities Package (`packages/browser-utils`)

This package provides browser-specific helper functions, local DOM snapshot extraction, visibility calculations, and deterministic element ID generation/resolution for the RedactEye browser agent.

## Features

- **Local DOM Snapshot Extraction (`extractDOMSnapshot`):** Converts live browser documents into structured `DOMSnapshot` data conforming to `@redact-eye/shared-types`.
- **Zero-Data Exfiltration:** Runs 100% locally in the browser. Never extracts `input.value`, `textarea.value`, passwords, cookies, or storage data.
- **Deterministic Stable Element IDs (`generateId` / `ElementIdGenerator`):** Assigns unique, collision-resistant element IDs (e.g. `button_submit`, `input_email`) that remain stable across unrelated DOM modifications.
- **Element Resolution (`resolveElement`):** Fast, reliable lookup mapping an `elementId` back to the live DOM element.
- **Semantic Mapping & Visibility:** Maps HTML and ARIA roles to standard `DOMElementType`, filters out hidden and zero-dimension elements, and computes viewport-relative bounding boxes.

## Usage

```typescript
import { extractDOMSnapshot, resolveElement } from '@redact-eye/browser-utils';

// Extract snapshot locally from current document
const snapshot = extractDOMSnapshot({ root: document });
console.log(snapshot.elements);

// Resolve an element by ID later for action targeting
const targetEl = resolveElement('button_submit', document);
```

## Privacy & Security Guarantees

- **No Value Extraction:** Raw user input values from inputs and textareas are never collected (`value: undefined`).
- **Sensitive Control Flagging:** Password inputs and credential fields are marked with `sensitive: true`.
- **No Network Requests:** This package contains zero networking code.
