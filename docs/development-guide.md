# RedactEye — Team Development Guide

## Designated Persons

- **Shikhar Srivastava** - Person 3 (Agent/Server/Evaluation)
- **Piyush Tharwani** - Person 2 (Vision/Privacy)
- **Jassnoor** - Person 1 (Browser/Extension)

## 1. Purpose of This Document

This document is the development guide for the RedactEye team.

It explains:

* What RedactEye is supposed to build
* How the complete system works
* What each team member owns
* What each team member needs to implement
* How the three components communicate
* Which files/directories each person should work in
* Which interfaces must be agreed upon
* How to work in parallel
* How to use Git and GitHub
* How to test individual components
* How the components will eventually be integrated
* What the final demo should demonstrate

This document should be treated as the team's development source of truth.

---

# 2. Project Goal

RedactEye is a privacy-preserving browser visual agent.

The core idea is:

> The browser sees the user's screen locally, detects sensitive information locally, removes or masks sensitive information locally, sends only sanitized context to the remote AI agent, receives a structured browser action, and executes that action locally.

The server must never receive the original unsanitized screenshot.

The system should demonstrate that an AI browser agent can operate while preserving user privacy.

---

# 3. Core Architecture

The high-level architecture is:

```text
                         USER
                           │
                           │ Task
                           ▼
                 ┌─────────────────────┐
                 │ Browser Extension   │
                 │                     │
                 │ Person 1            │
                 └──────────┬──────────┘
                            │
                   Screenshot + DOM
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Local Vision +      │
                 │ Privacy Engine      │
                 │                     │
                 │ Person 2            │
                 └──────────┬──────────┘
                            │
                     PII Detection
                     + Redaction
                            │
                            ▼
                  SANITIZED CONTEXT
                            │
                            │ Network
                            ▼
                 ┌─────────────────────┐
                 │ Agent Server        │
                 │                     │
                 │ Person 3            │
                 │ VLM + Planner       │
                 └──────────┬──────────┘
                            │
                       JSON Action
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Browser Extension   │
                 │                     │
                 │ Person 1            │
                 └──────────┬──────────┘
                            │
                            ▼
                     Browser Action
                            │
                            ▼
                      New Page State
                            │
                            └─────────────► Repeat
```

The complete agent loop is:

```text
OBSERVE
   ↓
CAPTURE
   ↓
DETECT
   ↓
REDACT
   ↓
SEND SANITIZED CONTEXT
   ↓
REASON
   ↓
GENERATE ACTION
   ↓
VALIDATE ACTION
   ↓
EXECUTE ACTION
   ↓
OBSERVE AGAIN
```

---

# 4. Most Important Privacy Rule

The following rule must never be violated:

```text
RAW SCREENSHOT
      │
      │
      X
      │
      X  NEVER SEND TO SERVER
      │
      ▼
LOCAL PRIVACY ENGINE
      │
      ▼
SANITIZED SCREENSHOT
      │
      ▼
SERVER
```

The browser/client is responsible for privacy enforcement.

The server should receive only:

* Sanitized screenshot
* Sanitized DOM
* Task information
* Non-sensitive metadata required for reasoning

The server must not receive raw PII.

---

# 5. Team Structure

There are three primary owners.

| Person   | Ownership                   | Main Question                                  |
| -------- | --------------------------- | ---------------------------------------------- |
| Person 1 | Browser / Extension         | "How do we observe and control the browser?"   |
| Person 2 | Vision / Privacy            | "What is on the screen and what is sensitive?" |
| Person 3 | Server / Agent / Evaluation | "What should the agent do?"                    |

---

# 6. Person 1 — Browser Extension Engineer

## Ownership

Person 1 owns:

```text
apps/extension/
packages/browser-utils/
```

Person 1 also participates in:

```text
packages/shared-types/
packages/action-schema/
```

but shared contracts must be discussed with the entire team before changing them.

---

# 7. Person 1 — Responsibilities

Person 1 builds the browser-side system.

The browser extension should eventually be able to:

1. Capture the visible browser screen
2. Extract DOM information
3. Identify useful browser elements
4. Assign stable IDs to elements
5. Determine element bounding boxes
6. Determine whether elements are visible
7. Determine whether elements are enabled/disabled
8. Maintain browser state
9. Send data to the local privacy engine
10. Receive actions from the agent server
11. Resolve action targets
12. Execute browser actions
13. Report action results
14. Provide a basic extension UI

---

# 8. Person 1 — Screenshot Capture

Build a browser-side screenshot capture mechanism.

Required capability:

```text
captureScreen()
```

Conceptual output:

```text
Screenshot
├── width
├── height
└── image data
```

The screenshot must correspond to the current browser viewport.

The implementation should eventually support the privacy pipeline:

```text
Screenshot
    ↓
Privacy Engine
    ↓
Sanitized Screenshot
```

Do not send the raw screenshot directly to the server.

---

# 9. Person 1 — DOM Extraction

The extension should extract useful DOM information.

For each relevant element, collect information such as:

```text
element ID
tag name
role
text
placeholder
aria-label
input type
bounding box
visibility
enabled/disabled state
```

Example:

```json
{
  "id": "button_17",
  "tag": "button",
  "role": "button",
  "text": "Login",
  "bbox": {
    "x": 500,
    "y": 400,
    "width": 120,
    "height": 40
  },
  "visible": true,
  "enabled": true
}
```

---

# 10. Person 1 — Important DOM Elements

Initially focus on:

```text
button
input
textarea
select
a
checkbox
radio
form
img
heading
text
```

For inputs, capture:

```text
input type
placeholder
aria-label
name
bounding box
```

Be careful with sensitive values.

Do NOT unnecessarily extract actual password values or other secrets.

---

# 11. Person 1 — Element IDs

The agent needs a reliable way to refer to elements.

Example:

```text
button_1
button_2
input_1
input_2
link_1
checkbox_1
```

The exact implementation can change later, but the action protocol must be able to identify the target.

The preferred approach is:

```text
Agent
  ↓
element_id
  ↓
Extension
  ↓
resolveElement(element_id)
  ↓
DOM element
```

---

# 12. Person 1 — Browser State

The extension should maintain a browser state representation.

It should eventually contain:

```text
Current URL
Page title
Viewport dimensions
Screenshot
DOM snapshot
Available interactive elements
Current task
Last action
Last action result
```

Do not store unnecessary private information.

---

# 13. Person 1 — Action Executor

Person 1 implements browser actions.

Initial action types:

```text
click
scroll
type
select
navigate
```

Example:

```json
{
  "type": "click",
  "target": {
    "element_id": "button_17"
  }
}
```

The extension should:

```text
Receive Action
      ↓
Validate Action
      ↓
Resolve Target
      ↓
Check Target
      ↓
Execute
      ↓
Return Result
```

---

# 14. Person 1 — Action Safety

Never execute arbitrary JavaScript received from the server.

The server should only return actions from the predefined action schema.

Bad:

```text
execute arbitrary JS
```

Good:

```text
click(element_id)
scroll(direction, amount)
type(element_id, value)
select(element_id, value)
navigate(url)
```

The extension must validate incoming actions before execution.

---

# 15. Person 1 — Extension UI

Eventually create a simple extension interface showing:

```text
RedactEye
────────────────────

Privacy Status:
● Protected

PII Detected:
4

Redacted Regions:
4

Agent:
● Active

Last Action:
Click Login

Network:
Sanitized Context Only
```

A privacy preview should also be considered:

```text
Original View
      ↓
Local Redaction
      ↓
What Leaves Device
```

This is important for the final SIH demonstration.

---

# 16. Person 1 — What NOT to Build

Person 1 should NOT own:

```text
OCR model
PII detection algorithms
Face detection
VLM
LLM prompting
Backend reasoning
Evaluation metrics
```

Person 1 consumes those outputs.

---

# 17. Person 2 — Local Vision and Privacy Engineer

## Ownership

Person 2 owns:

```text
packages/vision-engine/
packages/privacy-engine/
models/
```

Person 2 also participates in:

```text
packages/shared-types/
packages/action-schema/
```

when required.

---

# 18. Person 2 — Responsibilities

Person 2 builds the local privacy firewall.

The privacy system should answer:

> What information is visible on the screen, and which parts must not leave the device?

Main components:

```text
Screenshot
   │
   ├── OCR
   │
   ├── Face Detection
   │
   ├── UI Detection
   │
   └── DOM Information
          │
          ▼
     PII Detection
          │
          ▼
   Detection Fusion
          │
          ▼
      Redaction
          │
          ▼
   Sanitized Context
```

---

# 19. Person 2 — Local Inference

The primary goal is to run privacy-sensitive inference locally in the browser.

Preferred technologies:

```text
ONNX Runtime Web
WebGPU
WebAssembly fallback
```

Use lightweight models where possible.

Do not begin by selecting the largest possible model.

Client resource utilization and latency are evaluation criteria.

---

# 20. Person 2 — OCR

OCR should identify text visible in screenshots.

Output should conceptually contain:

```json
{
  "text": "john@example.com",
  "bbox": {
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 30
  },
  "confidence": 0.98
}
```

The OCR system should provide:

```text
text
bounding box
confidence
```

The privacy engine will use this information for PII detection.

---

# 21. Person 2 — PII Detection

Initial PII categories:

```text
Name
Email
Phone
Password
Face
```

Potential later categories:

```text
Address
Credit card
Government ID
Date of birth
Username
API key
Token
```

Do not implement every possible PII category initially.

Build the architecture so categories can be added later.

---

# 22. Person 2 — Detection Strategy

Do not depend on one detector.

Use multiple signals.

```text
                 ┌── DOM Rules
                 │
Screenshot ──────┼── OCR
                 │
                 ├── Regex
                 │
                 ├── Face Detection
                 │
                 └── ML Classifier
                        │
                        ▼
                 Detection Fusion
```

Example:

```text
DOM says:
input[type=password]

OCR says:
Password

Therefore:
HIGH CONFIDENCE PASSWORD REGION
```

Another example:

```text
OCR:
john@example.com

Regex:
EMAIL MATCH

Therefore:
EMAIL PII
```

---

# 23. Person 2 — Sensitive Region Representation

Every detected sensitive region should contain:

```text
PII type
Bounding box
Confidence
Detection source
Redaction action
```

Conceptual structure:

```json
{
  "type": "email",
  "bbox": {
    "x": 100,
    "y": 200,
    "width": 250,
    "height": 30
  },
  "confidence": 0.97,
  "source": [
    "ocr",
    "regex"
  ],
  "action": "mask"
}
```

---

# 24. Person 2 — Redaction Engine

The redaction engine converts:

```text
Original screenshot
```

into:

```text
Sanitized screenshot
```

Possible redaction methods:

```text
Blur
Black mask
Pixelation
Replacement token
```

Initially support one or two reliable methods.

Example:

```text
Original:

Email: john@example.com

Sanitized:

Email: [REDACTED]
```

---

# 25. Person 2 — Avoid Over-Redaction

This is extremely important.

Do NOT simply blur huge parts of the screen.

Bad:

```text
████████████████████████
████████████████████████
████████████████████████
```

Good:

```text
Name: ███████████
Email: ███████████████

[Login]
[Cancel]
```

The agent still needs enough visual context to understand the page.

Redaction should be precise.

---

# 26. Person 2 — Sanitized DOM

The DOM may also contain sensitive information.

Therefore the privacy layer must sanitize DOM information too.

Example:

Original:

```text
<input value="john@example.com">
```

Sanitized representation:

```text
<input type="email" id="input_1">
```

Do not send unnecessary secret values to the server.

---

# 27. Person 2 — Privacy Firewall

The final privacy API should conceptually behave like:

```text
sanitize(
    screenshot,
    domSnapshot
)
```

Output:

```text
sanitizedScreenshot
+
sanitizedDOM
+
detections
+
privacy statistics
```

The privacy layer must be the gatekeeper before any network transmission.

---

# 28. Person 2 — What NOT to Build

Person 2 should NOT own:

```text
FastAPI endpoints
VLM prompting
Agent planning
Browser clicking
Browser scrolling
Browser navigation
```

Person 2 produces sanitized context.

Person 3 decides what to do with it.

Person 1 executes the action.

---

# 29. Person 3 — Backend, VLM and Agent Engineer

## Ownership

Person 3 owns:

```text
services/agent-server/
evaluation/
```

Person 3 also works with:

```text
packages/shared-types/
packages/action-schema/
```

when required.

---

# 30. Person 3 — Responsibilities

Person 3 builds:

```text
FastAPI backend
Context processing
VLM integration
Agent planner
Action generation
Action validation
Agent loop
Evaluation framework
Performance measurement
```

---

# 31. Person 3 — Backend

Create a backend service using FastAPI.

Conceptual architecture:

```text
HTTP Request
     ↓
Context Validator
     ↓
Sanitized Context
     ↓
VLM / Agent
     ↓
Action Planner
     ↓
Action Validator
     ↓
JSON Response
```

Possible endpoints:

```text
/api/health
/api/analyze
/api/plan
```

The exact API can change as the project develops.

---

# 32. Person 3 — Server Input

The server should receive:

```text
Task
Sanitized Screenshot
Sanitized DOM
Safe Metadata
```

It should NOT receive:

```text
Raw screenshot
Raw password
Unredacted PII
Private DOM values
```

---

# 33. Person 3 — VLM

The VLM should reason over:

```text
Task
+
Sanitized screenshot
+
Sanitized DOM
```

Example task:

```text
"Find the login button and click it."
```

The VLM should identify:

```text
button_17
```

and generate:

```json
{
  "type": "click",
  "target": {
    "element_id": "button_17"
  }
}
```

---

# 34. Person 3 — Structured Actions

The VLM should NOT return free-form instructions such as:

```text
"Click the blue button near the bottom right."
```

Instead return a validated structured action.

Example:

```json
{
  "type": "click",
  "target": {
    "element_id": "button_17"
  }
}
```

---

# 35. Person 3 — Action Schema

Initial actions:

```text
click
scroll
type
select
navigate
```

Example click:

```json
{
  "type": "click",
  "target": {
    "element_id": "button_17"
  }
}
```

Example scroll:

```json
{
  "type": "scroll",
  "direction": "down",
  "amount": 500
}
```

Example type:

```json
{
  "type": "type",
  "target": {
    "element_id": "search_box"
  },
  "value": "example"
}
```

Typing must be treated carefully because values may contain sensitive information.

---

# 36. Person 3 — Action Validation

Before returning an action:

```text
VLM Output
    ↓
Schema Validation
    ↓
Target Validation
    ↓
Safety Validation
    ↓
Final Action
```

Reject invalid actions.

Never allow the VLM to bypass the action schema.

---

# 37. Person 3 — Agent Loop

Eventually the backend participates in:

```text
Observe
   ↓
Reason
   ↓
Action
   ↓
Browser executes
   ↓
Observe new state
   ↓
Reason again
```

The agent should be able to perform multi-step tasks.

Example:

```text
Task:
"Open the website and find the pricing page."

Step 1:
Click menu

Step 2:
Scroll

Step 3:
Click Pricing

Step 4:
Verify page
```

---

# 38. Person 3 — Evaluation

Person 3 owns evaluation.

The evaluation system should measure the PS criteria.

## Visual Context Accuracy

Measure whether the sanitized context still contains enough information for the agent.

Possible measurements:

```text
Element detection accuracy
UI element recognition
Task success rate
VLM action accuracy
```

---

## PII Detection

Measure:

```text
Precision
Recall
F1 score
```

Use synthetic test data.

---

## Redaction Precision

Measure:

```text
True PII area
vs
Redacted area
```

Important goals:

```text
Do not miss sensitive information.
Do not unnecessarily hide useful information.
```

---

## Client Resource Utilization

Measure:

```text
CPU
Memory
GPU usage when available
Model size
Inference time
```

---

## End-to-End Latency

Measure:

```text
Screenshot
   ↓
Local detection
   ↓
Redaction
   ↓
Network
   ↓
VLM
   ↓
Action generation
   ↓
Browser execution
```

Record each stage separately.

---

# 39. Shared Contracts

All three people depend on shared contracts.

These belong in:

```text
packages/shared-types/
packages/action-schema/
```

Important shared objects include:

```text
BrowserState
DOMSnapshot
DOMElement
Detection
SensitiveRegion
SanitizedContext
AgentAction
ActionResult
```

Do not casually change shared contracts.

If a contract must change:

```text
1. Discuss with the team
2. Update documentation
3. Update affected components
4. Test integration
```

---

# 40. Component Ownership

Use this ownership table.

| Directory                  | Owner    |
| -------------------------- | -------- |
| `apps/extension/`          | Person 1 |
| `packages/browser-utils/`  | Person 1 |
| `packages/vision-engine/`  | Person 2 |
| `packages/privacy-engine/` | Person 2 |
| `models/`                  | Person 2 |
| `services/agent-server/`   | Person 3 |
| `evaluation/`              | Person 3 |
| `packages/shared-types/`   | Shared   |
| `packages/action-schema/`  | Shared   |
| `docs/`                    | Shared   |
| `test-fixtures/`           | Shared   |
| `configs/`                 | Shared   |
| `scripts/`                 | Shared   |

---

# 41. How Everyone Works in Parallel

Do NOT wait for other team members.

Use mock data.

## Person 1

Use a mock privacy engine:

```text
Screenshot
    ↓
Mock Sanitizer
    ↓
Fake Sanitized Context
```

Continue developing the extension.

---

## Person 2

Use synthetic screenshots:

```text
test-fixtures/screenshots/
```

and synthetic DOM:

```text
test-fixtures/dom/
```

Build and test the privacy engine independently.

---

## Person 3

Use synthetic sanitized contexts:

```text
test-fixtures/sanitized/
```

Build the backend and VLM integration independently.

---

# 42. Integration Order

The team should integrate in this order.

## Integration 1

Person 1 + Person 2:

```text
Browser
   ↓
Screenshot + DOM
   ↓
Privacy Engine
   ↓
Sanitized Context
```

Goal:

> The browser can generate sanitized context locally.

---

## Integration 2

Person 2 + Person 3:

```text
Sanitized Context
       ↓
     Server
       ↓
      VLM
       ↓
  JSON Action
```

Goal:

> The server can reason over sanitized information and produce a valid action.

---

## Integration 3

Person 1 + Person 3:

```text
JSON Action
    ↓
Extension
    ↓
Browser
```

Goal:

> The browser can execute server-generated actions.

---

## Integration 4 — Full System

Finally:

```text
Browser
   ↓
Local Privacy
   ↓
Sanitized Context
   ↓
Server
   ↓
VLM
   ↓
Action
   ↓
Browser
   ↓
New State
```

This is the complete RedactEye system.

---

# 43. GitHub Workflow

Never directly push feature work to `main`.

Use:

```text
main
 │
 ├── feature/extension-screenshot
 ├── feature/extension-dom
 ├── feature/pii-email
 ├── feature/redaction-engine
 ├── feature/fastapi-server
 ├── feature/vlm-planner
 └── feature/action-validator
```

Recommended workflow:

```bash
git checkout main
git pull origin main

git checkout -b feature/your-feature
```

Work on the feature.

Then:

```bash
git status
git diff

git add <specific-files>
git commit -m "feat(scope): description"

git push -u origin feature/your-feature
```

Open a Pull Request on GitHub.

After review:

```text
Feature Branch
      ↓
Pull Request
      ↓
Review
      ↓
Merge
      ↓
main
```

---

# 44. Branch Naming

Use focused branches.

Good:

```text
feature/extension-screenshot
feature/extension-dom
feature/extension-actions

feature/ocr-engine
feature/pii-email
feature/pii-face
feature/redaction-engine

feature/fastapi-server
feature/vlm-planner
feature/action-validator

test/pii-benchmark
research/ocr-comparison
docs/architecture-update
fix/redaction-bbox
```

Avoid permanent giant branches such as:

```text
person1
person2
person3
```

A branch should represent a focused piece of work.

---

# 45. Commit Convention

Use:

```text
feat(scope): description
fix(scope): description
test(scope): description
docs(scope): description
refactor(scope): description
research(scope): description
chore(scope): description
```

Examples:

```text
feat(extension): add screenshot capture
feat(browser): add DOM extraction
feat(privacy): add email detection
feat(privacy): add bounding box redaction
feat(server): add analyze endpoint
feat(agent): add action validation
test(privacy): add synthetic PII fixtures
docs(research): compare OCR approaches
fix(privacy): correct email redaction bounds
```

---

# 46. Files Everyone Should Avoid Modifying Casually

Be careful when changing:

```text
README.md
CONTRIBUTING.md
package configuration
shared types
action schema
global configuration
```

These files are likely to cause merge conflicts.

Prefer separate documentation files instead of having everyone edit one large document.

---

# 47. Testing Rules

All test data must be synthetic.

Never commit:

```text
Real passwords
Real phone numbers
Real addresses
Real personal documents
Real API keys
Real screenshots containing private information
```

Use fake examples such as:

```text
Alice Example
alice@example.test
+91-90000-00000
```

---

# 48. Definition of Done

A feature is not considered complete merely because the code runs.

A feature is complete when:

```text
[ ] Code works
[ ] Relevant tests exist
[ ] No secrets/private data included
[ ] Documentation updated if necessary
[ ] Interface/contract is documented
[ ] Feature branch is pushed
[ ] Pull Request created
[ ] Teammate reviewed it
[ ] PR merged into main
```

---

# 49. First Development Milestones

The team should work toward these milestones.

## Milestone 1 — Browser Observation

Person 1:

```text
Screenshot capture
DOM extraction
Element IDs
Bounding boxes
Browser state
```

Person 2:

```text
Synthetic screenshot pipeline
Initial detection abstraction
```

Person 3:

```text
FastAPI skeleton
Health endpoint
Mock agent endpoint
```

---

## Milestone 2 — Privacy Pipeline

Person 1:

```text
Connect screenshot + DOM output
```

Person 2:

```text
OCR
PII detection
Face detection
Redaction
Sanitized DOM
```

Person 3:

```text
Accept sanitized context
Validate incoming context
```

Goal:

```text
Browser
   ↓
Local Privacy
   ↓
Sanitized Context
```

---

## Milestone 3 — Agent Reasoning

Person 3:

```text
VLM integration
Prompt/context construction
Action generation
Action validation
```

Person 1:

```text
Action receiver
Action executor
```

Goal:

```text
Sanitized Context
       ↓
      VLM
       ↓
  JSON Action
       ↓
    Browser
```

---

## Milestone 4 — Full Agent Loop

Connect:

```text
Observe
→ Sanitize
→ Reason
→ Act
→ Observe
```

Test multi-step tasks.

---

## Milestone 5 — Evaluation

Measure:

```text
Visual accuracy
PII precision
PII recall
Redaction precision
Latency
CPU
Memory
Task success
```

---

## Milestone 6 — Optimization

Only after measurements exist, optimize:

```text
Model size
Inference time
Redaction accuracy
OCR accuracy
Network payload
VLM latency
Browser CPU/memory usage
```

---

# 50. Recommended Initial Demo

The first serious demo should use a synthetic website containing:

```text
Name
Email
Phone
Password
Face
Buttons
Forms
Links
```

Example:

```text
┌──────────────────────────────────────────┐
│              RedactEye Demo              │
├──────────────────────────────────────────┤
│                                          │
│ Name:   Alice Example                    │
│ Email:  alice@example.test               │
│ Phone:  +91-90000-00000                  │
│ Password: ********                       │
│                                          │
│             [Login]                      │
│                                          │
└──────────────────────────────────────────┘
```

RedactEye should locally transform the sensitive information:

```text
Name:   █████████████
Email:  ███████████████████
Phone:  █████████████
Password: ███████████
```

while preserving:

```text
Login button
Page structure
Useful text
UI layout
Non-sensitive information
```

The server receives only the sanitized version.

The server then decides:

```text
CLICK login button
```

The extension executes the click.

---

# 51. Important Security Principle

The system should be designed around:

> Never trust the server with raw visual context.

Even if the server is compromised or logs requests, raw PII should never have been sent.

The privacy boundary is:

```text
                  TRUST BOUNDARY
                       │
Browser                │       Server
                       │
┌──────────────────────┼────────────────────┐
│                      │                    │
│ Raw Screenshot       │                    │
│ Raw DOM              │                    │
│ PII Detection        │                    │
│ Redaction            │                    │
│                      │  Sanitized Context │
│                      ├───────────────────►│
│                      │                    │
│                      │  Action            │
│◄─────────────────────┤                    │
│                      │                    │
│ Execute Action       │                    │
└──────────────────────┴────────────────────┘
```

---

# 52. The Three Most Important Rules

## Rule 1 — Privacy First

Raw sensitive visual information must never cross the privacy boundary.

---

## Rule 2 — Structured Communication

Components communicate using defined schemas.

Do not rely on random JSON formats or undocumented assumptions.

---

## Rule 3 — Small Pull Requests

Prefer:

```text
One Issue
   ↓
One Branch
   ↓
One Focused PR
   ↓
Review
   ↓
Merge
```

Avoid giant PRs containing unrelated changes.

---

# 53. Final Ownership Summary

## Person 1

Builds:

```text
Browser Extension
Screenshot Capture
DOM Extraction
Element Identification
Browser State
Action Execution
Extension UI
```

Question they answer:

> How does RedactEye observe and control the browser?

---

## Person 2

Builds:

```text
OCR
Face Detection
UI Detection
PII Detection
Detection Fusion
Redaction
Sanitized DOM
Privacy Firewall
Local Inference
```

Question they answer:

> What can the agent see safely?

---

## Person 3

Builds:

```text
FastAPI
VLM
Context Processing
Agent Planner
Action Schema Validation
Agent Loop
Evaluation
Metrics
```

Question they answer:

> Given the safe context, what should the agent do?

---

# 54. Final System

When everything is complete:

```text
                         USER
                           │
                     "Find pricing"
                           │
                           ▼
                  ┌────────────────┐
                  │   Extension   │
                  │    Person 1   │
                  └───────┬────────┘
                          │
                  Screenshot + DOM
                          │
                          ▼
              ┌────────────────────────┐
              │  Privacy Firewall      │
              │       Person 2         │
              │                        │
              │ OCR                    │
              │ Face Detection         │
              │ PII Detection          │
              │ Redaction              │
              └───────────┬────────────┘
                          │
                   Sanitized Context
                          │
                          ▼
              ╔════════════════════════╗
              ║      NETWORK           ║
              ║  Only sanitized data   ║
              ╚════════════╤═══════════╝
                           │
                           ▼
                  ┌────────────────┐
                  │  Agent Server  │
                  │    Person 3    │
                  │                │
                  │ VLM            │
                  │ Planner        │
                  │ Validator      │
                  └───────┬────────┘
                          │
                     JSON Action
                          │
                          ▼
                  ┌────────────────┐
                  │   Extension   │
                  │    Person 1   │
                  └───────┬────────┘
                          │
                       Click
                          │
                          ▼
                       Browser
                          │
                          ▼
                    New Screen
                          │
                          └──────────► Repeat
```

The final RedactEye demo should make this statement obvious:

> **RedactEye sees locally, protects locally, reasons remotely, and acts locally.**

That is the core engineering principle behind the project.
