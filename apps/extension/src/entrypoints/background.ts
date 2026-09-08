import { observeActiveTab } from '@redact-eye/browser-utils';
import { detectSensitiveRegions } from '@redact-eye/privacy-engine';

export default defineBackground(() => {
  // Configure the side panel to open automatically when the user clicks the extension icon in the toolbar
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[RedactEye] Failed to set side panel behavior:', err);
    });
  }

  // Handle extension-internal messaging for local browser observation and privacy detection
  // Flow: Extension context -> Background -> activeTab observation -> Privacy Engine -> Local Detections
  chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_BROWSER_STATE') {
      observeActiveTab()
        .then((result) => {
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            code: 'UNKNOWN_ERROR',
          });
        });
      return true; // Keep message channel open for asynchronous sendResponse
    }

    if (message?.type === 'DETECT_SENSITIVE_REGIONS') {
      observeActiveTab()
        .then((observation) => {
          if (!observation.success) {
            return sendResponse(observation);
          }
          const detections = detectSensitiveRegions(observation.state);
          sendResponse({
            success: true,
            detections,
            state: observation.state,
          });
        })
        .catch((err) => {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            code: 'UNKNOWN_ERROR',
          });
        });
      return true;
    }

    return false;
  });
});
