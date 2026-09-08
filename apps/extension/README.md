# RedactEye Browser Extension (`apps/extension`)

This application directory houses the Chrome Manifest V3 browser extension for RedactEye, built using **TypeScript**, **React**, and **WXT**.

## Current Status (Checkpoint 6: DOM Extraction + Stable Element IDs)

The extension provides:
1. **Chrome Side Panel UI Shell:** Persistent, native right-side panel with clean, minimal light styling, composer, task suggestions, and local state management.
2. **Local DOM Extraction & Element Resolution:** Content script observing active browser pages via `@redact-eye/browser-utils`. Extracts structural `DOMSnapshot` data conforming to `@redact-eye/shared-types`.
3. **Deterministic Element IDs:** Assigns unique, safe, collision-resistant IDs (`button_submit`, `input_email`) and supports deterministic resolution (`resolveElement(id)`).

> **IMPORTANT SCOPE & PRIVACY NOTICE:**
> - **Extraction is 100% Local:** DOM extraction occurs entirely inside the browser tab.
> - **No Raw Input Values Captured:** User-entered values from inputs and textareas are never collected (`value: undefined`). Passwords and credential fields are flagged as `sensitive: true`.
> - **No Network Requests:** No data is sent over the network or transmitted to any backend.
> - **Deferred Features:** Screenshot capture, OCR, privacy/PII redaction engine, and browser action execution are **intentionally deferred to subsequent checkpoints**.

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
│       ├── background.ts             # Service worker configuring side panel behavior
│       ├── content.ts                # Content script exposing local DOM snapshot extraction
│       └── sidepanel/
│           ├── index.html            # Side panel HTML entrypoint
│           ├── main.tsx              # React mounting script
│           ├── style.css             # Light, minimal, accessible CSS styles
│           └── App.tsx               # Root component & local state machine
├── tests/
│   ├── dom-extraction.test.ts        # DOM extraction, security, stability & resolution tests
│   └── sidepanel.test.tsx            # Side panel UI component tests
├── wxt.config.ts                     # WXT Manifest V3 configuration (aliases, permissions)
├── vitest.config.ts                  # Vitest configuration (jsdom)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Manifest V3, Side Panel & Content Script Configuration

The extension uses Chrome Manifest V3:
- `permissions: ["sidePanel"]`: Enables native Chrome Side Panel support.
- `background.ts`: Calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the extension toolbar icon opens the persistent right-side panel without a popup.
- `content.ts`: Injected into web pages (`<all_urls>`) to handle extension-internal runtime messages (`GET_DOM_SNAPSHOT`, `RESOLVE_ELEMENT`).

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
