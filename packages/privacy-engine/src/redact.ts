// TODO: Implement visual redaction of sensitive regions on a captured screenshot.
//
// This module takes the raw ImageData of the viewport and a list of `SensitiveRegion`
// objects (produced by the privacy engine after fusion) and applies the specified
// `RedactionMethod` to each region:
//
//   - "blur"   → Gaussian or box blur over the bounding box pixels
//   - "mask"   → Fill bounding box with an opaque black rectangle
//   - "remove" → Replace bounding box with a neutral solid colour or pattern
//
// IMPORTANT — Precision requirement:
//   Redaction MUST be precise. Only the sensitive bounding boxes should be obscured.
//   Over-redaction (masking large page areas) degrades agent reasoning quality.
//   The agent server must still be able to understand page structure and non-sensitive content.
//
// Output is a new ImageData (or OffscreenCanvas) safe for transmission to the agent server.

import type { SensitiveRegion } from "@redact-eye/shared-types";

/**
 * Input to the redaction pass.
 */
export interface RedactionInput {
  /** Raw pixel data of the captured viewport — MUST NOT be forwarded to the server. */
  imageData: ImageData;
  /** Width of the image in pixels. */
  width: number;
  /** Height of the image in pixels. */
  height: number;
  /** Sensitive regions identified by the privacy engine to be redacted. */
  regions: SensitiveRegion[];
}

/**
 * Result of the redaction pass — safe to include in the `SanitizedContext` payload.
 */
export interface RedactionResult {
  /** Pixel data with all sensitive regions redacted. Safe to transmit to the agent server. */
  sanitizedImageData: ImageData;
}

/**
 * Applies the specified `RedactionMethod` to each `SensitiveRegion` in the input image,
 * returning a new `ImageData` with all sensitive areas obscured.
 *
 * @param input - Raw image frame and the list of sensitive regions to redact.
 * @returns A `RedactionResult` containing the sanitized image safe for network transmission.
 *
 * TODO: Implement blur, mask, and remove redaction strategies.
 */
export function redactImage(_input: RedactionInput): RedactionResult {
  // TODO: iterate over regions, apply RedactionMethod per region to a cloned ImageData
  // TODO: "blur" — implement Gaussian/box blur kernel over bbox pixels
  // TODO: "mask" — fill bbox with opaque black
  // TODO: "remove" — replace bbox pixels with neutral color
  throw new Error("redactImage: not implemented");
}
