import type { BoundingBox } from "./geometry";

/**
 * Types of semantic detections produced by local perception (OCR, CV, regex, DOM heuristics).
 */
export type DetectionType =
  | "text"
  | "face"
  | "email"
  | "phone"
  | "name"
  | "password"
  | "address"
  | "credit_card"
  | "government_id"
  | "date_of_birth"
  | "username"
  | "api_key"
  | "button"
  | "input"
  | "link"
  | "checkbox"
  | "radio"
  | "image"
  | "unknown";

/**
 * Origin of a detection signal.
 * Multiple sources can be combined via detection fusion.
 */
export type DetectionSource =
  | "dom"
  | "ocr"
  | "face"
  | "ui_model"
  | "regex"
  | "nlp"
  | "fusion";

/**
 * A detected entity on the visual screen or within the DOM tree.
 */
export interface Detection {
  /**
   * Unique identifier for this detection instance.
   */
  id: string;

  /**
   * Semantic category of the detected entity or sensitive data.
   */
  type: DetectionType;

  /**
   * Bounding box geometry enclosing the detected entity.
   */
  bbox: BoundingBox;

  /**
   * Normalized detection confidence score between 0.0 (lowest) and 1.0 (highest).
   */
  confidence: number;

  /**
   * List of detectors that contributed to or confirmed this detection.
   */
  sources: DetectionSource[];

  /**
   * Extracted text content associated with the detection (e.g., from OCR).
   *
   * PRIVACY NOTICE:
   * Optional field. Sensitive text must NEVER be exposed or forwarded
   * remotely unless explicitly cleared/sanitized by the privacy engine.
   */
  text?: string;
}
