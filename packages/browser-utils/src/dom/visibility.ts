import type { BoundingBox } from "./types";

/**
 * Calculates viewport-relative bounding box for an element.
 */
export function getElementBoundingBox(element: Element): BoundingBox {
  if (typeof element.getBoundingClientRect === "function") {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left * 10) / 10,
      y: Math.round(rect.top * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Determines whether a DOM element is currently visible.
 *
 * Checks:
 * - HTML `hidden` attribute or property
 * - CSS `display: none`
 * - CSS `visibility: hidden` or `collapse`
 * - CSS `opacity: 0`
 * - Modern `checkVisibility()` API if supported
 * - Non-zero dimensions (`width > 0 && height > 0`)
 *
 * Limitations:
 * - Does not perform full z-index occlusion raycasting (computer vision handles visual occlusion).
 * - Elements clipped completely offscreen by nested scrollable overflow containers
 *   without overflow hidden might report non-zero rect.
 */
export function isElementVisible(element: Element, bbox?: BoundingBox): boolean {
  const htmlEl = element as HTMLElement;

  // 1. Explicit HTML hidden attribute
  if (element.hasAttribute("hidden") || htmlEl.hidden) {
    return false;
  }

  // 2. Modern browser checkVisibility API if available
  if (typeof (element as any).checkVisibility === "function") {
    const isVis = (element as any).checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    });
    if (!isVis) {
      return false;
    }
  }

  // 3. Computed style checks
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      ) {
        return false;
      }
    } catch {
      // In detached DOM or non-window environments, ignore getComputedStyle errors
    }
  }

  // 4. Bounding box dimension check
  const rect = bbox ?? getElementBoundingBox(element);
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  return true;
}

/**
 * Determines whether an interactive element is enabled.
 *
 * Checks:
 * - HTML `disabled` property/attribute on form controls
 * - `aria-disabled="true"`
 * - Ancestor `<fieldset disabled>` state
 */
export function isElementEnabled(element: Element): boolean {
  // Check aria-disabled
  if (element.getAttribute("aria-disabled") === "true") {
    return false;
  }

  // Check form control disabled attribute/property
  if (
    "disabled" in element &&
    Boolean((element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement).disabled)
  ) {
    return false;
  }

  if (element.hasAttribute("disabled")) {
    return false;
  }

  // Check closest disabled fieldset if element is inside a form
  const fieldset = element.closest("fieldset");
  if (fieldset && fieldset.hasAttribute("disabled")) {
    // If the element is inside the first <legend> of a disabled fieldset, it may still be enabled in HTML spec,
    // otherwise it is disabled.
    const legend = fieldset.querySelector("legend");
    if (!legend || !legend.contains(element)) {
      return false;
    }
  }

  return true;
}
