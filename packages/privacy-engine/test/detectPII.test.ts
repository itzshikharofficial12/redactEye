import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Detection, DOMElement } from "@redact-eye/shared-types";
import { detectPII, isEmail, isPhone, isPasswordElement } from "../dist/detectPII.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const fixturesDir = path.join(repoRoot, "test-fixtures");

test("PII Detection — Email + Phone + Password (@redact-eye/privacy-engine)", async (t) => {
  // =========================================================================
  // 1. Email Detection
  // =========================================================================
  await t.test("Email: detects valid email addresses and preserves OCR bounding box", () => {
    const ocrDetections: Detection[] = [
      {
        id: "ocr_1",
        type: "text",
        bbox: { x: 100, y: 150, width: 200, height: 25 },
        confidence: 0.95,
        sources: ["ocr"],
        text: "alice@example.test",
      },
      {
        id: "ocr_2",
        type: "text",
        bbox: { x: 100, y: 200, width: 250, height: 25 },
        confidence: 0.92,
        sources: ["ocr"],
        text: "Email: support@redacteye.io",
      },
      {
        id: "ocr_3",
        type: "text",
        bbox: { x: 100, y: 250, width: 300, height: 25 },
        confidence: 0.88,
        sources: ["ocr"],
        text: "john.doe+filter@sub.domain.co.uk",
      },
    ];

    const results = detectPII(ocrDetections, []);
    assert.equal(results.length, 3, "Must detect all 3 valid emails");

    // Verify first email detection
    const first = results[0]!;
    assert.equal(first.type, "email");
    assert.deepEqual(first.sources, ["regex"]);
    assert.deepEqual(first.bbox, { x: 100, y: 150, width: 200, height: 25 });
    assert.equal(first.confidence, 0.95);
    assert.equal(first.id, "ocr_1");

    // Verify helper function directly
    assert.equal(isEmail("alice@example.test"), true);
    assert.equal(isEmail("Email: support@redacteye.io"), true);
    assert.equal(isEmail("john.doe+filter@sub.domain.co.uk"), true);
  });

  await t.test("Email: rejects malformed and non-email strings", () => {
    const invalidInputs = [
      "user@localhost",
      "@example.com",
      "user@.com",
      "user@com",
      "plain text without at sign",
      "123@456",
      "a@@b.com",
      "+91-90000-00000",
      "1990-01-15",
      "Welcome Back",
      "Click here to continue",
    ];

    for (const input of invalidInputs) {
      assert.equal(isEmail(input), false, `Should NOT classify "${input}" as email`);
    }

    const nonEmailDetections: Detection[] = invalidInputs.map((text, i) => ({
      id: `ocr_neg_${i}`,
      type: "text",
      bbox: { x: 10, y: 10 * i, width: 100, height: 20 },
      confidence: 0.9,
      sources: ["ocr"],
      text,
    }));

    const results = detectPII(nonEmailDetections, []);
    const emailResults = results.filter((r) => r.type === "email");
    assert.equal(emailResults.length, 0, "Non-email strings must produce 0 email detections");
  });

  // =========================================================================
  // 2. Phone Detection
  // =========================================================================
  await t.test("Phone: detects Indian and international phone numbers from synthetic fixtures", () => {
    const phoneDetections: Detection[] = [
      {
        id: "ocr_phone_1",
        type: "text",
        bbox: { x: 50, y: 100, width: 180, height: 25 },
        confidence: 0.93,
        sources: ["ocr"],
        text: "+91-90000-00000",
      },
      {
        id: "ocr_phone_2",
        type: "text",
        bbox: { x: 50, y: 140, width: 220, height: 25 },
        confidence: 0.91,
        sources: ["ocr"],
        text: "Phone: +91-90000-00000",
      },
      {
        id: "ocr_phone_3",
        type: "text",
        bbox: { x: 50, y: 180, width: 150, height: 25 },
        confidence: 0.89,
        sources: ["ocr"],
        text: "90000-00000",
      },
      {
        id: "ocr_phone_4",
        type: "text",
        bbox: { x: 50, y: 220, width: 160, height: 25 },
        confidence: 0.94,
        sources: ["ocr"],
        text: "+1-555-123-4567",
      },
      {
        id: "ocr_phone_5",
        type: "text",
        bbox: { x: 50, y: 260, width: 150, height: 25 },
        confidence: 0.92,
        sources: ["ocr"],
        text: "(555) 123-4567",
      },
      {
        id: "ocr_phone_6",
        type: "text",
        bbox: { x: 50, y: 300, width: 150, height: 25 },
        confidence: 0.90,
        sources: ["ocr"],
        text: "9876543210",
      },
    ];

    const results = detectPII(phoneDetections, []);
    assert.equal(results.length, 6, "Must detect all 6 valid phone numbers");

    for (const r of results) {
      assert.equal(r.type, "phone");
      assert.deepEqual(r.sources, ["regex"]);
      assert.ok(r.confidence >= 0.85);
      assert.ok(r.bbox.width > 0 && r.bbox.height > 0);
    }

    // Verify first phone detection preserves exact OCR bounding box and ID
    assert.equal(results[0]!.id, "ocr_phone_1");
    assert.deepEqual(results[0]!.bbox, { x: 50, y: 100, width: 180, height: 25 });

    // Verify helper directly
    assert.equal(isPhone("+91-90000-00000"), true);
    assert.equal(isPhone("Phone: +91-90000-00000"), true);
    assert.equal(isPhone("90000-00000"), true);
    assert.equal(isPhone("+1-555-123-4567"), true);
    assert.equal(isPhone("(555) 123-4567"), true);
    assert.equal(isPhone("9876543210"), true);
  });

  await t.test("Phone: rejects dates, street addresses, short numbers, and non-phone strings", () => {
    const invalidPhoneStrings = [
      "1990-01-15",               // Date of birth from profile-page
      "2026-09-08",               // Current date
      "01/15/1990",               // Alternate date format
      "42 Example Street, Mumbai",// Street address with building number
      "123-45",                   // Short number (5 digits)
      "12345",                    // Zip code (5 digits)
      "90000",                    // 5 digits
      "+91",                      // Only country code
      "Phone:",                   // Label only
      "alice@example.test",       // Email
      "No numbers here",          // Plain text
      "192.168.1.1",              // IP address
    ];

    for (const input of invalidPhoneStrings) {
      assert.equal(isPhone(input), false, `Should NOT classify "${input}" as phone`);
    }

    const nonPhoneDetections: Detection[] = invalidPhoneStrings.map((text, i) => ({
      id: `ocr_neg_phone_${i}`,
      type: "text",
      bbox: { x: 10, y: 10 * i, width: 100, height: 20 },
      confidence: 0.9,
      sources: ["ocr"],
      text,
    }));

    const results = detectPII(nonPhoneDetections, []);
    const phoneResults = results.filter((r) => r.type === "phone");
    assert.equal(phoneResults.length, 0, "Dates and non-phone strings must produce 0 phone detections");
  });

  // =========================================================================
  // 3. Password Detection & Critical Security Rule
  // =========================================================================
  await t.test("Password: detects password field strictly from DOM metadata", () => {
    const domElements: DOMElement[] = [
      {
        id: "input_pwd_1",
        type: "input",
        tagName: "input",
        inputType: "password",
        placeholder: "Enter password",
        ariaLabel: "Password",
        bbox: { x: 528, y: 440, width: 320, height: 45 },
        visible: true,
        enabled: true,
        sensitive: true,
      },
      {
        id: "input_email_1",
        type: "input",
        tagName: "input",
        inputType: "email",
        placeholder: "Enter your email",
        bbox: { x: 528, y: 355, width: 320, height: 45 },
        visible: true,
        enabled: true,
      },
      {
        id: "btn_login",
        type: "button",
        tagName: "button",
        text: "Log In",
        bbox: { x: 528, y: 520, width: 320, height: 48 },
        visible: true,
        enabled: true,
      },
    ];

    const results = detectPII([], domElements);
    assert.equal(results.length, 1, "Must detect exactly 1 password field");

    const pwdDet = results[0]!;
    assert.equal(pwdDet.id, "input_pwd_1");
    assert.equal(pwdDet.type, "password");
    assert.deepEqual(pwdDet.sources, ["dom"]);
    assert.deepEqual(pwdDet.bbox, { x: 528, y: 440, width: 320, height: 45 });
    assert.equal(pwdDet.confidence, 1.0);
    assert.equal(pwdDet.text, undefined, "Password detection must NOT have text property");

    // Verify helper directly
    assert.equal(isPasswordElement(domElements[0]!), true);
    assert.equal(isPasswordElement(domElements[1]!), false);
    assert.equal(isPasswordElement(domElements[2]!), false);
  });

  await t.test("Password Security: DOMElement.value is NEVER accessed by detectPII()", () => {
    let valueAccessAttempted = false;

    // Create a DOMElement with a trap on the `value` property
    const guardedElement: DOMElement = {
      id: "input_trap_pwd",
      type: "input",
      tagName: "input",
      inputType: "password",
      placeholder: "Enter secret password",
      ariaLabel: "Password",
      bbox: { x: 488, y: 446, width: 400, height: 44 },
      visible: true,
      enabled: true,
      sensitive: true,
      get value(): string {
        valueAccessAttempted = true;
        throw new Error("CRITICAL SECURITY VIOLATION: DOMElement.value was accessed for a password field!");
      },
    };

    const results = detectPII([], [guardedElement]);
    assert.equal(valueAccessAttempted, false, "detectPII must NEVER read DOMElement.value");
    assert.equal(results.length, 1);
    assert.equal(results[0]!.type, "password");
    assert.equal(results[0]!.id, "input_trap_pwd");
    assert.equal(results[0]!.text, undefined);
  });

  await t.test("Password Security: show-password toggle scenario with inputType='text'", () => {
    let toggleValueAccessed = false;

    // A password field toggled to visible text (inputType: "text"), but with password metadata
    const toggledPasswordElement: DOMElement = {
      id: "input_user_password",
      type: "input",
      tagName: "input",
      inputType: "text", // Toggled to visible plain text
      placeholder: "Enter your password",
      ariaLabel: "Password",
      bbox: { x: 500, y: 300, width: 350, height: 45 },
      visible: true,
      enabled: true,
      sensitive: true,
      get value(): string {
        toggleValueAccessed = true;
        throw new Error("CRITICAL SECURITY VIOLATION: DOMElement.value accessed on toggled password field!");
      },
    };

    // A normal text input with no password metadata (e.g. username)
    const normalTextElement: DOMElement = {
      id: "input_username",
      type: "input",
      tagName: "input",
      inputType: "text",
      placeholder: "Enter username",
      ariaLabel: "Username",
      bbox: { x: 500, y: 200, width: 350, height: 45 },
      visible: true,
      enabled: true,
      sensitive: false,
    };

    const results = detectPII([], [toggledPasswordElement, normalTextElement]);

    // 1. Assert toggled password is classified as password
    assert.equal(results.length, 1, "Only toggled password field must be classified as PII");
    const detected = results[0]!;
    assert.equal(detected.id, "input_user_password");
    assert.equal(detected.type, "password");
    assert.deepEqual(detected.sources, ["dom"]);
    assert.deepEqual(detected.bbox, { x: 500, y: 300, width: 350, height: 45 });
    assert.equal(detected.confidence, 1.0);
    assert.equal(detected.text, undefined, "Password detection must not expose text");

    // 2. Assert value was never read
    assert.equal(toggleValueAccessed, false, "DOMElement.value must NEVER be read on toggled password field");

    // 3. Assert normal text element was NOT classified
    assert.equal(isPasswordElement(toggledPasswordElement), true);
    assert.equal(isPasswordElement(normalTextElement), false);
  });

  await t.test("Password False Positives: rejects adversarial non-password inputs", () => {
    const nonPasswordElements: DOMElement[] = [
      // 1. Explicit email input type with password in id
      {
        id: "forgot-password-email",
        type: "input",
        tagName: "input",
        inputType: "email",
        bbox: { x: 100, y: 100, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 2. Text input with forgot-password in id and email placeholder
      {
        id: "forgot-password-email",
        type: "input",
        tagName: "input",
        inputType: "text",
        placeholder: "Email",
        bbox: { x: 100, y: 150, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 3. Search query regarding password policies
      {
        id: "search_input",
        type: "input",
        tagName: "input",
        inputType: "text",
        placeholder: "Search password policies",
        bbox: { x: 100, y: 200, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 4. Username/user identifier input for password reset
      {
        id: "reset_user",
        type: "input",
        tagName: "input",
        inputType: "text",
        ariaLabel: "Password reset username",
        bbox: { x: 100, y: 250, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 5. Search input with password in placeholder
      {
        id: "search_input_2",
        type: "input",
        tagName: "input",
        inputType: "search",
        placeholder: "Search password FAQs",
        bbox: { x: 100, y: 300, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 6. Tel input with password in id
      {
        id: "2fa-password-phone",
        type: "input",
        tagName: "input",
        inputType: "tel",
        bbox: { x: 100, y: 350, width: 300, height: 40 },
        visible: true,
        enabled: true,
      },
      // 7. Checkbox with password in id
      {
        id: "remember-password",
        type: "checkbox",
        tagName: "input",
        inputType: "checkbox",
        bbox: { x: 100, y: 400, width: 20, height: 20 },
        visible: true,
        enabled: true,
      },
    ];

    for (const el of nonPasswordElements) {
      assert.equal(
        isPasswordElement(el),
        false,
        `Element "${el.id}" (inputType=${el.inputType}, placeholder=${el.placeholder}, ariaLabel=${el.ariaLabel}) must NOT be classified as password`
      );
    }

    const detections = detectPII([], nonPasswordElements);
    assert.equal(
      detections.length,
      0,
      "Adversarial non-password inputs must yield 0 password detections"
    );
  });

  // =========================================================================
  // 4. Combined and Edge Cases
  // =========================================================================
  await t.test("Combined: detects email, phone, and password together from mixed inputs", () => {
    const ocrDetections: Detection[] = [
      {
        id: "ocr_email",
        type: "text",
        bbox: { x: 488, y: 286, width: 170, height: 28 },
        confidence: 0.95,
        sources: ["ocr"],
        text: "alice@example.test",
      },
      {
        id: "ocr_phone",
        type: "text",
        bbox: { x: 488, y: 366, width: 190, height: 28 },
        confidence: 0.91,
        sources: ["ocr"],
        text: "+91-90000-00000",
      },
      {
        id: "ocr_heading",
        type: "text",
        bbox: { x: 586, y: 126, width: 204, height: 42 },
        confidence: 0.96,
        sources: ["ocr"],
        text: "Create Account",
      },
    ];

    const domElements: DOMElement[] = [
      {
        id: "dom_pwd",
        type: "input",
        tagName: "input",
        inputType: "password",
        bbox: { x: 488, y: 446, width: 400, height: 44 },
        visible: true,
        enabled: true,
      },
      {
        id: "dom_submit",
        type: "button",
        tagName: "button",
        text: "Sign Up",
        bbox: { x: 488, y: 535, width: 400, height: 48 },
        visible: true,
        enabled: true,
      },
    ];

    const results = detectPII(ocrDetections, domElements);
    assert.equal(results.length, 3, "Must detect exactly 3 PII entities: email, phone, password");

    const types = results.map((r) => r.type).sort();
    assert.deepEqual(types, ["email", "password", "phone"]);

    const emailDet = results.find((r) => r.type === "email")!;
    assert.equal(emailDet.id, "ocr_email");
    assert.deepEqual(emailDet.sources, ["regex"]);

    const phoneDet = results.find((r) => r.type === "phone")!;
    assert.equal(phoneDet.id, "ocr_phone");
    assert.deepEqual(phoneDet.sources, ["regex"]);

    const pwdDet = results.find((r) => r.type === "password")!;
    assert.equal(pwdDet.id, "dom_pwd");
    assert.deepEqual(pwdDet.sources, ["dom"]);
  });

  await t.test("Edge cases: handles empty arrays and non-string inputs safely", () => {
    assert.deepEqual(detectPII([], []), []);
    assert.deepEqual(detectPII(), []);

    // Detection with undefined or null text
    const emptyTextDets: Detection[] = [
      {
        id: "ocr_empty",
        type: "text",
        bbox: { x: 0, y: 0, width: 10, height: 10 },
        confidence: 0.5,
        sources: ["ocr"],
      },
    ];
    assert.deepEqual(detectPII(emptyTextDets, []), []);
  });

  // =========================================================================
  // 5. Fixture Integration: detects password from real fixture DOMs without reading value
  // =========================================================================
  await t.test("Fixtures: accurately detects password fields from login and signup DOM fixtures", () => {
    const loginDom = JSON.parse(fs.readFileSync(path.join(fixturesDir, "dom/login-page.json"), "utf-8"));
    const signupDom = JSON.parse(fs.readFileSync(path.join(fixturesDir, "dom/signup-page.json"), "utf-8"));
    const profileDom = JSON.parse(fs.readFileSync(path.join(fixturesDir, "dom/profile-page.json"), "utf-8"));

    // Guard all password elements in loginDom with value traps
    for (const el of loginDom.elements) {
      if (el.inputType === "password") {
        Object.defineProperty(el, "value", {
          get() {
            throw new Error("CRITICAL SECURITY VIOLATION: loginDom password.value accessed!");
          },
        });
      }
    }
    const loginPii = detectPII([], loginDom.elements);
    assert.equal(loginPii.length, 1);
    assert.equal(loginPii[0]!.id, "input_2");
    assert.equal(loginPii[0]!.type, "password");
    assert.deepEqual(loginPii[0]!.sources, ["dom"]);
    assert.equal(loginPii[0]!.text, undefined);

    // Guard all password elements in signupDom with value traps
    for (const el of signupDom.elements) {
      if (el.inputType === "password") {
        Object.defineProperty(el, "value", {
          get() {
            throw new Error("CRITICAL SECURITY VIOLATION: signupDom password.value accessed!");
          },
        });
      }
    }
    const signupPii = detectPII([], signupDom.elements);
    assert.equal(signupPii.length, 1);
    assert.equal(signupPii[0]!.id, "input_4");
    assert.equal(signupPii[0]!.type, "password");
    assert.deepEqual(signupPii[0]!.sources, ["dom"]);
    assert.equal(signupPii[0]!.text, undefined);

    // Profile page has no passwords
    const profilePii = detectPII([], profileDom.elements);
    assert.equal(profilePii.length, 0);
  });
});
