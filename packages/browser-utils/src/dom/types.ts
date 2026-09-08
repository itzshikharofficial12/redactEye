import type {
  DOMElement,
  DOMSnapshot,
  DOMElementType,
  BoundingBox,
} from "@redact-eye/shared-types";

export type { DOMElement, DOMSnapshot, DOMElementType, BoundingBox };

/**
 * Options for customizing DOM snapshot extraction.
 */
export interface ExtractionOptions {
  /**
   * Root document or element to extract from. Defaults to global `document`.
   */
  root?: Document | Element;

  /**
   * Maximum character length for extracted text content on an element.
   * Prevents large text container dumps. Defaults to 200.
   */
  maxTextLength?: number;

  /**
   * Whether to tag live DOM elements with a data attribute (`data-redacteye-id`)
   * for ultra-fast, 100% deterministic resolution back to the live element.
   * Defaults to true.
   */
  tagElements?: boolean;
}
