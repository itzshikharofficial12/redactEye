import type { CaptureOptions } from "./types";

/**
 * Restricted schemes and prefixes where Chrome extensions cannot capture screenshots
 * or inject content scripts.
 */
const RESTRICTED_SCHEMES = [
  "chrome://",
  "chrome-extension://",
  "devtools://",
  "edge://",
  "about:",
  "view-source:",
];

/**
 * Checks whether a tab URL is a restricted internal browser page.
 */
export function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return RESTRICTED_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

/**
 * Captures the currently visible viewport of the specified window as a base64 Data URL.
 *
 * MUST be called from an extension background service worker or extension page context
 * with `activeTab` or `<all_urls>` permission.
 *
 * PRIVACY GUARANTEE:
 * - Captures ONLY the currently visible viewport.
 * - Does not upload, transmit, or cache the image externally.
 * - Stored purely locally in memory.
 *
 * @param windowId The window ID to capture (defaults to current window).
 * @param options Format ('png' | 'jpeg') and optional JPEG quality.
 * @returns Promise resolving to the captured data URL (e.g. `data:image/png;base64,...`).
 */
export async function captureVisibleScreenshot(
  windowId?: number,
  options: CaptureOptions = { format: "png" }
): Promise<string> {
  if (typeof chrome === "undefined" || !chrome?.tabs?.captureVisibleTab) {
    throw new Error(
      "chrome.tabs.captureVisibleTab is not available in the current context. " +
        "Screenshot capture must run in an extension background or page context."
    );
  }

  const targetWindowId =
    windowId ??
    (chrome.windows ? chrome.windows.WINDOW_ID_CURRENT : undefined);

  return new Promise<string>((resolve, reject) => {
    try {
      // In Chrome MV3, captureVisibleTab takes (windowId, options, callback)
      const captureOptions = {
        format: options.format ?? "png",
        quality: options.quality,
      };

      const handleResult = (dataUrl?: string) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!dataUrl) {
          return reject(new Error("captureVisibleTab returned empty image data"));
        }
        resolve(dataUrl);
      };

      // Call Chrome API with callback
      chrome.tabs.captureVisibleTab(
        targetWindowId as any,
        captureOptions,
        handleResult
      );
    } catch (err) {
      reject(err);
    }
  });
}
