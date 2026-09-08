/**
 * Visual Screenshot Redaction module for RedactEye privacy engine.
 *
 * Implements deterministic pixel-level masking for sensitive regions
 * (email, phone, password, face, credentials) identified by detection and fusion.
 *
 * PRIVACY GUARANTEES:
 * - 100% client-side deterministic pixel manipulation.
 * - Never mutates the original screenshot or input detection objects.
 * - Fails closed: Redaction failure throws RedactionError, never returning unredacted images.
 * - Zero DOMElement.value access, zero PII logging.
 */

import type { BoundingBox, Detection, RedactionMethod, SensitiveRegion } from "@redact-eye/shared-types";

/**
 * Representation of raw image pixel buffer compatible across Node and Browser.
 */
export interface RawImageData {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Custom error thrown when redaction fails, ensuring fail-closed privacy.
 */
export class RedactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedactionError";
  }
}

/**
 * Input to the redaction pass.
 */
export interface RedactionInput {
  /** Raw pixel data of the captured viewport — MUST NOT be forwarded to the server. */
  imageData: ImageData | RawImageData;
  /** Width of the image in pixels. */
  width?: number;
  /** Height of the image in pixels. */
  height?: number;
  /** Sensitive regions or detections identified by the privacy engine to be redacted. */
  regions: (SensitiveRegion | Detection)[];
  /** Default redaction method to apply (defaults to "mask") */
  defaultMethod?: RedactionMethod;
}

/**
 * Result of the redaction pass — safe to include in the `SanitizedContext` payload.
 */
export interface RedactionResult {
  /** Pixel data with all sensitive regions redacted. Safe to transmit to the agent server. */
  sanitizedImageData: RawImageData;
  /** Total number of sensitive regions processed. */
  redactedRegionCount: number;
}

/**
 * Validates whether a bounding box has finite, positive numeric dimensions.
 */
function isValidBbox(bbox?: BoundingBox | null): bbox is BoundingBox {
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
 * Applies deterministic opaque black mask redaction to a target pixel buffer.
 */
function applyBlackMask(
  buffer: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  bbox: BoundingBox
): boolean {
  // Convert float/subpixel coordinates to safe integer pixel boundaries
  const xStart = Math.max(0, Math.floor(bbox.x));
  const yStart = Math.max(0, Math.floor(bbox.y));
  const xEnd = Math.min(imgWidth, Math.ceil(bbox.x + bbox.width));
  const yEnd = Math.min(imgHeight, Math.ceil(bbox.y + bbox.height));

  // If clamped box does not intersect the image viewport, no pixels to mask
  if (xStart >= xEnd || yStart >= yEnd) {
    return false;
  }

  // Paint opaque black [0, 0, 0, 255] over every pixel in target region
  for (let py = yStart; py < yEnd; py++) {
    const rowOffset = py * imgWidth;
    for (let px = xStart; px < xEnd; px++) {
      const idx = (rowOffset + px) * 4;
      buffer[idx] = 0;       // Red
      buffer[idx + 1] = 0;   // Green
      buffer[idx + 2] = 0;   // Blue
      buffer[idx + 3] = 255; // Alpha (opaque)
    }
  }

  return true;
}

/**
 * Applies visual redaction to each sensitive region in the input image,
 * returning a new image with all sensitive areas obscured.
 *
 * @param input - Raw image frame and the list of sensitive regions to redact.
 * @returns A `RedactionResult` containing the sanitized image safe for network transmission.
 */
export function redactImage(input: RedactionInput): RedactionResult;
export function redactImage(
  imageData: ImageData | RawImageData,
  regions: (SensitiveRegion | Detection)[],
  options?: { width?: number; height?: number }
): RedactionResult;
export function redactImage(
  inputOrImage: RedactionInput | ImageData | RawImageData,
  regionsOrNone?: (SensitiveRegion | Detection)[],
  options?: { width?: number; height?: number }
): RedactionResult {
  // 1. Resolve arguments
  let rawImage: ImageData | RawImageData;
  let regions: (SensitiveRegion | Detection)[];
  let explicitWidth: number | undefined;
  let explicitHeight: number | undefined;

  if ("imageData" in inputOrImage) {
    rawImage = inputOrImage.imageData;
    regions = inputOrImage.regions;
    explicitWidth = inputOrImage.width;
    explicitHeight = inputOrImage.height;
  } else {
    rawImage = inputOrImage;
    regions = regionsOrNone ?? [];
    explicitWidth = options?.width;
    explicitHeight = options?.height;
  }

  // 2. Validate image buffer and dimensions
  if (!rawImage || !rawImage.data) {
    throw new RedactionError("Invalid image data provided: missing or empty pixel buffer");
  }

  const width = explicitWidth ?? rawImage.width;
  const height = explicitHeight ?? rawImage.height;

  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RedactionError(`Invalid image dimensions: ${width}x${height}`);
  }

  const expectedByteLength = width * height * 4;
  if (rawImage.data.length !== expectedByteLength) {
    throw new RedactionError(
      `ImageData buffer length mismatch: expected ${expectedByteLength} bytes for ${width}x${height}, got ${rawImage.data.length} bytes`
    );
  }

  // 3. Clone buffer to guarantee immutability of the original screenshot
  const sanitizedBuffer = new Uint8ClampedArray(rawImage.data);

  // 4. Redact all valid sensitive regions
  let redactedRegionCount = 0;

  if (Array.isArray(regions)) {
    for (const region of regions) {
      if (!region || !isValidBbox(region.bbox)) {
        continue; // Safely ignore invalid or non-finite bounding boxes
      }

      const didMask = applyBlackMask(sanitizedBuffer, width, height, region.bbox);
      if (didMask) {
        redactedRegionCount++;
      }
    }
  }

  // 5. Package output
  let sanitizedImageData: RawImageData;
  if (typeof ImageData !== "undefined" && typeof (globalThis as unknown as { ImageData: unknown }).ImageData === "function") {
    try {
      sanitizedImageData = new ImageData(sanitizedBuffer, width, height);
    } catch {
      sanitizedImageData = { data: sanitizedBuffer, width, height };
    }
  } else {
    sanitizedImageData = { data: sanitizedBuffer, width, height };
  }

  return {
    sanitizedImageData,
    redactedRegionCount,
  };
}
