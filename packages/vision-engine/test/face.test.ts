import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import ort from "onnxruntime-node";
import { FacePipeline } from "../dist/face.js";
import { filterAndDecodeBoxes, nms, type FaceCandidate } from "../dist/facePostprocess.js";
import type { Detection } from "@redact-eye/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const modelPath = path.join(repoRoot, "models/face/det.onnx");
const fixtureImagePath = path.join(repoRoot, "test-fixtures/screenshots/profile-page.jpg");

const modelAvailable = fs.existsSync(modelPath);

test("Face Detection Pipeline (@redact-eye/vision-engine)", async (t) => {
  if (!modelAvailable) {
    t.skip(
      "Face detection model (det.onnx) is not present in models/face/. " +
        "Run `bash models/face/download.sh` to download the model before running this test suite."
    );
    return;
  }

  // Load and decode synthetic test fixture image
  assert.ok(fs.existsSync(fixtureImagePath), `Fixture screenshot missing: ${fixtureImagePath}`);
  const jpegBuffer = fs.readFileSync(fixtureImagePath);
  const rawImage = jpeg.decode(jpegBuffer);

  assert.ok(rawImage.width > 0, "Image width must be positive");
  assert.ok(rawImage.height > 0, "Image height must be positive");

  // Initialize pipeline with default threshold (0.7) and onnxruntime-node
  const pipeline = await FacePipeline.create({
    modelPath,
    ort,
  });

  let detections: Detection[] = [];

  await t.test("executes pipeline with default 0.7 threshold and returns face detections", async () => {
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
    assert.ok(detections.length >= 1, "Must detect at least 1 face in profile-page.jpg fixture");

    // Output formatted Detection[] for inspection
    console.log(`\n=== Actual Detection[] for profile-page.jpg (${detections.length} total) ===`);
    console.log(JSON.stringify(detections, null, 2));
  });

  await t.test("all detections conform strictly to shared-types Detection contract", () => {
    for (const d of detections) {
      // ID
      assert.equal(typeof d.id, "string", "Detection id must be a string");
      assert.ok(d.id.length > 0, "Detection id must not be empty");

      // Type
      assert.equal(d.type, "face", 'Detection type must be "face"');

      // Sources
      assert.ok(Array.isArray(d.sources), "Detection sources must be an array");
      assert.ok(d.sources.includes("face"), 'Detection sources must include "face"');

      // Bounding box validation
      assert.ok(d.bbox, "Detection bbox must exist");
      assert.ok(d.bbox.x >= 0, `bbox.x (${d.bbox.x}) must be >= 0`);
      assert.ok(d.bbox.y >= 0, `bbox.y (${d.bbox.y}) must be >= 0`);
      assert.ok(d.bbox.width > 0, `bbox.width (${d.bbox.width}) must be > 0`);
      assert.ok(d.bbox.height > 0, `bbox.height (${d.bbox.height}) must be > 0`);
      assert.ok(
        d.bbox.x + d.bbox.width <= rawImage.width + 10,
        `bbox must fit within viewport width (x=${d.bbox.x} + w=${d.bbox.width} vs img=${rawImage.width})`
      );
      assert.ok(
        d.bbox.y + d.bbox.height <= rawImage.height + 10,
        `bbox must fit within viewport height (y=${d.bbox.y} + h=${d.bbox.height} vs img=${rawImage.height})`
      );

      // Confidence score validation (with default threshold 0.7, must be >= 0.7)
      assert.equal(typeof d.confidence, "number", "Confidence must be a number");
      assert.ok(d.confidence >= 0.7, `Confidence (${d.confidence}) must be >= default threshold 0.7`);
      assert.ok(d.confidence <= 1.0, `Confidence (${d.confidence}) must be <= 1.0`);

      // Face detections must NOT have a text field set
      assert.equal(d.text, undefined, "Face detections must not have a text field");
    }
  });

  await t.test("respects configurable scoreThreshold parameter", async () => {
    // 1. Threshold above face confidence (0.95 > 0.9394) -> must yield 0 detections
    const strictPipeline = await FacePipeline.create({
      modelPath,
      ort,
      scoreThreshold: 0.95,
    });
    const strictResults = await strictPipeline.run({
      imageData: {
        data: rawImage.data,
        width: rawImage.width,
        height: rawImage.height,
      },
      width: rawImage.width,
      height: rawImage.height,
    });
    assert.equal(
      strictResults.length,
      0,
      "scoreThreshold: 0.95 must suppress face detection with confidence 0.9394"
    );

    // 2. Threshold below face confidence (0.90 <= 0.9394) -> must retain face detection
    const threshold90Pipeline = await FacePipeline.create({
      modelPath,
      ort,
      scoreThreshold: 0.90,
    });
    const results90 = await threshold90Pipeline.run({
      imageData: {
        data: rawImage.data,
        width: rawImage.width,
        height: rawImage.height,
      },
      width: rawImage.width,
      height: rawImage.height,
    });
    assert.equal(
      results90.length,
      1,
      "scoreThreshold: 0.90 must retain face detection with confidence 0.9394"
    );
    assert.ok(
      results90[0]!.confidence >= 0.90,
      `Detected confidence (${results90[0]!.confidence}) must be >= threshold 0.90`
    );

    // 3. Permissive threshold (0.50) -> retains detection and verifies every result >= 0.50
    const permissivePipeline = await FacePipeline.create({
      modelPath,
      ort,
      scoreThreshold: 0.5,
    });
    const permissiveResults = await permissivePipeline.run({
      imageData: {
        data: rawImage.data,
        width: rawImage.width,
        height: rawImage.height,
      },
      width: rawImage.width,
      height: rawImage.height,
    });
    assert.ok(
      permissiveResults.length >= 1,
      "scoreThreshold: 0.5 must retain face detections"
    );
    for (const d of permissiveResults) {
      assert.ok(
        d.confidence >= 0.5,
        `Every detection under scoreThreshold: 0.5 must satisfy confidence >= 0.5 (got ${d.confidence})`
      );
    }
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
      "Second invocation must detect identical face count"
    );

    // Verify every detection in the second run has a unique ID vs the first run
    console.log("\n  [Side-by-side ID Check]");
    console.log(`    Run 1 ID: "${detections[0]?.id}"`);
    console.log(`    Run 2 ID: "${run2Detections[0]?.id}"`);

    const firstRunIds = new Set(detections.map((d) => d.id));
    for (const d of run2Detections) {
      assert.ok(
        !firstRunIds.has(d.id),
        `Second invocation must produce fresh unique IDs, not cached objects (found duplicate: ${d.id})`
      );
    }

    // Verify bounding boxes are deterministic (same coordinates across runs)
    if (detections.length > 0 && run2Detections.length > 0) {
      assert.equal(
        run2Detections[0]!.bbox.x,
        detections[0]!.bbox.x,
        "Second invocation bbox.x must match"
      );
      assert.equal(
        run2Detections[0]!.confidence,
        detections[0]!.confidence,
        "Second invocation confidence must match"
      );
    }
  });

  await t.test("detects face in login-page.jpg avatar fixture", async () => {
    const loginPath = path.join(repoRoot, "test-fixtures/screenshots/login-page.jpg");
    assert.ok(fs.existsSync(loginPath), `login-page fixture missing: ${loginPath}`);
    const loginImg = jpeg.decode(fs.readFileSync(loginPath));

    const loginDetections = await pipeline.run({
      imageData: {
        data: loginImg.data,
        width: loginImg.width,
        height: loginImg.height,
      },
      width: loginImg.width,
      height: loginImg.height,
    });

    assert.equal(loginDetections.length, 1, "Must detect exactly 1 face in login-page.jpg");
    assert.equal(loginDetections[0]!.type, "face");
    assert.ok(loginDetections[0]!.confidence >= 0.7, "Confidence must be >= 0.7");
    // Avatar is at { x: 565, y: 120, width: 150, height: 150 } in DOM
    assert.ok(loginDetections[0]!.bbox.x >= 565 && loginDetections[0]!.bbox.x <= 715);
    assert.ok(loginDetections[0]!.bbox.y >= 120 && loginDetections[0]!.bbox.y <= 270);
  });

  await t.test("returns empty detection array for non-face images without false positives", async () => {
    // 1. signup-page.jpg has no face avatar (registration form only)
    const signupPath = path.join(repoRoot, "test-fixtures/screenshots/signup-page.jpg");
    assert.ok(fs.existsSync(signupPath), `signup-page fixture missing: ${signupPath}`);
    const signupImg = jpeg.decode(fs.readFileSync(signupPath));

    const signupDetections = await pipeline.run({
      imageData: {
        data: signupImg.data,
        width: signupImg.width,
        height: signupImg.height,
      },
      width: signupImg.width,
      height: signupImg.height,
    });

    assert.ok(Array.isArray(signupDetections), "Result must be an array");
    assert.equal(
      signupDetections.length,
      0,
      "signup-page.jpg has no avatar and must produce 0 face detections"
    );

    // 2. Non-face crop from login-page.jpg (form inputs & buttons: y=320..768)
    const loginPath = path.join(repoRoot, "test-fixtures/screenshots/login-page.jpg");
    const loginImg = jpeg.decode(fs.readFileSync(loginPath));
    const cropY = 320;
    const cropH = loginImg.height - cropY;
    const cropW = loginImg.width;
    const cropData = new Uint8Array(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
      const srcOffset = ((cropY + y) * loginImg.width) * 4;
      const dstOffset = y * cropW * 4;
      cropData.set(loginImg.data.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
    }

    const cropDetections = await pipeline.run({
      imageData: {
        data: cropData,
        width: cropW,
        height: cropH,
      },
      width: cropW,
      height: cropH,
    });

    assert.ok(Array.isArray(cropDetections), "Result must be an array");
    assert.equal(
      cropDetections.length,
      0,
      "Form input crop from login-page.jpg must produce 0 face detections (no false positives)"
    );
  });
});

test("Non-Maximum Suppression (nms) Unit Tests", async (t) => {
  await t.test("suppresses overlapping candidate box with lower confidence", () => {
    const candidates: FaceCandidate[] = [
      {
        bbox: { x: 100, y: 100, width: 80, height: 80 },
        confidence: 0.95,
      },
      {
        bbox: { x: 105, y: 102, width: 80, height: 80 }, // heavily overlapping box (~85% IoU)
        confidence: 0.82,
      },
    ];

    const result = nms(candidates, 0.3);
    assert.equal(result.length, 1, "Must suppress the lower-confidence overlapping candidate");
    assert.equal(result[0]!.confidence, 0.95, "Must retain the higher-confidence candidate");
    assert.deepEqual(result[0]!.bbox, { x: 100, y: 100, width: 80, height: 80 });
  });

  await t.test("preserves distinct non-overlapping face candidate boxes", () => {
    const candidates: FaceCandidate[] = [
      {
        bbox: { x: 50, y: 50, width: 60, height: 60 }, // Face 1 (left)
        confidence: 0.92,
      },
      {
        bbox: { x: 500, y: 300, width: 60, height: 60 }, // Face 2 (right, IoU = 0)
        confidence: 0.88,
      },
    ];

    const result = nms(candidates, 0.3);
    assert.equal(result.length, 2, "Must preserve both distinct non-overlapping face candidates");
    assert.equal(result[0]!.confidence, 0.92);
    assert.equal(result[1]!.confidence, 0.88);
  });

  await t.test("correctly applies IoU threshold boundary", () => {
    // Two 100x100 boxes: Box 1 at (0,0), Box 2 at (50,0)
    // Intersection: width 50, height 100 -> area = 5,000
    // Union: 10,000 + 10,000 - 5,000 = 15,000
    // IoU: 5,000 / 15,000 = 0.3333...
    const candidates: FaceCandidate[] = [
      { bbox: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.90 },
      { bbox: { x: 50, y: 0, width: 100, height: 100 }, confidence: 0.70 },
    ];

    // At iouThreshold = 0.30, IoU (0.333) > 0.30 -> lower confidence box is suppressed
    const suppressed = nms(candidates, 0.30);
    assert.equal(suppressed.length, 1, "IoU 0.333 > threshold 0.30 must suppress overlapping box");
    assert.equal(suppressed[0]!.confidence, 0.90);

    // At iouThreshold = 0.40, IoU (0.333) <= 0.40 -> both boxes are kept
    const kept = nms(candidates, 0.40);
    assert.equal(kept.length, 2, "IoU 0.333 <= threshold 0.40 must retain both boxes");
  });
});

test("Face Box Coordinate Rescaling & Clamping Regression Tests", async (t) => {
  const origWidth = 1000;
  const origHeight = 800;
  const inputWidth = 320;
  const inputHeight = 240;

  await t.test("centered face [.30, .30, .50, .60] produces a reasonably sized box (>10px, not 1x1)", () => {
    // scores: [bg_prob, face_prob]
    const scores = new Float32Array([0.05, 0.95]);
    // boxes: [x_min, y_min, x_max, y_max]
    const boxes = new Float32Array([0.30, 0.30, 0.50, 0.60]);

    const candidates = filterAndDecodeBoxes(
      scores,
      boxes,
      1,
      0.7,
      inputWidth,
      inputHeight,
      origWidth,
      origHeight
    );

    assert.equal(candidates.length, 1, "Must detect 1 candidate");
    const { bbox } = candidates[0]!;
    // Assertion explicitly checking width and height are above 10px
    assert.ok(bbox.width > 10, `Width (${bbox.width}) must be > 10px, not a collapsed 1x1 box`);
    assert.ok(bbox.height > 10, `Height (${bbox.height}) must be > 10px, not a collapsed 1x1 box`);
    assert.equal(bbox.x, 300);
    assert.equal(bbox.y, 240);
    assert.equal(bbox.width, 200);
    assert.equal(bbox.height, 240);
  });

  await t.test("right-edge face with xMax=1.05 produces a box clamped to image width with meaningful dimensions (>10px, not 1x1)", () => {
    // Raw normalized box extending past right edge (xMax = 1.05)
    const scores = new Float32Array([0.05, 0.95]);
    const boxes = new Float32Array([0.80, 0.20, 1.05, 0.60]);

    const candidates = filterAndDecodeBoxes(
      scores,
      boxes,
      1,
      0.7,
      inputWidth,
      inputHeight,
      origWidth,
      origHeight
    );

    assert.equal(candidates.length, 1, "Must detect 1 candidate");
    const { bbox } = candidates[0]!;
    // Assertion explicitly checking width and height are above 10px
    assert.ok(bbox.width > 10, `Width (${bbox.width}) must be > 10px, not a collapsed 1x1 box`);
    assert.ok(bbox.height > 10, `Height (${bbox.height}) must be > 10px, not a collapsed 1x1 box`);
    // Clamped to image width: bbox.x + bbox.width === origWidth
    assert.equal(bbox.x, 800);
    assert.equal(bbox.y, 160);
    assert.equal(bbox.x + bbox.width, origWidth, `bbox must be clamped to image width (${origWidth})`);
    assert.equal(bbox.width, 200, "Box width must be clamped (1000 - 800 = 200px)");
    assert.equal(bbox.height, 320, "Box height must be rescaled to 320px");
  });

  await t.test("left-edge face with xMin=-0.04 clamps to x=0 with meaningful width (>10px, not collapse)", () => {
    // Raw normalized box extending past left edge (xMin = -0.04)
    const scores = new Float32Array([0.05, 0.95]);
    const boxes = new Float32Array([-0.04, 0.20, 0.25, 0.60]);

    const candidates = filterAndDecodeBoxes(
      scores,
      boxes,
      1,
      0.7,
      inputWidth,
      inputHeight,
      origWidth,
      origHeight
    );

    assert.equal(candidates.length, 1, "Must detect 1 candidate");
    const { bbox } = candidates[0]!;
    // Assertion explicitly checking width and height are above 10px
    assert.ok(bbox.width > 10, `Width (${bbox.width}) must be > 10px, not a collapsed 1x1 box`);
    assert.ok(bbox.height > 10, `Height (${bbox.height}) must be > 10px, not a collapsed 1x1 box`);
    // Clamped to x=0
    assert.equal(bbox.x, 0, "bbox.x must clamp to 0 for xMin < 0");
    assert.equal(bbox.y, 160);
    assert.equal(bbox.width, 250, "Box width must be 250px from x=0 to xMax=0.25*1000");
    assert.equal(bbox.height, 320, "Box height must be 320px");
  });

  await t.test("top-edge face with yMin=-0.05 clamps to y=0 with meaningful height (>10px, not collapse)", () => {
    // Raw normalized box extending past top edge (yMin = -0.05)
    const scores = new Float32Array([0.05, 0.95]);
    const boxes = new Float32Array([0.30, -0.05, 0.60, 0.35]);

    const candidates = filterAndDecodeBoxes(
      scores,
      boxes,
      1,
      0.7,
      inputWidth,
      inputHeight,
      origWidth,
      origHeight
    );

    assert.equal(candidates.length, 1, "Must detect 1 candidate");
    const { bbox } = candidates[0]!;
    // Assertion explicitly checking width and height are above 10px
    assert.ok(bbox.width > 10, `Width (${bbox.width}) must be > 10px, not a collapsed 1x1 box`);
    assert.ok(bbox.height > 10, `Height (${bbox.height}) must be > 10px, not a collapsed 1x1 box`);
    // Clamped to y=0
    assert.equal(bbox.x, 300);
    assert.equal(bbox.y, 0, "bbox.y must clamp to 0 for yMin < 0");
    assert.equal(bbox.width, 300, "Box width must be 300px");
    assert.equal(bbox.height, 280, "Box height must be 280px from y=0 to yMax=0.35*800");
  });
});
