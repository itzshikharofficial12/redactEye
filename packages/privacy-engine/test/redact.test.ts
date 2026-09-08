import test from "node:test";
import assert from "node:assert/strict";
import type { Detection, SensitiveRegion } from "@redact-eye/shared-types";
import { redactImage, RedactionError } from "../dist/redact.js";

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

/**
 * Asserts every pixel inside the rectangular area [xStart, yStart, width, height] is opaque black [0, 0, 0, 255].
 */
function assertRegionIsBlack(
  image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
  xStart: number,
  yStart: number,
  width: number,
  height: number
): void {
  for (let y = yStart; y < yStart + height; y++) {
    for (let x = xStart; x < xStart + width; x++) {
      const pixel = getPixel(image, x, y);
      assert.deepEqual(
        pixel,
        [0, 0, 0, 255],
        `Pixel at (${x}, ${y}) must be opaque black [0, 0, 0, 255], got [${pixel.join(", ")}]`
      );
    }
  }
}

test("Screenshot Redaction (@redact-eye/privacy-engine)", async (t) => {
  // =========================================================================
  // A. Single email bbox is completely blacked out
  // =========================================================================
  await t.test("A. Single email bbox is completely blacked out", () => {
    const img = createSyntheticImage(60, 40, [255, 255, 255, 255]);
    const emailDetection: Detection = {
      id: "det_email_1",
      type: "email",
      bbox: { x: 10, y: 10, width: 25, height: 12 },
      confidence: 0.98,
      sources: ["regex", "ocr"],
    };

    const result = redactImage({
      imageData: img,
      width: 60,
      height: 40,
      regions: [emailDetection],
    });

    assertRegionIsBlack(result.sanitizedImageData, 10, 10, 25, 12);
  });

  // =========================================================================
  // B. Single phone bbox is completely blacked out
  // =========================================================================
  await t.test("B. Single phone bbox is completely blacked out", () => {
    const img = createSyntheticImage(50, 50, [200, 200, 200, 255]);
    const phoneRegion: SensitiveRegion = {
      id: "region_phone_1",
      type: "phone",
      bbox: { x: 5, y: 5, width: 20, height: 15 },
      confidence: 0.95,
      sources: ["regex"],
      redaction: "mask",
    };

    const result = redactImage({
      imageData: img,
      width: 50,
      height: 50,
      regions: [phoneRegion],
    });

    assertRegionIsBlack(result.sanitizedImageData, 5, 5, 20, 15);
  });

  // =========================================================================
  // C. Password DOM bbox is completely blacked out
  // =========================================================================
  await t.test("C. Password DOM bbox is completely blacked out", () => {
    const img = createSyntheticImage(80, 40, [255, 255, 255, 255]);
    const passwordDetection: Detection = {
      id: "det_password_1",
      type: "password",
      bbox: { x: 15, y: 8, width: 45, height: 20 },
      confidence: 1.0,
      sources: ["dom"],
    };

    const result = redactImage({
      imageData: img,
      width: 80,
      height: 40,
      regions: [passwordDetection],
    });

    assertRegionIsBlack(result.sanitizedImageData, 15, 8, 45, 20);
  });

  // =========================================================================
  // D. Face bbox is completely blacked out
  // =========================================================================
  await t.test("D. Face bbox is completely blacked out", () => {
    const img = createSyntheticImage(100, 100, [240, 240, 240, 255]);
    const faceDetection: Detection = {
      id: "det_face_1",
      type: "face",
      bbox: { x: 20, y: 20, width: 40, height: 40 },
      confidence: 0.93,
      sources: ["face"],
    };

    const result = redactImage({
      imageData: img,
      width: 100,
      height: 100,
      regions: [faceDetection],
    });

    assertRegionIsBlack(result.sanitizedImageData, 20, 20, 40, 40);
  });

  // =========================================================================
  // E. Multiple sensitive regions are all redacted
  // =========================================================================
  await t.test("E. Multiple sensitive regions are all redacted", () => {
    const img = createSyntheticImage(120, 120, [255, 255, 255, 255]);
    const regions: Detection[] = [
      {
        id: "det_face",
        type: "face",
        bbox: { x: 10, y: 10, width: 30, height: 30 },
        confidence: 0.9,
        sources: ["face"],
      },
      {
        id: "det_email",
        type: "email",
        bbox: { x: 60, y: 10, width: 40, height: 15 },
        confidence: 0.95,
        sources: ["regex"],
      },
      {
        id: "det_phone",
        type: "phone",
        bbox: { x: 10, y: 60, width: 35, height: 15 },
        confidence: 0.92,
        sources: ["regex"],
      },
      {
        id: "det_password",
        type: "password",
        bbox: { x: 60, y: 60, width: 45, height: 25 },
        confidence: 1.0,
        sources: ["dom"],
      },
    ];

    const result = redactImage({
      imageData: img,
      width: 120,
      height: 120,
      regions,
    });

    assertRegionIsBlack(result.sanitizedImageData, 10, 10, 30, 30);
    assertRegionIsBlack(result.sanitizedImageData, 60, 10, 40, 15);
    assertRegionIsBlack(result.sanitizedImageData, 10, 60, 35, 15);
    assertRegionIsBlack(result.sanitizedImageData, 60, 60, 45, 25);
  });

  // =========================================================================
  // F. Pixels immediately outside the bbox remain unchanged
  // =========================================================================
  await t.test("F. Pixels immediately outside the bbox remain unchanged", () => {
    const img = createSyntheticImage(50, 50, [255, 255, 255, 255]);
    const detection: Detection = {
      id: "det_precise",
      type: "email",
      bbox: { x: 15, y: 15, width: 20, height: 20 },
      confidence: 0.99,
      sources: ["regex"],
    };

    const result = redactImage({
      imageData: img,
      width: 50,
      height: 50,
      regions: [detection],
    });

    // Verify inside is black
    assertRegionIsBlack(result.sanitizedImageData, 15, 15, 20, 20);

    // Verify pixels adjacent to the 4 edges remain untouched white [255, 255, 255, 255]
    // Top neighbor: y=14, x in [15..34]
    for (let x = 15; x < 35; x++) {
      assert.deepEqual(getPixel(result.sanitizedImageData, x, 14), [255, 255, 255, 255]);
    }
    // Bottom neighbor: y=35, x in [15..34]
    for (let x = 15; x < 35; x++) {
      assert.deepEqual(getPixel(result.sanitizedImageData, x, 35), [255, 255, 255, 255]);
    }
    // Left neighbor: x=14, y in [15..34]
    for (let y = 15; y < 35; y++) {
      assert.deepEqual(getPixel(result.sanitizedImageData, 14, y), [255, 255, 255, 255]);
    }
    // Right neighbor: x=35, y in [15..34]
    for (let y = 15; y < 35; y++) {
      assert.deepEqual(getPixel(result.sanitizedImageData, 35, y), [255, 255, 255, 255]);
    }
  });

  // =========================================================================
  // G. Partial/out-of-bounds bbox is safely clamped and redacted
  // =========================================================================
  await t.test("G. Partial/out-of-bounds bbox is safely clamped and redacted", () => {
    const img = createSyntheticImage(50, 50, [255, 255, 255, 255]);
    const regions: Detection[] = [
      // Extends beyond left and top
      {
        id: "det_neg",
        type: "email",
        bbox: { x: -10, y: -5, width: 25, height: 20 },
        confidence: 0.9,
        sources: ["regex"],
      },
      // Extends beyond right and bottom
      {
        id: "det_overflow",
        type: "phone",
        bbox: { x: 35, y: 35, width: 30, height: 30 },
        confidence: 0.9,
        sources: ["regex"],
      },
    ];

    const result = redactImage({
      imageData: img,
      width: 50,
      height: 50,
      regions,
    });

    // Top-left clamped mask: x in [0..15), y in [0..15)
    assertRegionIsBlack(result.sanitizedImageData, 0, 0, 15, 15);
    // Bottom-right clamped mask: x in [35..50), y in [35..50)
    assertRegionIsBlack(result.sanitizedImageData, 35, 35, 15, 15);
  });

  // =========================================================================
  // H. Negative/NaN/Infinity/zero-size bbox is safely rejected/handled
  // =========================================================================
  await t.test("H. Negative/NaN/Infinity/zero-size bbox is safely rejected/handled", () => {
    const img = createSyntheticImage(40, 40, [255, 255, 255, 255]);
    const invalidRegions: Detection[] = [
      {
        id: "det_nan",
        type: "email",
        bbox: { x: NaN, y: 10, width: 20, height: 10 },
        confidence: 0.8,
        sources: ["regex"],
      },
      {
        id: "det_inf",
        type: "phone",
        bbox: { x: 10, y: Infinity, width: 20, height: 10 },
        confidence: 0.8,
        sources: ["regex"],
      },
      {
        id: "det_zero_w",
        type: "password",
        bbox: { x: 10, y: 10, width: 0, height: 10 },
        confidence: 0.8,
        sources: ["dom"],
      },
      {
        id: "det_neg_h",
        type: "name",
        bbox: { x: 10, y: 10, width: 10, height: -5 },
        confidence: 0.8,
        sources: ["ocr"],
      },
      {
        id: "det_fully_outside",
        type: "face",
        bbox: { x: 100, y: 100, width: 20, height: 20 },
        confidence: 0.8,
        sources: ["face"],
      },
    ];

    // Must not crash or throw
    const result = redactImage({
      imageData: img,
      width: 40,
      height: 40,
      regions: invalidRegions,
    });

    // Entire image must remain untouched white
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        assert.deepEqual(getPixel(result.sanitizedImageData, x, y), [255, 255, 255, 255]);
      }
    }
  });

  // =========================================================================
  // I. Original input image remains unchanged (no mutation)
  // =========================================================================
  await t.test("I. Original input image remains unchanged", () => {
    const img = createSyntheticImage(30, 30, [128, 128, 128, 255]);
    const originalCopy = new Uint8ClampedArray(img.data);

    const detection: Detection = {
      id: "det_immutable",
      type: "email",
      bbox: { x: 5, y: 5, width: 15, height: 15 },
      confidence: 0.95,
      sources: ["regex"],
    };

    redactImage({
      imageData: img,
      width: 30,
      height: 30,
      regions: [detection],
    });

    // Verify original image data has not changed a single byte
    assert.deepEqual(img.data, originalCopy, "Input image buffer must never be mutated");
  });

  // =========================================================================
  // J. Detection objects remain unchanged
  // =========================================================================
  await t.test("J. Detection objects remain unchanged", () => {
    const img = createSyntheticImage(30, 30, [255, 255, 255, 255]);
    const frozenBbox = Object.freeze({ x: 5, y: 5, width: 10, height: 10 });
    const frozenDetection: Detection = Object.freeze({
      id: "det_frozen",
      type: "password",
      bbox: frozenBbox,
      confidence: 1.0,
      sources: Object.freeze(["dom"]) as unknown as string[],
    }) as Detection;

    // Passing frozen detection must not throw mutation error
    assert.doesNotThrow(() => {
      redactImage({
        imageData: img,
        width: 30,
        height: 30,
        regions: [frozenDetection],
      });
    });
  });

  // =========================================================================
  // K. Adjacent and overlapping regions are handled correctly
  // =========================================================================
  await t.test("K. Adjacent and overlapping regions are handled correctly", () => {
    const img = createSyntheticImage(50, 50, [255, 255, 255, 255]);
    const regions: Detection[] = [
      // Box 1: [10..25) x [10..25)
      {
        id: "det_box1",
        type: "email",
        bbox: { x: 10, y: 10, width: 15, height: 15 },
        confidence: 0.9,
        sources: ["regex"],
      },
      // Box 2 overlaps Box 1: [18..35) x [15..30)
      {
        id: "det_box2",
        type: "phone",
        bbox: { x: 18, y: 15, width: 17, height: 15 },
        confidence: 0.95,
        sources: ["regex"],
      },
    ];

    const result = redactImage({
      imageData: img,
      width: 50,
      height: 50,
      regions,
    });

    // Box 1 region
    assertRegionIsBlack(result.sanitizedImageData, 10, 10, 15, 15);
    // Box 2 region
    assertRegionIsBlack(result.sanitizedImageData, 18, 15, 17, 15);
  });

  // =========================================================================
  // L. A redaction failure NEVER returns the original unredacted image
  // =========================================================================
  await t.test("L. A redaction failure NEVER returns the original unredacted image", () => {
    // Corrupted buffer where data length does not match width * height * 4
    const corruptImg = {
      data: new Uint8ClampedArray(10), // Invalid size for 20x20 image
      width: 20,
      height: 20,
    };

    const detection: Detection = {
      id: "det_fail",
      type: "password",
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      confidence: 1.0,
      sources: ["dom"],
    };

    assert.throws(
      () => {
        redactImage({
          imageData: corruptImg,
          width: 20,
          height: 20,
          regions: [detection],
        });
      },
      (err: unknown) => {
        // Must fail closed with an error rather than returning corruptImg or unredacted image
        return err instanceof Error;
      },
      "Must throw an error when image data is corrupted, never returning unredacted data"
    );
  });

  // =========================================================================
  // M. Verify every pixel inside the intended mask is actually opaque black
  // =========================================================================
  await t.test("M. Verify every pixel inside the intended mask is actually opaque black", () => {
    const img = createSyntheticImage(25, 25, [100, 150, 200, 255]);
    const detection: Detection = {
      id: "det_all_pixels",
      type: "face",
      bbox: { x: 4, y: 6, width: 12, height: 14 },
      confidence: 0.99,
      sources: ["face"],
    };

    const result = redactImage({
      imageData: img,
      width: 25,
      height: 25,
      regions: [detection],
    });

    let blackPixelCount = 0;
    for (let y = 6; y < 20; y++) {
      for (let x = 4; x < 16; x++) {
        const pixel = getPixel(result.sanitizedImageData, x, y);
        assert.equal(pixel[0], 0, `Red channel at (${x}, ${y}) must be 0`);
        assert.equal(pixel[1], 0, `Green channel at (${x}, ${y}) must be 0`);
        assert.equal(pixel[2], 0, `Blue channel at (${x}, ${y}) must be 0`);
        assert.equal(pixel[3], 255, `Alpha channel at (${x}, ${y}) must be 255`);
        blackPixelCount++;
      }
    }
    assert.equal(blackPixelCount, 12 * 14, "Every pixel in target mask area must be counted and verified");
  });

  // =========================================================================
  // N. Verify password detection data/text is never required for image redaction
  // =========================================================================
  await t.test("N. Verify password detection data/text is never required for image redaction", () => {
    const img = createSyntheticImage(40, 40, [255, 255, 255, 255]);

    // Password detection has NO text property, or text is undefined
    const passwordDetection: Detection = {
      id: "det_no_text",
      type: "password",
      bbox: { x: 10, y: 10, width: 20, height: 10 },
      confidence: 1.0,
      sources: ["dom"],
      text: undefined,
    };

    // Ensure getter for .text or .value is never called
    let accessedForbiddenProperty = false;
    const protectedDetection = {
      ...passwordDetection,
      get value() {
        accessedForbiddenProperty = true;
        throw new Error("Security violation: DOMElement.value was accessed!");
      },
    };

    const result = redactImage({
      imageData: img,
      width: 40,
      height: 40,
      regions: [protectedDetection as unknown as Detection],
    });

    assert.equal(accessedForbiddenProperty, false, "Must never access .value property");
    assertRegionIsBlack(result.sanitizedImageData, 10, 10, 20, 10);
  });

  // =========================================================================
  // BOUNDARY TESTS: Edge cases (x=0, y=0, edges, 1x1, full-image)
  // =========================================================================
  await t.test("Boundary: x=0, y=0 (top-left corner)", () => {
    const img = createSyntheticImage(30, 30, [255, 255, 255, 255]);
    const result = redactImage({
      imageData: img,
      width: 30,
      height: 30,
      regions: [
        {
          id: "det_origin",
          type: "email",
          bbox: { x: 0, y: 0, width: 10, height: 10 },
          confidence: 0.9,
          sources: ["regex"],
        },
      ],
    });
    assertRegionIsBlack(result.sanitizedImageData, 0, 0, 10, 10);
    assert.deepEqual(getPixel(result.sanitizedImageData, 10, 10), [255, 255, 255, 255]);
  });

  await t.test("Boundary: x+w = imageWidth, y+h = imageHeight (bottom-right edge)", () => {
    const img = createSyntheticImage(30, 30, [255, 255, 255, 255]);
    const result = redactImage({
      imageData: img,
      width: 30,
      height: 30,
      regions: [
        {
          id: "det_bottom_right",
          type: "phone",
          bbox: { x: 20, y: 20, width: 10, height: 10 },
          confidence: 0.9,
          sources: ["regex"],
        },
      ],
    });
    assertRegionIsBlack(result.sanitizedImageData, 20, 20, 10, 10);
    assert.deepEqual(getPixel(result.sanitizedImageData, 19, 19), [255, 255, 255, 255]);
  });

  await t.test("Boundary: 1x1 single-pixel mask", () => {
    const img = createSyntheticImage(10, 10, [255, 255, 255, 255]);
    const result = redactImage({
      imageData: img,
      width: 10,
      height: 10,
      regions: [
        {
          id: "det_1x1",
          type: "email",
          bbox: { x: 4, y: 4, width: 1, height: 1 },
          confidence: 0.9,
          sources: ["regex"],
        },
      ],
    });
    assert.deepEqual(getPixel(result.sanitizedImageData, 4, 4), [0, 0, 0, 255]);
    assert.deepEqual(getPixel(result.sanitizedImageData, 3, 4), [255, 255, 255, 255]);
    assert.deepEqual(getPixel(result.sanitizedImageData, 5, 4), [255, 255, 255, 255]);
  });

  await t.test("Boundary: full-image mask (w=imageWidth, h=imageHeight)", () => {
    const img = createSyntheticImage(15, 15, [255, 255, 255, 255]);
    const result = redactImage({
      imageData: img,
      width: 15,
      height: 15,
      regions: [
        {
          id: "det_full",
          type: "password",
          bbox: { x: 0, y: 0, width: 15, height: 15 },
          confidence: 1.0,
          sources: ["dom"],
        },
      ],
    });
    assertRegionIsBlack(result.sanitizedImageData, 0, 0, 15, 15);
  });
});
