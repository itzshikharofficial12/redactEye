import type { BoundingBox } from "./geometry";
import type { DOMSnapshot } from "./dom";
import type { BrowserState } from "./browser";
import type { DetectionType, DetectionSource } from "./detection";

/**
 * Strategy applied by the local privacy engine to redact sensitive information.
 */
export type RedactionMethod =
  | "blur"
  | "mask"
  | "remove";

/**
 * A classified sensitive region that has been flagged or masked by the privacy engine.
 */
export interface SensitiveRegion {
  /**
   * Unique identifier matching or referencing the underlying detection.
   */
  id: string;

  /**
   * Category of sensitive data (e.g. password, email, face, credit_card).
   */
  type: DetectionType;

  /**
   * Bounding box geometry of the redacted area.
   */
  bbox: BoundingBox;

  /**
   * Normalized detection confidence score between 0.0 and 1.0.
   */
  confidence: number;

  /**
   * Sources that identified this sensitive region.
   */
  sources: DetectionSource[];

  /**
   * The redaction method applied locally to neutralize this sensitive region.
   */
  redaction: RedactionMethod;
}

/**
 * Aggregate telemetry describing the results of local privacy enforcement.
 */
export interface PrivacyStatistics {
  /**
   * Total number of raw visual/DOM detections identified.
   */
  totalDetections: number;

  /**
   * Number of detections classified as containing sensitive/PII data.
   */
  sensitiveDetections: number;

  /**
   * Number of distinct regions successfully redacted or masked.
   */
  redactedRegions: number;
}

/**
 * Context payload verified safe for transmission across the network to the agent server.
 *
 * CORE PRIVACY PRINCIPLE:
 * SanitizedContext represents information that is SAFE TO SEND to the remote agent.
 * The raw screenshot and raw PII values must NEVER be included in this payload.
 * Sensitive fields in `sanitizedDom` must be stripped or tokenized, and all visual
 * sensitive coordinates are masked prior to any image transmission.
 */
export interface SanitizedContext {
  /**
   * High-level browser and viewport state, excluding raw/unsanitized DOM structures.
   */
  browser: Omit<BrowserState, "dom">;

  /**
   * Sanitized DOM tree containing only safe structural and interactive elements.
   *
   * CRITICAL PRIVACY BOUNDARY:
   * Must NEVER contain raw `DOMElement.value` strings for sensitive fields.
   * Password fields (e.g. `type="password"`), credentials, card numbers, and other
   * sensitive input values must be removed or replaced with safe tokens before
   * constructing `SanitizedContext`.
   */
  sanitizedDom?: DOMSnapshot;

  /**
   * Metadata describing the bounding boxes and types of redacted sensitive regions.
   * Enables the reasoning model to know where privacy masks are without seeing PII.
   */
  sensitiveRegions: SensitiveRegion[];

  /**
   * Summary metrics regarding local privacy engine operations.
   */
  statistics: PrivacyStatistics;
}
