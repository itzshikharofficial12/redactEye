import type { BrowserState, BrowserStateOptions } from "./types";
import { extractDOMSnapshot } from "../dom/extract";

/**
 * Extracts the current local browser page state, combining page metadata,
 * viewport dimensions, scroll positions, and a sanitized DOMSnapshot.
 *
 * PRIVACY GUARANTEES:
 * - Runs 100% locally in the active tab context.
 * - Does NOT access `document.cookie`.
 * - Does NOT access `localStorage` or `sessionStorage`.
 * - Does NOT extract raw user input values (`input.value`, `textarea.value`).
 * - Never makes network calls (`fetch`, `XMLHttpRequest`, `WebSocket`).
 *
 * @param options Custom document, window, or DOM extraction options.
 * @returns Complete local BrowserState.
 */
export function getBrowserState(options: BrowserStateOptions = {}): BrowserState {
  const doc =
    options.doc ??
    (typeof document !== "undefined" ? document : null);
  const win =
    options.win ??
    (typeof window !== "undefined" ? window : null);

  const url = win?.location?.href ?? doc?.location?.href ?? "";
  const title = doc?.title ?? "";

  const width = win?.innerWidth ?? doc?.documentElement?.clientWidth ?? 0;
  const height = win?.innerHeight ?? doc?.documentElement?.clientHeight ?? 0;
  const devicePixelRatio = win?.devicePixelRatio ?? 1;

  const scrollX = win?.scrollX ?? win?.pageXOffset ?? 0;
  const scrollY = win?.scrollY ?? win?.pageYOffset ?? 0;

  const dom = extractDOMSnapshot({
    root: doc ?? undefined,
    ...options.extractionOptions,
  });

  return {
    url,
    title,
    viewport: {
      width,
      height,
      devicePixelRatio,
    },
    scrollX,
    scrollY,
    dom,
  };
}
