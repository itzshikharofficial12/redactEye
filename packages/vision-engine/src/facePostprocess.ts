/**
 * Post-processing routines for RedactEye face detection pipeline.
 *
 * Implements:
 * 1. Score-based filtering of UltraFace anchor outputs.
 * 2. Coordinate rescaling from normalized [0, 1] output space to original image pixel coordinates.
 * 3. Bounding box clamping to image bounds after rescaling.
 * 4. Greedy Non-Maximum Suppression (NMS) using Intersection-over-Union (IoU).
 */

import type { BoundingBox } from "@redact-eye/shared-types";

/**
 * A face detection candidate after score filtering but before NMS.
 */
export interface FaceCandidate {
  bbox: BoundingBox;
  confidence: number;
}

/**
 * Filters UltraFace raw outputs by face score threshold and decodes
 * bounding box coordinates to the original image pixel space.
 *
 * @param scores - Flattened scores tensor [1, numAnchors, 2] — [bg_prob, face_prob] per anchor.
 * @param boxes - Flattened boxes tensor [1, numAnchors, 4] — decoded [x_min, y_min, x_max, y_max].
 * @param numAnchors - Number of anchor boxes (typically 4420 for UltraFace-320).
 * @param scoreThreshold - Minimum face probability to keep (default: 0.7).
 * @param inputWidth - Model input width (320).
 * @param inputHeight - Model input height (240).
 * @param origWidth - Original image width in pixels.
 * @param origHeight - Original image height in pixels.
 */
export function filterAndDecodeBoxes(
  scores: Float32Array,
  boxes: Float32Array,
  numAnchors: number,
  scoreThreshold: number,
  _inputWidth: number,
  _inputHeight: number,
  origWidth: number,
  origHeight: number,
): FaceCandidate[] {
  const candidates: FaceCandidate[] = [];

  for (let i = 0; i < numAnchors; i++) {
    // scores layout: [bg_prob, face_prob] per anchor
    const faceScore = scores[i * 2 + 1]!;
    if (faceScore < scoreThreshold) continue;

    // boxes layout: [x_min, y_min, x_max, y_max] per anchor
    // UltraFace outputs decoded normalized coordinates relative to image dimensions.
    // Real range can extend slightly beyond [0, 1] (e.g. -0.25 to 1.27) for edge faces.
    const normXMin = boxes[i * 4]!;
    const normYMin = boxes[i * 4 + 1]!;
    const normXMax = boxes[i * 4 + 2]!;
    const normYMax = boxes[i * 4 + 3]!;

    // 1. Unconditionally rescale normalized coordinates to original image pixel space
    const pixelXMin = normXMin * origWidth;
    const pixelYMin = normYMin * origHeight;
    const pixelXMax = normXMax * origWidth;
    const pixelYMax = normYMax * origHeight;

    // 2. Clamp final pixel coordinates to image bounds AFTER rescaling
    const clampedXMin = Math.max(0, Math.min(origWidth, pixelXMin));
    const clampedYMin = Math.max(0, Math.min(origHeight, pixelYMin));
    const clampedXMax = Math.max(0, Math.min(origWidth, pixelXMax));
    const clampedYMax = Math.max(0, Math.min(origHeight, pixelYMax));

    const x = Math.max(0, Math.min(origWidth, Math.round(clampedXMin)));
    const y = Math.max(0, Math.min(origHeight, Math.round(clampedYMin)));
    const w = Math.max(0, Math.min(origWidth - x, Math.round(clampedXMax - clampedXMin)));
    const h = Math.max(0, Math.min(origHeight - y, Math.round(clampedYMax - clampedYMin)));

    if (w > 0 && h > 0) {
      candidates.push({
        bbox: { x, y, width: w, height: h },
        confidence: Math.min(1.0, Math.max(0.0, faceScore)),
      });
    }
  }

  return candidates;
}

/**
 * Computes Intersection-over-Union (IoU) for two axis-aligned bounding boxes.
 */
function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const unionArea = areaA + areaB - interArea;

  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

/**
 * Greedy Non-Maximum Suppression.
 *
 * Sorts candidates by confidence (descending) and iteratively suppresses
 * any candidate whose IoU with a higher-confidence kept box exceeds the threshold.
 *
 * @param candidates - Pre-filtered face candidates.
 * @param iouThreshold - Maximum IoU overlap before suppression (default: 0.3).
 */
export function nms(candidates: FaceCandidate[], iouThreshold: number): FaceCandidate[] {
  if (candidates.length <= 1) return candidates;

  // Sort by confidence descending
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: FaceCandidate[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]!);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (computeIoU(sorted[i]!.bbox, sorted[j]!.bbox) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}
