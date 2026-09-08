import type {
  BrowserState,
  DOMElement,
  DOMSnapshot,
  Detection,
  DetectionType,
} from "../types";
import type { PrivacyDetector } from "../types";

/**
 * Regex matching password keywords in attribute strings.
 */
const PASSWORD_REGEX = /(password|passwd|passphrase|pwd)/i;

/**
 * Regex matching email keywords in attribute strings.
 */
const EMAIL_REGEX = /(^|[\W_])(email|e-mail|mail_?address)([\W_]|$)/i;

/**
 * Regex matching phone number keywords in attribute strings.
 */
const PHONE_REGEX = /(^|[\W_])(phone|mobile|cell|telephone|tel_?no)([\W_]|$)/i;

/**
 * Explicit name keywords requiring high semantic specificity to avoid false positives.
 */
const EXPLICIT_NAME_REGEX =
  /(^|[\W_])(full_?name|first_?name|last_?name|sur_?name|given_?name|family_?name)([\W_]|$)/i;

/**
 * Phrases in placeholders/labels indicating a personal name input.
 */
const NAME_PHRASES = [
  "full name",
  "first name",
  "last name",
  "your name",
  "given name",
  "family name",
  "surname",
  "legal name",
];

/**
 * Negative filter: words indicating non-name inputs that must not trigger name PII detection.
 */
const NON_NAME_FILTER =
  /(search|query|filter|find|product|item|title|subject|comment|message|url|link|domain|company|org|tag)/i;

/**
 * Priority order when multiple different PII classifications apply to the same element.
 * Higher index = higher priority.
 */
const PII_TYPE_PRIORITY: Record<string, number> = {
  name: 1,
  phone: 2,
  email: 3,
  password: 4,
};

interface CandidateMatch {
  type: DetectionType;
  confidence: number;
}

/**
 * Evaluates an individual DOMElement for PII signals using ONLY structural and accessibility metadata.
 *
 * CRITICAL PRIVACY GUARANTEE:
 * Does NOT read or process `element.value`.
 */
function evaluateElement(el: DOMElement): CandidateMatch | null {
  const matches: CandidateMatch[] = [];

  const inputType = el.inputType?.toLowerCase() || "";
  const id = el.id || "";
  const placeholder = el.placeholder?.toLowerCase() || "";
  const ariaLabel = el.ariaLabel?.toLowerCase() || "";

  // Check for any extended attributes attached to element (e.g. autocomplete, name)
  const autocomplete = ((el as any).autocomplete || "").toLowerCase();
  const name = ((el as any).name || "").toLowerCase();

  // Combine safe metadata attributes for keyword checks
  const combinedMeta = `${id} ${placeholder} ${ariaLabel} ${name} ${autocomplete}`.toLowerCase();

  // -------------------------------------------------------------------------
  // 1. PASSWORD DETECTION
  // -------------------------------------------------------------------------
  if (inputType === "password" || el.sensitive === true) {
    matches.push({ type: "password", confidence: 1.0 });
  } else if (autocomplete === "current-password" || autocomplete === "new-password") {
    matches.push({ type: "password", confidence: 1.0 });
  } else if (PASSWORD_REGEX.test(combinedMeta)) {
    matches.push({ type: "password", confidence: 0.9 });
  }

  // -------------------------------------------------------------------------
  // 2. EMAIL DETECTION
  // -------------------------------------------------------------------------
  if (inputType === "email" || autocomplete === "email") {
    matches.push({ type: "email", confidence: 1.0 });
  } else if (EMAIL_REGEX.test(combinedMeta) || placeholder.includes("email") || ariaLabel.includes("email")) {
    matches.push({ type: "email", confidence: 0.85 });
  }

  // -------------------------------------------------------------------------
  // 3. PHONE DETECTION
  // -------------------------------------------------------------------------
  if (inputType === "tel" || autocomplete === "tel" || autocomplete.startsWith("tel-")) {
    matches.push({ type: "phone", confidence: 1.0 });
  } else if (PHONE_REGEX.test(combinedMeta) || placeholder.includes("phone") || ariaLabel.includes("phone")) {
    matches.push({ type: "phone", confidence: 0.85 });
  }

  // -------------------------------------------------------------------------
  // 4. NAME DETECTION (Strict false-positive safeguards)
  // -------------------------------------------------------------------------
  const isInputLike = el.type === "input" || el.type === "textarea" || el.tagName === "INPUT" || el.tagName === "TEXTAREA";

  if (isInputLike) {
    // Autocomplete standards for names
    if (
      autocomplete === "name" ||
      autocomplete === "given-name" ||
      autocomplete === "family-name" ||
      autocomplete === "additional-name"
    ) {
      matches.push({ type: "name", confidence: 0.95 });
    } else if (!NON_NAME_FILTER.test(combinedMeta)) {
      // Check for explicit name patterns
      if (EXPLICIT_NAME_REGEX.test(id) || EXPLICIT_NAME_REGEX.test(name)) {
        matches.push({ type: "name", confidence: 0.85 });
      } else if (
        NAME_PHRASES.some((phrase) => placeholder.includes(phrase) || ariaLabel.includes(phrase))
      ) {
        matches.push({ type: "name", confidence: 0.85 });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Deduplicate and select strongest / highest priority classification
  matches.sort((a, b) => {
    const priorityA = PII_TYPE_PRIORITY[a.type] || 0;
    const priorityB = PII_TYPE_PRIORITY[b.type] || 0;
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }
    return b.confidence - a.confidence;
  });

  return matches[0] || null;
}

/**
 * Detects sensitive PII elements within a DOMSnapshot using safe metadata heuristics.
 *
 * @param dom The DOMSnapshot to inspect.
 * @returns Array of Detection objects representing sensitive DOM elements.
 */
export function detectDomPII(dom: DOMSnapshot): Detection[] {
  if (!dom || !Array.isArray(dom.elements)) {
    return [];
  }

  const detections: Detection[] = [];

  for (const element of dom.elements) {
    // Skip invisible or zero-size elements
    if (element.visible === false || element.bbox.width <= 0 || element.bbox.height <= 0) {
      continue;
    }

    const match = evaluateElement(element);
    if (!match) {
      continue;
    }

    detections.push({
      id: `det_${element.id}_${match.type}`,
      type: match.type,
      bbox: element.bbox,
      confidence: match.confidence,
      sources: ["dom"],
      // CRITICAL: never extract or copy text/values into detections!
      text: undefined,
    });
  }

  return detections;
}

/**
 * DOM-based privacy detector implementation conforming to the `PrivacyDetector` pipeline interface.
 */
export class DomPrivacyDetector implements PrivacyDetector {
  public readonly name = "dom";

  public detect(browserState: BrowserState): Detection[] {
    if (!browserState?.dom) {
      return [];
    }
    return detectDomPII(browserState.dom);
  }
}
