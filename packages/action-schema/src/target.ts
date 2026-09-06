/**
 * Target definitions for browser actions.
 *
 * SECURITY NOTICE:
 * Action targets only support explicit element IDs or numeric viewport coordinates.
 * Arbitrary CSS selectors, XPath expressions, or executable code are strictly disallowed
 * to eliminate injection vectors from untrusted server responses.
 */

/**
 * Target referring to a distinct DOM element by its assigned identifier.
 */
export interface ElementTarget {
  elementId: string;
}

/**
 * Target referring to explicit (x, y) coordinates within the active viewport frame.
 */
export interface CoordinateTarget {
  x: number;
  y: number;
}

/**
 * Supported target types for browser interactions.
 */
export type ActionTarget =
  | ElementTarget
  | CoordinateTarget;
