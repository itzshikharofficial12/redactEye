import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import ort from "onnxruntime-node";
import { OcrPipeline } from "../dist/ocr.js";
import { extractBoxesFromHeatmap } from "../dist/postprocess.js";
import { FacePipeline } from "../dist/face.js";
import { filterAndDecodeBoxes } from "../dist/facePostprocess.js";
import type { DOMSnapshot, DOMElement, Detection, BoundingBox } from "@redact-eye/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const detModelPath = path.join(repoRoot, "models/ocr/det.onnx");
const recModelPath = path.join(repoRoot, "models/ocr/rec.onnx");
const dictPath = path.join(repoRoot, "models/ocr/en_dict.txt");
const faceModelPath = path.join(repoRoot, "models/face/det.onnx");

const modelsAvailable =
  fs.existsSync(detModelPath) &&
  fs.existsSync(recModelPath) &&
  fs.existsSync(dictPath) &&
  fs.existsSync(faceModelPath);

function loadFixture(name: string) {
  const imgPath = path.join(repoRoot, `test-fixtures/screenshots/${name}.jpg`);
  const domPath = path.join(repoRoot, `test-fixtures/dom/${name}.json`);

  assert.ok(fs.existsSync(imgPath), `Screenshot missing: ${imgPath}`);
  assert.ok(fs.existsSync(domPath), `DOM snapshot missing: ${domPath}`);

  const imgBuf = fs.readFileSync(imgPath);
  const rawImage = jpeg.decode(imgBuf);
  const dom: DOMSnapshot = JSON.parse(fs.readFileSync(domPath, "utf-8"));

  return { rawImage, dom };
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const unionArea = a.width * a.height + b.width * b.height - interArea;
  return unionArea <= 0 ? 0 : interArea / unionArea;
}

function computeIntersectionOverArea(target: BoundingBox, container: BoundingBox): number {
  const x1 = Math.max(target.x, container.x);
  const y1 = Math.max(target.y, container.y);
  const x2 = Math.min(target.x + target.width, container.x + container.width);
  const y2 = Math.min(target.y + target.height, container.y + container.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  return interArea / (target.width * target.height);
}

test("Detector Bounding-Box Spatial Accuracy (@redact-eye/vision-engine)", async (t) => {
  if (!modelsAvailable) {
    t.skip("Models not available in models/. Skipping spatial accuracy inference tests.");
    return;
  }

  const dictContent = fs.readFileSync(dictPath, "utf-8");
  const ocr = await OcrPipeline.create({
    detModel: detModelPath,
    recModel: recModelPath,
    dictionary: dictContent,
    ort,
    detThreshold: 0.3,
    boxThreshold: 0.5,
    confidenceThreshold: 0.2,
  });

  const face = await FacePipeline.create({
    modelPath: faceModelPath,
    ort,
    scoreThreshold: 0.7,
  });

  // =========================================================================
  // Section A: OCR Spatial Accuracy on Known Visual Text Fixtures
  // =========================================================================
  await t.test("Section A: OCR spatial accuracy for known text in fixtures", async (st) => {
    await st.test("login-page: email address detection overlaps input container and stays within bounds", async () => {
      const { rawImage, dom } = loadFixture("login-page");
      const detections = await ocr.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      const emailDet = detections.find((d) => d.text?.includes("alice@example.test"));
      assert.ok(emailDet, 'OCR must detect email "alice@example.test" on login page');

      // 1. Positive dimensions and within screenshot bounds
      assert.ok(emailDet.bbox.width > 0, "Email width must be positive");
      assert.ok(emailDet.bbox.height > 0, "Email height must be positive");
      assert.ok(emailDet.bbox.x >= 0, "Email x must be >= 0");
      assert.ok(emailDet.bbox.y >= 0, "Email y must be >= 0");
      assert.ok(
        emailDet.bbox.x + emailDet.bbox.width <= rawImage.width,
        `Email bbox must stay within screenshot width (${rawImage.width})`
      );
      assert.ok(
        emailDet.bbox.y + emailDet.bbox.height <= rawImage.height,
        `Email bbox must stay within screenshot height (${rawImage.height})`
      );

      // 2. Spatial overlap with DOM email input box (input_1)
      const inputEl = dom.elements.find((e) => e.id === "input_1");
      assert.ok(inputEl, "DOM input_1 must exist");

      // The text is rendered inside the input box: at least 90% of text area must fall inside the input box
      const textInside = computeIntersectionOverArea(emailDet.bbox, inputEl.bbox);
      assert.ok(
        textInside >= 0.9,
        `Detected email text must be inside email input container (got ${(textInside * 100).toFixed(1)}%)`
      );

      // Does not appear in an unrelated location (center distance < 100px from input box center)
      const textCenterX = emailDet.bbox.x + emailDet.bbox.width / 2;
      const textCenterY = emailDet.bbox.y + emailDet.bbox.height / 2;
      const inputCenterX = inputEl.bbox.x + inputEl.bbox.width / 2;
      const inputCenterY = inputEl.bbox.y + inputEl.bbox.height / 2;
      const dist = Math.hypot(textCenterX - inputCenterX, textCenterY - inputCenterY);
      assert.ok(dist < 100, `Email text must not appear at unrelated location (dist=${dist.toFixed(1)}px)`);
    });

    await st.test("signup-page: email, phone, and name detections overlap corresponding input boxes", async () => {
      const { rawImage, dom } = loadFixture("signup-page");
      const detections = await ocr.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      // 1. Email on signup page
      const emailDet = detections.find((d) => d.text?.includes("alice@example.test"));
      assert.ok(emailDet, 'OCR must detect email on signup page');
      const emailInput = dom.elements.find((e) => e.id === "input_2")!;
      assert.ok(
        computeIntersectionOverArea(emailDet.bbox, emailInput.bbox) >= 0.9,
        "Email text must fall inside email input container on signup page"
      );

      // 2. Phone on signup page
      const phoneDet = detections.find((d) => d.text?.includes("90000-00000") || d.text?.includes("+91"));
      assert.ok(phoneDet, 'OCR must detect phone number on signup page');
      const phoneInput = dom.elements.find((e) => e.id === "input_3")!;
      assert.ok(
        computeIntersectionOverArea(phoneDet.bbox, phoneInput.bbox) >= 0.9,
        "Phone text must fall inside phone input container on signup page"
      );

      // 3. Name on signup page
      const nameDet = detections.find((d) => d.text?.includes("Alice Example"));
      assert.ok(nameDet, 'OCR must detect name "Alice Example" on signup page');
      const nameInput = dom.elements.find((e) => e.id === "input_1")!;
      assert.ok(
        computeIntersectionOverArea(nameDet.bbox, nameInput.bbox) >= 0.9,
        "Name text must fall inside name input container on signup page"
      );
    });

    await st.test("profile-page: user name heading has high-precision visual overlap", async () => {
      const { rawImage, dom } = loadFixture("profile-page");
      const detections = await ocr.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      const nameDet = detections.find((d) => d.text?.includes("Alice Example"));
      assert.ok(nameDet, 'OCR must detect "Alice Example" on profile page');

      const nameHeading = dom.elements.find((e) => e.id === "text_2")!;
      const iou = computeIoU(nameDet.bbox, nameHeading.bbox);
      assert.ok(
        iou >= 0.8,
        `Name heading must match DOM bounding box with IoU >= 0.80 (got ${iou.toFixed(3)})`
      );
    });
  });

  // =========================================================================
  // Section B: Face Detector Spatial Accuracy on Known Visual Avatars
  // =========================================================================
  await t.test("Section B: Face detector spatial accuracy on visual avatar fixtures", async (st) => {
    await st.test("login-page: detected face is contained inside avatar region and within bounds", async () => {
      const { rawImage, dom } = loadFixture("login-page");
      const detections = await face.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      assert.equal(detections.length, 1, "Must detect exactly 1 face on login page");
      const faceDet = detections[0]!;

      // Bbox within screenshot bounds and valid positive dimensions
      assert.ok(faceDet.bbox.x >= 0 && faceDet.bbox.y >= 0);
      assert.ok(faceDet.bbox.x + faceDet.bbox.width <= rawImage.width);
      assert.ok(faceDet.bbox.y + faceDet.bbox.height <= rawImage.height);
      assert.ok(faceDet.bbox.width > 10, "Face width must be > 10px");
      assert.ok(faceDet.bbox.height > 10, "Face height must be > 10px");

      // 100% of detected face must be inside the avatar DOM region
      const avatarEl = dom.elements.find((e) => e.id === "image_1")!;
      const faceInside = computeIntersectionOverArea(faceDet.bbox, avatarEl.bbox);
      assert.equal(faceInside, 1.0, "Face bbox must be strictly inside the avatar circle");
    });

    await st.test("profile-page: detected face is contained inside avatar region and within bounds", async () => {
      const { rawImage, dom } = loadFixture("profile-page");
      const detections = await face.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      assert.equal(detections.length, 1, "Must detect exactly 1 face on profile page");
      const faceDet = detections[0]!;

      assert.ok(faceDet.bbox.x >= 0 && faceDet.bbox.y >= 0);
      assert.ok(faceDet.bbox.x + faceDet.bbox.width <= rawImage.width);
      assert.ok(faceDet.bbox.y + faceDet.bbox.height <= rawImage.height);
      assert.ok(faceDet.bbox.width > 10, "Face width must be > 10px");
      assert.ok(faceDet.bbox.height > 10, "Face height must be > 10px");

      const avatarEl = dom.elements.find((e) => e.id === "image_1")!;
      const faceInside = computeIntersectionOverArea(faceDet.bbox, avatarEl.bbox);
      assert.equal(faceInside, 1.0, "Face bbox must be strictly inside the profile avatar circle");
    });

    await st.test("signup-page: reports 0 faces (no false positives)", async () => {
      const { rawImage } = loadFixture("signup-page");
      const detections = await face.run({
        imageData: { data: rawImage.data, width: rawImage.width, height: rawImage.height },
        width: rawImage.width,
        height: rawImage.height,
      });

      assert.equal(detections.length, 0, "Must report 0 faces on signup page");
    });
  });

  // =========================================================================
  // Section C: Coordinate Transformation Regression Tests
  // =========================================================================
  await t.test("Section C: Coordinate transformation regression tests", async (st) => {
    const origWidth = 1376;
    const origHeight = 768;

    await st.test("Face transform: center, edges, non-square dimensions, and strict bounds clamping", () => {
      // 1. Center coordinates
      const centerBoxes = new Float32Array([0.4, 0.4, 0.6, 0.6]);
      const centerScores = new Float32Array([0.05, 0.95]);
      const centerCands = filterAndDecodeBoxes(centerScores, centerBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.equal(centerCands.length, 1);
      assert.equal(centerCands[0]!.bbox.x, Math.round(0.4 * origWidth));
      assert.equal(centerCands[0]!.bbox.y, Math.round(0.4 * origHeight));
      assert.equal(centerCands[0]!.bbox.width, Math.round(0.2 * origWidth));
      assert.equal(centerCands[0]!.bbox.height, Math.round(0.2 * origHeight));

      // 2. Left edge (negative normalized xMin clamps to 0 with meaningful width)
      const leftBoxes = new Float32Array([-0.05, 0.2, 0.25, 0.5]);
      const leftCands = filterAndDecodeBoxes(centerScores, leftBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.equal(leftCands[0]!.bbox.x, 0);
      assert.ok(leftCands[0]!.bbox.width > 10);

      // 3. Top edge (negative normalized yMin clamps to 0 with meaningful height)
      const topBoxes = new Float32Array([0.2, -0.05, 0.5, 0.25]);
      const topCands = filterAndDecodeBoxes(centerScores, topBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.equal(topCands[0]!.bbox.y, 0);
      assert.ok(topCands[0]!.bbox.height > 10);

      // 4. Right edge clamping (xMax = 1.05 clamps to origWidth)
      const rightBoxes = new Float32Array([0.8, 0.2, 1.05, 0.5]);
      const rightCands = filterAndDecodeBoxes(centerScores, rightBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.ok(rightCands[0]!.bbox.x + rightCands[0]!.bbox.width <= origWidth);

      // 5. Bottom edge clamping (yMax = 1.08 clamps to origHeight)
      const bottomBoxes = new Float32Array([0.2, 0.8, 0.5, 1.08]);
      const bottomCands = filterAndDecodeBoxes(centerScores, bottomBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.ok(bottomCands[0]!.bbox.y + bottomCands[0]!.bbox.height <= origHeight);

      // 6. Rounding overshoot edge case: xMin at 1311.5 / 1376, xMax = 1.05 (clamped to 1376)
      // In naive rounding, Math.round(1311.5) = 1312 and Math.round(64.5) = 65 => x + w = 1377 > 1376
      const edgeBoxes = new Float32Array([1311.5 / origWidth, 0.2, 1.05, 0.5]);
      const edgeCands = filterAndDecodeBoxes(centerScores, edgeBoxes, 1, 0.7, 320, 240, origWidth, origHeight);
      assert.equal(edgeCands.length, 1);
      assert.ok(
        edgeCands[0]!.bbox.x + edgeCands[0]!.bbox.width <= origWidth,
        `Face bbox.x + bbox.width (${edgeCands[0]!.bbox.x + edgeCands[0]!.bbox.width}) must not exceed origWidth (${origWidth})`
      );
    });

    await st.test("OCR transform: center, edges, non-square dimensions, and strict bounds clamping", () => {
      const detW = 960;
      const detH = 544;
      const scaleX = detW / origWidth;
      const scaleY = detH / origHeight;

      // 1. Center coordinates
      const probMapCenter = new Float32Array(detW * detH);
      const centerX0 = Math.round(0.4 * detW);
      const centerX1 = Math.round(0.6 * detW);
      const centerY0 = Math.round(0.4 * detH);
      const centerY1 = Math.round(0.6 * detH);
      for (let y = centerY0; y < centerY1; y++) {
        for (let x = centerX0; x < centerX1; x++) {
          probMapCenter[y * detW + x] = 0.95;
        }
      }
      const centerRegions = extractBoxesFromHeatmap(probMapCenter, detW, detH, scaleX, scaleY, {
        binThreshold: 0.3,
        boxThreshold: 0.5,
        minArea: 16,
        unclipRatio: 0,
        origWidth,
        origHeight,
      });
      assert.equal(centerRegions.length, 1);
      assert.ok(Math.abs(centerRegions[0]!.bbox.x - 0.4 * origWidth) <= 2);
      assert.ok(Math.abs(centerRegions[0]!.bbox.y - 0.4 * origHeight) <= 2);

      // 2. Left and Top edge
      const probMapEdges = new Float32Array(detW * detH);
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          probMapEdges[y * detW + x] = 0.95;
        }
      }
      const edgeRegions = extractBoxesFromHeatmap(probMapEdges, detW, detH, scaleX, scaleY, {
        binThreshold: 0.3,
        boxThreshold: 0.5,
        minArea: 16,
        unclipRatio: 1.5,
        origWidth,
        origHeight,
      });
      assert.equal(edgeRegions.length, 1);
      assert.equal(edgeRegions[0]!.bbox.x, 0);
      assert.equal(edgeRegions[0]!.bbox.y, 0);

      // 3. Right edge, bottom edge, non-square dimensions with unclip expansion
      const probMapRightBottom = new Float32Array(detW * detH);
      for (let y = detH - 20; y < detH; y++) {
        for (let x = detW - 20; x < detW; x++) {
          probMapRightBottom[y * detW + x] = 0.95;
        }
      }
      const rbRegions = extractBoxesFromHeatmap(probMapRightBottom, detW, detH, scaleX, scaleY, {
        binThreshold: 0.3,
        boxThreshold: 0.5,
        minArea: 16,
        unclipRatio: 1.5,
        origWidth,
        origHeight,
      });
      assert.equal(rbRegions.length, 1);
      assert.ok(rbRegions[0]!.bbox.x + rbRegions[0]!.bbox.width <= origWidth);
      assert.ok(rbRegions[0]!.bbox.y + rbRegions[0]!.bbox.height <= origHeight);

      // 4. Rounding overshoot edge case: x0 = 15, x1 = 960 (touching right edge)
      // origX = 15 / (960 / 1376) = 21.5 => Math.round(21.5) = 22
      // origW = (960 - 15) / (960 / 1376) = 1354.5 => Math.round(1354.5) = 1355
      // Naive rounding gives x + w = 22 + 1355 = 1377 > 1376
      const probMapOvershoot = new Float32Array(detW * detH);
      for (let y = 100; y <= 102; y++) {
        for (let x = 15; x < detW; x++) {
          probMapOvershoot[y * detW + x] = 0.9;
        }
      }
      const overshootRegions = extractBoxesFromHeatmap(probMapOvershoot, detW, detH, scaleX, scaleY, {
        binThreshold: 0.3,
        boxThreshold: 0.5,
        minArea: 16,
        unclipRatio: 0,
        origWidth,
        origHeight,
      });
      assert.equal(overshootRegions.length, 1);
      const ob = overshootRegions[0]!.bbox;
      assert.ok(
        ob.x + ob.width <= origWidth,
        `OCR bbox.x + bbox.width (${ob.x + ob.width}) must not exceed origWidth (${origWidth})`
      );
    });
  });
});
