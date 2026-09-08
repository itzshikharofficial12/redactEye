import test from "node:test";
import assert from "node:assert/strict";
import type { Detection } from "@redact-eye/shared-types";
import { fuseDetections } from "../dist/fuse.js";

test("Detection Fusion (@redact-eye/privacy-engine)", async (t) => {
  // =========================================================================
  // A. Face detection is preserved directly
  // =========================================================================
  await t.test("A. Face detection is preserved directly without requiring OCR overlap", () => {
    const faceDetections: Detection[] = [
      {
        id: "face_avatar_1",
        type: "face",
        bbox: { x: 625, y: 115, width: 126, height: 130 },
        confidence: 0.94,
        sources: ["face"],
      },
    ];

    const results = fuseDetections([faceDetections]);
    assert.equal(results.length, 1, "Must preserve the face detection");
    const face = results[0]!;
    assert.equal(face.type, "face");
    assert.deepEqual(face.sources, ["face"]);
    assert.deepEqual(face.bbox, { x: 625, y: 115, width: 126, height: 130 });
    assert.equal(face.confidence, 0.94);
  });

  // =========================================================================
  // B. Email + OCR detection produces one email detection
  // =========================================================================
  await t.test("B. Email + OCR detection produces one email detection", () => {
    const ocrDetections: Detection[] = [
      {
        id: "ocr_email_raw",
        type: "text",
        bbox: { x: 536, y: 363, width: 171, height: 28 },
        confidence: 0.96,
        sources: ["ocr"],
        text: "alice@example.test",
      },
    ];

    const piiDetections: Detection[] = [
      {
        id: "pii_email_regex",
        type: "email",
        bbox: { x: 536, y: 363, width: 171, height: 28 },
        confidence: 0.98,
        sources: ["regex"],
      },
    ];

    const results = fuseDetections([ocrDetections, piiDetections]);
    assert.equal(results.length, 1, "Must produce exactly one fused email detection");

    const email = results[0]!;
    assert.equal(email.type, "email");
    assert.ok(email.sources.includes("regex"), "Must contain regex source");
    assert.ok(email.sources.includes("ocr"), "Must contain ocr source");
    assert.equal(email.confidence, 0.98, "Must take highest confidence");
    assert.deepEqual(email.bbox, { x: 536, y: 363, width: 171, height: 28 });
  });

  // =========================================================================
  // C. Phone + OCR detection produces one phone detection
  // =========================================================================
  await t.test("C. Phone + OCR detection produces one phone detection", () => {
    const ocrDetections: Detection[] = [
      {
        id: "ocr_phone_raw",
        type: "text",
        bbox: { x: 523, y: 370, width: 159, height: 34 },
        confidence: 0.91,
        sources: ["ocr"],
        text: "+91-90000-00000",
      },
    ];

    const piiDetections: Detection[] = [
      {
        id: "pii_phone_regex",
        type: "phone",
        bbox: { x: 523, y: 370, width: 159, height: 34 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const results = fuseDetections([ocrDetections, piiDetections]);
    assert.equal(results.length, 1, "Must produce exactly one fused phone detection");

    const phone = results[0]!;
    assert.equal(phone.type, "phone");
    assert.ok(phone.sources.includes("regex"));
    assert.ok(phone.sources.includes("ocr"));
    assert.equal(phone.confidence, 0.95);
    assert.deepEqual(phone.bbox, { x: 523, y: 370, width: 159, height: 34 });
  });

  // =========================================================================
  // D. Password DOM detection is preserved
  // =========================================================================
  await t.test("D. Password DOM detection is preserved", () => {
    const domDetections: Detection[] = [
      {
        id: "dom_pwd_input",
        type: "password",
        bbox: { x: 528, y: 442, width: 320, height: 45 },
        confidence: 1.0,
        sources: ["dom"],
      },
    ];

    const results = fuseDetections([domDetections]);
    assert.equal(results.length, 1, "Must preserve password detection");

    const pwd = results[0]!;
    assert.equal(pwd.type, "password");
    assert.deepEqual(pwd.sources, ["dom"]);
    assert.deepEqual(pwd.bbox, { x: 528, y: 442, width: 320, height: 45 });
    assert.equal(pwd.confidence, 1.0);
    assert.equal(pwd.text, undefined, "Password detection must have undefined text");
  });

  // =========================================================================
  // E. Duplicate compatible detections in the same region are deduplicated
  // =========================================================================
  await t.test("E. Duplicate compatible detections in the same region are deduplicated", () => {
    // Two email detections covering the same visual area (e.g. from two detector passes)
    const emailGroup1: Detection[] = [
      {
        id: "email_pass1",
        type: "email",
        bbox: { x: 100, y: 150, width: 200, height: 30 },
        confidence: 0.90,
        sources: ["regex"],
      },
    ];
    const emailGroup2: Detection[] = [
      {
        id: "email_pass2",
        type: "email",
        bbox: { x: 102, y: 148, width: 202, height: 32 },
        confidence: 0.96,
        sources: ["dom"],
      },
    ];

    const results = fuseDetections([emailGroup1, emailGroup2]);
    assert.equal(results.length, 1, "Must deduplicate to a single fused email detection");

    const fused = results[0]!;
    assert.equal(fused.type, "email");
    assert.equal(fused.confidence, 0.96, "Highest confidence must be selected");
    assert.ok(fused.sources.includes("regex"));
    assert.ok(fused.sources.includes("dom"));
    // Enclosing bounding box should cover both
    assert.ok(fused.bbox.x <= 100);
    assert.ok(fused.bbox.y <= 148);
    assert.ok(fused.bbox.x + fused.bbox.width >= 304);
    assert.ok(fused.bbox.y + fused.bbox.height >= 180);
  });

  // =========================================================================
  // F. Same-region incompatible detections are NOT incorrectly merged
  // =========================================================================
  await t.test("F. Same-region incompatible detections are NOT incorrectly merged", () => {
    // A face detection and an email detection with high spatial overlap
    const faceDet: Detection = {
      id: "face_overlap",
      type: "face",
      bbox: { x: 200, y: 200, width: 100, height: 100 },
      confidence: 0.92,
      sources: ["face"],
    };

    const emailDet: Detection = {
      id: "email_overlap",
      type: "email",
      bbox: { x: 210, y: 210, width: 80, height: 40 },
      confidence: 0.95,
      sources: ["regex"],
    };

    const results = fuseDetections([[faceDet], [emailDet]]);
    assert.equal(results.length, 2, "Incompatible types (face vs email) must NEVER be merged");

    const types = results.map((r) => r.type).sort();
    assert.deepEqual(types, ["email", "face"]);

    // Test phone vs password overlap
    const phoneDet: Detection = {
      id: "phone_overlap",
      type: "phone",
      bbox: { x: 400, y: 400, width: 150, height: 40 },
      confidence: 0.90,
      sources: ["regex"],
    };
    const pwdDet: Detection = {
      id: "pwd_overlap",
      type: "password",
      bbox: { x: 405, y: 395, width: 140, height: 45 },
      confidence: 1.0,
      sources: ["dom"],
    };

    const results2 = fuseDetections([[phoneDet], [pwdDet]]);
    assert.equal(results2.length, 2, "Incompatible types (phone vs password) must NEVER be merged");
    assert.deepEqual(results2.map((r) => r.type).sort(), ["password", "phone"]);
  });

  // =========================================================================
  // G. Multiple sources are combined uniquely
  // =========================================================================
  await t.test("G. Multiple sources are combined uniquely without duplicates", () => {
    const detA: Detection = {
      id: "det_a",
      type: "phone",
      bbox: { x: 50, y: 50, width: 120, height: 25 },
      confidence: 0.88,
      sources: ["regex", "ocr"],
    };

    const detB: Detection = {
      id: "det_b",
      type: "phone",
      bbox: { x: 50, y: 50, width: 120, height: 25 },
      confidence: 0.93,
      sources: ["regex", "dom"],
    };

    const results = fuseDetections([[detA, detB]]);
    assert.equal(results.length, 1);
    const fused = results[0]!;

    // Must have regex, ocr, dom without duplicates
    assert.equal(fused.sources.filter((s) => s === "regex").length, 1, "regex source must appear exactly once");
    assert.ok(fused.sources.includes("regex"));
    assert.ok(fused.sources.includes("ocr"));
    assert.ok(fused.sources.includes("dom"));
  });

  // =========================================================================
  // H. Highest confidence is preserved according to deterministic rule
  // =========================================================================
  await t.test("H. Highest confidence is preserved according to deterministic rule", () => {
    const lowerConf: Detection = {
      id: "low_conf",
      type: "email",
      bbox: { x: 10, y: 10, width: 100, height: 20 },
      confidence: 0.72,
      sources: ["ocr"],
    };

    const higherConf: Detection = {
      id: "high_conf",
      type: "email",
      bbox: { x: 10, y: 10, width: 100, height: 20 },
      confidence: 0.97,
      sources: ["regex"],
    };

    const results = fuseDetections([[lowerConf], [higherConf]]);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.confidence, 0.97);
  });

  // =========================================================================
  // I. Input detections are not mutated
  // =========================================================================
  await t.test("I. Input detections are not mutated", () => {
    const inputBbox = Object.freeze({ x: 30, y: 40, width: 150, height: 35 });
    const inputSources = Object.freeze(["regex"] as const);
    const inputDet: Detection = Object.freeze({
      id: "frozen_det",
      type: "email",
      bbox: inputBbox,
      confidence: 0.91,
      sources: inputSources as any,
    });

    const ocrDet: Detection = Object.freeze({
      id: "frozen_ocr",
      type: "text",
      bbox: Object.freeze({ x: 30, y: 40, width: 150, height: 35 }),
      confidence: 0.89,
      sources: Object.freeze(["ocr"]) as any,
      text: "frozen@example.test",
    });

    const results = fuseDetections([[inputDet], [ocrDet]]);
    assert.equal(results.length, 1);

    // Verify input objects are not the same reference as the output object
    assert.notEqual(results[0], inputDet);
    assert.notEqual(results[0]!.bbox, inputDet.bbox);
    assert.notEqual(results[0]!.sources, inputDet.sources);

    // Verify original object properties remain unchanged
    assert.equal(inputDet.bbox.x, 30);
    assert.equal(inputDet.confidence, 0.91);
  });

  // =========================================================================
  // J. Invalid geometry is rejected/handled safely
  // =========================================================================
  await t.test("J. Invalid geometry is rejected/handled safely", () => {
    const invalidDetections: Detection[] = [
      {
        id: "inv_1",
        type: "email",
        bbox: { x: 10, y: 10, width: -50, height: 20 }, // Negative width
        confidence: 0.9,
        sources: ["regex"],
      },
      {
        id: "inv_2",
        type: "phone",
        bbox: { x: 10, y: 10, width: 100, height: 0 }, // Zero height
        confidence: 0.9,
        sources: ["regex"],
      },
      {
        id: "inv_3",
        type: "face",
        bbox: { x: NaN, y: 10, width: 100, height: 100 }, // NaN coordinate
        confidence: 0.9,
        sources: ["face"],
      },
      {
        id: "inv_4",
        type: "password",
        bbox: { x: 10, y: 10, width: Infinity, height: 20 }, // Infinite width
        confidence: 1.0,
        sources: ["dom"],
      },
    ];

    const validDet: Detection = {
      id: "valid_1",
      type: "email",
      bbox: { x: 100, y: 100, width: 200, height: 30 },
      confidence: 0.95,
      sources: ["regex"],
    };

    const results = fuseDetections([invalidDetections, [validDet]]);
    assert.equal(results.length, 1, "Must discard invalid geometry and retain only valid detections");
    assert.equal(results[0]!.id, "valid_1");
  });

  // =========================================================================
  // K. Empty detection arrays are handled safely
  // =========================================================================
  await t.test("K. Empty detection arrays are handled safely", () => {
    assert.deepEqual(fuseDetections([]), []);
    assert.deepEqual(fuseDetections([[], []]), []);
    assert.deepEqual(fuseDetections([[], [], []]), []);
    assert.deepEqual(fuseDetections(), []);
  });

  // =========================================================================
  // L. Password detection remains free of text/value
  // =========================================================================
  await t.test("L. Password detection remains free of text/value even when merged", () => {
    const ocrPasswordBullet: Detection = {
      id: "ocr_pwd_bullets",
      type: "text",
      bbox: { x: 528, y: 442, width: 120, height: 25 },
      confidence: 0.85,
      sources: ["ocr"],
      text: "••••••••",
    };

    const domPassword: Detection = {
      id: "dom_pwd_field",
      type: "password",
      bbox: { x: 528, y: 442, width: 320, height: 45 },
      confidence: 1.0,
      sources: ["dom"],
      // text is undefined
    };

    const results = fuseDetections([[ocrPasswordBullet], [domPassword]]);
    assert.equal(results.length, 1, "Must merge into a single password detection");

    const pwd = results[0]!;
    assert.equal(pwd.type, "password");
    assert.equal(pwd.text, undefined, "CRITICAL: Fused password detection MUST NOT contain text property!");
    assert.ok(pwd.sources.includes("dom"));
    assert.ok(pwd.sources.includes("ocr"));
  });
});
