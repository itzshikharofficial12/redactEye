/**
 * Privacy Guard module for RedactEye privacy engine.
 *
 * Serves as the final local security firewall between raw browser data
 * and external network transmission. Orchestrates screenshot redaction,
 * DOM sanitization, and strict multi-phase verification.
 *
 * CRITICAL RULE: Fails closed. If safety cannot be verified, blocks request.
 */

import type {
  BrowserState,
  Detection,
  DOMElement,
  DOMSnapshot,
  SanitizedContext,
  SensitiveRegion,
} from "@redact-eye/shared-types";
import { isPasswordElement } from "./detectPII.js";
import { isValidBoundingBox, SENSITIVE_DETECTION_TYPES } from "./fuse.js";
import { redactImage, type RawImageData, type RedactionResult } from "./redact.js";
import { sanitizeDomSnapshot } from "./sanitizeDom.js";

/**
 * Custom error thrown when Privacy Guard blocks a context due to validation or verification failures.
 * Never includes raw PII, passwords, or image bytes.
 */
export class PrivacyGuardError extends Error {
  public readonly category: string;

  constructor(message: string, category = "PRIVACY_GUARD_VERIFICATION_FAILURE") {
    super(message);
    this.name = "PrivacyGuardError";
    this.category = category;
  }
}

/**
 * Input to Privacy Guard orchestration and verification.
 */
export interface PrivacyGuardInput {
  rawScreenshot: ImageData | RawImageData;
  rawDomSnapshot: DOMSnapshot;
  detections: (Detection | SensitiveRegion)[];
  browserMetadata?: Partial<Omit<BrowserState, "dom">>;
}

/**
 * Verified safe context payload returned by Privacy Guard.
 * Extends SanitizedContext with the sanitized visual screenshot frame.
 */
export interface PrivacyGuardResult extends SanitizedContext {
  sanitizedScreenshot: RawImageData;
}

/**
 * Privacy Guard orchestrator and verifier.
 */
export class PrivacyGuard {
  /**
   * Sanitizes and verifies raw screenshot, DOM snapshot, and detections.
   * Fails closed: throws PrivacyGuardError if any verification check fails.
   */
  public sanitize(
    inputOrScreenshot: PrivacyGuardInput | ImageData | RawImageData,
    rawDomSnapshotOrNone?: DOMSnapshot,
    detectionsOrNone?: (Detection | SensitiveRegion)[],
    browserMetadataOrNone?: Partial<Omit<BrowserState, "dom">>
  ): PrivacyGuardResult {
    // 1. Resolve arguments
    let rawScreenshot: ImageData | RawImageData;
    let rawDomSnapshot: DOMSnapshot;
    let detections: (Detection | SensitiveRegion)[];
    let browserMetadata: Partial<Omit<BrowserState, "dom">> | undefined;

    if (
      inputOrScreenshot &&
      typeof inputOrScreenshot === "object" &&
      "rawScreenshot" in inputOrScreenshot
    ) {
      const input = inputOrScreenshot as PrivacyGuardInput;
      rawScreenshot = input.rawScreenshot;
      rawDomSnapshot = input.rawDomSnapshot;
      detections = input.detections;
      browserMetadata = input.browserMetadata;
    } else {
      rawScreenshot = inputOrScreenshot as ImageData | RawImageData;
      rawDomSnapshot = rawDomSnapshotOrNone as DOMSnapshot;
      detections = detectionsOrNone as (Detection | SensitiveRegion)[];
      browserMetadata = browserMetadataOrNone;
    }

    // 2. Validate raw inputs and detection geometry
    this.validateInputs(rawScreenshot, rawDomSnapshot, detections, browserMetadata);

    // 3. Determine sensitive detections
    const sensitiveDetections = detections.filter(
      (d) => d && SENSITIVE_DETECTION_TYPES.has(d.type)
    );

    // 4. Generate sanitized screenshot via redactImage()
    let redactionResult: RedactionResult;
    try {
      redactionResult = this.performRedaction(rawScreenshot, sensitiveDetections);
    } catch (err) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: screenshot redaction failed.",
        "REDACTION_EXECUTION_FAILURE"
      );
    }

    // 5. Generate sanitized DOM via sanitizeDomSnapshot()
    let sanitizedDom: DOMSnapshot;
    try {
      sanitizedDom = this.performDomSanitization(rawDomSnapshot, detections);
    } catch (err) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: DOM sanitization failed.",
        "DOM_SANITIZATION_EXECUTION_FAILURE"
      );
    }

    // 6. Perform FINAL strict verification
    const screenshotVerified = this.verifySanitizedScreenshot(
      redactionResult.sanitizedImageData,
      rawScreenshot,
      sensitiveDetections
    );
    if ((screenshotVerified as unknown) === false) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: screenshot verification failed.",
        "SCREENSHOT_VERIFICATION_FAILURE"
      );
    }
    const domVerified = this.verifySanitizedDom(sanitizedDom, rawDomSnapshot, sensitiveDetections);
    if ((domVerified as unknown) === false) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: DOM verification failed.",
        "DOM_VERIFICATION_FAILURE"
      );
    }

    // 7. Construct verified SanitizedContext
    const sensitiveRegions: SensitiveRegion[] = sensitiveDetections.map((det) => ({
      id: det.id,
      type: det.type,
      bbox: { ...det.bbox },
      confidence: det.confidence ?? 1.0,
      sources: Array.isArray(det.sources) ? [...det.sources] : ["fusion"],
      redaction: "mask" as const,
    }));

    const statistics = {
      totalDetections: detections.length,
      sensitiveDetections: sensitiveDetections.length,
      redactedRegions: sensitiveRegions.length,
    };

    const browser: Omit<BrowserState, "dom"> = {
      url: browserMetadata?.url ?? "about:blank",
      title: browserMetadata?.title ?? "",
      viewport: browserMetadata?.viewport ?? {
        width: rawScreenshot.width,
        height: rawScreenshot.height,
        devicePixelRatio: 1,
      },
      scrollX: browserMetadata?.scrollX ?? 0,
      scrollY: browserMetadata?.scrollY ?? 0,
    };

    return {
      browser,
      sanitizedDom,
      sensitiveRegions,
      statistics,
      sanitizedScreenshot: redactionResult.sanitizedImageData,
    };
  }

  /**
   * Validates all raw inputs and detection geometry prior to sanitization.
   */
  protected validateInputs(
    rawScreenshot: ImageData | RawImageData,
    rawDomSnapshot: DOMSnapshot,
    detections: (Detection | SensitiveRegion)[],
    browserMetadata?: Partial<Omit<BrowserState, "dom">>
  ): void {
    // Screenshot validation
    if (!rawScreenshot || !rawScreenshot.data) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: missing screenshot buffer.",
        "INVALID_SCREENSHOT"
      );
    }

    const { width, height } = rawScreenshot;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: invalid screenshot dimensions.",
        "INVALID_SCREENSHOT_DIMENSIONS"
      );
    }

    const expectedLength = width * height * 4;
    if (rawScreenshot.data.length !== expectedLength) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: screenshot buffer length mismatch.",
        "CORRUPTED_SCREENSHOT_BUFFER"
      );
    }

    // DOM snapshot validation
    if (!rawDomSnapshot || !Array.isArray(rawDomSnapshot.elements)) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: missing or invalid DOM snapshot.",
        "INVALID_DOM_SNAPSHOT"
      );
    }

    // Detection collection validation
    if (!Array.isArray(detections)) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: detections must be an array.",
        "INVALID_DETECTIONS"
      );
    }

    // Check each detection for valid structure and finite geometry
    for (const det of detections) {
      if (!det || typeof det !== "object") {
        throw new PrivacyGuardError(
          "PrivacyGuard blocked context: malformed detection object.",
          "INVALID_DETECTION"
        );
      }

      if (!det.type || typeof det.type !== "string") {
        throw new PrivacyGuardError(
          "PrivacyGuard blocked context: detection missing type.",
          "INVALID_DETECTION_TYPE"
        );
      }

      if (!det.bbox || !isValidBoundingBox(det.bbox)) {
        throw new PrivacyGuardError(
          "PrivacyGuard blocked context: detection contains invalid bounding box geometry.",
          "INVALID_DETECTION_GEOMETRY"
        );
      }
    }

    // Browser metadata validation (leakage check for query param credentials)
    if (browserMetadata) {
      const url = browserMetadata.url ?? "";
      const title = browserMetadata.title ?? "";
      if (
        /(password|pwd|secret|api_key|token)=[^&]+/i.test(url) ||
        /(password|pwd|secret)=/i.test(title)
      ) {
        throw new PrivacyGuardError(
          "PrivacyGuard blocked context: credentials detected in browser metadata.",
          "LEAKED_METADATA"
        );
      }
    }
  }

  /**
   * Applies screenshot redaction. Overridable for testing.
   */
  protected performRedaction(
    rawScreenshot: ImageData | RawImageData,
    sensitiveDetections: (Detection | SensitiveRegion)[]
  ): RedactionResult {
    return redactImage({
      imageData: rawScreenshot,
      width: rawScreenshot.width,
      height: rawScreenshot.height,
      regions: sensitiveDetections,
    });
  }

  /**
   * Applies DOM sanitization. Overridable for testing.
   */
  protected performDomSanitization(
    rawDom: DOMSnapshot,
    detections: (Detection | SensitiveRegion)[]
  ): DOMSnapshot {
    return sanitizeDomSnapshot(rawDom, detections);
  }

  /**
   * Verifies that the sanitized screenshot meets all privacy and safety criteria.
   */
  protected verifySanitizedScreenshot(
    sanitizedScreenshot: RawImageData,
    rawScreenshot: ImageData | RawImageData,
    sensitiveDetections: (Detection | SensitiveRegion)[]
  ): void {
    if (!sanitizedScreenshot || !sanitizedScreenshot.data) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: missing sanitized screenshot result.",
        "SCREENSHOT_VERIFICATION_FAILURE"
      );
    }

    // Verify dimensions
    if (
      sanitizedScreenshot.width !== rawScreenshot.width ||
      sanitizedScreenshot.height !== rawScreenshot.height
    ) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: sanitized screenshot dimensions changed.",
        "SCREENSHOT_VERIFICATION_FAILURE"
      );
    }

    // Verify buffer length
    const expectedLength = rawScreenshot.width * rawScreenshot.height * 4;
    if (sanitizedScreenshot.data.length !== expectedLength) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: sanitized screenshot buffer length mismatch.",
        "SCREENSHOT_VERIFICATION_FAILURE"
      );
    }

    // Verify immutability: output buffer must not be the exact same buffer as input
    if (sanitizedScreenshot.data === rawScreenshot.data) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: sanitized screenshot buffer is identical to mutable input.",
        "SCREENSHOT_VERIFICATION_FAILURE"
      );
    }

    // Verify every sensitive detection is covered by opaque black pixels [0, 0, 0, 255]
    const width = sanitizedScreenshot.width;
    const height = sanitizedScreenshot.height;
    const data = sanitizedScreenshot.data;

    for (const det of sensitiveDetections) {
      const xStart = Math.max(0, Math.floor(det.bbox.x));
      const yStart = Math.max(0, Math.floor(det.bbox.y));
      const xEnd = Math.min(width, Math.ceil(det.bbox.x + det.bbox.width));
      const yEnd = Math.min(height, Math.ceil(det.bbox.y + det.bbox.height));

      if (xStart >= xEnd || yStart >= yEnd) {
        continue; // Out of bounds, no pixels on viewport
      }

      for (let py = yStart; py < yEnd; py++) {
        const rowOffset = py * width;
        for (let px = xStart; px < xEnd; px++) {
          const idx = (rowOffset + px) * 4;
          if (
            data[idx] !== 0 ||
            data[idx + 1] !== 0 ||
            data[idx + 2] !== 0 ||
            data[idx + 3] !== 255
          ) {
            throw new PrivacyGuardError(
              "PrivacyGuard blocked context: screenshot verification failed - unmasked pixels in sensitive region.",
              "SCREENSHOT_UNMASKED_PIXELS"
            );
          }
        }
      }
    }
  }

  /**
   * Verifies that the sanitized DOM meets all privacy and safety criteria.
   */
  protected verifySanitizedDom(
    sanitizedDom: DOMSnapshot,
    rawDom: DOMSnapshot,
    sensitiveDetections: (Detection | SensitiveRegion)[]
  ): void {
    if (!sanitizedDom || !Array.isArray(sanitizedDom.elements)) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: missing or malformed sanitized DOM.",
        "DOM_VERIFICATION_FAILURE"
      );
    }

    // Verify immutability: new objects created
    if (sanitizedDom === rawDom || sanitizedDom.elements === rawDom.elements) {
      throw new PrivacyGuardError(
        "PrivacyGuard blocked context: sanitized DOM mutated or shares reference with raw snapshot.",
        "DOM_VERIFICATION_FAILURE"
      );
    }

    // Map raw elements by ID for comparative verification
    const rawMap = new Map<string, DOMElement>();
    for (const el of rawDom.elements) {
      if (el && el.id) {
        rawMap.set(el.id, el);
      }
    }

    // Verify every element in sanitized DOM
    for (const sEl of sanitizedDom.elements) {
      if (!sEl) continue;

      const rawEl = sEl.id ? rawMap.get(sEl.id) : undefined;
      const isPassword = rawEl ? isPasswordElement(rawEl) : isPasswordElement(sEl);

      // Password fields must NEVER contain raw value
      if (isPassword) {
        if (sEl.value !== undefined && sEl.value !== "[REDACTED]") {
          throw new PrivacyGuardError(
            "PrivacyGuard blocked context: password element in sanitized DOM was not redacted.",
            "PASSWORD_VALUE_LEAKAGE"
          );
        }
      }

      // Explicitly sensitive elements must be redacted
      if (sEl.sensitive === true) {
        if (sEl.value !== undefined && sEl.value !== "[REDACTED]") {
          throw new PrivacyGuardError(
            "PrivacyGuard blocked context: sensitive element in sanitized DOM was not redacted.",
            "SENSITIVE_VALUE_LEAKAGE"
          );
        }
      }
    }

    // Final leakage verification: check that known secret strings from detections are absent from sanitized DOM
    for (const det of sensitiveDetections) {
      const text = "text" in det ? det.text : undefined;
      if (text && typeof text === "string" && text.length > 0) {
        const secret = text;
        for (const el of sanitizedDom.elements) {
          if (!el) continue;
          if (
            (el.value && el.value.includes(secret)) ||
            (el.text && el.text.includes(secret))
          ) {
            throw new PrivacyGuardError(
              "PrivacyGuard blocked context: raw sensitive text detected in sanitized DOM element.",
              "LEAKED_SECRET_IN_DOM"
            );
          }
        }
      }
    }
  }
}

/** Singleton default instance */
export const privacyGuard = new PrivacyGuard();

/** Standalone convenience entry point */
export function sanitizeContext(
  inputOrScreenshot: PrivacyGuardInput | ImageData | RawImageData,
  rawDomSnapshotOrNone?: DOMSnapshot,
  detectionsOrNone?: (Detection | SensitiveRegion)[],
  browserMetadataOrNone?: Partial<Omit<BrowserState, "dom">>
): PrivacyGuardResult {
  return privacyGuard.sanitize(
    inputOrScreenshot as any,
    rawDomSnapshotOrNone,
    detectionsOrNone,
    browserMetadataOrNone
  );
}
