/**
 * Rule-based and pattern-based PII detection for RedactEye privacy engine.
 *
 * Implements detection for:
 * 1. Email addresses (OCR text detections via regex)
 * 2. Phone numbers (OCR text detections via regex/heuristics, including +91 formats)
 * 3. Password fields (DOM element metadata — NEVER reads DOMElement.value)
 */

import type { Detection, DOMElement } from "@redact-eye/shared-types";

/**
 * Deterministic regular expression matching valid email addresses.
 * Requires a standard user/local part, domain name, and a valid TLD (2+ alphabetic characters).
 * Avoids false positives on plain text, missing TLDs, or multiple consecutive @ signs.
 */
export const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9]+([.-][A-Za-z0-9]+)*\.[A-Za-z]{2,}\b/;

/**
 * Deterministic regular expression matching standard phone numbers.
 * Supports:
 * - Indian formats: +91-90000-00000, 90000-00000, +91 90000 00000, 9876543210
 * - International / US formats: +1-555-123-4567, (555) 123-4567, 555-123-4567
 */
export const PHONE_REGEX = /(?:(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4,5}\b|(?:\+\d{1,3}[-.\s]?)?\d{5}[-.\s]\d{5}\b|\b\d{10}\b)/;

/**
 * Regex identifying calendar dates (e.g. 1990-01-15, 01/15/1990) to prevent false positive phone matches.
 */
export const DATE_REGEX = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/;

/**
 * Determines whether the given text string contains a valid email address.
 *
 * @param text - Candidate text string from OCR.
 * @returns boolean indicating if a valid email is present.
 */
export function isEmail(text?: string | null): boolean {
  if (!text || typeof text !== "string") return false;
  return EMAIL_REGEX.test(text);
}

/**
 * Determines whether the given text string contains a valid phone number.
 * Excludes dates (e.g. 1990-01-15), short numbers, and non-numeric strings.
 *
 * @param text - Candidate text string from OCR.
 * @returns boolean indicating if a valid phone number is present.
 */
export function isPhone(text?: string | null): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (DATE_REGEX.test(trimmed)) return false;

  const match = trimmed.match(PHONE_REGEX);
  if (!match) return false;

  // Extract digits and verify realistic phone number length (10 to 15 digits)
  const digits = match[0].replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Set of standard HTML input types that are explicitly non-passwords.
 */
const NON_PASSWORD_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "image",
  "month",
  "number",
  "radio",
  "range",
  "reset",
  "search",
  "submit",
  "tel",
  "time",
  "url",
  "week",
]);

/**
 * Determines whether a DOM element is a password field strictly from metadata.
 *
 * CRITICAL PRIVACY INVARIANT:
 * This function NEVER accesses or evaluates `element.value`.
 * Classification is derived entirely from `inputType`, `type`, `tagName`,
 * `placeholder`, `ariaLabel`, and element attributes.
 *
 * @param element - DOM element extracted by the browser extension.
 * @returns boolean indicating if the element represents a password field.
 */
export function isPasswordElement(element: DOMElement): boolean {
  if (!element) return false;

  // 1. Explicit inputType === "password" always qualifies
  const inputType = element.inputType?.toLowerCase();
  if (inputType === "password") {
    return true;
  }

  // 2. Element must be an interactive input tag
  const isInputTag = element.type === "input" || element.tagName?.toLowerCase() === "input";
  if (!isInputTag) {
    return false;
  }

  // 3. Exclude explicit non-password input types (e.g. email, tel, search, checkbox)
  if (inputType && NON_PASSWORD_INPUT_TYPES.has(inputType)) {
    return false;
  }

  // Also reject if element.type is explicitly a non-input type (e.g. type="checkbox")
  if (element.type && element.type !== "input" && NON_PASSWORD_INPUT_TYPES.has(element.type.toLowerCase())) {
    return false;
  }

  // 4. Exclude search roles
  const role = element.role?.toLowerCase();
  if (role === "search" || role === "searchbox") {
    return false;
  }

  // 5. Exclude negative contextual indicators on metadata to prevent false positives
  // (e.g. "forgot-password-email", "Search password policies", "Password reset username")
  const placeholder = element.placeholder?.toLowerCase();
  const ariaLabel = element.ariaLabel?.toLowerCase();
  const id = element.id?.toLowerCase();

  const isSearchQuery =
    placeholder?.startsWith("search") ||
    ariaLabel?.startsWith("search") ||
    id?.includes("search");

  const isEmailRecovery =
    placeholder?.includes("email") ||
    ariaLabel?.includes("email") ||
    id?.includes("email");

  const isUsernameIdentifier =
    placeholder?.includes("username") ||
    ariaLabel?.includes("username") ||
    ariaLabel?.includes("user name") ||
    (id?.includes("username") && !id.includes("password"));

  if (isSearchQuery || isEmailRecovery || isUsernameIdentifier) {
    return false;
  }

  // 6. Positive password heuristics for text inputs (e.g. show-password toggle, custom widgets)
  if (role === "password") {
    return true;
  }
  if (ariaLabel && ariaLabel.includes("password")) {
    return true;
  }
  if (placeholder && placeholder.includes("password")) {
    return true;
  }
  if (id && (id.includes("password") || id.includes("passwd") || id.includes("pwd"))) {
    return true;
  }

  return false;
}

/**
 * Runs rule-based and pattern-based PII detection over OCR text detections and DOM elements.
 *
 * Identifies:
 * - Emails: from OCR text detections matching email pattern (source: "regex")
 * - Phones: from OCR text detections matching phone pattern (source: "regex")
 * - Passwords: from DOM element metadata without reading value (source: "dom")
 *
 * PRIVACY GUARANTEE:
 * - DOMElement.value is NEVER read or copied for password fields.
 * - Raw sensitive strings are NOT attached to output detections.
 * - Bounding boxes from original OCR detections and DOM elements are strictly preserved.
 *
 * @param textDetections - OCR detections from the vision engine with `type: "text"`.
 * @param domElements - DOM elements extracted by the browser extension.
 * @returns Array of structured `Detection` objects classified by PII category.
 */
export function detectPII(
  textDetections: Detection[] = [],
  domElements: DOMElement[] = []
): Detection[] {
  const piiDetections: Detection[] = [];

  // 1. Password detection from DOM element metadata (NEVER accesses element.value)
  if (Array.isArray(domElements)) {
    for (const el of domElements) {
      if (isPasswordElement(el)) {
        piiDetections.push({
          id: el.id,
          type: "password",
          bbox: {
            x: el.bbox.x,
            y: el.bbox.y,
            width: el.bbox.width,
            height: el.bbox.height,
          },
          confidence: 1.0,
          sources: ["dom"],
          // Note: `text` is intentionally omitted. Password values are never read.
        });
      }
    }
  }

  // 2. Email and Phone detection from OCR text detections
  if (Array.isArray(textDetections)) {
    for (const det of textDetections) {
      const text = det.text;
      if (!text || typeof text !== "string") continue;

      if (isEmail(text)) {
        piiDetections.push({
          id: det.id,
          type: "email",
          bbox: {
            x: det.bbox.x,
            y: det.bbox.y,
            width: det.bbox.width,
            height: det.bbox.height,
          },
          confidence: det.confidence ?? 0.95,
          sources: ["regex"],
        });
      } else if (isPhone(text)) {
        piiDetections.push({
          id: det.id,
          type: "phone",
          bbox: {
            x: det.bbox.x,
            y: det.bbox.y,
            width: det.bbox.width,
            height: det.bbox.height,
          },
          confidence: det.confidence ?? 0.90,
          sources: ["regex"],
        });
      }
    }
  }

  return piiDetections;
}
