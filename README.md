# On-Device Visual Perception for Lightweight Browser Agents

> Privacy-preserving vision agent for the browser. Perceives locally, redacts locally, reasons in the cloud, acts on the page.
>
> **Status:** Prototype in development · **Codename:** TBD · **Track:** Smart India Hackathon — Software Edition

---

## Table of Contents

- [Problem](#problem)
- [Solution](#solution)
- [Architecture](#architecture)
- [Component Responsibilities](#component-responsibilities)
- [Data & API Contracts](#data--api-contracts)
- [PII & Redaction Taxonomy](#pii--redaction-taxonomy)
- [Tech Stack](#tech-stack)
- [Repo Structure](#repo-structure)
- [Getting Started](#getting-started)
- [Evaluation Alignment](#evaluation-alignment)
- [Roadmap](#roadmap)
- [Team Roles](#team-roles)
- [Risks & Mitigations](#risks--mitigations)
- [Definition of Done](#definition-of-done)

---

## Problem

Agentic AI pipelines are largely server-side today, which forces users to share sensitive screen data (passwords, IDs, personal info) with a remote service just to get assistance. Local devices are too resource-constrained to run a full reasoning pipeline, so most solutions default to sending everything to the server — trading privacy for usefulness.

## Solution

A four-stage loop, split across a device-local client and a cloud reasoning server:

1. **Perceive** — a lightweight on-device model reads the DOM and visual layer of the current screen. No network call required.
2. **Redact** — passwords, card numbers, IDs, and faces are detected and stripped/masked locally, before anything is packaged for transmission.
3. **Reason** — only sanitized, anonymized context reaches a cloud LLM/VLM, which decides the next step of the task.
4. **Act** — the extension executes the returned action (click / fill / scroll) on the real page, then loops back to step 1.

**Core guarantee:** no raw PII — text or pixel — ever leaves the user's device, under any code path, including failure paths (fail-closed, not fail-open).

---

## Architecture

```
┌─────────────────────────────── CLIENT — BROWSER (device-local) ───────────────────────────────┐
│                                                                                                  │
│   ┌─────────────────────┐        ┌─────────────────────┐                                       │
│   │   Screen Capture     │        │  Local Perception     │                                     │
│   │ DOM tree + viewport  │        │ ONNX/WebGPU CV + NER  │                                     │
│   └──────────┬───────────┘        └───────────┬───────────┘                                     │
│              │                                │                                                 │
│              ▼                                ▼                                                 │
│   ┌─────────────────────┐        ┌─────────────────────┐                                       │
│   │   PII Detection       │◄──────►│  Redaction Engine    │──── sanitized JSON (no raw PII) ───┐ │
│   │ Regex + DOM attrs +   │        │ Mask / blur / strip  │                                     │ │
│   │ model                 │        │                       │                                     │ │
│   └──────────┬───────────┘        └───────────┬───────────┘                                     │ │
│              │                                │                                                 │ │
│              └────────────────┬───────────────┘                                                 │ │
│                                ▼                                                                 │ │
│                    ┌─────────────────────────┐          structured action                       │ │
│                    │     Action Executor      │◄──────── {click / fill / scroll} ────────────────┼─┤
│                    │ click / fill / scroll on │                                                  │ │
│                    │ live DOM                 │                                                  │ │
│                    └─────────────────────────┘                                                  │ │
│                                                                                                    │ │
│         Loop: perceive → sanitize → reason → act → observe, repeated until task complete         │ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘ │
                                                                                                      │
┌───────────────────────────────────────── SERVER (cloud) ──────────────────────────────────────────┘
│
│   ┌───────────────────────────────┐        ┌───────────────────────────────┐
│   │  Sanitized Context Receiver     │───────►│   Cloud VLM / LLM Reasoning     │
│   │  Validates + parses incoming   │        │  Interprets context, returns   │
│   │  JSON context                   │        │  next structured action         │
│   └───────────────────────────────┘        └───────────────────────────────┘
│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Everything left of the boundary runs entirely on the user's device. **No raw PII ever crosses it.**

## Component Responsibilities

| Component | Runs On | Responsibility |
|---|---|---|
| Screen Capture | Client | Reads DOM tree / accessibility roles; captures viewport frame when pixel data is needed |
| Local Perception | Client | Small ONNX CV model (WebGPU) for image regions; optional Transformers.js NER for free text |
| PII Detection | Client | Regex + DOM-attribute heuristics (`type=password`, `autocomplete`) + model-based detection |
| Redaction Engine | Client | Masks/blurs/strips sensitive nodes and regions before serialization — nothing sensitive is ever sent |
| Action Executor | Client | Executes structured actions returned by the server on the live page |
| Context Receiver | Server | Validates and parses incoming sanitized JSON context |
| Cloud VLM/LLM Reasoning | Server | Interprets sanitized context against the task goal, returns next structured action |

---

## Data & API Contracts

### Client → Server request (sanitized context)

```json
{
  "task": "fill out the shipping form",
  "step": 2,
  "screen": {
    "url_domain": "example-demo-site.local",
    "elements": [
      { "id": "el_12", "role": "textbox", "label": "Full Name", "value": null, "redacted": false },
      { "id": "el_13", "role": "textbox", "label": "Card Number", "value": "[REDACTED]", "redacted": true }
    ],
    "screenshot_redacted": "base64-png-with-mask-boxes-applied (optional)"
  },
  "redaction_summary": { "fields_redacted": 3, "image_regions_redacted": 1 }
}
```

### Server → Client response (structured action)

```json
{
  "action": "fill",
  "target_id": "el_12",
  "value": "Ananya Sharma",
  "reasoning_note": "Filling name field from provided profile",
  "task_complete": false,
  "next_expected_step": 3
}
```

**Action vocabulary is fixed to:** `click`, `fill`, `scroll`, `wait`, `done`. The server must never return free-form instructions — only this schema — so execution stays deterministic.

---

## PII & Redaction Taxonomy

| PII Type | Detection Method | Redaction Method |
|---|---|---|
| Passwords | `input[type=password]` / `autocomplete` attr | Value never read; field excluded entirely |
| Email / phone | Regex on text nodes + input patterns | Replace with `[REDACTED]` token before serialization |
| Card / bank numbers | Regex (Luhn-checked) + field name heuristics | Mask all but non-sensitive formatting; exclude value |
| Govt ID (PAN/Aadhaar-style) | Regex pattern set + field label matching | Field excluded entirely, label preserved for context |
| Faces / photos | Local CV detector (ONNX/WebGPU) | Blur or black-box region in any captured frame |
| Free-text PII (names, address) | Optional local NER model | Token-level redaction in transmitted text |

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Extension shell | Manifest V3, JavaScript/TypeScript | Chrome primary target, Firefox best-effort |
| Local inference | ONNX Runtime Web + WebGPU (WASM fallback) | Runs the CV/redaction-support model |
| Local NLP (optional) | Transformers.js | Lightweight NER for free-text PII |
| PII rules | Plain JS + regex | No model needed — fastest, most precise layer |
| Server | Node.js (Express) or Python (FastAPI) | Single reasoning endpoint |
| Cloud reasoning model | Any hosted VLM/LLM API (swappable) | Open-weight model optional for offline story |
| Demo site | Static HTML/CSS/JS | Self-hosted, controlled for reliable live demo |
| Metrics/logging | Simple client + server logging | For resource-usage and latency evidence at judging |

---

## Repo Structure

```
.
├── extension/               # Manifest V3 browser extension
│   ├── manifest.json
│   ├── content-script.js    # DOM read, screen capture
│   ├── background.js        # Service worker, network calls to server
│   ├── perception/          # ONNX Runtime Web model + WebGPU/WASM loader
│   ├── pii-detection/       # Regex + DOM-attribute rules + NER hooks
│   ├── redaction/           # Masking/blurring/stripping engine
│   ├── action-executor.js   # Executes click/fill/scroll actions
│   └── popup/                # Status UI, redaction preview
│
├── server/                  # Reasoning backend
│   ├── index.js / main.py
│   ├── routes/agent-step.*  # POST /agent/step endpoint
│   ├── llm-client.*         # Cloud VLM/LLM integration
│   └── schema/action.*      # Structured action schema + validation
│
├── demo-site/                # Self-hosted controlled demo target
│   └── index.html
│
├── docs/
│   ├── PRD.pdf
│   └── pitch-deck.pptx
│
└── README.md
```

---

## Getting Started

```bash
# 1. Clone and install
git clone <repo-url>
cd <repo>

# 2. Extension (dev mode)
cd extension
npm install
# Load unpacked extension in chrome://extensions with Developer Mode on

# 3. Server
cd ../server
npm install        # or: pip install -r requirements.txt
npm run dev         # or: uvicorn main:app --reload

# 4. Demo site
cd ../demo-site
# serve statically, e.g.:
npx serve .
```

Point the extension's server URL (in `background.js` / popup settings) at your local server instance, then open the demo site and trigger a task from the popup.

---

## Evaluation Alignment

| # | Metric | Weight | What We Must Demonstrate |
|---|---|---|---|
| 1 | Accuracy of visual context extraction | 25% | Correctly identify fields, buttons, text, layout from DOM + vision layer |
| 2 | Recall & precision of PII detection | 20% | Reliably catch passwords, IDs, cards, emails, faces — few false negatives |
| 3 | Precision of redaction | 20% | Redact exactly the sensitive region — no over-masking or leakage |
| 4 | Client-side resource utilization | 20% | Low CPU/GPU/memory footprint in the extension; measurable and shown live |
| 5 | End-to-end task latency | 15% | Full perceive→reason→act loop completes within an acceptable time |

**Build priority:** redaction correctness + perception accuracy (65% combined) first, resource efficiency designed in from the start, latency polished last.

---

## Roadmap

| Phase | Focus | Key Deliverable |
|---|---|---|
| 1 | Extension skeleton + DOM capture | Extension loads, reads and logs page structure |
| 2 | PII rules + local CV model integration | Structured + visual PII reliably detected |
| 3 | Redaction engine | Verified: no raw PII in any outgoing payload (Network tab proof) |
| 4 | Server + cloud reasoning + action schema | Server returns valid structured actions from sanitized input |
| 5 | Action executor + full loop | End-to-end task completes on the demo site |
| 6 | Resource/latency instrumentation + polish | Metrics captured; demo script rehearsed |

## Team Roles

| Role | Owns |
|---|---|
| Extension/Frontend | Manifest, content/background scripts, popup UI, action executor |
| ML/Perception | ONNX model selection/export, WebGPU integration, NER integration |
| Privacy/Redaction | PII rule set, redaction engine, fail-closed guarantees |
| Backend | Server endpoint, cloud model integration, action-schema validation |
| QA/Demo | Demo site, test scenarios, resource/latency measurement, pitch rehearsal |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| WebGPU unsupported on judge's/demo machine | Always ship a WASM CPU fallback path; test on the actual demo laptop beforehand |
| Live/external site DOM changes before demo | Primary demo runs on a self-hosted controlled site; real-site run is a bonus, not the core proof |
| Over- or under-redaction hurts precision score | Maintain a labeled test set of pages; measure precision/recall before the deadline, not live |
| Cloud LLM latency spikes during demo (venue wifi) | Cache/pre-warm a request before presenting; have a recorded backup run as fallback |
| Team skill gaps across ML/extension/backend | Use AI-assisted scaffolding early per phase; pair less-experienced members with a clear owner per module |

## Definition of Done

- [ ] Extension installs and runs on Chrome without console errors
- [ ] Local model runs client-side (WebGPU, with WASM fallback verified)
- [ ] At least 4 PII types detected and redacted with visible before/after proof
- [ ] Network tab shows zero raw PII in any outgoing request, live, on stage
- [ ] Server returns valid structured actions consumed directly by the executor
- [ ] One complete multi-step task runs end-to-end without manual intervention
- [ ] Resource usage (CPU/memory) and end-to-end latency numbers captured and ready to state

---

*This README is a living document — update it as architecture decisions firm up, particularly the final product name, exact PII regex set, and chosen ONNX model.*
