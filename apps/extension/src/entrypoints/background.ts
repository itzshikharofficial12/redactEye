import { observeActiveTab } from '@redact-eye/browser-utils';

export default defineBackground(() => {
  // Configure the side panel to open automatically when the user clicks the extension icon in the toolbar
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[RedactEye] Failed to set side panel behavior:', err);
    });
  }

  // Handle extension-internal messaging for local browser observation
  // Flow: Side Panel -> Background -> activeTab (captureVisibleTab + content script GET_BROWSER_STATE)
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
    return false;
  });
});
