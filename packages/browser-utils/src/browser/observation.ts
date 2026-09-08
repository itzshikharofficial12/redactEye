import type {
  BrowserObservationResult,
  BrowserState,
  Screenshot,
} from "./types";
import { captureVisibleScreenshot, isRestrictedUrl } from "./screenshot";

/**
 * Observes the current active tab by capturing a visible viewport screenshot
 * and retrieving the local browser state (metadata + sanitized DOM snapshot)
 * via extension-internal content script messaging.
 *
 * MUST run from an extension background service worker or extension context.
 *
 * PRIVACY GUARANTEES:
 * - All observations are strictly local.
 * - Zero network transmissions.
 * - No raw input values or credentials captured.
 *
 * @returns Structured BrowserObservationResult with success or detailed error.
 */
export async function observeActiveTab(): Promise<BrowserObservationResult> {
  if (typeof chrome === "undefined" || !chrome?.tabs?.query) {
    return {
      success: false,
      error: "Chrome tabs API is not available in the current context",
      code: "UNKNOWN_ERROR",
    };
  }

  // 1. Locate active tab in current window
  let activeTab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(result || []);
      });
    });
    activeTab = tabs[0];
  } catch (err) {
    return {
      success: false,
      error: `Failed to query active tab: ${err instanceof Error ? err.message : String(err)}`,
      code: "NO_ACTIVE_TAB",
    };
  }

  if (!activeTab || typeof activeTab.id !== "number") {
    return {
      success: false,
      error: "No active tab found in the current browser window",
      code: "NO_ACTIVE_TAB",
    };
  }

  // 2. Check for restricted browser internal URLs (chrome://, devtools://, etc.)
  if (isRestrictedUrl(activeTab.url)) {
    return {
      success: false,
      error: `Cannot observe restricted browser page: ${activeTab.url || "unknown"}`,
      code: "RESTRICTED_URL",
    };
  }

  // 3. Capture visible viewport screenshot
  let dataUrl: string;
  try {
    dataUrl = await captureVisibleScreenshot(activeTab.windowId);
  } catch (err) {
    return {
      success: false,
      error: `Screenshot capture failed: ${err instanceof Error ? err.message : String(err)}`,
      code: "CAPTURE_FAILED",
    };
  }

  // 4. Request local BrowserState from content script
  let contentResponse: any;
  try {
    contentResponse = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        activeTab!.id!,
        { type: "GET_BROWSER_STATE" },
        (response) => {
          if (chrome.runtime?.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve(response);
        }
      );
    });
  } catch (err) {
    return {
      success: false,
      error: `Content script messaging failed: ${err instanceof Error ? err.message : String(err)}`,
      code: "CONTENT_SCRIPT_UNAVAILABLE",
    };
  }

  if (!contentResponse?.success || !contentResponse?.state) {
    return {
      success: false,
      error:
        contentResponse?.error ||
        "Content script returned invalid or unsuccessful browser state",
      code: "DOM_EXTRACTION_FAILED",
    };
  }

  const state: BrowserState = contentResponse.state;

  // 5. Package observation with matching viewport dimensions
  const screenshot: Screenshot = {
    dataUrl,
    width: state.viewport.width || activeTab.width || 0,
    height: state.viewport.height || activeTab.height || 0,
    devicePixelRatio: state.viewport.devicePixelRatio ?? 1,
  };

  return {
    success: true,
    state,
    screenshot,
    tabId: activeTab.id,
  };
}
