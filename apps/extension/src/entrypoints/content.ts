import { extractDOMSnapshot, resolveElement, getBrowserState } from '@redact-eye/browser-utils';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // Listen for extension-internal runtime messages
    // Strictly extension-internal: no external/network calls
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') {
        return false;
      }

      if (message.type === 'GET_BROWSER_STATE') {
        try {
          const state = getBrowserState({ doc: document, win: window });
          sendResponse({ success: true, state });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;
      }

      if (message.type === 'GET_DOM_SNAPSHOT') {
        try {
          const snapshot = extractDOMSnapshot({ root: document });
          sendResponse({ success: true, snapshot });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;
      }

      if (message.type === 'RESOLVE_ELEMENT' && typeof message.elementId === 'string') {
        try {
          const element = resolveElement(message.elementId, document);
          sendResponse({
            success: true,
            found: Boolean(element),
            tagName: element?.tagName,
          });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;
      }

      return false;
    });
  },
});
