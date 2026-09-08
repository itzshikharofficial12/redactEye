import test from "node:test";
import assert from "node:assert/strict";
import type { Detection, DOMElement, DOMSnapshot, SensitiveRegion } from "@redact-eye/shared-types";
import { sanitizeDomSnapshot, REDACTED_VALUE } from "../dist/sanitizeDom.js";

test("DOM Sanitization (@redact-eye/privacy-engine)", async (t) => {
  // =========================================================================
  // A. Sensitive value removal
  // =========================================================================
  await t.test("A. Sensitive value removal: replaces sensitive values with [REDACTED] while preserving structure", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "email_input",
          type: "input",
          tagName: "input",
          role: "textbox",
          inputType: "email",
          value: "secret.user@example.com",
          placeholder: "Enter email",
          ariaLabel: "Email address",
          bbox: { x: 100, y: 150, width: 200, height: 40 },
          visible: true,
          enabled: true,
          sensitive: true,
        },
      ],
      documentWidth: 1024,
      documentHeight: 768,
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);

    assert.equal(sanitized.elements.length, 1);
    const el = sanitized.elements[0]!;
    assert.equal(el.id, "email_input");
    assert.equal(el.value, REDACTED_VALUE);
    assert.equal(el.sensitive, true);
    // Structural metadata preserved
    assert.equal(el.type, "input");
    assert.equal(el.tagName, "input");
    assert.equal(el.role, "textbox");
    assert.equal(el.placeholder, "Enter email");
    assert.equal(el.ariaLabel, "Email address");
    assert.deepEqual(el.bbox, { x: 100, y: 150, width: 200, height: 40 });
    assert.equal(el.visible, true);
    assert.equal(el.enabled, true);
  });

  // =========================================================================
  // B. Non-sensitive preservation
  // =========================================================================
  await t.test("B. Non-sensitive preservation: preserves non-sensitive element values and UI context", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "search_bar",
          type: "input",
          tagName: "input",
          role: "searchbox",
          inputType: "text",
          value: "wireless headphones",
          placeholder: "Search products...",
          bbox: { x: 50, y: 20, width: 300, height: 35 },
          visible: true,
          enabled: true,
        },
        {
          id: "submit_btn",
          type: "button",
          tagName: "button",
          role: "button",
          text: "Search",
          bbox: { x: 360, y: 20, width: 80, height: 35 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);

    assert.equal(sanitized.elements.length, 2);
    assert.equal(sanitized.elements[0]!.value, "wireless headphones", "Search term must be preserved");
    assert.equal(sanitized.elements[0]!.sensitive, false);
    assert.equal(sanitized.elements[1]!.text, "Search", "Button text must be preserved");
  });

  // =========================================================================
  // C. Detection-driven sanitization
  // =========================================================================
  await t.test("C. Detection-driven sanitization: sanitizes elements matching detections by ID or spatial overlap", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "field_phone",
          type: "input",
          tagName: "input",
          inputType: "text", // generic input type
          value: "+1-555-867-5309",
          bbox: { x: 100, y: 200, width: 180, height: 32 },
          visible: true,
          enabled: true,
        },
        {
          id: "field_username",
          type: "input",
          tagName: "input",
          inputType: "text",
          value: "john_doe_public",
          bbox: { x: 100, y: 50, width: 180, height: 32 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_phone_1",
        type: "phone",
        // Bbox overlapping field_phone
        bbox: { x: 102, y: 201, width: 175, height: 30 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const sanitized = sanitizeDomSnapshot(rawSnapshot, detections);

    // field_phone matched by spatial overlap -> redacted
    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[0]!.sensitive, true);

    // field_username not matched -> preserved
    assert.equal(sanitized.elements[1]!.value, "john_doe_public");
    assert.equal(sanitized.elements[1]!.sensitive, false);
  });

  // =========================================================================
  // D. Immutability
  // =========================================================================
  await t.test("D. Immutability: input DOMSnapshot and detections are not mutated", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "frozen_pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "super_secret_pwd",
          bbox: { x: 50, y: 50, width: 150, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    // Deep freeze the input snapshot
    Object.freeze(rawSnapshot.elements[0]!.bbox);
    Object.freeze(rawSnapshot.elements[0]);
    Object.freeze(rawSnapshot.elements);
    Object.freeze(rawSnapshot);

    const detections: Detection[] = [
      Object.freeze({
        id: "det_pwd",
        type: "password",
        bbox: Object.freeze({ x: 50, y: 50, width: 150, height: 30 }),
        confidence: 1.0,
        sources: Object.freeze(["dom"]) as unknown as string[],
      }) as Detection,
    ];
    Object.freeze(detections);

    let sanitized: DOMSnapshot;
    assert.doesNotThrow(() => {
      sanitized = sanitizeDomSnapshot(rawSnapshot, detections);
    }, "Sanitizing frozen DOM snapshot must never throw mutation errors");

    assert.equal(sanitized!.elements[0]!.value, REDACTED_VALUE);
    // Original frozen element must still hold its original value
    assert.equal(rawSnapshot.elements[0]!.value, "super_secret_pwd");
  });

  // =========================================================================
  // E. Password security (Getter-trap test)
  // =========================================================================
  await t.test("E. Password security: DOMElement.value of password element is NEVER accessed", () => {
    let passwordValueGetterCalled = false;

    const passwordElement = {
      id: "pwd_trap",
      type: "input" as const,
      tagName: "input",
      inputType: "password",
      bbox: { x: 10, y: 20, width: 120, height: 30 },
      visible: true,
      enabled: true,
      get value(): string {
        passwordValueGetterCalled = true;
        throw new Error("SECURITY VIOLATION: DOMElement.value was accessed on a password element!");
      },
    };

    const snapshot: DOMSnapshot = {
      elements: [passwordElement as unknown as DOMElement],
    };

    assert.doesNotThrow(() => {
      const sanitized = sanitizeDomSnapshot(snapshot);
      assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
      assert.equal(sanitized.elements[0]!.sensitive, true);
    });

    assert.equal(
      passwordValueGetterCalled,
      false,
      "DOMElement.value getter on password element must never be invoked"
    );
  });

  // =========================================================================
  // F. Leakage prevention
  // =========================================================================
  await t.test("F. Leakage prevention: raw secrets do not appear anywhere in serialized sanitized DOM", () => {
    const rawSecret = "VeryConfidentialSecretKey_987654";
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "secret_field",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: rawSecret,
          bbox: { x: 0, y: 0, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);
    const serialized = JSON.stringify(sanitized);

    assert.equal(serialized.includes(rawSecret), false, "Raw secret must NOT appear in JSON stringify");
    assert.equal(serialized.includes(REDACTED_VALUE), true, "Serialized DOM must contain [REDACTED]");
  });

  // =========================================================================
  // G. Structural preservation
  // =========================================================================
  await t.test("G. Structural preservation: preserves order, IDs, roles, labels, and bounding boxes", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "header",
          type: "text",
          tagName: "h1",
          text: "Login Page",
          bbox: { x: 20, y: 10, width: 200, height: 40 },
          visible: true,
          enabled: true,
        },
        {
          id: "email",
          type: "input",
          tagName: "input",
          inputType: "email",
          value: "user@corp.internal",
          placeholder: "username@domain",
          ariaLabel: "User email",
          bbox: { x: 20, y: 60, width: 250, height: 35 },
          visible: true,
          enabled: true,
        },
        {
          id: "pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "password123",
          placeholder: "Password",
          ariaLabel: "User password",
          bbox: { x: 20, y: 110, width: 250, height: 35 },
          visible: true,
          enabled: true,
        },
      ],
      documentWidth: 800,
      documentHeight: 600,
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);

    assert.equal(sanitized.elements.length, 3);
    assert.equal(sanitized.documentWidth, 800);
    assert.equal(sanitized.documentHeight, 600);

    // Order & metadata preserved
    assert.equal(sanitized.elements[0]!.id, "header");
    assert.equal(sanitized.elements[0]!.text, "Login Page");

    assert.equal(sanitized.elements[1]!.id, "email");
    assert.equal(sanitized.elements[1]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[1]!.placeholder, "username@domain");
    assert.equal(sanitized.elements[1]!.ariaLabel, "User email");

    assert.equal(sanitized.elements[2]!.id, "pwd");
    assert.equal(sanitized.elements[2]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[2]!.placeholder, "Password");
    assert.equal(sanitized.elements[2]!.ariaLabel, "User password");
  });

  // =========================================================================
  // H. Edge cases
  // =========================================================================
  await t.test("H1. Edge case: empty DOM snapshot", () => {
    const empty: DOMSnapshot = { elements: [] };
    const sanitized = sanitizeDomSnapshot(empty);
    assert.deepEqual(sanitized.elements, []);
  });

  await t.test("H2. Edge case: no detections provided", () => {
    const snapshot: DOMSnapshot = {
      elements: [
        {
          id: "pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "secret",
          bbox: { x: 10, y: 10, width: 50, height: 20 },
          visible: true,
          enabled: true,
        },
      ],
    };
    // Should still redact password via element metadata alone
    const sanitized = sanitizeDomSnapshot(snapshot);
    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
  });

  await t.test("H3. Edge case: multiple detections on one element", () => {
    const snapshot: DOMSnapshot = {
      elements: [
        {
          id: "overlap_el",
          type: "input",
          tagName: "input",
          value: "test_val",
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_1",
        type: "email",
        bbox: { x: 10, y: 10, width: 100, height: 30 },
        confidence: 0.9,
        sources: ["regex"],
      },
      {
        id: "det_2",
        type: "phone",
        bbox: { x: 15, y: 10, width: 90, height: 30 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const sanitized = sanitizeDomSnapshot(snapshot, detections);
    assert.equal(sanitized.elements.length, 1);
    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[0]!.sensitive, true);
  });

  await t.test("H4. Edge case: sensitive element without a value (value: undefined)", () => {
    const snapshot: DOMSnapshot = {
      elements: [
        {
          id: "empty_email",
          type: "input",
          tagName: "input",
          inputType: "email",
          placeholder: "Email",
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          enabled: true,
          sensitive: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(snapshot);
    assert.equal(sanitized.elements[0]!.value, undefined, "Missing value stays undefined");
    assert.equal(sanitized.elements[0]!.sensitive, true);
  });

  await t.test("H5. Edge case: already redacted element", () => {
    const snapshot: DOMSnapshot = {
      elements: [
        {
          id: "already_redacted",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: REDACTED_VALUE,
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          enabled: true,
          sensitive: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(snapshot);
    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
  });

  await t.test("H6. Edge case: stripValue option strips value property entirely", () => {
    const snapshot: DOMSnapshot = {
      elements: [
        {
          id: "strip_pwd",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "secret",
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(snapshot, [], { stripValue: true });
    assert.equal(sanitized.elements[0]!.value, undefined);
    assert.equal("value" in sanitized.elements[0]!, false, "value property should be stripped");
  });

  await t.test("H7. Edge case: malformed elements in snapshot are handled safely without crashing", () => {
    const snapshot = {
      elements: [
        null as unknown as DOMElement,
        undefined as unknown as DOMElement,
        {
          id: "broken_bbox",
          type: "input" as const,
          tagName: "input",
          bbox: null as unknown as DOMElement["bbox"],
          visible: true,
          enabled: true,
        },
      ],
    };

    assert.doesNotThrow(() => {
      const sanitized = sanitizeDomSnapshot(snapshot as unknown as DOMSnapshot);
      assert.ok(Array.isArray(sanitized.elements));
    });
  });

  // =========================================================================
  // I. Element-level scoping and container isolation hardening
  // =========================================================================
  await t.test("I1. Form fixture: redacts only sensitive email input while preserving all labels, selects, buttons, and help text", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "form_user_registration",
          type: "container",
          tagName: "form",
          bbox: { x: 50, y: 50, width: 400, height: 350 },
          visible: true,
          enabled: true,
        },
        {
          id: "label_email",
          type: "text",
          tagName: "label",
          role: "label",
          text: "Email",
          bbox: { x: 60, y: 60, width: 80, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "input_email",
          type: "input",
          tagName: "input",
          inputType: "email",
          value: "alice@example.com",
          bbox: { x: 60, y: 85, width: 250, height: 35 },
          visible: true,
          enabled: true,
        },
        {
          id: "label_account_type",
          type: "text",
          tagName: "label",
          role: "label",
          text: "Account type",
          bbox: { x: 60, y: 130, width: 120, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "select_account_type",
          type: "select",
          tagName: "select",
          value: "Business",
          bbox: { x: 60, y: 155, width: 250, height: 35 },
          visible: true,
          enabled: true,
        },
        {
          id: "btn_continue",
          type: "button",
          tagName: "button",
          role: "button",
          text: "Continue",
          bbox: { x: 60, y: 210, width: 120, height: 40 },
          visible: true,
          enabled: true,
        },
        {
          id: "help_text",
          type: "text",
          tagName: "p",
          text: "We'll never share your email.",
          bbox: { x: 60, y: 260, width: 300, height: 20 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);

    assert.equal(sanitized.elements.length, 7);

    // Form container must NOT be sensitive
    assert.equal(sanitized.elements[0]!.sensitive, false);

    // Label: "Email" preserved exactly
    assert.equal(sanitized.elements[1]!.text, "Email");
    assert.equal(sanitized.elements[1]!.sensitive, false);

    // Input: "alice@example.com" REDACTED
    assert.equal(sanitized.elements[2]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[2]!.sensitive, true);

    // Label: "Account type" preserved exactly
    assert.equal(sanitized.elements[3]!.text, "Account type");
    assert.equal(sanitized.elements[3]!.sensitive, false);

    // Select: "Business" preserved exactly
    assert.equal(sanitized.elements[4]!.value, "Business");
    assert.equal(sanitized.elements[4]!.sensitive, false);

    // Button: "Continue" preserved exactly
    assert.equal(sanitized.elements[5]!.text, "Continue");
    assert.equal(sanitized.elements[5]!.sensitive, false);

    // Help text: "We'll never share your email." preserved exactly
    assert.equal(sanitized.elements[6]!.text, "We'll never share your email.");
    assert.equal(sanitized.elements[6]!.sensitive, false);
  });

  await t.test("I2. Parent/child isolation: sensitive child does not infect parent container or non-sensitive siblings", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "parent_card",
          type: "container",
          tagName: "div",
          text: "User Settings Dashboard",
          bbox: { x: 0, y: 0, width: 600, height: 400 },
          visible: true,
          enabled: true,
        },
        {
          id: "sibling_username",
          type: "input",
          tagName: "input",
          inputType: "text",
          value: "alice_public_username",
          bbox: { x: 50, y: 50, width: 200, height: 30 },
          visible: true,
          enabled: true,
        },
        {
          id: "sensitive_password",
          type: "input",
          tagName: "input",
          inputType: "password",
          value: "my_master_password",
          bbox: { x: 50, y: 100, width: 200, height: 30 },
          visible: true,
          enabled: true,
        },
        {
          id: "sibling_button",
          type: "button",
          tagName: "button",
          text: "Update Profile",
          bbox: { x: 50, y: 150, width: 120, height: 35 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const sanitized = sanitizeDomSnapshot(rawSnapshot);

    // Parent container retains its text and is not marked sensitive
    assert.equal(sanitized.elements[0]!.text, "User Settings Dashboard");
    assert.equal(sanitized.elements[0]!.sensitive, false);

    // Sibling input retains its value
    assert.equal(sanitized.elements[1]!.value, "alice_public_username");
    assert.equal(sanitized.elements[1]!.sensitive, false);

    // Only password child is redacted
    assert.equal(sanitized.elements[2]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[2]!.sensitive, true);

    // Sibling button retains its text
    assert.equal(sanitized.elements[3]!.text, "Update Profile");
    assert.equal(sanitized.elements[3]!.sensitive, false);
  });

  await t.test("I3. Container overlap precision: large container enclosing a detection is NOT redacted", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "navbar_container",
          type: "container",
          tagName: "nav",
          text: "Company Portal Navigation",
          bbox: { x: 0, y: 0, width: 1000, height: 100 },
          visible: true,
          enabled: true,
        },
        {
          id: "user_email_badge",
          type: "text",
          tagName: "span",
          text: "ceo@company.com",
          bbox: { x: 800, y: 30, width: 150, height: 30 },
          visible: true,
          enabled: true,
        },
      ],
    };

    // Detection precisely targeting user_email_badge
    const detections: Detection[] = [
      {
        id: "det_email_badge",
        type: "email",
        bbox: { x: 800, y: 30, width: 150, height: 30 },
        confidence: 0.98,
        sources: ["regex"],
      },
    ];

    const sanitized = sanitizeDomSnapshot(rawSnapshot, detections);

    // The container encloses the detection spatially, but it is a container and must NOT be redacted
    assert.equal(sanitized.elements[0]!.text, "Company Portal Navigation");
    assert.equal(sanitized.elements[0]!.sensitive, false);

    // The specific span target is redacted
    assert.equal(sanitized.elements[1]!.text, REDACTED_VALUE);
    assert.equal(sanitized.elements[1]!.sensitive, true);
  });

  await t.test("I4. Spatial precision: nearby adjacent elements without overlap are NOT redacted", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "field_target",
          type: "input",
          tagName: "input",
          value: "sensitive_phone_number",
          bbox: { x: 50, y: 100, width: 150, height: 30 },
          visible: true,
          enabled: true,
        },
        {
          id: "field_adjacent",
          type: "input",
          tagName: "input",
          value: "safe_product_sku_12345",
          bbox: { x: 220, y: 100, width: 150, height: 30 }, // 20px gap, no overlap
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_phone_target",
        type: "phone",
        bbox: { x: 50, y: 100, width: 150, height: 30 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const sanitized = sanitizeDomSnapshot(rawSnapshot, detections);

    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[0]!.sensitive, true);

    assert.equal(sanitized.elements[1]!.value, "safe_product_sku_12345");
    assert.equal(sanitized.elements[1]!.sensitive, false);
  });

  await t.test("I5. Detection ID matching is token-scoped: substring matches on unrelated IDs are rejected", () => {
    const rawSnapshot: DOMSnapshot = {
      elements: [
        {
          id: "user_email_input",
          type: "input",
          tagName: "input",
          value: "target_secret@email.com",
          bbox: { x: 0, y: 0, width: 100, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "user", // Substring of "user_email_input"
          type: "text",
          tagName: "span",
          text: "User Directory",
          bbox: { x: 0, y: 50, width: 100, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "email", // Substring of "user_email_input"
          type: "text",
          tagName: "span",
          text: "Email Settings",
          bbox: { x: 0, y: 80, width: 100, height: 20 },
          visible: true,
          enabled: true,
        },
        {
          id: "", // Empty ID
          type: "text",
          tagName: "span",
          text: "Header text",
          bbox: { x: 0, y: 110, width: 100, height: 20 },
          visible: true,
          enabled: true,
        },
      ],
    };

    const detections: Detection[] = [
      {
        id: "det_user_email_input",
        type: "email",
        bbox: { x: 0, y: 0, width: 100, height: 20 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const sanitized = sanitizeDomSnapshot(rawSnapshot, detections);

    // Exact target is redacted
    assert.equal(sanitized.elements[0]!.value, REDACTED_VALUE);
    assert.equal(sanitized.elements[0]!.sensitive, true);

    // Substrings "user", "email", and empty id "" MUST NOT be redacted
    assert.equal(sanitized.elements[1]!.text, "User Directory");
    assert.equal(sanitized.elements[1]!.sensitive, false);

    assert.equal(sanitized.elements[2]!.text, "Email Settings");
    assert.equal(sanitized.elements[2]!.sensitive, false);

    assert.equal(sanitized.elements[3]!.text, "Header text");
    assert.equal(sanitized.elements[3]!.sensitive, false);
  });
});

