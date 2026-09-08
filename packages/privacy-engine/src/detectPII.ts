import type { Detection, DOMElement } from "@redact-eye/shared-types";
import { detectDomPII } from "./detectors/dom";

/**
 * Runs rule-based and pattern-based PII detection over a flat list of raw text detections
 * and DOM elements extracted from the live page.
 *
 * @param textDetections - OCR detections from the vision engine with `type: "text"` (reserved for OCR milestone).
 * @param domElements    - DOM elements extracted by the browser extension.
 * @returns Array of `Detection` objects whose `type` has been classified into a PII category.
 */
export function detectPII(
  _textDetections: Detection[] = [],
  domElements: DOMElement[] = []
): Detection[] {
  // Run DOM-based PII detection
  return detectDomPII({ elements: domElements });
}
