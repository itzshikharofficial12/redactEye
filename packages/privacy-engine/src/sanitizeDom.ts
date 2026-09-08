/**
 * DOM Sanitization module for RedactEye privacy engine.
 *
 * Sanitizes extracted DOM snapshots before transmission across network boundaries,
 * ensuring sensitive input values (passwords, emails, phone numbers, credentials)
 * are redacted or stripped while preserving structural context for the remote agent.
 *
 * PRIVACY INVARIANTS:
 * - DOMElement.value of password elements is NEVER read or accessed.
 * - Input DOMSnapshot and Detection objects are NEVER mutated.
 * - Fails closed: malformed or uncertain sensitive elements are masked rather than exposed.
 * - Sensitive values are replaced with "[REDACTED]" or stripped entirely.
 */

import type { Detection, DOMElement, DOMSnapshot, SensitiveRegion } from "@redact-eye/shared-types";
import { isPasswordElement } from "./detectPII.js";
import { computeIoU, computeMaxOverlap, isValidBoundingBox, SENSITIVE_DETECTION_TYPES } from "./fuse.js";

/**
 * Standard token used to mask sensitive values in the DOM.
 */
export const REDACTED_VALUE = "[REDACTED]";

/**
 * Configuration options for DOM sanitization.
 */
export interface SanitizeDomOptions {
  /** Replacement text for sensitive values. Defaults to "[REDACTED]". */
  replacementToken?: string;
  /** Whether to strip the value property entirely instead of replacing with token. Defaults to false. */
  stripValue?: boolean;
}

/**
 * Evaluates whether a DOMElement represents sensitive PII using structural metadata
 * and spatial/ID association with upstream detections.
 *
 * CRITICAL: Does NOT read `el.value`.
 */
function isElementSensitive(
  el: DOMElement,
  detections: (Detection | SensitiveRegion)[]
): boolean {
  // 1. Password elements are always sensitive (metadata evaluation, never accesses .value)
  if (isPasswordElement(el)) {
    return true;
  }

  // 2. Pre-flagged as sensitive
  if (el.sensitive === true) {
    return true;
  }

  // 3. Explicit sensitive input types (password, email, tel)
  const inputType = typeof el.inputType === "string" ? el.inputType.toLowerCase() : "";
  if (inputType === "password" || inputType === "email" || inputType === "tel") {
    return true;
  }

  // 4. Association with detections (via strict ID matching or element-scoped spatial overlap)
  if (Array.isArray(detections) && detections.length > 0) {
    for (const det of detections) {
      if (!det || !SENSITIVE_DETECTION_TYPES.has(det.type)) continue;

      // 4a. Strict token-scoped ID match (never loose substring)
      if (typeof el.id === "string" && el.id.trim().length > 0) {
        if (
          det.id === el.id ||
          det.id === `det_${el.id}` ||
          det.id === `det_${el.id}_${det.type}` ||
          det.id === `${el.id}_${det.type}`
        ) {
          return true;
        }
      }

      // 4b. Spatial matching: Structural containers are NEVER marked sensitive via spatial overlap alone
      const isContainerLike =
        el.type === "container" ||
        el.tagName?.toLowerCase() === "form" ||
        el.tagName?.toLowerCase() === "nav" ||
        el.role === "form";

      if (isContainerLike) {
        continue;
      }

      // 4c. Spatial overlap check for leaf content elements
      if (isValidBoundingBox(det.bbox) && isValidBoundingBox(el.bbox)) {
        const x1 = Math.max(det.bbox.x, el.bbox.x);
        const y1 = Math.max(det.bbox.y, el.bbox.y);
        const x2 = Math.min(det.bbox.x + det.bbox.width, el.bbox.x + el.bbox.width);
        const y2 = Math.min(det.bbox.y + det.bbox.height, el.bbox.y + el.bbox.height);

        const interW = Math.max(0, x2 - x1);
        const interH = Math.max(0, y2 - y1);
        const interArea = interW * interH;

        if (interArea > 0) {
          const areaDet = det.bbox.width * det.bbox.height;
          const areaEl = el.bbox.width * el.bbox.height;
          const unionArea = areaDet + areaEl - interArea;
          const iou = unionArea > 0 ? interArea / unionArea : 0;
          const coverageOfDet = areaDet > 0 ? interArea / areaDet : 0;
          const coverageOfEl = areaEl > 0 ? interArea / areaEl : 0;

          // Must either have significant IoU or substantial two-way containment
          // (prevents parent elements from absorbing small child detections)
          if (iou >= 0.2 || (coverageOfDet >= 0.5 && coverageOfEl >= 0.25)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Sanitizes an individual DOMElement, returning a newly constructed unmutated object.
 * Guaranteed never to read `.value` on password elements.
 */
export function sanitizeDomElement(
  el: DOMElement,
  isSensitive: boolean,
  options?: SanitizeDomOptions
): DOMElement {
  const replacement = options?.replacementToken ?? REDACTED_VALUE;
  const strip = options?.stripValue ?? false;

  // Clone bounding box safely
  const bbox = el.bbox
    ? {
        x: el.bbox.x,
        y: el.bbox.y,
        width: el.bbox.width,
        height: el.bbox.height,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  // Construct new sanitized element with structural metadata preserved
  const sanitized: DOMElement = {
    id: el.id,
    type: el.type,
    tagName: el.tagName,
    role: el.role,
    text: isSensitive && el.text !== undefined ? replacement : el.text,
    ariaLabel: el.ariaLabel,
    placeholder: el.placeholder,
    inputType: el.inputType,
    bbox,
    visible: el.visible,
    enabled: el.enabled,
    sensitive: isSensitive,
  };

  // PASSWORD SECURITY INVARIANT:
  // Password values must NEVER be read from DOMElement.value.
  if (isPasswordElement(el)) {
    const hasValue = Object.prototype.hasOwnProperty.call(el, "value") || ("value" in el);
    if (hasValue && !strip) {
      sanitized.value = replacement;
    }
    return sanitized;
  }

  // Non-password elements: inspect value property safely
  const hasValueProp = Object.prototype.hasOwnProperty.call(el, "value") || ("value" in el);

  if (hasValueProp) {
    let rawVal: string | undefined;
    try {
      rawVal = el.value;
    } catch {
      // Fail closed: if reading value threw an error, treat as sensitive
      rawVal = undefined;
    }

    if (rawVal !== undefined) {
      if (isSensitive) {
        if (!strip) {
          sanitized.value = replacement;
        }
      } else {
        sanitized.value = rawVal;
      }
    }
  }

  return sanitized;
}

/**
 * Produces a deep-sanitized copy of a raw `DOMSnapshot`, stripping or replacing
 * all `DOMElement.value` fields for elements that carry or could carry sensitive data.
 *
 * @param rawSnapshot - The raw DOM snapshot extracted locally by the browser extension.
 * @param detections - Optional detections from vision/privacy pipelines to associate with elements.
 * @param options - Optional sanitization configurations.
 * @returns A new `DOMSnapshot` safe for inclusion in `SanitizedContext.sanitizedDom`.
 *          The original `rawSnapshot` is NOT mutated.
 */
export function sanitizeDomSnapshot(
  rawSnapshot: DOMSnapshot,
  detections: (Detection | SensitiveRegion)[] = [],
  options: SanitizeDomOptions = {}
): DOMSnapshot {
  if (!rawSnapshot || !Array.isArray(rawSnapshot.elements)) {
    return {
      elements: [],
      documentWidth: rawSnapshot?.documentWidth,
      documentHeight: rawSnapshot?.documentHeight,
    };
  }

  const sanitizedElements: DOMElement[] = [];

  for (const el of rawSnapshot.elements) {
    if (!el) continue; // Safe handling of null/undefined elements

    try {
      const isSensitive = isElementSensitive(el, detections);
      const sanitizedEl = sanitizeDomElement(el, isSensitive, options);
      sanitizedElements.push(sanitizedEl);
    } catch {
      // Security fail-closed: if any error occurs processing element, omit raw value entirely
      if (el && el.id) {
        sanitizedElements.push({
          id: el.id,
          type: el.type ?? "unknown",
          tagName: el.tagName ?? "div",
          bbox: el.bbox ? { ...el.bbox } : { x: 0, y: 0, width: 0, height: 0 },
          visible: el.visible ?? false,
          enabled: el.enabled ?? false,
          sensitive: true,
          value: options.stripValue ? undefined : (options.replacementToken ?? REDACTED_VALUE),
        });
      }
    }
  }

  return {
    elements: sanitizedElements,
    documentWidth: rawSnapshot.documentWidth,
    documentHeight: rawSnapshot.documentHeight,
  };
}
