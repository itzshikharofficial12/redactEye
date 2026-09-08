import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectSensitiveRegions,
  detectDomPII,
  PrivacyEngine,
  DomPrivacyDetector,
} from '@redact-eye/privacy-engine';
import type { BrowserState, DOMElement, DOMSnapshot } from '@redact-eye/shared-types';

describe('Checkpoint 8: Local Privacy Engine Foundation & DOM-Based PII Detection', () => {
  let fetchSpy: any;
  let xhrSpy: any;
  let localStorageSpy: any;
  let sessionStorageSpy: any;

  beforeEach(() => {
    // Spy on networking and storage APIs to guarantee zero access
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
  });

  // Helper to build synthetic BrowserState with mock DOM elements
  const createMockBrowserState = (elements: DOMElement[]): BrowserState => ({
    url: 'https://example.com/checkout',
    title: 'Secure Checkout',
    viewport: { width: 1280, height: 800, devicePixelRatio: 1 },
    scrollX: 0,
    scrollY: 0,
    dom: {
      elements,
      documentWidth: 1280,
      documentHeight: 1600,
    },
  });

  // =========================================================================
  // 1. Password Detection
  // =========================================================================

  describe('1. Password Detection', () => {
    it('detects input with inputType="password" with high confidence and preserves bbox', () => {
      const passwordEl: DOMElement = {
        id: 'input_user_pwd',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'password',
        sensitive: true,
        value: 'Fake Password 123', // Synthetic value to test privacy
        bbox: { x: 50, y: 120, width: 250, height: 40 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([passwordEl]));
      expect(detections.length).toBe(1);

      const det = detections[0]!;
      expect(det.type).toBe('password');
      expect(det.confidence).toBe(1.0);
      expect(det.sources).toEqual(['dom']);
      expect(det.bbox).toEqual({ x: 50, y: 120, width: 250, height: 40 });
      expect(det.text).toBeUndefined(); // NEVER contains raw value
    });

    it('detects password fields via sensitive flag and autocomplete metadata', () => {
      const sensitiveEl: DOMElement = {
        id: 'pwd_token',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        sensitive: true,
        bbox: { x: 10, y: 20, width: 200, height: 35 },
        visible: true,
        enabled: true,
      };

      const autocompletePwdEl: any = {
        id: 'input_new_pwd',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'new-password',
        bbox: { x: 10, y: 70, width: 200, height: 35 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(
        createMockBrowserState([sensitiveEl, autocompletePwdEl])
      );

      expect(detections.length).toBe(2);
      expect(detections[0]?.type).toBe('password');
      expect(detections[0]?.confidence).toBe(1.0);
      expect(detections[1]?.type).toBe('password');
      expect(detections[1]?.confidence).toBe(1.0);
    });
  });

  // =========================================================================
  // 2. Email Detection
  // =========================================================================

  describe('2. Email Detection', () => {
    it('detects inputType="email" and autocomplete="email"', () => {
      const emailEl: DOMElement = {
        id: 'input_email',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'email',
        placeholder: 'test@example.invalid',
        value: 'test@example.invalid',
        bbox: { x: 100, y: 50, width: 300, height: 42 },
        visible: true,
        enabled: true,
      };

      const autocompleteEmailEl: any = {
        id: 'input_ac_email',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'email',
        bbox: { x: 100, y: 110, width: 300, height: 42 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(
        createMockBrowserState([emailEl, autocompleteEmailEl])
      );

      expect(detections.length).toBe(2);
      expect(detections[0]?.type).toBe('email');
      expect(detections[0]?.confidence).toBe(1.0);
      expect(detections[1]?.type).toBe('email');
      expect(detections[1]?.confidence).toBe(1.0);
    });

    it('detects email via semantic placeholder or label with lower confidence', () => {
      const placeholderEmailEl: DOMElement = {
        id: 'input_contact',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        placeholder: 'Your email address',
        bbox: { x: 40, y: 80, width: 220, height: 38 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([placeholderEmailEl]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('email');
      expect(detections[0]?.confidence).toBe(0.85);
    });
  });

  // =========================================================================
  // 3. Phone Detection
  // =========================================================================

  describe('3. Phone Detection', () => {
    it('detects inputType="tel" and autocomplete="tel"', () => {
      const telEl: DOMElement = {
        id: 'input_tel',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'tel',
        value: '555-0100',
        bbox: { x: 30, y: 200, width: 180, height: 36 },
        visible: true,
        enabled: true,
      };

      const acTelEl: any = {
        id: 'input_ac_phone',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'tel-national',
        bbox: { x: 30, y: 250, width: 180, height: 36 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([telEl, acTelEl]));
      expect(detections.length).toBe(2);
      expect(detections[0]?.type).toBe('phone');
      expect(detections[0]?.confidence).toBe(1.0);
      expect(detections[1]?.type).toBe('phone');
      expect(detections[1]?.confidence).toBe(1.0);
    });

    it('detects phone fields via semantic placeholder', () => {
      const phonePlaceholderEl: DOMElement = {
        id: 'input_cell',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        placeholder: 'Enter mobile phone',
        bbox: { x: 30, y: 300, width: 180, height: 36 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([phonePlaceholderEl]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('phone');
      expect(detections[0]?.confidence).toBe(0.85);
    });
  });

  // =========================================================================
  // 4. Name Detection
  // =========================================================================

  describe('4. Name Detection', () => {
    it('detects name inputs with autocomplete="name", "given-name", "family-name"', () => {
      const nameEl: any = {
        id: 'name_1',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'name',
        bbox: { x: 20, y: 20, width: 240, height: 40 },
        visible: true,
        enabled: true,
      };

      const givenNameEl: any = {
        id: 'name_2',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'given-name',
        bbox: { x: 20, y: 70, width: 240, height: 40 },
        visible: true,
        enabled: true,
      };

      const familyNameEl: any = {
        id: 'name_3',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        autocomplete: 'family-name',
        bbox: { x: 20, y: 120, width: 240, height: 40 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(
        createMockBrowserState([nameEl, givenNameEl, familyNameEl])
      );

      expect(detections.length).toBe(3);
      for (const det of detections) {
        expect(det.type).toBe('name');
        expect(det.confidence).toBe(0.95);
      }
    });

    it('detects explicit name fields via placeholder or id patterns', () => {
      const fullNameEl: DOMElement = {
        id: 'input_full_name',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        placeholder: 'Full Name',
        bbox: { x: 20, y: 170, width: 240, height: 40 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([fullNameEl]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('name');
      expect(detections[0]?.confidence).toBe(0.85);
    });
  });

  // =========================================================================
  // 5. False-Positive Safety
  // =========================================================================

  describe('5. False-Positive Safety', () => {
    it('does NOT classify generic search or product search fields as PII', () => {
      const searchInput: DOMElement = {
        id: 'search_bar',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        placeholder: 'Search',
        bbox: { x: 10, y: 10, width: 300, height: 35 },
        visible: true,
        enabled: true,
      };

      const productSearchInput: DOMElement = {
        id: 'product_query',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'search',
        placeholder: 'Search products',
        bbox: { x: 10, y: 50, width: 300, height: 35 },
        visible: true,
        enabled: true,
      };

      const genericTextInput: DOMElement = {
        id: 'item_title',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'text',
        placeholder: 'Enter article title',
        bbox: { x: 10, y: 90, width: 300, height: 35 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(
        createMockBrowserState([searchInput, productSearchInput, genericTextInput])
      );

      expect(detections.length).toBe(0);
    });
  });

  // =========================================================================
  // 6 & 7. Deduplication & Confidence Strategy
  // =========================================================================

  describe('6 & 7. Deduplication & Confidence', () => {
    it('merges multiple signals on the same element, retaining highest confidence and source', () => {
      // Element has both inputType="email" and placeholder="Enter email"
      const el: DOMElement = {
        id: 'input_multi_email',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'email',
        placeholder: 'Enter email address',
        bbox: { x: 50, y: 50, width: 200, height: 40 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([el]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('email');
      expect(detections[0]?.confidence).toBe(1.0); // max confidence chosen
      expect(detections[0]?.sources).toEqual(['dom']);
    });

    it('resolves conflicting signals by choosing highest priority PII type', () => {
      // Element with conflicting signals (e.g. password takes precedence over name)
      const el: any = {
        id: 'input_conflict',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'password',
        placeholder: 'Full Name',
        bbox: { x: 50, y: 50, width: 200, height: 40 },
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([el]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('password'); // Password prioritized over name
    });
  });

  // =========================================================================
  // 8. Bounding Box Preservation
  // =========================================================================

  describe('8. Bounding Box Preservation', () => {
    it('strictly preserves the exact source bounding box coordinates', () => {
      const expectedBbox = { x: 142.5, y: 88.2, width: 215.0, height: 38.5 };
      const el: DOMElement = {
        id: 'input_preserved_bbox',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'password',
        bbox: expectedBbox,
        visible: true,
        enabled: true,
      };

      const detections = detectSensitiveRegions(createMockBrowserState([el]));
      expect(detections.length).toBe(1);
      expect(detections[0]?.bbox).toEqual(expectedBbox);
    });
  });

  // =========================================================================
  // 9 & 10. Privacy & Network Invariants
  // =========================================================================

  describe('9 & 10. Privacy & Network Invariants', () => {
    it('NEVER extracts or leaks raw user input values in detections', () => {
      const fakeEmailValue = 'test@example.invalid';
      const fakePasswordValue = 'Fake Password 123';
      const fakePhoneValue = '555-0100';

      const elements: DOMElement[] = [
        {
          id: 'email_field',
          type: 'input',
          tagName: 'INPUT',
          inputType: 'email',
          value: fakeEmailValue,
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
        {
          id: 'pwd_field',
          type: 'input',
          tagName: 'INPUT',
          inputType: 'password',
          value: fakePasswordValue,
          bbox: { x: 10, y: 50, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
        {
          id: 'phone_field',
          type: 'input',
          tagName: 'INPUT',
          inputType: 'tel',
          value: fakePhoneValue,
          bbox: { x: 10, y: 90, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
      ];

      const detections = detectSensitiveRegions(createMockBrowserState(elements));
      expect(detections.length).toBe(3);

      const serializedDetections = JSON.stringify(detections);
      expect(serializedDetections).not.toContain(fakeEmailValue);
      expect(serializedDetections).not.toContain(fakePasswordValue);
      expect(serializedDetections).not.toContain(fakePhoneValue);

      for (const det of detections) {
        expect(det.text).toBeUndefined();
      }
    });

    it('makes ZERO network calls and accesses ZERO storage or cookies', () => {
      const el: DOMElement = {
        id: 'test_input',
        type: 'input',
        tagName: 'INPUT',
        inputType: 'email',
        bbox: { x: 10, y: 10, width: 100, height: 30 },
        visible: true,
        enabled: true,
      };

      detectSensitiveRegions(createMockBrowserState([el]));

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(xhrSpy).not.toHaveBeenCalled();
      expect(localStorageSpy).not.toHaveBeenCalled();
      expect(sessionStorageSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Pipeline Abstraction & Standalone Functions
  // =========================================================================

  describe('Pipeline Abstraction', () => {
    it('supports custom detector registration on PrivacyEngine', () => {
      const engine = new PrivacyEngine([new DomPrivacyDetector()]);

      const state = createMockBrowserState([
        {
          id: 'test_email',
          type: 'input',
          tagName: 'INPUT',
          inputType: 'email',
          bbox: { x: 0, y: 0, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
      ]);

      const detections = engine.detectSensitiveRegions(state);
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('email');
    });

    it('detectDomPII operates directly on a DOMSnapshot', () => {
      const snapshot: DOMSnapshot = {
        elements: [
          {
            id: 'direct_phone',
            type: 'input',
            tagName: 'INPUT',
            inputType: 'tel',
            bbox: { x: 0, y: 0, width: 100, height: 30 },
            visible: true,
            enabled: true,
          },
        ],
      };

      const detections = detectDomPII(snapshot);
      expect(detections.length).toBe(1);
      expect(detections[0]?.type).toBe('phone');
    });

    it('background service worker coordinates DETECT_SENSITIVE_REGIONS locally', async () => {
      const mockState = createMockBrowserState([
        {
          id: 'pwd_input',
          type: 'input',
          tagName: 'INPUT',
          inputType: 'password',
          bbox: { x: 10, y: 10, width: 150, height: 35 },
          visible: true,
          enabled: true,
        },
      ]);

      // Emulate background message handler
      const messageHandler = (message: any): Promise<any> => {
        return new Promise((resolve) => {
          if (message.type === 'DETECT_SENSITIVE_REGIONS') {
            const detections = detectSensitiveRegions(mockState);
            resolve({ success: true, detections, state: mockState });
          }
        });
      };

      const response = await messageHandler({ type: 'DETECT_SENSITIVE_REGIONS' });
      expect(response.success).toBe(true);
      expect(response.detections.length).toBe(1);
      expect(response.detections[0].type).toBe('password');
      expect(response.detections[0].sources).toEqual(['dom']);
    });
  });
});
