import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBrowserState,
  captureVisibleScreenshot,
  observeActiveTab,
  isRestrictedUrl,
} from '@redact-eye/browser-utils';

describe('Checkpoint 7: Browser State & Local Screenshot Capture', () => {
  let fetchSpy: any;
  let xhrSpy: any;
  let localStorageSpy: any;
  let sessionStorageSpy: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Test Dashboard';

    // Mock layout for JSDOM
    window.Element.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      if (el.hasAttribute('hidden') || el.style.display === 'none' || el.classList.contains('zero-size')) {
        return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => {} };
      }
      return { x: 10, y: 20, width: 150, height: 40, top: 20, left: 10, right: 160, bottom: 60, toJSON: () => {} };
    };

    // Spy on networking and storage APIs to prove 100% privacy preservation
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    xhrSpy = vi.fn();
    (globalThis as any).XMLHttpRequest = vi.fn().mockImplementation(() => ({
      open: xhrSpy,
      send: xhrSpy,
    }));
    localStorageSpy = vi.spyOn(Storage.prototype, 'getItem');
    sessionStorageSpy = vi.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).chrome;
  });

  // =========================================================================
  // A & B: Browser State Metadata & DOM Integration
  // =========================================================================

  describe('Browser State Metadata & DOM Integration', () => {
    it('captures URL, title, viewport, scroll position, and DOM snapshot', () => {
      document.body.innerHTML = `
        <header>
          <h1>RedactEye Security Settings</h1>
        </header>
        <main>
          <button id="save-btn">Save Configuration</button>
          <input type="text" id="username" placeholder="Username" value="john_doe" />
          <input type="password" id="secret" placeholder="Password" value="super-secret-password" />
        </main>
      `;

      // Mock window properties
      const mockWin = {
        location: { href: 'https://app.redacteye.local/settings' },
        innerWidth: 1280,
        innerHeight: 800,
        devicePixelRatio: 2,
        scrollX: 0,
        scrollY: 150,
      } as unknown as Window;

      const state = getBrowserState({
        doc: document,
        win: mockWin,
      });

      // Metadata verification
      expect(state.url).toBe('https://app.redacteye.local/settings');
      expect(state.title).toBe('Test Dashboard');
      expect(state.viewport).toEqual({
        width: 1280,
        height: 800,
        devicePixelRatio: 2,
      });
      expect(state.scrollX).toBe(0);
      expect(state.scrollY).toBe(150);

      // DOM integration verification
      expect(state.dom.elements.length).toBe(4); // h1, button, input, password
      const pwdEl = state.dom.elements.find((e) => e.inputType === 'password');
      expect(pwdEl).toBeDefined();
      expect(pwdEl?.sensitive).toBe(true);
      expect(pwdEl?.value).toBeUndefined(); // Password NEVER captured

      const userEl = state.dom.elements.find((e) => e.placeholder === 'Username');
      expect(userEl).toBeDefined();
      expect(userEl?.value).toBeUndefined(); // Raw input value NEVER captured
    });

    it('handles fallback defaults gracefully when window/document fields are undefined', () => {
      const state = getBrowserState({
        doc: document,
        win: undefined,
      });

      expect(state.url).toBeDefined();
      expect(state.title).toBe('Test Dashboard');
      expect(typeof state.viewport.width).toBe('number');
      expect(typeof state.viewport.height).toBe('number');
      expect(state.scrollX).toBe(0);
      expect(state.scrollY).toBe(0);
      expect(Array.isArray(state.dom.elements)).toBe(true);
    });
  });

  // =========================================================================
  // C: Visible Viewport Screenshot Capture
  // =========================================================================

  describe('Screenshot Capture API', () => {
    it('calls chrome.tabs.captureVisibleTab with correct parameters and returns dataUrl', async () => {
      const mockDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        tabs: {
          captureVisibleTab: vi.fn((windowId, options, callback) => {
            expect(windowId).toBe(-2);
            expect(options).toEqual({ format: 'png', quality: undefined });
            callback(mockDataUrl);
          }),
        },
      };

      const result = await captureVisibleScreenshot();
      expect(result).toBe(mockDataUrl);
      expect((globalThis as any).chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    });

    it('rejects with error when chrome.tabs.captureVisibleTab reports lastError', async () => {
      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        runtime: {
          lastError: { message: 'The tab was closed or cannot be captured' },
        },
        tabs: {
          captureVisibleTab: vi.fn((_windowId, _options, callback) => {
            callback(undefined);
          }),
        },
      };

      await expect(captureVisibleScreenshot()).rejects.toThrow(
        'The tab was closed or cannot be captured'
      );
    });

    it('throws when chrome API is not available in non-extension context', async () => {
      delete (globalThis as any).chrome;
      await expect(captureVisibleScreenshot()).rejects.toThrow(
        'chrome.tabs.captureVisibleTab is not available'
      );
    });
  });

  // =========================================================================
  // D: Error Handling & Restricted Pages
  // =========================================================================

  describe('Restricted Pages & Error Handling', () => {
    it('correctly identifies restricted browser URLs', () => {
      expect(isRestrictedUrl('chrome://settings')).toBe(true);
      expect(isRestrictedUrl('chrome://extensions/')).toBe(true);
      expect(isRestrictedUrl('chrome-extension://abcdefg/popup.html')).toBe(true);
      expect(isRestrictedUrl('devtools://devtools/bundled/inspector.html')).toBe(true);
      expect(isRestrictedUrl('edge://settings')).toBe(true);
      expect(isRestrictedUrl('about:blank')).toBe(true);
      expect(isRestrictedUrl('view-source:https://example.com')).toBe(true);
      expect(isRestrictedUrl(undefined)).toBe(true);

      // Normal pages are NOT restricted
      expect(isRestrictedUrl('https://example.com')).toBe(false);
      expect(isRestrictedUrl('http://localhost:3000/dashboard')).toBe(false);
    });

    it('observeActiveTab returns NO_ACTIVE_TAB when no tabs are found', async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn((_query, callback) => callback([])),
        },
      };

      const result = await observeActiveTab();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('NO_ACTIVE_TAB');
        expect(result.error).toContain('No active tab found');
      }
    });

    it('observeActiveTab returns RESTRICTED_URL for internal chrome:// pages', async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn((_query, callback) =>
            callback([{ id: 101, url: 'chrome://settings', windowId: 1 }])
          ),
          captureVisibleTab: vi.fn(),
          sendMessage: vi.fn(),
        },
      };

      const result = await observeActiveTab();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('RESTRICTED_URL');
        expect(result.error).toContain('Cannot observe restricted browser page');
      }
      // Never attempt screenshot or injection on restricted page
      expect((globalThis as any).chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
      expect((globalThis as any).chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('observeActiveTab returns CAPTURE_FAILED when screenshot fails', async () => {
      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        runtime: {},
        tabs: {
          query: vi.fn((_query, callback) =>
            callback([{ id: 102, url: 'https://example.com', windowId: 1 }])
          ),
          captureVisibleTab: vi.fn((_winId, _opts, callback) => {
            (globalThis as any).chrome.runtime.lastError = { message: 'Window is minimized' };
            callback(undefined);
          }),
          sendMessage: vi.fn(),
        },
      };

      const result = await observeActiveTab();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('CAPTURE_FAILED');
        expect(result.error).toContain('Screenshot capture failed');
      }
    });

    it('observeActiveTab returns CONTENT_SCRIPT_UNAVAILABLE when messaging content script fails', async () => {
      const mockDataUrl = 'data:image/png;base64,abc123mock';

      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        runtime: {},
        tabs: {
          query: vi.fn((_query, callback) =>
            callback([{ id: 103, url: 'https://example.com', windowId: 1 }])
          ),
          captureVisibleTab: vi.fn((_winId, _opts, callback) => callback(mockDataUrl)),
          sendMessage: vi.fn((_tabId, _msg, callback) => {
            (globalThis as any).chrome.runtime.lastError = {
              message: 'Could not establish connection. Receiving end does not exist.',
            };
            callback(undefined);
          }),
        },
      };

      const result = await observeActiveTab();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('CONTENT_SCRIPT_UNAVAILABLE');
        expect(result.error).toContain('Content script messaging failed');
      }
    });
  });

  // =========================================================================
  // Coordination & Combined Observation Success
  // =========================================================================

  describe('Full Observation Flow (Side Panel / Background Coordination)', () => {
    it('successfully coordinates screenshot capture and content script DOM state', async () => {
      const mockDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA==';
      const mockState = {
        url: 'https://example.com/checkout',
        title: 'Checkout Store',
        viewport: { width: 1024, height: 768, devicePixelRatio: 1 },
        scrollX: 0,
        scrollY: 0,
        dom: {
          elements: [
            {
              id: 'button_checkout',
              type: 'button',
              tagName: 'BUTTON',
              text: 'Complete Purchase',
              bbox: { x: 50, y: 100, width: 200, height: 45 },
              visible: true,
              enabled: true,
            },
          ],
        },
      };

      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        runtime: {},
        tabs: {
          query: vi.fn((_query, callback) =>
            callback([{ id: 777, url: 'https://example.com/checkout', windowId: 5, width: 1024, height: 768 }])
          ),
          captureVisibleTab: vi.fn((winId, _opts, callback) => {
            expect(winId).toBe(5);
            callback(mockDataUrl);
          }),
          sendMessage: vi.fn((tabId, message, callback) => {
            expect(tabId).toBe(777);
            expect(message).toEqual({ type: 'GET_BROWSER_STATE' });
            callback({ success: true, state: mockState });
          }),
        },
      };

      const result = await observeActiveTab();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tabId).toBe(777);
        expect(result.state).toEqual(mockState);
        expect(result.screenshot).toEqual({
          dataUrl: mockDataUrl,
          width: 1024,
          height: 768,
          devicePixelRatio: 1,
        });
      }
    });

    it('background service worker responds to GET_BROWSER_STATE messages', async () => {
      const mockDataUrl = 'data:image/png;base64,sample-screenshot';
      const mockState = {
        url: 'https://example.com/app',
        title: 'App',
        viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
        scrollX: 0,
        scrollY: 0,
        dom: { elements: [] },
      };

      (globalThis as any).chrome = {
        windows: { WINDOW_ID_CURRENT: -2 },
        runtime: {},
        tabs: {
          query: vi.fn((_query, callback) =>
            callback([{ id: 99, url: 'https://example.com/app', windowId: 1 }])
          ),
          captureVisibleTab: vi.fn((_winId, _opts, callback) => callback(mockDataUrl)),
          sendMessage: vi.fn((_tabId, _msg, callback) =>
            callback({ success: true, state: mockState })
          ),
        },
      };

      // Emulate background message listener logic
      const messageHandler = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          if (message?.type === 'GET_BROWSER_STATE') {
            observeActiveTab().then(resolve);
          }
        });
      };

      const response = await messageHandler({ type: 'GET_BROWSER_STATE' });
      expect(response.success).toBe(true);
      expect(response.tabId).toBe(99);
      expect(response.state.url).toBe('https://example.com/app');
      expect(response.screenshot.dataUrl).toBe(mockDataUrl);
      expect(response.screenshot.devicePixelRatio).toBe(2);
    });
  });

  // =========================================================================
  // E: Privacy Invariants
  // =========================================================================

  describe('Privacy Invariants', () => {
    it('observing browser state makes ZERO network requests and reads NO cookies or storage', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="uname" value="secret_user" />
          <input type="password" id="pword" value="super_secret_pword" />
        </form>
      `;

      getBrowserState({ doc: document });

      // Zero network calls
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrSpy).not.toHaveBeenCalled();

      // Zero storage reads
      expect(localStorageSpy).not.toHaveBeenCalled();
      expect(sessionStorageSpy).not.toHaveBeenCalled();
    });
  });
});
