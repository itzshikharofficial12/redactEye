# Browser Utilities Package (`packages/browser-utils`)

This package provides browser-specific helper functions, local DOM snapshot extraction, visibility calculations, deterministic element ID generation/resolution, and local browser state/visible-viewport screenshot observation for the RedactEye browser agent.

## Features

- **Local DOM Snapshot Extraction (`extractDOMSnapshot`):** Converts live browser documents into structured `DOMSnapshot` data conforming to `@redact-eye/shared-types`.
- **Deterministic Stable Element IDs (`generateId` / `ElementIdGenerator`):** Assigns unique, collision-resistant element IDs (e.g. `button_submit`, `input_email`) that remain stable across unrelated DOM modifications.
- **Element Resolution (`resolveElement`):** Fast, reliable lookup mapping an `elementId` back to the live DOM element.
- **Local Browser State Extraction (`getBrowserState`):** Gathers active tab page metadata (`url`, `title`, `viewport`, `scrollX`, `scrollY`) combined with a sanitized `DOMSnapshot`.
- **Visible Viewport Screenshot Capture (`captureVisibleScreenshot`):** Safely invokes `chrome.tabs.captureVisibleTab` from extension background context to capture only the currently visible viewport.
- **Active Tab Observation Coordinator (`observeActiveTab`):** Extension background coordinator that queries the active tab, enforces safety on restricted internal pages, captures the visible viewport, requests the DOM state from the content script, and returns a combined `BrowserObservationResult`.

## Usage

```typescript
import {
  extractDOMSnapshot,
  resolveElement,
  getBrowserState,
  captureVisibleScreenshot,
  observeActiveTab,
} from '@redact-eye/browser-utils';

// 1. In Content Script: Extract complete local browser state
const browserState = getBrowserState({ doc: document, win: window });
console.log(browserState.url, browserState.viewport, browserState.dom);

// 2. In Background Script: Observe the active browser tab
const observation = await observeActiveTab();
if (observation.success) {
  console.log('Observed URL:', observation.state.url);
  console.log('Screenshot dimensions:', observation.screenshot.width, observation.screenshot.height);
} else {
  console.error('Observation error:', observation.code, observation.error);
}

// 3. Resolve an element by ID later for action targeting
const targetEl = resolveElement('button_submit', document);
```

## Privacy & Security Guarantees

- **100% Local Observation:** Screenshots and DOM snapshots are processed strictly in-memory on the local machine.
- **No Screenshot Transmission:** Screenshots are never uploaded, sent over the network, or exposed to unprivileged webpage scripts.
- **No Value Extraction:** Raw user input values from inputs and textareas are never collected (`value: undefined`).
- **Sensitive Control Flagging:** Password inputs and credential fields are marked with `sensitive: true`.
- **Zero Storage Ingestion:** Does NOT read `document.cookie`, `localStorage`, or `sessionStorage`.
- **Zero Network Code:** This package contains zero networking code (`fetch`, `XMLHttpRequest`, `WebSocket` are completely absent).
