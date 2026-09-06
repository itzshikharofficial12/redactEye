# Contributing to RedactEye

Welcome to the RedactEye project! This repository is organized as a monorepo designed for a three-person team working concurrently with minimal Git merge conflicts.

Please review these guidelines thoroughly before opening branches or submitting pull requests.

---

## 1. Team Roles and Code Ownership

To keep development decoupled and streamlined, primary ownership of directories is divided across three developers:

### Person 1 — Browser & Extension
* **Primary Ownership:**
  * `apps/extension/`
  * `packages/browser-utils/`
* **Responsibilities:**
  * Chrome & Firefox extension manifest and architecture
  * Screen capture and viewport handling
  * DOM extraction and tree traversal
  * Browser state management
  * Content scripts and background service workers
  * Extension popup and management UI
  * Browser action execution (click, scroll, type, select, navigate)

### Person 2 — Local Vision & Privacy Engine
* **Primary Ownership:**
  * `packages/vision-engine/`
  * `packages/privacy-engine/`
  * `models/`
* **Responsibilities:**
  * In-browser local inference execution (WebGPU, ONNX Runtime Web, WebAssembly)
  * OCR model pipeline
  * Face detection and UI element detection
  * PII pattern detection and privacy classification
  * Bounding box masking, pixel blurring, and DOM text sanitization
  * Client-side privacy rules and policies

### Person 3 — Server, Agent & Evaluation
* **Primary Ownership:**
  * `services/agent-server/`
  * `evaluation/`
* **Responsibilities:**
  * FastAPI backend reasoning service
  * Vision-Language Model (VLM) integration
  * Agent task planning and structured action generation
  * Action validation against schemas
  * Server-side context ingestion
  * Evaluation pipeline, benchmark generation, and datasets
  * Accuracy, PII precision/recall, latency, and resource measurement

### Shared Areas (Contract Boundaries)
* **Locations:**
  * `packages/shared-types/`
  * `packages/action-schema/`
  * `docs/`
* **Rules:**
  * These areas represent public interfaces and project documentation.
  * **Do not modify shared contracts unilaterally.**
  * Any changes to shared types or action schemas must be agreed upon by all team members before merging.

---

## 2. Branch Naming Conventions

All branches should follow standard naming conventions prefixed by role or scope:

* `feature/person1-<description>` — Browser and extension features
* `feature/person2-<description>` — Vision engine, privacy engine, and model pipelines
* `feature/person3-<description>` — Agent server, reasoning, and evaluation framework
* `fix/<issue-or-scope>` — Bug fixes
* `research/<topic>` — Exploration, benchmark investigations, and spike documentation
* `docs/<topic>` — Documentation updates and architectural decision records

---

## 3. Pull Request Expectations

1. **Stay Within Your Boundaries:** Avoid making changes in directories owned by other teammates unless explicitly coordinating a cross-cutting change.
2. **Keep Commits Focused:** Make small, atomic commits with descriptive commit messages.
3. **Draft First:** Open a draft PR early if you need alignment on interface changes.
4. **Contract Changes:** If a PR touches `packages/shared-types/` or `packages/action-schema/`, request review from all team members.
5. **No Broken Builds:** Ensure your code adheres to `.editorconfig` formatting and contains no syntax or lint errors.

---

## 4. Repository Hygiene Rules

* **Never commit secrets:** API keys, cloud tokens, credentials, and `.env` files must NEVER be committed.
* **Never commit model binaries:** Large model weights (`.onnx`, `.pt`, `.bin`, `.safetensors`) must not be committed to Git. Follow model storage instructions documented in `models/README.md`.
* **Never commit generated files:** Build outputs (`dist/`, `build/`), virtual environments (`.venv/`), and dependency folders (`node_modules/`) are strictly ignored.
* **Update documentation:** Whenever an architectural choice, interface contract, or technical decision is made or updated, update the corresponding markdown document in `docs/`.
* **Synthetic data only:** Never commit real user data, credentials, or personally identifiable information into `test-fixtures/` or `evaluation/`. Use synthetic test data only.
