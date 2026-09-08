import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeBrowserAction } from '@redact-eye/browser-utils';
import type {
  AgentAction,
  ClickAction,
  TypeAction,
  SelectAction,
  ScrollAction,
  NavigateAction,
} from '@redact-eye/action-schema';

describe('Checkpoint: Person 1 — Browser Action Executor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';

    // Mock layout & geometry for JSDOM
    window.Element.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;
      if (
        el.hasAttribute('hidden') ||
        el.style.display === 'none' ||
        el.style.visibility === 'hidden' ||
        el.classList.contains('zero-size')
      ) {
        return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => {} };
      }
      return { x: 50, y: 50, width: 120, height: 35, top: 50, left: 50, right: 170, bottom: 85, toJSON: () => {} };
    };

    // Mock elementFromPoint
    document.elementFromPoint = function (x: number, y: number) {
      if (x >= 50 && x <= 170 && y >= 50 && y <= 85) {
        return document.querySelector('#interactive-target');
      }
      return null;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).chrome;
  });

  // =========================================================================
  // 1. CLICK ACTION TESTS
  // =========================================================================

  describe('CLICK action', () => {
    it('executes valid click by element ID and triggers click listener', async () => {
      document.body.innerHTML = `
        <button id="btn-submit" data-redacteye-id="btn_submit">Submit Application</button>
      `;

      const btn = document.querySelector('#btn-submit') as HTMLButtonElement;
      let clicked = false;
      btn.addEventListener('click', () => {
        clicked = true;
      });

      const action: ClickAction = {
        type: 'click',
        target: { elementId: 'btn_submit' },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('click');
      expect(clicked).toBe(true);
    });

    it('executes valid click by coordinate target', async () => {
      document.body.innerHTML = `
        <button id="interactive-target">Click Point</button>
      `;

      const btn = document.querySelector('#interactive-target') as HTMLButtonElement;
      let clicked = false;
      btn.addEventListener('click', () => {
        clicked = true;
      });

      const action: ClickAction = {
        type: 'click',
        target: { x: 100, y: 60 },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('click');
      expect(clicked).toBe(true);
    });

    it('returns TARGET_NOT_FOUND when click element ID does not exist', async () => {
      document.body.innerHTML = `<button id="other">Other</button>`;

      const action: ClickAction = {
        type: 'click',
        target: { elementId: 'non_existent_btn' },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_FOUND');
    });

    it('returns TARGET_NOT_INTERACTABLE when click element is disabled', async () => {
      document.body.innerHTML = `
        <button id="btn-disabled" data-redacteye-id="btn_disabled" disabled>Disabled Button</button>
      `;

      const action: ClickAction = {
        type: 'click',
        target: { elementId: 'btn_disabled' },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });

    it('returns TARGET_NOT_INTERACTABLE when click element is hidden', async () => {
      document.body.innerHTML = `
        <button id="btn-hidden" data-redacteye-id="btn_hidden" style="display: none;">Hidden Button</button>
      `;

      const action: ClickAction = {
        type: 'click',
        target: { elementId: 'btn_hidden' },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });

    it('returns TARGET_NOT_INTERACTABLE when click coordinates are outside viewport', async () => {
      const action: ClickAction = {
        type: 'click',
        target: { x: 99999, y: 99999 },
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });
  });

  // =========================================================================
  // 2. TYPE ACTION TESTS
  // =========================================================================

  describe('TYPE action', () => {
    it('executes valid type into input element and dispatches input and change events', async () => {
      document.body.innerHTML = `
        <input type="text" id="username" data-redacteye-id="input_username" />
      `;

      const input = document.querySelector('#username') as HTMLInputElement;
      let inputDispatched = false;
      let changeDispatched = false;

      input.addEventListener('input', () => {
        inputDispatched = true;
      });
      input.addEventListener('change', () => {
        changeDispatched = true;
      });

      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'input_username' },
        value: 'test_user',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('type');
      expect(input.value).toBe('test_user');
      expect(inputDispatched).toBe(true);
      expect(changeDispatched).toBe(true);

      // PRIVACY: Verify typed value is NOT exposed in result message
      expect(result.message).not.toContain('test_user');
    });

    it('executes valid type into textarea element', async () => {
      document.body.innerHTML = `
        <textarea id="comments" data-redacteye-id="area_comments"></textarea>
      `;

      const textarea = document.querySelector('#comments') as HTMLTextAreaElement;

      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'area_comments' },
        value: 'Detailed feedback',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(textarea.value).toBe('Detailed feedback');
    });

    it('executes valid type into contenteditable element', async () => {
      document.body.innerHTML = `
        <div id="editor" data-redacteye-id="editor_div" contenteditable="true">Initial</div>
      `;

      const div = document.querySelector('#editor') as HTMLDivElement;

      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'editor_div' },
        value: 'Updated content',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(div.textContent).toBe('Updated content');
    });

    it('returns TARGET_NOT_FOUND when typing into non-existent element', async () => {
      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'missing_input' },
        value: 'some text',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_FOUND');
    });

    it('returns TARGET_NOT_INTERACTABLE when typing into a non-editable element (button)', async () => {
      document.body.innerHTML = `
        <button id="my-btn" data-redacteye-id="btn_target">Click Me</button>
      `;

      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'btn_target' },
        value: 'invalid text',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });

    it('returns TARGET_NOT_INTERACTABLE when typing into a disabled or read-only input', async () => {
      document.body.innerHTML = `
        <input type="text" id="readonly-input" data-redacteye-id="input_ro" readonly />
      `;

      const action: TypeAction = {
        type: 'type',
        target: { elementId: 'input_ro' },
        value: 'cannot write',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });
  });

  // =========================================================================
  // 3. SELECT ACTION TESTS
  // =========================================================================

  describe('SELECT action', () => {
    it('executes valid select by option value and dispatches events', async () => {
      document.body.innerHTML = `
        <select id="country" data-redacteye-id="select_country">
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
        </select>
      `;

      const select = document.querySelector('#country') as HTMLSelectElement;
      let changed = false;
      select.addEventListener('change', () => {
        changed = true;
      });

      const action: SelectAction = {
        type: 'select',
        target: { elementId: 'select_country' },
        value: 'ca',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('select');
      expect(select.value).toBe('ca');
      expect(changed).toBe(true);
    });

    it('executes valid select by option visible text', async () => {
      document.body.innerHTML = `
        <select id="priority" data-redacteye-id="select_priority">
          <option value="1">Low</option>
          <option value="2">Medium</option>
          <option value="3">High</option>
        </select>
      `;

      const select = document.querySelector('#priority') as HTMLSelectElement;

      const action: SelectAction = {
        type: 'select',
        target: { elementId: 'select_priority' },
        value: 'High',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(select.value).toBe('3');
    });

    it('returns TARGET_NOT_INTERACTABLE when targeting non-select element with select action', async () => {
      document.body.innerHTML = `
        <input type="text" id="not-a-select" data-redacteye-id="not_select" />
      `;

      const action: SelectAction = {
        type: 'select',
        target: { elementId: 'not_select' },
        value: 'test',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });

    it('returns TARGET_NOT_INTERACTABLE when option does not exist in <select>', async () => {
      document.body.innerHTML = `
        <select id="size" data-redacteye-id="select_size">
          <option value="s">Small</option>
          <option value="m">Medium</option>
        </select>
      `;

      const action: SelectAction = {
        type: 'select',
        target: { elementId: 'select_size' },
        value: 'extra-large',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('TARGET_NOT_INTERACTABLE');
    });
  });

  // =========================================================================
  // 4. SCROLL ACTION TESTS
  // =========================================================================

  describe('SCROLL action', () => {
    it('executes valid scroll down and calls window.scrollBy', async () => {
      const scrollBySpy = vi.fn();
      window.scrollBy = scrollBySpy;

      const action: ScrollAction = {
        type: 'scroll',
        direction: 'down',
        amount: 300,
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('scroll');
      expect(scrollBySpy).toHaveBeenCalledWith(0, 300);
    });

    it('executes valid scroll up and calls window.scrollBy with negative delta', async () => {
      const scrollBySpy = vi.fn();
      window.scrollBy = scrollBySpy;

      const action: ScrollAction = {
        type: 'scroll',
        direction: 'up',
        amount: 150,
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('success');
      expect(scrollBySpy).toHaveBeenCalledWith(0, -150);
    });

    it('returns INVALID_ACTION when scroll amount exceeds MAX_SCROLL_AMOUNT or is negative', async () => {
      const actionTooLarge: any = {
        type: 'scroll',
        direction: 'down',
        amount: 5000, // exceeds 1000 limit
      };

      const result1 = await executeBrowserAction(actionTooLarge, { doc: document, win: window });
      expect(result1.status).toBe('failure');
      expect(result1.errorCode).toBe('INVALID_ACTION');

      const actionNegative: any = {
        type: 'scroll',
        direction: 'down',
        amount: -50,
      };

      const result2 = await executeBrowserAction(actionNegative, { doc: document, win: window });
      expect(result2.status).toBe('failure');
      expect(result2.errorCode).toBe('INVALID_ACTION');
    });
  });

  // =========================================================================
  // 5. NAVIGATE ACTION TESTS
  // =========================================================================

  describe('NAVIGATE action', () => {
    it('executes valid navigation via chrome.tabs.update when available', async () => {
      const updateSpy = vi.fn((tabId, opts, callback) => {
        expect(tabId).toBe(123);
        expect(opts).toEqual({ url: 'https://example.com/dashboard' });
        callback?.();
      });

      (globalThis as any).chrome = {
        tabs: {
          update: updateSpy,
        },
      };

      const action: NavigateAction = {
        type: 'navigate',
        url: 'https://example.com/dashboard',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window, tabId: 123 });
      expect(result.status).toBe('success');
      expect(result.actionType).toBe('navigate');
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects dangerous javascript: protocols with INVALID_URL', async () => {
      const action: any = {
        type: 'navigate',
        url: 'javascript:alert(document.cookie)',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('INVALID_ACTION');
    });

    it('blocks navigation to restricted browser schemes (chrome://, devtools://) with NAVIGATION_BLOCKED', async () => {
      // In case an action bypasses initial schema check with a valid http url that redirects or restricted scheme
      const action: any = {
        type: 'navigate',
        url: 'chrome://settings',
      };

      const result = await executeBrowserAction(action, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode === 'INVALID_ACTION' || result.errorCode === 'NAVIGATION_BLOCKED').toBe(true);
    });
  });

  // =========================================================================
  // 6. SECURITY & UNSUPPORTED PAYLOAD REJECTION
  // =========================================================================

  describe('Security & Injection Prevention', () => {
    it('rejects executeScript payload with INVALID_ACTION', async () => {
      const maliciousPayload: any = {
        type: 'executeScript',
        code: 'window.fetch("https://attacker.com")',
      };

      const result = await executeBrowserAction(maliciousPayload, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('INVALID_ACTION');
    });

    it('rejects eval payload with INVALID_ACTION', async () => {
      const maliciousPayload: any = {
        type: 'eval',
        expression: 'localStorage.clear()',
      };

      const result = await executeBrowserAction(maliciousPayload, { doc: document, win: window });
      expect(result.status).toBe('failure');
      expect(result.errorCode).toBe('INVALID_ACTION');
    });

    it('rejects arbitrary string commands or non-object payloads', async () => {
      const result1 = await executeBrowserAction(null as any);
      expect(result1.status).toBe('failure');
      expect(result1.errorCode).toBe('INVALID_ACTION');

      const result2 = await executeBrowserAction('click #btn' as any);
      expect(result2.status).toBe('failure');
      expect(result2.errorCode).toBe('INVALID_ACTION');
    });
  });
});
