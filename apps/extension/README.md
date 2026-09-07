# RedactEye Browser Extension (`apps/extension`)

This application directory houses the Chrome Manifest V3 browser extension for RedactEye, built using **TypeScript**, **React**, and **WXT**.

## Current Status (Checkpoint 5: Extension Foundation + Chrome Side Panel)

This checkpoint provides the **Chrome Side Panel UI shell and extension foundation only**:
- Opens as a native, persistent right-side Chrome Side Panel (`chrome.sidePanel`).
- Clean, minimal, native-feeling assistant layout designed for narrow panels.
- Includes Header, Empty State greeting, Task Suggestions ("Find the login button", "Summarize this page", "Fill out this form"), Privacy Status Indicator, and Composer input.
- Local UI state management (`idle`, `composing`, `submitted-placeholder`).
- **Truthful Privacy State:** Accurately reports *"Protected locally - Privacy engine not connected"*.

> **IMPORTANT SCOPE NOTICE:**
> DOM capture, screenshot capture, privacy/PII detection, OCR, and agent execution/API communication are **intentionally deferred to subsequent checkpoints**. In this checkpoint, no network requests are made, and no page data or screenshots leave the browser.

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
│   │   ├── TaskSuggestions.tsx       # 3 quick-start task suggestion buttons
│   │   ├── PrivacyStatus.tsx         # Persistent privacy indicator
│   │   └── Composer.tsx              # Input field & submission button
│   └── entrypoints/
│       ├── background.ts             # Service worker configuring side panel behavior
│       └── sidepanel/
│           ├── index.html            # Side panel HTML entrypoint
│           ├── main.tsx              # React mounting script
│           ├── style.css             # Light, minimal, accessible CSS styles
│           └── App.tsx               # Root component & local state machine
├── tests/
│   └── sidepanel.test.tsx            # Vitest + React Testing Library tests
├── wxt.config.ts                     # WXT Manifest V3 configuration
├── vitest.config.ts                  # Vitest configuration (jsdom)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Manifest V3 & Side Panel Configuration

The extension uses the Chrome Side Panel API (`permissions: ["sidePanel"]`):
- `wxt.config.ts` declares the Manifest V3 side panel entry point and action title.
- `src/entrypoints/background.ts` configures `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the extension toolbar icon opens the persistent right-side panel without a popup.

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
