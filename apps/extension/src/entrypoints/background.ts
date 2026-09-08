import { observeActiveTab, executeBrowserAction } from '@redact-eye/browser-utils';
import { detectSensitiveRegions } from '@redact-eye/privacy-engine';

export default defineBackground(() => {
  // Configure the side panel to open automatically when the user clicks the extension icon in the toolbar
  if (chrome?.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[RedactEye] Failed to set side panel behavior:', err);
    });
  }

  // Handle extension-internal messaging for local browser observation, privacy detection, and action execution
  // Flow: Extension context -> Background -> activeTab -> Action Executor
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

    if (message?.type === 'EXECUTE_ACTION' && message.action) {
      // 1. Navigation actions run at the browser tab level
      if (message.action.type === 'navigate') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (!tab || typeof tab.id !== 'number') {
            return sendResponse({
              status: 'failure',
              actionType: 'navigate',
              errorCode: 'TARGET_NOT_FOUND',
              message: 'No active tab found for navigation',
            });
          }
          executeBrowserAction(message.action, { tabId: tab.id })
            .then((result) => sendResponse(result))
            .catch((err) => {
              sendResponse({
                status: 'failure',
                actionType: 'navigate',
                errorCode: 'EXECUTION_FAILED',
                message: err instanceof Error ? err.message : String(err),
              });
            });
        });
        return true;
      }

      // 2. DOM actions (click, type, select, scroll) route to active tab content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || typeof tab.id !== 'number') {
          return sendResponse({
            status: 'failure',
            actionType: message.action.type,
            errorCode: 'TARGET_NOT_FOUND',
            message: 'No active tab found for action execution',
          });
        }

        chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_ACTION', action: message.action }, (response) => {
          if (chrome.runtime?.lastError) {
            return sendResponse({
              status: 'failure',
              actionType: message.action.type,
              errorCode: 'EXECUTION_FAILED',
              message: `Failed to communicate with content script: ${chrome.runtime.lastError.message}`,
            });
          }
          sendResponse(response);
        });
      });
      return true;
    }

    return false;
  });
});
