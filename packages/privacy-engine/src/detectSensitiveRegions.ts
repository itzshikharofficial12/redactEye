import type { BrowserState, Detection } from "./types";
import type { PrivacyDetector } from "./types";
import { DomPrivacyDetector } from "./detectors/dom";

/**
 * Deduplicates detections across detector runs.
 * If multiple detections target the same bounding box:
 * - Keeps the highest priority PII type (password > email > phone > name).
 * - Retains the maximum confidence score.
 * - Combines unique sources.
 */
function deduplicateDetections(detections: Detection[]): Detection[] {
  const byElementOrBox = new Map<string, Detection>();

  for (const det of detections) {
    // Key by bbox geometry coordinates
    const key = `${det.bbox.x},${det.bbox.y},${det.bbox.width},${det.bbox.height}`;
    const existing = byElementOrBox.get(key);

    if (!existing) {
      byElementOrBox.set(key, { ...det });
    } else {
      // If same type, take max confidence
      if (existing.type === det.type) {
        existing.confidence = Math.max(existing.confidence, det.confidence);
      } else {
        // Priority resolution: password > email > phone > name
        const priority: Record<string, number> = {
          password: 4,
          email: 3,
          phone: 2,
          name: 1,
        };
        const existingPri = priority[existing.type] || 0;
        const newPri = priority[det.type] || 0;

        if (newPri > existingPri) {
          existing.type = det.type;
          existing.confidence = det.confidence;
          existing.id = det.id;
        }
      }

      // Merge sources without duplicates
      for (const src of det.sources) {
        if (!existing.sources.includes(src)) {
          existing.sources.push(src);
        }
      }
    }
  }

  return Array.from(byElementOrBox.values());
}

/**
 * Modular privacy engine coordinating local privacy detectors.
 */
export class PrivacyEngine {
  private detectors: PrivacyDetector[];

  constructor(detectors?: PrivacyDetector[]) {
    this.detectors = detectors ?? [new DomPrivacyDetector()];
  }

  /**
   * Registers an additional privacy detector into the detection pipeline.
   */
  public registerDetector(detector: PrivacyDetector): void {
    this.detectors.push(detector);
  }

  /**
   * Evaluates the active browser state across all registered detectors
   * and returns deduplicated sensitive PII detections.
   *
   * @param browserState The current local BrowserState.
   * @returns Array of Detection objects representing sensitive PII regions.
   */
  public detectSensitiveRegions(browserState: BrowserState): Detection[] {
    if (!browserState) {
      return [];
    }

    const detections: Detection[] = [];
    for (const detector of this.detectors) {
      try {
        const results = detector.detect(browserState);
        detections.push(...results);
      } catch (err) {
        console.warn(`[PrivacyEngine] Detector ${detector.name} failed:`, err);
      }
    }

    return deduplicateDetections(detections);
  }
}

/** Default singleton privacy engine instance. */
const defaultEngine = new PrivacyEngine();

/**
 * Central API for Checkpoint 8:
 * Consumes local BrowserState and returns detected sensitive PII regions.
 *
 * PRIVACY GUARANTEES:
 * - 100% client-side deterministic evaluation.
 * - Does NOT access `input.value`, `textarea.value`, or user input text.
 * - Does NOT access `document.cookie`, `localStorage`, or `sessionStorage`.
 * - Makes zero network calls.
 *
 * @param browserState The active browser state containing page metadata and DOMSnapshot.
 * @returns Array of Detection objects with bounding boxes, types, and confidence scores.
 */
export function detectSensitiveRegions(browserState: BrowserState): Detection[] {
  return defaultEngine.detectSensitiveRegions(browserState);
}
