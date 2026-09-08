import type {
  DOMElement,
  DOMSnapshot,
  DOMElementType,
  ExtractionOptions,
} from "./types";
import {
  getElementBoundingBox,
  isElementVisible,
  isElementEnabled,
} from "./visibility";
import {
  ElementIdGenerator,
  REDACTEYE_ID_ATTR,
} from "./ids";

/**
 * Regex matching input types classified as passwords or credentials.
 */
const SENSITIVE_INPUT_TYPES = new Set(["password"]);

/**
 * Regex matching names, autocomplete, or attributes suggesting sensitive credential data.
 */
const SENSITIVE_ATTR_REGEX =
  /(password|passwd|secret|token|auth|cookie|cvv|credit|card|ssn|pin)/i;

/**
 * Normalizes text content by trimming and collapsing consecutive whitespace.
 */
function normalizeText(raw: string | null | undefined, maxLength: number): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLength ? cleaned.substring(0, maxLength) : cleaned;
}

/**
 * Maps an Element to the project's standard DOMElementType.
 */
function determineElementType(el: Element): DOMElementType | null {
  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute("role")?.toLowerCase();

  // Form input controls
  if (tagName === "input") {
    const inputType = (el.getAttribute("type") || "text").toLowerCase();
    if (inputType === "checkbox") return "checkbox";
    if (inputType === "radio") return "radio";
    if (inputType === "button" || inputType === "submit" || inputType === "reset") return "button";
    if (inputType === "image") return "image";
    if (inputType === "hidden") return null; // Skip hidden inputs
    return "input";
  }

  if (tagName === "button") return "button";
  if (tagName === "textarea") return "textarea";
  if (tagName === "select") return "select";
  if (tagName === "a" && el.hasAttribute("href")) return "link";
  if (tagName === "img") return "image";

  // Heading tags mapped to "text" (with role "heading")
  if (/^h[1-6]$/.test(tagName)) return "text";

  // ARIA role mappings
  if (role) {
    if (role === "button") return "button";
    if (role === "checkbox") return "checkbox";
    if (role === "radio") return "radio";
    if (role === "link") return "link";
    if (role === "textbox" || role === "searchbox") return "input";
    if (role === "combobox" || role === "listbox") return "select";
    if (role === "img") return "image";
    if (role === "heading") return "text";
  }

  // Anchor without href but with role or onclick can be a link/button
  if (tagName === "a") return "link";

  return null;
}

/**
 * Determines whether an element represents sensitive input (e.g. password, credit card).
 */
function isSensitiveElement(el: Element, inputType?: string): boolean {
  if (inputType && SENSITIVE_INPUT_TYPES.has(inputType.toLowerCase())) {
    return true;
  }

  const name = el.getAttribute("name") || "";
  const autocomplete = el.getAttribute("autocomplete") || "";
  const id = el.getAttribute("id") || "";

  return (
    SENSITIVE_ATTR_REGEX.test(name) ||
    SENSITIVE_ATTR_REGEX.test(autocomplete) ||
    SENSITIVE_ATTR_REGEX.test(id)
  );
}

/**
 * Extracts useful visible text from an element without extracting user-entered values.
 */
function extractElementText(el: Element, type: DOMElementType, maxLength: number): string | undefined {
  // Never extract text from input or textarea values!
  if (type === "input" || type === "textarea") {
    return undefined;
  }

  // For images, use alt text
  if (type === "image") {
    const alt = el.getAttribute("alt");
    if (alt) return normalizeText(alt, maxLength);
    return undefined;
  }

  // For buttons and links, extract textContent
  if (type === "button" || type === "link" || type === "text") {
    // Only extract immediate or shallow text, avoiding giant containers
    return normalizeText(el.textContent, maxLength);
  }

  return undefined;
}

/**
 * Extracts a complete DOMSnapshot from the provided document or root element.
 *
 * Privacy & Security Guarantees:
 * - NEVER extracts `input.value` or `textarea.value`.
 * - Password fields are marked `sensitive: true` with `value: undefined`.
 * - Does not access cookies, localStorage, or sessionStorage.
 * - Makes zero network calls.
 * - Uses deterministic, collision-resistant element IDs.
 */
export function extractDOMSnapshot(options: ExtractionOptions = {}): DOMSnapshot {
  const root =
    options.root ??
    (typeof document !== "undefined" ? document : null);

  if (!root) {
    return { elements: [] };
  }

  const maxLength = options.maxTextLength ?? 200;
  const shouldTag = options.tagElements ?? true;

  const idGenerator = new ElementIdGenerator();
  const extractedElements: DOMElement[] = [];

  // Query candidate interactive and semantic elements
  const selector = [
    "button",
    "input",
    "textarea",
    "select",
    "a[href]",
    "img",
    "h1, h2, h3, h4, h5, h6",
    "[role='button']",
    "[role='link']",
    "[role='textbox']",
    "[role='searchbox']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='combobox']",
    "[role='listbox']",
    "[role='img']",
    "[role='heading']",
  ].join(", ");

  const candidateNodes = root.querySelectorAll(selector);

  for (const node of candidateNodes) {
    if (!(node instanceof Element)) continue;

    const type = determineElementType(node);
    if (!type) continue;

    const bbox = getElementBoundingBox(node);
    const visible = isElementVisible(node, bbox);

    // Skip zero-size or non-visible elements if desired, or record with visible=false
    // The requirement states: "Ignore elements with zero/invalid dimensions."
    if (bbox.width <= 0 || bbox.height <= 0) {
      // Element is zero-size, check if hidden
      // If zero dimensions, we ignore or mark visible=false
      // Requirement 9: "Ignore elements with zero/invalid dimensions."
      // Requirement 10: "An element should generally be considered visible only when: it has non-zero dimensions..."
      // Requirement 16: "Tests MUST verify: zero-size elements are handled correctly"
      // If an element is completely 0x0, it has no rendered footprint on screen.
      // We skip it from the interactive snapshot or record it with visible: false.
      // Skipping zero-dimension elements aligns with requirement 9.
      continue;
    }

    const id = idGenerator.generateId(node, type);

    if (shouldTag) {
      try {
        node.setAttribute(REDACTEYE_ID_ATTR, id);
      } catch {
        // Ignore if element is read-only
      }
    }

    const tagName = node.tagName.toUpperCase();
    const explicitRole = node.getAttribute("role");
    const inferredRole = explicitRole || (tagName.startsWith("H") ? "heading" : undefined);
    const ariaLabel = node.getAttribute("aria-label")?.trim() || undefined;
    const placeholder = node.getAttribute("placeholder")?.trim() || undefined;

    let inputType: string | undefined;
    if (node.tagName.toLowerCase() === "input") {
      inputType = (node.getAttribute("type") || "text").toLowerCase();
    }

    const text = extractElementText(node, type, maxLength);
    const enabled = isElementEnabled(node);
    const sensitive = isSensitiveElement(node, inputType);

    const domElement: DOMElement = {
      id,
      type,
      tagName,
      role: inferredRole,
      text,
      ariaLabel,
      placeholder,
      inputType,
      // CRITICAL PRIVACY RULE: value is NEVER populated with raw input values!
      value: undefined,
      bbox,
      visible,
      enabled,
      sensitive: sensitive ? true : undefined,
    };

    extractedElements.push(domElement);
  }

  // Viewport/document dimensions
  let docWidth: number | undefined;
  let docHeight: number | undefined;

  if (typeof window !== "undefined") {
    docWidth = window.innerWidth || document?.documentElement?.clientWidth;
    docHeight = window.innerHeight || document?.documentElement?.clientHeight;
  } else if ("documentElement" in root) {
    const docObj = root as Document;
    docWidth = docObj.documentElement?.clientWidth;
    docHeight = docObj.documentElement?.clientHeight;
  }

  return {
    elements: extractedElements,
    documentWidth: docWidth,
    documentHeight: docHeight,
  };
}
