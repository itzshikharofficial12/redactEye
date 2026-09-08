import type { BrowserState, Viewport, DOMSnapshot } from "@redact-eye/shared-types";
import type { ExtractionOptions } from "../dom/types";

export type { BrowserState, Viewport, DOMSnapshot };

/**
 * Local visible-viewport screenshot representation.
 *
 * PRIVACY GUARANTEE:
 * Captured exclusively within the local extension context.
 * Must NEVER be transmitted externally or uploaded without explicit user
 * approval and privacy engine sanitization/redaction.
 */
export interface Screenshot {
  dataUrl: string;
  width: number;
  height: number;
  devicePixelRatio: number;
}

/**
 * Options for capturing visible tab screenshots.
 */
export interface CaptureOptions {
  format?: "png" | "jpeg";
  quality?: number;
}

/**
 * Options for extracting browser page state.
 */
export interface BrowserStateOptions {
  doc?: Document;
  win?: Window;
  extractionOptions?: ExtractionOptions;
}

/**
 * Structured observation error codes.
 */
export type ObservationErrorCode =
  | "NO_ACTIVE_TAB"
  | "RESTRICTED_URL"
  | "CONTENT_SCRIPT_UNAVAILABLE"
  | "CAPTURE_FAILED"
  | "DOM_EXTRACTION_FAILED"
  | "UNKNOWN_ERROR";

/**
 * Successful browser observation containing combined browser state and screenshot.
 */
export interface BrowserObservationSuccess {
  success: true;
  state: BrowserState;
  screenshot: Screenshot;
  tabId?: number;
}

/**
 * Structured failure for browser observation.
 */
export interface BrowserObservationFailure {
  success: false;
  error: string;
  code: ObservationErrorCode;
}

/**
 * Result of observing the current browser state.
 */
export type BrowserObservationResult =
  | BrowserObservationSuccess
  | BrowserObservationFailure;
