import type { BoundingBox } from "./geometry";

/**
 * Categorical classifications for extracted interactive and semantic DOM elements.
 */
export type DOMElementType =
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "link"
  | "image"
  | "text"
  | "container"
  | "unknown";

/**
 * Representation of an individual extracted browser DOM element.
 *
 * CRITICAL PRIVACY BOUNDARY:
 * `DOMElement` holds local browser state extracted on the client machine.
 * `DOMElement.value` represents RAW LOCAL BROWSER DATA and MUST NOT be included
 * in any remote or sanitized context without explicit sanitization.
 * Password fields and other sensitive input values must be removed or replaced
 * before constructing `SanitizedContext`.
 */
export interface DOMElement {
  id: string;
  type: DOMElementType;
  tagName: string;
  role?: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;

  /**
   * Raw input or text value of the element extracted locally from the live DOM.
   *
   * PRIVACY RULE:
   * Represents RAW LOCAL BROWSER DATA. This value MUST NOT be transmitted in
   * any remote or sanitized context without explicit local sanitization.
   * Password fields (e.g. `type="password"`), credentials, card numbers, and other
   * sensitive inputs must be stripped or replaced before constructing `SanitizedContext`.
   */
  value?: string;
  inputType?: string;

  bbox: BoundingBox;

  visible: boolean;
  enabled: boolean;

  sensitive?: boolean;
}

/**
 * Structural snapshot of the DOM at a specific point in time.
 */
export interface DOMSnapshot {
  elements: DOMElement[];
  documentWidth?: number;
  documentHeight?: number;
}
