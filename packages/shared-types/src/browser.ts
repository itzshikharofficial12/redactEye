import type { Viewport } from "./geometry";
import type { DOMSnapshot } from "./dom";

/**
 * Representation of the current active browser page state.
 *
 * NOTE:
 * Do NOT include screenshot or image binary/base64 data directly inside BrowserState.
 * Visual screenshots are processed separately through the visual perception and
 * privacy pipeline to avoid unnecessary payload bloat and accidental data leakage.
 */
export interface BrowserState {
  url: string;
  title: string;
  viewport: Viewport;
  scrollX: number;
  scrollY: number;
  dom: DOMSnapshot;
}
