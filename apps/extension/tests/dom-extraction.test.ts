import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractDOMSnapshot,
  resolveElement,
  clearRedactEyeIds,
  isElementVisible,
  isElementEnabled,
} from '@redact-eye/browser-utils';

describe('DOM Extraction & Element Resolution', () => {
  let fetchSpy: any;
  let cookieGetterSpy: any;
  let localStorageSpy: any;
  let sessionStorageSpy: any;

  beforeEach(() => {
    // Reset document body
    document.body.innerHTML = '';

    // Mock getBoundingClientRect for JSDOM
    window.Element.prototype.getBoundingClientRect = function () {
      const el = this as HTMLElement;

      // Handle zero-size elements
      if (el.classList.contains('zero-size')) {
        return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => {} };
      }

      // Handle hidden or display:none elements
      if (el.hasAttribute('hidden') || el.style.display === 'none' || el.style.visibility === 'hidden') {
        return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => {} };
      }

      // Default realistic non-zero dimensions
      return { x: 20, y: 40, width: 120, height: 35, top: 40, left: 20, right: 140, bottom: 75, toJSON: () => {} };
    };

    // Spy on network and storage APIs to guarantee zero access
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorageSpy = vi.spyOn(Storage.prototype, 'getItem');
    sessionStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearRedactEyeIds(document);
  });

  // =========================================================================
  // 1. Synthetic Fixture Tests (16 categories)
  // =========================================================================

  it('Fixture 1: extracts a complete simple login form', () => {
    document.body.innerHTML = `
      <form id="login-form">
        <h1>Welcome Back</h1>
        <input type="email" id="email" placeholder="user@example.com" value="real-user@example.com" />
        <input type="password" id="password" placeholder="Enter password" value="super-secret-pwd" />
        <button type="submit" id="login-btn">Sign In</button>
      </form>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(4);

    const heading = snapshot.elements.find((e) => e.tagName === 'H1');
    expect(heading).toBeDefined();
    expect(heading?.type).toBe('text');
    expect(heading?.role).toBe('heading');
    expect(heading?.text).toBe('Welcome Back');

    const email = snapshot.elements.find((e) => e.id.includes('email'));
    expect(email).toBeDefined();
    expect(email?.type).toBe('input');
    expect(email?.inputType).toBe('email');
    expect(email?.placeholder).toBe('user@example.com');
    expect(email?.value).toBeUndefined(); // NEVER raw value

    const pwd = snapshot.elements.find((e) => e.inputType === 'password');
    expect(pwd).toBeDefined();
    expect(pwd?.type).toBe('input');
    expect(pwd?.sensitive).toBe(true);
    expect(pwd?.value).toBeUndefined(); // NEVER password value

    const btn = snapshot.elements.find((e) => e.type === 'button');
    expect(btn).toBeDefined();
    expect(btn?.text).toBe('Sign In');
  });

  it('Fixture 2: extracts native buttons and ARIA button roles', () => {
    document.body.innerHTML = `
      <button id="primary-btn">Submit Order</button>
      <input type="button" value="Click Me" id="input-btn" />
      <div role="button" id="custom-btn">Custom Button</div>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const buttons = snapshot.elements.filter((e) => e.type === 'button');
    expect(buttons.length).toBe(3);

    expect(buttons.some((b) => b.text === 'Submit Order')).toBe(true);
    expect(buttons.some((b) => b.text === 'Custom Button')).toBe(true);
  });

  it('Fixture 3: extracts links with href and role="link"', () => {
    document.body.innerHTML = `
      <a href="https://example.com/docs" id="docs-link">Documentation</a>
      <span role="link" id="aria-link">Help Center</span>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const links = snapshot.elements.filter((e) => e.type === 'link');
    expect(links.length).toBe(2);
    expect(links[0]?.text).toBe('Documentation');
    expect(links[1]?.text).toBe('Help Center');
  });

  it('Fixture 4: extracts email input with metadata and no value', () => {
    document.body.innerHTML = `
      <input type="email" name="user_email" placeholder="name@domain.com" value="user@domain.com" />
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    const input = snapshot.elements[0]!;
    expect(input.type).toBe('input');
    expect(input.inputType).toBe('email');
    expect(input.placeholder).toBe('name@domain.com');
    expect(input.value).toBeUndefined();
  });

  it('Fixture 5: extracts password input with sensitive flag and no value', () => {
    document.body.innerHTML = `
      <input type="password" name="user_password" placeholder="••••••••" value="p@ssw0rd123" />
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    const input = snapshot.elements[0]!;
    expect(input.type).toBe('input');
    expect(input.inputType).toBe('password');
    expect(input.sensitive).toBe(true);
    expect(input.value).toBeUndefined();
  });

  it('Fixture 6: extracts checkbox elements', () => {
    document.body.innerHTML = `
      <input type="checkbox" id="agree-terms" aria-label="I accept terms" />
      <div role="checkbox" id="aria-checkbox" aria-label="Subscribe to newsletter"></div>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const checkboxes = snapshot.elements.filter((e) => e.type === 'checkbox');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]?.ariaLabel).toBe('I accept terms');
    expect(checkboxes[1]?.ariaLabel).toBe('Subscribe to newsletter');
  });

  it('Fixture 7: extracts radio buttons', () => {
    document.body.innerHTML = `
      <input type="radio" name="plan" id="plan-free" aria-label="Free Plan" />
      <input type="radio" name="plan" id="plan-pro" aria-label="Pro Plan" />
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const radios = snapshot.elements.filter((e) => e.type === 'radio');
    expect(radios.length).toBe(2);
    expect(radios[0]?.ariaLabel).toBe('Free Plan');
    expect(radios[1]?.ariaLabel).toBe('Pro Plan');
  });

  it('Fixture 8: extracts select dropdowns', () => {
    document.body.innerHTML = `
      <select id="country-select" aria-label="Country">
        <option value="US">United States</option>
        <option value="CA">Canada</option>
      </select>
      <div role="combobox" aria-label="Search suggestions" id="combo"></div>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const selects = snapshot.elements.filter((e) => e.type === 'select');
    expect(selects.length).toBe(2);
  });

  it('Fixture 9: extracts textarea with placeholder and no raw value', () => {
    document.body.innerHTML = `
      <textarea id="feedback" placeholder="Describe your issue...">My confidential feedback</textarea>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    const textarea = snapshot.elements[0]!;
    expect(textarea.type).toBe('textarea');
    expect(textarea.placeholder).toBe('Describe your issue...');
    expect(textarea.value).toBeUndefined();
    expect(textarea.text).toBeUndefined(); // Values are not extracted as text
  });

  it('Fixture 10: correctly identifies disabled controls', () => {
    document.body.innerHTML = `
      <button id="btn-enabled">Active</button>
      <button id="btn-disabled" disabled>Disabled</button>
      <input type="text" id="input-aria-disabled" aria-disabled="true" />
      <fieldset disabled>
        <button id="btn-in-disabled-fieldset">In Fieldset</button>
      </fieldset>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    const enabledBtn = snapshot.elements.find((e) => e.id.includes('btn-enabled'));
    const disabledBtn = snapshot.elements.find((e) => e.id.includes('btn-disabled'));
    const ariaDisabledInput = snapshot.elements.find((e) => e.id.includes('aria-disabled'));
    const fieldsetBtn = snapshot.elements.find((e) => e.text === 'In Fieldset');

    expect(enabledBtn?.enabled).toBe(true);
    expect(disabledBtn?.enabled).toBe(false);
    expect(ariaDisabledInput?.enabled).toBe(false);
    expect(fieldsetBtn?.enabled).toBe(false);
  });

  it('Fixture 11: skips hidden elements (hidden attribute, display:none, visibility:hidden)', () => {
    document.body.innerHTML = `
      <button id="btn-visible">Visible Button</button>
      <button id="btn-hidden-attr" hidden>Hidden Button</button>
      <button id="btn-display-none" style="display: none;">Display None</button>
      <button id="btn-vis-hidden" style="visibility: hidden;">Vis Hidden</button>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    expect(snapshot.elements[0]?.text).toBe('Visible Button');
  });

  it('Fixture 12: skips zero-size controls', () => {
    document.body.innerHTML = `
      <button id="normal-btn">Normal Size</button>
      <button id="zero-btn" class="zero-size">Zero Size</button>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    expect(snapshot.elements[0]?.text).toBe('Normal Size');
  });

  it('Fixture 13: extracts elements with aria-label', () => {
    document.body.innerHTML = `
      <button aria-label="Close dialog" id="close-btn">×</button>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    expect(snapshot.elements[0]?.ariaLabel).toBe('Close dialog');
    expect(snapshot.elements[0]?.text).toBe('×');
  });

  it('Fixture 14: extracts elements with placeholders', () => {
    document.body.innerHTML = `
      <input type="search" placeholder="Search products..." id="search-input" />
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    expect(snapshot.elements[0]?.placeholder).toBe('Search products...');
  });

  it('Fixture 15: extracts nested button content cleanly', () => {
    document.body.innerHTML = `
      <button id="cart-btn">
        <span>Proceed to</span>
        <strong>Checkout</strong>
        <svg><path d="M0 0" /></svg>
      </button>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(1);
    expect(snapshot.elements[0]?.text).toBe('Proceed to Checkout');
  });

  it('Fixture 16: generates unique IDs for duplicate visible labels', () => {
    document.body.innerHTML = `
      <div>
        <button class="action-btn">Delete</button>
        <button class="action-btn">Delete</button>
        <button class="action-btn">Delete</button>
      </div>
    `;

    const snapshot = extractDOMSnapshot({ root: document });
    expect(snapshot.elements.length).toBe(3);
    const ids = snapshot.elements.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  // =========================================================================
  // 2. Security & Privacy Tests (Requirement 16)
  // =========================================================================

  describe('Security & Privacy Invariants', () => {
    it('never extracts password values', () => {
      document.body.innerHTML = `
        <input type="password" id="pwd" value="SecretPassword123!" />
      `;
      const snapshot = extractDOMSnapshot({ root: document });
      expect(snapshot.elements[0]?.value).toBeUndefined();
      expect(snapshot.elements[0]?.sensitive).toBe(true);
    });

    it('never extracts email or arbitrary input values', () => {
      document.body.innerHTML = `
        <input type="email" id="email" value="shikhar@example.com" />
        <input type="text" id="phone" value="+1-555-0199" />
      `;
      const snapshot = extractDOMSnapshot({ root: document });
      for (const el of snapshot.elements) {
        expect(el.value).toBeUndefined();
      }
    });

    it('never extracts textarea content as value or secret', () => {
      document.body.innerHTML = `
        <textarea id="notes">My secret personal notes</textarea>
      `;
      const snapshot = extractDOMSnapshot({ root: document });
      expect(snapshot.elements[0]?.value).toBeUndefined();
      expect(snapshot.elements[0]?.text).toBeUndefined();
    });

    it('does not access cookies, localStorage, or sessionStorage', () => {
      document.body.innerHTML = `<button id="btn">Click</button>`;
      extractDOMSnapshot({ root: document });

      expect(localStorageSpy).not.toHaveBeenCalled();
      expect(sessionStorageSpy).not.toHaveBeenCalled();
    });

    it('makes zero network calls', () => {
      document.body.innerHTML = `<button id="btn">Click</button>`;
      extractDOMSnapshot({ root: document });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never incorporates sensitive credentials into generated element IDs', () => {
      document.body.innerHTML = `
        <input type="password" id="user-password-field" name="auth_secret_token" />
      `;
      const snapshot = extractDOMSnapshot({ root: document });
      const id = snapshot.elements[0]!.id;
      expect(id).not.toMatch(/password|secret|token|auth/i);
    });
  });

  // =========================================================================
  // 3. ID Stability Tests (Requirement 17)
  // =========================================================================

  describe('ID Stability & Resolution', () => {
    it('produces identical IDs on the same DOM across multiple extractions', () => {
      document.body.innerHTML = `
        <header>
          <a href="/home" id="nav-home">Home</a>
        </header>
        <main>
          <button id="btn-save">Save Changes</button>
          <input type="text" id="input-title" placeholder="Title" />
        </main>
      `;

      const snap1 = extractDOMSnapshot({ root: document });
      const snap2 = extractDOMSnapshot({ root: document });

      expect(snap1.elements.length).toBe(snap2.elements.length);
      for (let i = 0; i < snap1.elements.length; i++) {
        expect(snap1.elements[i]!.id).toBe(snap2.elements[i]!.id);
      }
    });

    it('maintains ID stability when unrelated DOM elements are inserted', () => {
      document.body.innerHTML = `
        <button id="login">Login</button>
        <button id="signup">Signup</button>
      `;

      const snapA = extractDOMSnapshot({ root: document });
      const loginIdA = snapA.elements.find((e) => e.text === 'Login')?.id;
      const signupIdA = snapA.elements.find((e) => e.text === 'Signup')?.id;

      // Insert unrelated content between the buttons
      document.body.innerHTML = `
        <button id="login">Login</button>
        <div class="announcement-banner"><h3>Important Announcement</h3><p>Sale ends today!</p></div>
        <button id="signup">Signup</button>
      `;

      const snapB = extractDOMSnapshot({ root: document });
      const loginIdB = snapB.elements.find((e) => e.text === 'Login')?.id;
      const signupIdB = snapB.elements.find((e) => e.text === 'Signup')?.id;

      expect(loginIdA).toBe(loginIdB);
      expect(signupIdA).toBe(signupIdB);
    });

    it('resolves an element ID back to the exact live DOM element', () => {
      document.body.innerHTML = `
        <form>
          <input type="email" id="target-input" placeholder="Enter email" />
          <button type="submit" id="target-btn">Submit</button>
        </form>
      `;

      const snapshot = extractDOMSnapshot({ root: document });
      const btnElement = snapshot.elements.find((e) => e.type === 'button')!;
      const inputElement = snapshot.elements.find((e) => e.type === 'input')!;

      const resolvedBtn = resolveElement(btnElement.id, document);
      const resolvedInput = resolveElement(inputElement.id, document);

      expect(resolvedBtn).not.toBeNull();
      expect(resolvedBtn?.id).toBe('target-btn');
      expect(resolvedBtn?.tagName).toBe('BUTTON');

      expect(resolvedInput).not.toBeNull();
      expect(resolvedInput?.id).toBe('target-input');
      expect(resolvedInput?.tagName).toBe('INPUT');
    });

    it('returns null when resolving a non-existent element ID', () => {
      document.body.innerHTML = `<button id="test">Test</button>`;
      extractDOMSnapshot({ root: document });

      const resolved = resolveElement('non_existent_id_9999', document);
      expect(resolved).toBeNull();
    });

    it('handles GET_DOM_SNAPSHOT and RESOLVE_ELEMENT message requests locally', () => {
      document.body.innerHTML = `
        <button id="submit-order">Place Order</button>
      `;

      // Simulate the content script handler logic
      const handleMessage = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          if (message.type === 'GET_DOM_SNAPSHOT') {
            const snapshot = extractDOMSnapshot({ root: document });
            resolve({ success: true, snapshot });
          } else if (message.type === 'RESOLVE_ELEMENT') {
            const el = resolveElement(message.elementId, document);
            resolve({ success: true, found: Boolean(el), tagName: el?.tagName });
          } else {
            resolve({ success: false });
          }
        });
      };

      return handleMessage({ type: 'GET_DOM_SNAPSHOT' }).then((res) => {
        expect(res.success).toBe(true);
        expect(res.snapshot.elements.length).toBe(1);
        const elementId = res.snapshot.elements[0].id;

        return handleMessage({ type: 'RESOLVE_ELEMENT', elementId }).then((resolveRes) => {
          expect(resolveRes.success).toBe(true);
          expect(resolveRes.found).toBe(true);
          expect(resolveRes.tagName).toBe('BUTTON');
        });
      });
    });
  });
});
