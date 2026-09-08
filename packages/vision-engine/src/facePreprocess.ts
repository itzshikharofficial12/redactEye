/**
 * Image preprocessing routines for RedactEye face detection pipeline.
 *
 * UltraFace Slim-320 expects input normalized as (pixel - 127) / 128 in NCHW layout,
 * resized to 320×240. This differs from the OCR pipeline's ImageNet normalization.
 *
 * Reuses the bilinear resize utility from preprocess.ts but applies face-specific
 * normalization constants.
 */

import { type RawImageData, resizeBilinear } from "./preprocess.js";

/** UltraFace fixed input dimensions. */
export const FACE_INPUT_WIDTH = 320;
export const FACE_INPUT_HEIGHT = 240;

/**
 * Resizes an RGBA image to 320×240 and normalizes to a NCHW Float32Array
 * using UltraFace's `(pixel - 127) / 128` formula.
 *
 * @param image - Source image in RGBA pixel layout.
 * @returns Float32Array of shape [1, 3, 240, 320] ready for inference.
 */
export function resizeAndNormalizeForFace(image: RawImageData): Float32Array {
  const resized = resizeBilinear(image, FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT);
  const numPixels = FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT;
  const tensor = new Float32Array(3 * numPixels);

  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  for (let i = 0; i < numPixels; i++) {
    const srcIdx = i * 4; // RGBA stride
    tensor[i] = (resized.data[srcIdx]! - 127) / 128;
    tensor[gOffset + i] = (resized.data[srcIdx + 1]! - 127) / 128;
    tensor[bOffset + i] = (resized.data[srcIdx + 2]! - 127) / 128;
  }

  return tensor;
}
