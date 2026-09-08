import test from "node:test";
import assert from "node:assert/strict";
import type { Detection, DOMElement, DOMSnapshot } from "@redact-eye/shared-types";
import {
  privacyGuard,
  PrivacyGuardError,
  sanitizeContext,
} from "../dist/privacyGuard.js";

/**
 * Creates a synthetic image buffer with all pixels set to a uniform RGBA color.
 */
function createSyntheticImage(
  width: number,
  height: number,
  fillRgba: [number, number, number, number] = [255, 255, 255, 255]
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillRgba[0];
    data[i + 1] = fillRgba[1];
    data[i + 2] = fillRgba[2];
    data[i + 3] = fillRgba[3];
  }
  return { data, width, height };
}

/**
 * Reads a single RGBA pixel from an image buffer at (x, y).
 */
function getPixel(
  image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
  x: number,
  y: number
): [number, number, number, number] {
  const idx = (y * image.width + x) * 4;
  return [image.data[idx]!, image.data[idx + 1]!, image.data[idx + 2]!, image.data[idx + 3]!];
}

test("Privacy Guard / Final Privacy Firewall (@redact-eye/privacy-engine)", async (t) => {
  // =========================================================================
  // 1. Safe page with no detections -> PASS
  // =========================================================================
  await t.test("1. Safe page with no detections -> PASS", () => {
    const rawScreenshot = createSyntheticImage(50, 50, [255, 255, 255, 255]);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "heading",
          type: "text",
          tagName: "h1",
          text: "Welcome to our public store",
          bbox: { x: 10, y: 10, width: 200, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections: [],
    });

    assert.ok(result);
    assert.equal(result.sensitiveRegions.length, 0);
    assert.equal(result.statistics.sensitiveDetections, 0);
    assert.equal(result.sanitizedDom?.elements[0]!.text, "Welcome to our public store");
  });

  // =========================================================================
  // 2. Email -> PASS after screenshot + DOM sanitization
  // =========================================================================
  await t.test("2. Email -> PASS after screenshot + DOM sanitization", () => {
    const rawScreenshot = createSyntheticImage(100, 100, [255, 255, 255, 255]);
    const emailSecret = "alice@example.com";
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "email_input",
          type: "input",
          tagName: "input",
          inputType: "email",
          value: emailSecret,
          bbox: { x: 20, y: 20, width: 60, height: 25 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_email",
        type: "email",
        bbox: { x: 20, y: 20, width: 60, height: 25 },
        confidence: 0.98,
        sources: ["regex"],
        text: emailSecret,
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    // Verify DOM redacted
    assert.equal(result.sanitizedDom?.elements[0]!.value, "[REDACTED]");
    assert.equal(JSON.stringify(result).includes(emailSecret), false);

    // Verify screenshot masked
    assert.deepEqual(getPixel(result.sanitizedScreenshot, 25, 25), [0, 0, 0, 255]);
    assert.equal(result.sensitiveRegions.length, 1);
  });

  // =========================================================================
  // 3. Phone -> PASS after screenshot + DOM sanitization
  // =========================================================================
  await t.test("3. Phone -> PASS after screenshot + DOM sanitization", () => {
    const rawScreenshot = createSyntheticImage(80, 80, [255, 255, 255, 255]);
    const phoneSecret = "+91-98765-43210";
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "phone_field",
          type: "input",
          tagName: "input",
          inputType: "tel",
          value: phoneSecret,
          bbox: { x: 10, y: 10, width: 50, height: 20 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_phone",
        type: "phone",
        bbox: { x: 10, y: 10, width: 50, height: 20 },
        confidence: 0.95,
        sources: ["regex"],
        text: phoneSecret,
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    assert.equal(result.sanitizedDom?.elements[0]!.value, "[REDACTED]");
    assert.equal(JSON.stringify(result).includes(phoneSecret), false);
    assert.deepEqual(getPixel(result.sanitizedScreenshot, 15, 15), [0, 0, 0, 255]);
  });

  // =========================================================================
  // 4. Password -> PASS without accessing value (getter-trap test)
  // =========================================================================
  await t.test("4. Password -> PASS without accessing value", () => {
    const rawScreenshot = createSyntheticImage(80, 50, [255, 255, 255, 255]);
    let getterCalled = false;

    const passwordElement = {
      id: "pwd_trap",
      type: "input" as const,
      tagName: "input",
      inputType: "password",
      bbox: { x: 10, y: 10, width: 50, height: 25 },
      visible: true,
      enabled: true,
      get value(): string {
        getterCalled = true;
        throw new Error("SECURITY VIOLATION: Password value getter was called!");
      },
    };

    const rawDom: DOMSnapshot = {
      elements: [passwordElement as unknown as DOMElement],
    };

    const detections: Detection[] = [
      {
        id: "pwd_trap",
        type: "password",
        bbox: { x: 10, y: 10, width: 50, height: 25 },
        confidence: 1.0,
        sources: ["dom"],
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    assert.equal(getterCalled, false, "Password getter must never be accessed");
    assert.equal(result.sanitizedDom?.elements[0]!.value, "[REDACTED]");
    assert.deepEqual(getPixel(result.sanitizedScreenshot, 15, 15), [0, 0, 0, 255]);
  });

  // =========================================================================
  // 5. Face -> PASS after screenshot redaction
  // =========================================================================
  await t.test("5. Face -> PASS after screenshot redaction", () => {
    const rawScreenshot = createSyntheticImage(100, 100, [200, 200, 200, 255]);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "avatar_img",
          type: "image",
          tagName: "img",
          bbox: { x: 20, y: 20, width: 40, height: 40 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_face",
        type: "face",
        bbox: { x: 20, y: 20, width: 40, height: 40 },
        confidence: 0.94,
        sources: ["face"],
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    assert.deepEqual(getPixel(result.sanitizedScreenshot, 25, 25), [0, 0, 0, 255]);
    assert.equal(result.sensitiveRegions.length, 1);
    assert.equal(result.sensitiveRegions[0]!.type, "face");
  });

  // =========================================================================
  // 6. Multiple PII types -> PASS
  // =========================================================================
  await t.test("6. Multiple PII types -> PASS", () => {
    const rawScreenshot = createSyntheticImage(120, 120, [255, 255, 255, 255]);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "email",
          type: "input",
          tagName: "input",
          inputType: "email",
          value: "test@example.com",
          bbox: { x: 10, y: 10, width: 40, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "secret",
          bbox: { x: 10, y: 50, width: 40, height: 20 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_email",
        type: "email",
        bbox: { x: 10, y: 10, width: 40, height: 20 },
        confidence: 0.95,
        sources: ["regex"],
      },
      {
        id: "pwd",
        type: "password",
        bbox: { x: 10, y: 50, width: 40, height: 20 },
        confidence: 1.0,
        sources: ["dom"],
      },
      {
        id: "det_face",
        type: "face",
        bbox: { x: 70, y: 70, width: 30, height: 30 },
        confidence: 0.9,
        sources: ["face"],
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    assert.equal(result.sensitiveRegions.length, 3);
    assert.equal(result.statistics.sensitiveDetections, 3);
    assert.equal(result.sanitizedDom?.elements[0]!.value, "[REDACTED]");
    assert.equal(result.sanitizedDom?.elements[1]!.value, "[REDACTED]");
  });

  // =========================================================================
  // 7. Missing screenshot -> BLOCK
  // =========================================================================
  await t.test("7. Missing screenshot -> BLOCK", () => {
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot: null as unknown as ImageData,
          rawDomSnapshot: { elements: [] },
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 8. Corrupted screenshot buffer -> BLOCK
  // =========================================================================
  await t.test("8. Corrupted screenshot buffer -> BLOCK", () => {
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot: {
            data: new Uint8ClampedArray(10), // length does not match 20*20*4
            width: 20,
            height: 20,
          },
          rawDomSnapshot: { elements: [] },
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 9. Invalid screenshot dimensions -> BLOCK
  // =========================================================================
  await t.test("9. Invalid screenshot dimensions -> BLOCK", () => {
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot: {
            data: new Uint8ClampedArray(0),
            width: 0,
            height: -10,
          },
          rawDomSnapshot: { elements: [] },
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 10. Missing DOM -> BLOCK
  // =========================================================================
  await t.test("10. Missing DOM -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(20, 20);
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot,
          rawDomSnapshot: null as unknown as DOMSnapshot,
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 11. Invalid detection bbox (NaN / Infinity / <=0) -> BLOCK
  // =========================================================================
  await t.test("11. Invalid detection bbox -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = { elements: [] };

    // NaN in bbox
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [
            {
              id: "det_invalid",
              type: "email",
              bbox: { x: NaN, y: 10, width: 20, height: 10 },
              confidence: 0.9,
              sources: ["regex"],
            },
          ],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );

    // Negative width in bbox
    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [
            {
              id: "det_invalid_w",
              type: "phone",
              bbox: { x: 10, y: 10, width: -5, height: 10 },
              confidence: 0.9,
              sources: ["regex"],
            },
          ],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 12. Sensitive detection not redacted -> BLOCK
  // =========================================================================
  await t.test("12. Sensitive detection not redacted -> BLOCK", () => {
    // We construct a scenario where a verification check detects pixels weren't masked
    // PrivacyGuard must verify all sensitive bounding boxes are actually masked
    const rawScreenshot = createSyntheticImage(60, 60, [255, 255, 255, 255]);
    const rawDom: DOMSnapshot = { elements: [] };

    // We pass a detection that requires masking
    const detection: Detection = {
      id: "det_email",
      type: "email",
      bbox: { x: 10, y: 10, width: 20, height: 15 },
      confidence: 0.9,
      sources: ["regex"],
    };

    // If redaction is bypassed or fails to cover the region, PrivacyGuard must block
    // We test this by subclassing PrivacyGuard or verifying its verifier rejects unmasked output
    const guard = new (class extends (privacyGuard.constructor as any) {
      protected override performRedaction() {
        // Deliberately returns unredacted copy
        return {
          sanitizedImageData: createSyntheticImage(60, 60, [255, 255, 255, 255]),
          redactedRegionCount: 0,
        };
      }
    })();

    assert.throws(
      () => {
        guard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [detection],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 13. Sensitive DOM element not sanitized -> BLOCK
  // =========================================================================
  await t.test("13. Sensitive DOM element not sanitized -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "pwd_field",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "super_secret_unmasked",
          bbox: { x: 5, y: 5, width: 30, height: 15 },
          visible: true,
          enabled: true,
        },
      ],
    };

    // Subclass or mock sanitizer that fails to redact the DOM
    const guard = new (class extends (privacyGuard.constructor as any) {
      protected override performDomSanitization(dom: DOMSnapshot) {
        // Deliberately leaks the unredacted DOM
        return dom;
      }
    })();

    assert.throws(
      () => {
        guard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 14. Sanitization throws -> BLOCK
  // =========================================================================
  await t.test("14. Sanitization throws -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = { elements: [] };

    const guard = new (class extends (privacyGuard.constructor as any) {
      protected override performRedaction() {
        throw new Error("Underlying redaction crashed!");
      }
    })();

    assert.throws(
      () => {
        guard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 15. Verification failure -> BLOCK
  // =========================================================================
  await t.test("15. Verification failure -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = { elements: [] };

    const guard = new (class extends (privacyGuard.constructor as any) {
      protected override verifySanitizedDom() {
        return false; // Verification reports failure
      }
    })();

    assert.throws(
      () => {
        guard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 16. Raw secret detected in sanitized DOM -> BLOCK
  // =========================================================================
  await t.test("16. Raw secret detected in sanitized DOM -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "email_el",
          type: "input",
          tagName: "input",
          inputType: "text",
          value: "target_secret@example.com",
          bbox: { x: 5, y: 5, width: 30, height: 15 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const guard = new (class extends (privacyGuard.constructor as any) {
      protected override performDomSanitization() {
        return {
          elements: [
            {
              id: "email_el",
              type: "input" as const,
              tagName: "input",
              value: "target_secret@example.com", // Secret was not cleaned!
              bbox: { x: 5, y: 5, width: 30, height: 15 },
              visible: true,
              enabled: true,
              sensitive: true,
            },
          ],
        };
      }
    })();

    assert.throws(
      () => {
        guard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [
            {
              id: "email_el",
              type: "email",
              bbox: { x: 5, y: 5, width: 30, height: 15 },
              confidence: 0.95,
              sources: ["regex"],
              text: "target_secret@example.com",
            },
          ],
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 17. Raw secret detected in safe metadata -> BLOCK
  // =========================================================================
  await t.test("17. Raw secret detected in safe metadata -> BLOCK", () => {
    const rawScreenshot = createSyntheticImage(50, 50);
    const rawDom: DOMSnapshot = { elements: [] };

    // Metadata contains raw password
    const browserMetadata = {
      url: "https://example.com/login?password=mySecretPassword123",
      title: "Login with password=mySecretPassword123",
    };

    assert.throws(
      () => {
        privacyGuard.sanitize({
          rawScreenshot,
          rawDomSnapshot: rawDom,
          detections: [],
          browserMetadata,
        });
      },
      (err: unknown) => err instanceof PrivacyGuardError
    );
  });

  // =========================================================================
  // 18. Original screenshot remains unchanged (no mutation)
  // =========================================================================
  await t.test("18. Original screenshot remains unchanged", () => {
    const rawScreenshot = createSyntheticImage(30, 30, [100, 100, 100, 255]);
    const copy = new Uint8ClampedArray(rawScreenshot.data);

    const detections: Detection[] = [
      {
        id: "det_face",
        type: "face",
        bbox: { x: 5, y: 5, width: 10, height: 10 },
        confidence: 0.9,
        sources: ["face"],
      },
    ];

    privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: { elements: [] },
      detections,
    });

    assert.deepEqual(rawScreenshot.data, copy, "Raw screenshot buffer must never be mutated");
  });

  // =========================================================================
  // 19. Original DOM remains unchanged (no mutation)
  // =========================================================================
  await t.test("19. Original DOM remains unchanged", () => {
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "secret_password",
          bbox: { x: 0, y: 0, width: 20, height: 10 },
          visible: true,
          enabled: true,
        },
      ],
    };

    Object.freeze(rawDom.elements[0]!.bbox);
    Object.freeze(rawDom.elements[0]);
    Object.freeze(rawDom.elements);
    Object.freeze(rawDom);

    assert.doesNotThrow(() => {
      privacyGuard.sanitize({
        rawScreenshot: createSyntheticImage(20, 20),
        rawDomSnapshot: rawDom,
        detections: [],
      });
    });

    assert.equal(rawDom.elements[0]!.value, "secret_password");
  });

  // =========================================================================
  // 20. Detection objects remain unchanged (no mutation)
  // =========================================================================
  await t.test("20. Detection objects remain unchanged", () => {
    const frozenDet = Object.freeze({
      id: "frozen_det",
      type: "email" as const,
      bbox: Object.freeze({ x: 5, y: 5, width: 10, height: 10 }),
      confidence: 0.95,
      sources: Object.freeze(["regex"]) as unknown as string[],
    }) as Detection;

    assert.doesNotThrow(() => {
      privacyGuard.sanitize({
        rawScreenshot: createSyntheticImage(20, 20),
        rawDomSnapshot: { elements: [] },
        detections: [frozenDet],
      });
    });
  });

  // =========================================================================
  // 21. Password getter never accessed
  // =========================================================================
  await t.test("21. Password getter never accessed", () => {
    let getterCalled = false;
    const pwd = {
      id: "pwd_trap2",
      type: "input" as const,
      tagName: "input",
      inputType: "password",
      bbox: { x: 0, y: 0, width: 20, height: 10 },
      visible: true,
      enabled: true,
      get value() {
        getterCalled = true;
        throw new Error("SECURITY FAULT");
      },
    };

    privacyGuard.sanitize({
      rawScreenshot: createSyntheticImage(20, 20),
      rawDomSnapshot: { elements: [pwd as unknown as DOMElement] },
      detections: [],
    });

    assert.equal(getterCalled, false);
  });

  // =========================================================================
  // 22. Error messages contain no raw PII
  // =========================================================================
  await t.test("22. Error messages contain no raw PII", () => {
    const secretEmail = "topsecret_personal_identifiable@bank.com";
    try {
      privacyGuard.sanitize({
        rawScreenshot: {
          data: new Uint8ClampedArray(5), // invalid length to force throw
          width: 20,
          height: 20,
        },
        rawDomSnapshot: { elements: [] },
        detections: [
          {
            id: "det",
            type: "email",
            bbox: { x: 0, y: 0, width: 10, height: 10 },
            confidence: 0.9,
            sources: ["regex"],
            text: secretEmail,
          },
        ],
      });
      assert.fail("Must throw PrivacyGuardError");
    } catch (err) {
      assert.ok(err instanceof PrivacyGuardError);
      assert.equal(err.message.includes(secretEmail), false, "Error message must never contain secret string");
    }
  });

  // =========================================================================
  // 23. Partially sanitized context is NEVER returned
  // =========================================================================
  await t.test("23. Partially sanitized context is NEVER returned", () => {
    // If one part fails, entire call must throw and return nothing
    let returnedValue: unknown = undefined;
    try {
      returnedValue = privacyGuard.sanitize({
        rawScreenshot: createSyntheticImage(20, 20),
        rawDomSnapshot: null as unknown as DOMSnapshot,
        detections: [],
      });
    } catch {
      // expected
    }

    assert.equal(returnedValue, undefined, "Partially sanitized context must NEVER be returned");
  });

  // =========================================================================
  // 24. Unrelated UI context remains preserved
  // =========================================================================
  await t.test("24. Unrelated UI context remains preserved", () => {
    const rawScreenshot = createSyntheticImage(100, 100, [255, 255, 255, 255]);
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "lbl_email",
          type: "text",
          tagName: "label",
          text: "Email",
          bbox: { x: 10, y: 10, width: 40, height: 15 },
          visible: true,
          enabled: true,
        },
        {
          id: "input_email",
          type: "input",
          tagName: "input",
          inputType: "email",
          value: "test@corp.com",
          bbox: { x: 10, y: 30, width: 80, height: 25 },
          visible: true,
          enabled: true,
        },
        {
          id: "btn_save",
          type: "button",
          tagName: "button",
          text: "Save Settings",
          bbox: { x: 10, y: 65, width: 60, height: 25 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_email",
        type: "email",
        bbox: { x: 10, y: 30, width: 80, height: 25 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    // Unrelated label and button preserved
    assert.equal(result.sanitizedDom?.elements[0]!.text, "Email");
    assert.equal(result.sanitizedDom?.elements[2]!.text, "Save Settings");
    // Target input redacted
    assert.equal(result.sanitizedDom?.elements[1]!.value, "[REDACTED]");
  });

  // =========================================================================
  // 25. Empty detection set succeeds safely
  // =========================================================================
  await t.test("25. Empty detection set succeeds safely", () => {
    const rawScreenshot = createSyntheticImage(30, 30);
    const rawDom: DOMSnapshot = { elements: [] };

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections: [],
    });

    assert.ok(result);
    assert.equal(result.sensitiveRegions.length, 0);
  });

  // =========================================================================
  // 26. Section 15 Invariant: Privacy Guard never returns a SanitizedContext containing raw sensitive data
  // =========================================================================
  await t.test("26. Privacy Guard never returns a SanitizedContext containing raw sensitive data", () => {
    const rawScreenshot = createSyntheticImage(100, 100, [255, 255, 255, 255]);
    const rawSecret = "super_classified_api_key_4815162342";
    const rawDom: DOMSnapshot = {
      elements: [
        {
          id: "key_input",
          type: "input",
          tagName: "input",
          value: rawSecret,
          sensitive: true,
          bbox: { x: 10, y: 10, width: 80, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_key",
        type: "api_key",
        bbox: { x: 10, y: 10, width: 80, height: 30 },
        confidence: 0.99,
        sources: ["regex"],
        text: rawSecret,
      },
    ];

    const result = privacyGuard.sanitize({
      rawScreenshot,
      rawDomSnapshot: rawDom,
      detections,
    });

    const serialized = JSON.stringify(result);
    assert.equal(
      serialized.includes(rawSecret),
      false,
      "CRITICAL INVARIANT: Returned SanitizedContext must never contain raw sensitive data"
    );
  });
});
