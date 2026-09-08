import type {
  BrowserState,
  DOMElement,
  DOMSnapshot,
  Detection,
  DetectionSource,
  DetectionType,
  SensitiveRegion,
  SanitizedContext,
  PrivacyStatistics,
} from "@redact-eye/shared-types";

export type {
  BrowserState,
  DOMElement,
  DOMSnapshot,
  Detection,
  DetectionSource,
  DetectionType,
  SensitiveRegion,
  SanitizedContext,
  PrivacyStatistics,
};

/**
 * Interface for pluggable privacy detectors in the RedactEye privacy pipeline.
 * Future detectors (e.g. OCR text detector, Face detector, Vision model) will implement this.
 */
export interface PrivacyDetector {
  /** Descriptive name of the detector (e.g. "dom", "ocr", "face"). */
  readonly name: string;

  /**
   * Evaluates the local browser state and returns classified PII detections.
   *
   * MUST NOT perform network calls or read raw input values.
   */
  detect(browserState: BrowserState): Detection[];
}
