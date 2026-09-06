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
 * PRIVACY NOTICE:
 * Do NOT assume that `value` is safe to transmit.
 * While this contract allows capturing `value` locally on the client for perception,
 * all sensitive/PII values must be stripped or redacted by the local privacy engine
 * before any payload leaves the client device.
 */
export interface DOMElement {
  id: string;
  type: DOMElementType;
  tagName: string;
  role?: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
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
