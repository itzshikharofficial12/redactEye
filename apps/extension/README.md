# RedactEye Browser Extension (`apps/extension`)

This application directory houses the Chrome Manifest V3 browser extension for RedactEye, built using **TypeScript**, **React**, and **WXT**.

## Current Status (Checkpoint 8: Local Privacy Engine Foundation + DOM-Based PII Detection)

The extension provides:
1. **Chrome Side Panel UI Shell:** Persistent, native right-side panel with clean, minimal light styling, composer, task suggestions, and local state management.
2. **Local DOM Extraction & Element Resolution:** Content script observing active browser pages via `@redact-eye/browser-utils`. Extracts structural `DOMSnapshot` data conforming to `@redact-eye/shared-types`.
3. **Deterministic Element IDs:** Assigns unique, safe, collision-resistant IDs (`button_submit`, `input_email`) and supports deterministic resolution (`resolveElement(id)`).
4. **Local Browser State & Visible Screenshot Observation:** Background service worker coordinates observing the current active tab upon receiving `GET_BROWSER_STATE` (captures visible viewport and local page state).
5. **Local Privacy Engine Integration:** Background service worker coordinates local PII detection upon receiving `DETECT_SENSITIVE_REGIONS` via `@redact-eye/privacy-engine`:
   - Evaluates active tab's `BrowserState` locally.
   - Identifies sensitive DOM elements (`password`, `email`, `phone`, `name`) with deterministic confidence and bounding boxes.
   - Returns structured `Detection[]` with zero network egress.

> **IMPORTANT SCOPE & PRIVACY NOTICE:**
> - **100% Local Evaluation:** Detection and privacy analysis occur entirely inside the extension context.
> - **No Raw Input Values Extracted:** User-entered values from inputs and textareas are never collected (`value: undefined`). Sensitive detection objects do not contain raw values.
> - **No Storage/Cookie Access:** Does not read `document.cookie`, `localStorage`, or `sessionStorage`.
> - **Zero Network Requests:** No data is sent over the network or transmitted to any backend.
> - **Deferred Features:** OCR, face detection, visual image redaction, VLM/agent planning, and browser action execution are **intentionally deferred to subsequent checkpoints**.

---

## Architecture & Structure

```
apps/extension/
├── public/
│   └── icon.svg                      # Extension icon
├── src/
│   ├── components/
│   │   ├── Header.tsx                # App title, logo, status dot, menu button
│   │   ├── EmptyState.tsx            # Contextual greeting & prompt
│   │   ├── TaskSuggestions.tsx       # Quick-start task suggestion buttons
│   │   ├── PrivacyStatus.tsx         # Persistent privacy indicator
│   │   └── Composer.tsx              # Input field & submission button
│   └── entrypoints/
│       ├── background.ts             # Service worker handling observation & DETECT_SENSITIVE_REGIONS
│       ├── content.ts                # Content script exposing local DOM & browser state
│       └── sidepanel/
│           ├── index.html            # Side panel HTML entrypoint
│           ├── main.tsx              # React mounting script
│           ├── style.css             # Light, minimal, accessible CSS styles
│           └── App.tsx               # Root component & local state machine
├── tests/
│   ├── privacy-engine.test.ts        # Checkpoint 8 privacy engine & PII detection tests
│   ├── browser-state.test.ts         # Checkpoint 7 browser state, screenshot & coordinator tests
│   ├── dom-extraction.test.ts        # Checkpoint 6 DOM extraction, security, stability & resolution tests
│   └── sidepanel.test.tsx            # Checkpoint 5 side panel UI component tests
├── wxt.config.ts                     # WXT Manifest V3 configuration (aliases, permissions)
├── vitest.config.ts                  # Vitest configuration (jsdom)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Manifest V3, Permissions & Messaging Boundary

The extension uses Chrome Manifest V3:
- `permissions: ["sidePanel", "activeTab"]`:
  - `sidePanel`: Native Chrome Side Panel support.
  - `activeTab`: Allows capturing the visible viewport of the active tab (`captureVisibleTab`) and accessing tab metadata when invoked.
- `background.ts`:
  - Configures `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
  - Handles extension-internal message `GET_BROWSER_STATE`:
    1. Queries active tab in current window.
    2. Enforces restrictions on internal browser pages (`chrome://`, `devtools://`, etc.).
    3. Captures visible viewport screenshot via `chrome.tabs.captureVisibleTab()`.
    4. Requests local `BrowserState` from the active tab's content script (`GET_BROWSER_STATE`).
    5. Returns structured `{ success: true, state, screenshot, tabId }`.
  - Handles extension-internal message `DETECT_SENSITIVE_REGIONS`:
    1. Obtains active tab browser state.
    2. Runs `@redact-eye/privacy-engine`'s `detectSensitiveRegions(state)` locally.
    3. Returns structured `{ success: true, detections, state }`.
- `content.ts`: Injected into web pages (`<all_urls>`) to handle extension-internal runtime messages:
  - `GET_BROWSER_STATE` $\rightarrow$ returns metadata + `DOMSnapshot`.
  - `GET_DOM_SNAPSHOT` $\rightarrow$ returns `DOMSnapshot`.
  - `RESOLVE_ELEMENT` $\rightarrow$ resolves an element ID to live DOM node.

---

## Development & Build Instructions

### Prerequisites
- Node.js >= 18.0.0 (Node 20+ recommended)
- npm >= 9.0.0

### Install Dependencies
```bash
cd apps/extension
npm install
```

### Typecheck & Run Tests
```bash
npm run typecheck
npm test
```

### Build for Production
```bash
npm run build
```
The compiled extension output will be placed in `.output/chrome-mv3/`.

### Development Mode with Live Reload
```bash
npm run dev
```

---

## Loading the Extension Locally in Chrome

1. Build the extension:
   ```bash
   npm run build
   ```
2. Open Google Chrome and navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** via the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `.output/chrome-mv3` directory inside `apps/extension/`:
   ```
   <repo_root>/apps/extension/.output/chrome-mv3
   ```
6. Click the extension puzzle icon in the Chrome toolbar and pin **RedactEye**.
7. Click the **RedactEye** icon — the side panel opens persistently on the right side of the browser.
