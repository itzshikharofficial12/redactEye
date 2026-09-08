/**
 * Detection Fusion module for RedactEye privacy engine.
 *
 * Merges multi-modal detection signals (OCR text detections, DOM element heuristics,
 * regex patterns, and face detections) into a single deterministic, deduplicated
 * set of sensitive detections ready for visual redaction and DOM sanitization.
 */

import type { BoundingBox, Detection, DetectionSource, DetectionType } from "@redact-eye/shared-types";

/**
 * Known sensitive detection types that represent actionable PII for redaction.
 */
export const SENSITIVE_DETECTION_TYPES = new Set<DetectionType>([
  "face",
  "email",
  "phone",
  "password",
  "name",
  "address",
  "credit_card",
  "government_id",
  "date_of_birth",
  "username",
  "api_key",
]);

/**
 * Configuration options for detection fusion.
 */
export interface FuseOptions {
  /**
   * Minimum Intersection-over-Union (IoU) required to consider two bounding boxes overlapping.
   * Defaults to 0.3.
   */
  iouThreshold?: number;

  /**
   * Minimum Intersection-over-Area (IoA) required to consider a bounding box contained within another.
   * Defaults to 0.5.
   */
  ioaThreshold?: number;

  /**
   * When true (default), unclassified non-sensitive detections (e.g. raw "text", "button")
   * that do not match any sensitive PII category are excluded from the output.
   */
  filterNonSensitive?: boolean;

  /**
   * Optional image or viewport width for coordinate boundary clamping.
   */
  imageWidth?: number;

  /**
   * Optional image or viewport height for coordinate boundary clamping.
   */
  imageHeight?: number;
}

/**
 * Validates whether a bounding box has finite, positive numeric dimensions.
 */
export function isValidBoundingBox(bbox?: BoundingBox | null): bbox is BoundingBox {
  if (!bbox) return false;
  const { x, y, width, height } = bbox;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/**
 * Computes Intersection over Union (IoU) between two 2D bounding boxes.
 */
export function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  if (interArea <= 0) return 0;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const unionArea = areaA + areaB - interArea;

  return unionArea <= 0 ? 0 : interArea / unionArea;
}

/**
 * Computes maximum Intersection over Area relative to the smaller bounding box.
 * Determines if one box is substantially contained inside the other.
 */
export function computeMaxOverlap(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  if (interArea <= 0) return 0;

  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea <= 0 ? 0 : interArea / minArea;
}

/**
 * Determines whether two detections represent compatible semantic types for fusion.
 *
 * Rules:
 * 1. Detections of the exact same type are always compatible (e.g. email + email, face + face).
 * 2. Generic OCR "text" detections are compatible with text-based sensitive types (email, phone, password, name).
 * 3. Incompatible types (e.g. face vs email, phone vs password) are NEVER compatible and must not merge.
 */
export function areCompatibleDetections(a: Detection, b: Detection): boolean {
  if (a.type === b.type) {
    return true;
  }

  const aIsText = a.type === "text";
  const bIsText = b.type === "text";

  if (aIsText && SENSITIVE_DETECTION_TYPES.has(b.type) && b.type !== "face") {
    return true;
  }
  if (bIsText && SENSITIVE_DETECTION_TYPES.has(a.type) && a.type !== "face") {
    return true;
  }

  return false;
}

/**
 * Merges two compatible detections into a newly constructed Detection object.
 */
function mergeTwoDetections(a: Detection, b: Detection, options?: FuseOptions): Detection {
  // Resolve primary semantic type (prefer specific sensitive type over generic "text")
  let targetType = a.type;
  if (targetType === "text" && b.type !== "text") {
    targetType = b.type;
  }

  // Preserve highest confidence
  const confidence = Math.max(a.confidence ?? 0, b.confidence ?? 0);

  // Compute enclosing bounding box union
  const minX = Math.min(a.bbox.x, b.bbox.x);
  const minY = Math.min(a.bbox.y, b.bbox.y);
  const maxX = Math.max(a.bbox.x + a.bbox.width, b.bbox.x + b.bbox.width);
  const maxY = Math.max(a.bbox.y + a.bbox.height, b.bbox.y + b.bbox.height);

  let fusedX = Math.max(0, Math.round(minX));
  let fusedY = Math.max(0, Math.round(minY));
  let fusedW = Math.max(1, Math.round(maxX - minX));
  let fusedH = Math.max(1, Math.round(maxY - minY));

  // Boundary clamping when bounds are provided
  if (options?.imageWidth) {
    fusedX = Math.min(fusedX, options.imageWidth);
    fusedW = Math.min(fusedW, options.imageWidth - fusedX);
  }
  if (options?.imageHeight) {
    fusedY = Math.min(fusedY, options.imageHeight);
    fusedH = Math.min(fusedH, options.imageHeight - fusedY);
  }

  // Combine unique sources
  const mergedSources: DetectionSource[] = [];
  for (const s of [...(a.sources ?? []), ...(b.sources ?? [])]) {
    if (!mergedSources.includes(s)) {
      mergedSources.push(s);
    }
  }

  // PRIVACY INVARIANT: Password detections MUST NOT have a text property
  const text = targetType === "password" ? undefined : (a.text ?? b.text);

  return {
    id: a.type !== "text" ? a.id : b.id,
    type: targetType,
    bbox: {
      x: fusedX,
      y: fusedY,
      width: fusedW,
      height: fusedH,
    },
    confidence,
    sources: mergedSources,
    text,
  };
}

/**
 * Fuses detections from multiple upstream detector passes into a single
 * deduplicated, confidence-weighted list of sensitive detections.
 *
 * @param detectionGroups - One array of `Detection` objects per detector that ran
 *                          (e.g. `[ocrDetections, faceDetections, piiDetections]`).
 * @param options - Optional fusion parameters (IoU thresholds, image bounds, filtering).
 * @returns A single merged array of `Detection` objects ready for visual redaction.
 */
export function fuseDetections(
  detectionGroups: Detection[][] = [],
  options: FuseOptions = {}
): Detection[] {
  if (!Array.isArray(detectionGroups) || detectionGroups.length === 0) {
    return [];
  }

  const iouThreshold = options.iouThreshold ?? 0.3;
  const ioaThreshold = options.ioaThreshold ?? 0.5;
  const filterNonSensitive = options.filterNonSensitive ?? true;

  // 1. Flatten all groups and filter out invalid bounding boxes
  const allDetections: Detection[] = [];
  for (const group of detectionGroups) {
    if (!Array.isArray(group)) continue;
    for (const det of group) {
      if (det && isValidBoundingBox(det.bbox)) {
        allDetections.push(det);
      }
    }
  }

  if (allDetections.length === 0) {
    return [];
  }

  // 2. Separate sensitive detections from generic OCR text detections
  const sensitiveCandidates: Detection[] = [];
  const genericTextCandidates: Detection[] = [];

  for (const det of allDetections) {
    if (SENSITIVE_DETECTION_TYPES.has(det.type)) {
      sensitiveCandidates.push(det);
    } else {
      genericTextCandidates.push(det);
    }
  }

  // If no sensitive detections exist and filtering is enabled, return empty array
  if (sensitiveCandidates.length === 0 && filterNonSensitive) {
    return [];
  }

  // 3. Cluster and merge compatible sensitive detections
  const clusters: Detection[] = [];

  for (const candidate of sensitiveCandidates) {
    let matchedClusterIndex = -1;
    let bestOverlap = 0;

    for (let i = 0; i < clusters.length; i++) {
      const existing = clusters[i]!;
      if (!areCompatibleDetections(existing, candidate)) {
        continue;
      }

      const iou = computeIoU(existing.bbox, candidate.bbox);
      const ioa = computeMaxOverlap(existing.bbox, candidate.bbox);

      if (iou >= iouThreshold || ioa >= ioaThreshold) {
        const overlapMetric = Math.max(iou, ioa);
        if (overlapMetric > bestOverlap) {
          bestOverlap = overlapMetric;
          matchedClusterIndex = i;
        }
      }
    }

    if (matchedClusterIndex >= 0) {
      clusters[matchedClusterIndex] = mergeTwoDetections(
        clusters[matchedClusterIndex]!,
        candidate,
        options
      );
    } else {
      // Create new cluster (clone newly constructed object to avoid mutating input)
      clusters.push(cloneDetection(candidate, options));
    }
  }

  // 4. Absorb generic OCR text detections into overlapping compatible sensitive clusters
  for (const textDet of genericTextCandidates) {
    let matchedClusterIndex = -1;
    let bestOverlap = 0;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]!;
      if (!areCompatibleDetections(cluster, textDet)) {
        continue;
      }

      const iou = computeIoU(cluster.bbox, textDet.bbox);
      const ioa = computeMaxOverlap(cluster.bbox, textDet.bbox);

      if (iou >= iouThreshold || ioa >= ioaThreshold) {
        const overlapMetric = Math.max(iou, ioa);
        if (overlapMetric > bestOverlap) {
          bestOverlap = overlapMetric;
          matchedClusterIndex = i;
        }
      }
    }

    if (matchedClusterIndex >= 0) {
      clusters[matchedClusterIndex] = mergeTwoDetections(
        clusters[matchedClusterIndex]!,
        textDet,
        options
      );
    } else if (!filterNonSensitive) {
      clusters.push(cloneDetection(textDet, options));
    }
  }

  return clusters;
}

/**
 * Creates a clean, newly constructed copy of a detection with optional bounds clamping.
 */
function cloneDetection(det: Detection, options?: FuseOptions): Detection {
  let x = Math.max(0, Math.round(det.bbox.x));
  let y = Math.max(0, Math.round(det.bbox.y));
  let width = Math.max(1, Math.round(det.bbox.width));
  let height = Math.max(1, Math.round(det.bbox.height));

  if (options?.imageWidth) {
    x = Math.min(x, options.imageWidth);
    width = Math.min(width, options.imageWidth - x);
  }
  if (options?.imageHeight) {
    y = Math.min(y, options.imageHeight);
    height = Math.min(height, options.imageHeight - y);
  }

  return {
    id: det.id,
    type: det.type,
    bbox: { x, y, width, height },
    confidence: det.confidence,
    sources: Array.isArray(det.sources) ? [...det.sources] : [],
    text: det.type === "password" ? undefined : det.text,
  };
}
