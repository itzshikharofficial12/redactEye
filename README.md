# RedactEye

> A privacy-preserving browser visual agent for the Smart India Hackathon (SIH) that performs local visual perception and sensitive data redaction directly on-device before communicating with server-side reasoning models.

---

## High-Level Goal

The primary goal of RedactEye is to enable intelligent browser automation and visual agent assistance while ensuring that no sensitive personal data (PII, credentials, financial details, or identifiable faces) ever leaves the client device in raw, unredacted form. Visual perception and privacy masking run locally inside the browser, sending only sanitized context to a remote Vision-Language Model (VLM) for reasoning and structured action planning.

---

## High-Level Architecture

The RedactEye system architecture follows a privacy-first perceive-redact-reason-act loop:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                       │
│                                                         │
│  [Screen Capture / DOM] ──► [Local Vision Perception]   │
│                                      │                  │
│                                      ▼                  │
│                           [Local Privacy Engine]        │
│                           (PII / Face Redaction)        │
│                                      │                  │
│                                      ▼                  │
│                            Sanitized Context            │
└──────────────────────────────────────┬──────────────────┘
                                       │ (Safe Network Call)
                                       ▼
┌─────────────────────────────────────────────────────────┐
│                     SERVER SYSTEM                       │
│                                                         │
│  [Context Ingestion] ──► [VLM / Agent Reasoning]        │
│                                  │                      │
│                                  ▼                      │
│                      [Structured Action Schema]         │
└──────────────────────────────────┬──────────────────────┘
                                   │ (Validated Action)
                                   ▼
┌─────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                       │
│                                                         │
│  [Local Browser Executor] ──► (Click / Type / Scroll)   │
└─────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
redact-eye/
├── apps/
│   └── extension/             # Chrome/Firefox browser extension shell
├── packages/
│   ├── shared-types/          # Shared data contracts across client and server
│   ├── action-schema/         # Action protocol schema between server and executor
│   ├── vision-engine/         # Local in-browser vision and inference engine
│   ├── privacy-engine/        # Local PII detection and redaction engine
│   └── browser-utils/         # DOM traversal, capture, and browser helpers
├── services/
│   └── agent-server/          # FastAPI backend server with VLM reasoning
├── models/
│   ├── vision/                # Vision model assets and metadata
│   ├── ocr/                   # OCR model assets and metadata
│   ├── face/                  # Face detection model assets and metadata
│   └── ui-detection/          # UI element detection model assets and metadata
├── test-fixtures/
│   ├── screenshots/           # Synthetic screenshots for testing
│   ├── dom/                   # Synthetic DOM trees and snapshots
│   ├── pii/                   # Synthetic PII samples for detection testing
│   ├── sanitized/             # Verified sanitized output fixtures
│   └── agent-tasks/           # Synthetic multi-step agent benchmark tasks
├── evaluation/
│   ├── datasets/              # Benchmark evaluation datasets
│   ├── benchmarks/            # Benchmark definitions and harnesses
│   ├── metrics/               # Evaluation metrics and score calculators
│   └── results/               # Experiment logs and evaluation results
├── docs/
│   ├── architecture/          # System architecture and design documents
│   ├── research/              # Technology research notes and benchmarks
│   ├── privacy/               # Privacy requirements and redaction rules
│   ├── models/                # Model selection and optimization documentation
│   ├── api/                   # Interface and API documentation
│   ├── evaluation/            # Evaluation methodology and metrics docs
│   ├── decisions/             # Architecture Decision Records (ADRs)
│   └── setup/                 # Environment setup and developer guides
├── scripts/                   # Development, build, and evaluation scripts
├── configs/                   # Shared configurations and linting configs
└── .github/                   # GitHub workflows, templates, and issue tracking
```

---

## Three-Person Ownership Overview

To support parallel development with minimal merge conflicts, ownership is partitioned as follows:

| Role | Primary Directories | Responsibilities |
|---|---|---|
| **Person 1: Browser / Extension** | `apps/extension/`<br>`packages/browser-utils/` | Chrome/Firefox extension shell, DOM capture, action execution, content/background scripts, extension UI. |
| **Person 2: Local Vision / Privacy** | `packages/vision-engine/`<br>`packages/privacy-engine/`<br>`models/` | On-device inference (WebGPU, ONNX Runtime Web), OCR, face detection, UI detection, PII detection, redaction engine. |
| **Person 3: Server / Agent / Evaluation** | `services/agent-server/`<br>`evaluation/` | FastAPI backend, VLM integration, task reasoning, action generation, evaluation pipelines, latency and resource benchmarking. |
| **Shared Contracts** | `packages/shared-types/`<br>`packages/action-schema/`<br>`docs/` | Public type interfaces, communication protocols, and architectural documentation. Requires consensus before modification. |

Detailed collaboration guidelines are available in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Documentation Location

All technical documentation, research notes, architecture diagrams, decision records, and API specifications are maintained inside the [`docs/`](docs/) directory:

* [`docs/architecture/`](docs/architecture/) — High-level architecture and system design
* [`docs/research/`](docs/research/) — Research notes, library evaluations, and model comparisons
* [`docs/privacy/`](docs/privacy/) — Privacy criteria, PII classification, and redaction policies
* [`docs/models/`](docs/models/) — Model evaluation, quantization, and runtime documentation
* [`docs/api/`](docs/api/) — Service contracts and interface specifications
* [`docs/evaluation/`](docs/evaluation/) — Benchmarking methodology and target metrics
* [`docs/decisions/`](docs/decisions/) — Architecture Decision Records (ADRs)
* [`docs/setup/`](docs/setup/) — Developer environment setup guides

---

## Development Status

**Project initialization**

Implementation will be added incrementally following the component ownership matrix and documented architectural contracts.
