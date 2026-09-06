# Action Schema Package (`packages/action-schema`)

This package is reserved for the validated action protocol governing communication between the server-side agent reasoning engine and the local browser executor.

## Contract Status
- **Status:** Interface definition reserved (not yet implemented).
- **Ownership:** Shared contract — modifications require discussion and consensus across all developers before updating.

## Eventual Action Protocol Concepts
The eventual action protocol is expected to support structured concepts such as:
- `click` — Target element click or coordinate click
- `scroll` — Scroll direction, delta, or target element scroll
- `type` — Keystroke or text input into focused/specified fields
- `select` — Option selection from dropdowns or choices
- `navigate` — URL navigation, back/forward history transitions

Implementation schemas and validators will be added incrementally under agreement by all team members.
