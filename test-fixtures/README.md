# Test Fixtures (`test-fixtures/`)

This directory contains synthetic test fixtures used for local unit testing, regression testing, and pipeline verification.

## Privacy and Safety Policy
> **CRITICAL RULE: NEVER commit real personal data, passwords, real credit card numbers, government IDs, or authentic user screenshots.**
>
> All test fixtures must strictly contain synthetic, simulated, or randomized mock data.

## Subdirectories
- [`screenshots/`](screenshots/) — Synthetic test screenshots of web interfaces
- [`dom/`](dom/) — Synthetic HTML DOM trees and snapshots
- [`pii/`](pii/) — Synthetic PII samples for evaluating detector recall and precision
- [`sanitized/`](sanitized/) — Reference sanitized snapshots and redaction ground truth
- [`agent-tasks/`](agent-tasks/) — Synthetic task prompts and environment setups for agent workflows
