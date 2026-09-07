import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import ort from "onnxruntime-node";
import { OcrPipeline } from "../dist/ocr.js";
import type { Detection } from "@redact-eye/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const detModelPath = path.join(repoRoot, "models/ocr/det.onnx");
const recModelPath = path.join(repoRoot, "models/ocr/rec.onnx");
const dictPath = path.join(repoRoot, "models/ocr/en_dict.txt");
const fixtureImagePath = path.join(repoRoot, "test-fixtures/screenshots/signup-page.jpg");

const modelsAvailable =
  fs.existsSync(detModelPath) &&
  fs.existsSync(recModelPath) &&
  fs.existsSync(dictPath);

test("OCR Pipeline (@redact-eye/vision-engine)", async (t) => {
  if (!modelsAvailable) {
    t.skip(
      "OCR model files (det.onnx, rec.onnx) or en_dict.txt are not present in models/ocr/. " +
        "Run `bash models/ocr/download.sh` to download models before running this test suite."
    );
    return;
  }

  // Load and decode synthetic test fixture image
  assert.ok(fs.existsSync(fixtureImagePath), `Fixture screenshot missing: ${fixtureImagePath}`);
  const jpegBuffer = fs.readFileSync(fixtureImagePath);
  const rawImage = jpeg.decode(jpegBuffer);

  assert.ok(rawImage.width > 0, "Image width must be positive");
  assert.ok(rawImage.height > 0, "Image height must be positive");

  // Initialize pipeline with onnxruntime-node backend and local model files
  const dictContent = fs.readFileSync(dictPath, "utf-8");
  const pipeline = await OcrPipeline.create({
    detModel: detModelPath,
    recModel: recModelPath,
    dictionary: dictContent,
    ort,
    detThreshold: 0.3,
    boxThreshold: 0.5,
    confidenceThreshold: 0.2,
  });

  let detections: Detection[] = [];

  await t.test("executes pipeline and returns non-empty detection list", async () => {
    detections = await pipeline.run({
      imageData: {
        data: rawImage.data,
        width: rawImage.width,
        height: rawImage.height,
      },
      width: rawImage.width,
      height: rawImage.height,
    });

    assert.ok(Array.isArray(detections), "Result must be an array");
    assert.ok(detections.length > 0, "Pipeline should detect text in signup page fixture");
  });

  await t.test("all detections conform strictly to shared-types Detection contract", () => {
    for (const d of detections) {
      assert.equal(typeof d.id, "string", "Detection id must be a string");
      assert.ok(d.id.length > 0, "Detection id must not be empty");
      assert.equal(d.type, "text", 'Detection type must be "text"');
      assert.ok(Array.isArray(d.sources), "Detection sources must be an array");
      assert.ok(d.sources.includes("ocr"), 'Detection sources must include "ocr"');

      // Bounding box validation
      assert.ok(d.bbox, "Detection bbox must exist");
      assert.ok(d.bbox.x >= 0, `bbox.x (${d.bbox.x}) must be >= 0`);
      assert.ok(d.bbox.y >= 0, `bbox.y (${d.bbox.y}) must be >= 0`);
      assert.ok(d.bbox.width > 0, `bbox.width (${d.bbox.width}) must be > 0`);
      assert.ok(d.bbox.height > 0, `bbox.height (${d.bbox.height}) must be > 0`);
      assert.ok(
        d.bbox.x + d.bbox.width <= rawImage.width + 10,
        `bbox must fit within viewport width`
      );
      assert.ok(
        d.bbox.y + d.bbox.height <= rawImage.height + 10,
        `bbox must fit within viewport height`
      );

      // Confidence score validation
      assert.equal(typeof d.confidence, "number", "Confidence must be a number");
      assert.ok(d.confidence >= 0.0, `Confidence (${d.confidence}) must be >= 0.0`);
      assert.ok(d.confidence <= 1.0, `Confidence (${d.confidence}) must be <= 1.0`);

      // Text field validation
      assert.equal(typeof d.text, "string", "Detection text must be a string");
      assert.ok(d.text!.length > 0, "Detection text must not be empty");
    }
  });

  await t.test("correctly recognizes synthetic PII fields in screenshot fixture", () => {
    const recognizedTexts = detections.map((d) => d.text?.toLowerCase() ?? "");

    // Check for email address
    const emailDetected = detections.some((d) =>
      d.text?.toLowerCase().includes("alice@example.test")
    );
    assert.ok(
      emailDetected,
      `Expected OCR to detect email "alice@example.test". Detected: [${recognizedTexts.join(", ")}]`
    );

    // Check for phone number
    const phoneDetected = detections.some((d) =>
      d.text?.includes("90000-00000") || d.text?.includes("+91")
    );
    assert.ok(
      phoneDetected,
      `Expected OCR to detect phone "+91-90000-00000". Detected: [${recognizedTexts.join(", ")}]`
    );

    // Check for user name
    const nameDetected = detections.some((d) =>
      d.text?.toLowerCase().includes("alice")
    );
    assert.ok(
      nameDetected,
      `Expected OCR to detect name "Alice". Detected: [${recognizedTexts.join(", ")}]`
    );
  });

  await t.test("executes fresh inference on subsequent invocations with unique IDs", async () => {
    const run2Detections = await pipeline.run({
      imageData: {
        data: rawImage.data,
        width: rawImage.width,
        height: rawImage.height,
      },
      width: rawImage.width,
      height: rawImage.height,
    });

    assert.equal(
      run2Detections.length,
      detections.length,
      "Second invocation must detect identical text count"
    );
    assert.notEqual(
      run2Detections[0]!.id,
      detections[0]!.id,
      "Second invocation must produce fresh unique IDs, not cached objects"
    );
    assert.equal(
      run2Detections[0]!.text,
      detections[0]!.text,
      "Second invocation text must match"
    );
  });
});
