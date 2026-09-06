// TODO: Implement PII detection rules and pattern matching.
//
// This module classifies raw `Detection` objects (produced by vision-engine OCR,
// face detector, and DOM heuristics) into PII categories defined by `DetectionType`.
//
// Detection strategies to implement:
//   - Regex patterns for email, phone, credit_card, government_id, date_of_birth, api_key
//   - DOM attribute heuristics: input[type=password], autocomplete="cc-number", etc.
//   - NLP/ML classifier pass for name, address, username (future milestone)
//
// Output is a list of `Detection` objects with refined types ready for fusion and redaction.
// The `text` field on output detections MUST be treated as raw PII and
// stripped before any network transmission (see Detection.text privacy notice).

import type { Detection, DOMElement } from "@redact-eye/shared-types";

/**
 * Runs rule-based and pattern-based PII detection over a flat list of raw text detections
 * (typically produced by `runOcr`) and DOM elements extracted from the live page.
 *
 * @param textDetections - OCR detections from the vision engine with `type: "text"`.
 * @param domElements    - DOM elements extracted by the browser extension.
 * @returns Array of `Detection` objects whose `type` has been refined to a specific
 *          PII category (e.g. `"email"`, `"phone"`, `"password"`).
 *          Detections that could not be classified are discarded.
 *
 * TODO: Implement regex rules and DOM attribute heuristics.
 */
export function detectPII(
  _textDetections: Detection[],
  _domElements: DOMElement[]
): Detection[] {
  // TODO: apply regex patterns per PII category
  // TODO: cross-reference DOM attributes (type=password, autocomplete, etc.)
  throw new Error("detectPII: not implemented");
}
