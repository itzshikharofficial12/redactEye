/**
 * Reusable 2D geometry and coordinate types for RedactEye.
 */

/**
 * Standard 2D bounding box representing an element or detected region.
 * Coordinates are typically relative to the viewport or source image frame.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D coordinate point representing a location on screen or in an image.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Viewport dimensions and display scaling for the active browser window.
 */
export interface Viewport {
  width: number;
  height: number;
  devicePixelRatio?: number;
}
