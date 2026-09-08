import type { DOMElementType } from "./types";

/**
 * Attribute name used to tag elements in the live DOM for fast, deterministic resolution.
 */
export const REDACTEYE_ID_ATTR = "data-redacteye-id";

/**
 * Regular expression matching sensitive identifier substrings that should never
 * be incorporated into generated element IDs.
 */
const SENSITIVE_NAME_REGEX =
  /(password|passwd|secret|token|auth|cookie|cvv|credit|card|ssn|pin|key)/i;

/**
 * Helper to escape CSS attribute selector values safely across environments.
 */
function escapeAttrValue(val: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(val);
  }
  return val.replace(/(["\\])/g, "\\$1");
}

/**
 * Normalizes an attribute string to a safe, clean identifier component.
 */
function sanitizeIdentifierPart(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 32);
}

/**
 * Generator for unique, stable, deterministic element IDs within a DOM extraction run.
 */
export class ElementIdGenerator {
  private usedIds = new Set<string>();
  private typeCounts = new Map<string, number>();

  /**
   * Generates a stable, safe, deterministic ID for an element.
   *
   * Priority:
   * 1. Safe existing DOM id attribute (e.g. `button_submit`)
   * 2. Safe existing DOM name attribute (e.g. `input_email`)
   * 3. Sequential type-based identifier (e.g. `button_1`, `link_3`)
   *
   * Guarantees:
   * - Never includes passwords, credentials, input values, or query strings.
   * - Deterministic for the same DOM structure.
   * - Unique within the snapshot run.
   */
  public generateId(element: Element, type: DOMElementType): string {
    const rawDomId = element.getAttribute("id")?.trim();
    const rawName = element.getAttribute("name")?.trim();

    let candidate: string | null = null;

    // 1. Check existing DOM id
    if (rawDomId && !SENSITIVE_NAME_REGEX.test(rawDomId)) {
      const sanitized = sanitizeIdentifierPart(rawDomId);
      if (sanitized.length > 0) {
        candidate = `${type}_${sanitized}`;
      }
    }

    // 2. Check existing DOM name if no DOM id
    if (!candidate && rawName && !SENSITIVE_NAME_REGEX.test(rawName)) {
      const sanitized = sanitizeIdentifierPart(rawName);
      if (sanitized.length > 0) {
        candidate = `${type}_name_${sanitized}`;
      }
    }

    // 3. Fallback to sequential type counter
    const currentCount = (this.typeCounts.get(type) ?? 0) + 1;
    this.typeCounts.set(type, currentCount);

    if (!candidate) {
      candidate = `${type}_${currentCount}`;
    }

    // 4. Ensure absolute uniqueness within the snapshot
    let finalId = candidate;
    let disambiguation = 1;
    while (this.usedIds.has(finalId)) {
      disambiguation++;
      finalId = `${candidate}_${disambiguation}`;
    }

    this.usedIds.add(finalId);
    return finalId;
  }
}

/**
 * Resolves an element ID back to the corresponding live DOM element.
 *
 * @param elementId The element ID generated during DOM snapshot extraction.
 * @param root Document or parent element to search within. Defaults to global `document`.
 */
export function resolveElement(
  elementId: string,
  root?: Document | Element
): Element | null {
  if (!elementId) return null;

  const doc =
    root ??
    (typeof document !== "undefined" ? document : null);

  if (!doc) return null;

  // 1. Primary lookup by data-redacteye-id
  try {
    const escaped = escapeAttrValue(elementId);
    const found = doc.querySelector(`[${REDACTEYE_ID_ATTR}="${escaped}"]`);
    if (found) {
      return found;
    }
  } catch {
    // If selector throws, fall through to fallback resolution
  }

  // 2. Fallback lookup if elementId was derived from native DOM id (e.g. `button_login` or `input_id_username`)
  const parts = elementId.split("_");
  if (parts.length >= 2) {
    const rawIdPart = parts.slice(1).join("_");
    if (rawIdPart) {
      const byId =
        "getElementById" in doc
          ? (doc as Document).getElementById(rawIdPart)
          : doc.querySelector(`#${escapeAttrValue(rawIdPart)}`);
      if (byId) {
        return byId;
      }
    }
  }

  return null;
}

/**
 * Clears all data-redacteye-id attributes from the given DOM tree.
 */
export function clearRedactEyeIds(root?: Document | Element): void {
  const doc =
    root ??
    (typeof document !== "undefined" ? document : null);
  if (!doc) return;

  const tagged = doc.querySelectorAll(`[${REDACTEYE_ID_ATTR}]`);
  tagged.forEach((el) => el.removeAttribute(REDACTEYE_ID_ATTR));
}
