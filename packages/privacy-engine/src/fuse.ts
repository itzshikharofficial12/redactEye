// TODO: Implement detection fusion.
//
// This module merges signals from multiple detectors (OCR, face detection, DOM heuristics,
// regex, NLP) into a single deduplicated and confidence-weighted list of `Detection` objects.
//
// Fusion goals:
//   - Merge overlapping bounding boxes from different sources for the same entity
//   - Combine confidence scores (e.g. weighted average or max)
//   - Produce a unified `sources` array (e.g. ["ocr", "regex"]) on the merged detection
//   - Mark fused detections with `DetectionSource: "fusion"` when applicable
//   - Discard duplicate or contradictory low-confidence signals
//
// Example:
//   OCR says "john@example.com" in bbox A with confidence 0.95
//   Regex says EMAIL_MATCH in bbox A with confidence 1.0
//   → Fused: Detection { type: "email", bbox: A, confidence: 0.97, sources: ["ocr","regex","fusion"] }

import type { Detection } from "@redact-eye/shared-types";

/**
 * Fuses detections from multiple upstream detector passes into a single
 * deduplicated, confidence-weighted list.
 *
 * @param detectionGroups - One array of `Detection` objects per detector that ran
 *                          (e.g. [ocrDetections, faceDetections, piiDetections]).
 * @returns A single merged array of `Detection` objects ready for the redaction step.
 *
 * TODO: Implement IoU-based bounding box merging and confidence fusion.
 */
export function fuseDetections(_detectionGroups: Detection[][]): Detection[] {
  // TODO: compute pairwise IoU between bounding boxes across groups
  // TODO: merge overlapping detections into single fused Detection
  // TODO: combine sources arrays and recalculate confidence
  throw new Error("fuseDetections: not implemented");
}
