// TODO: Implement OCR inference pipeline.
//
// This module will accept a raw screenshot frame (ImageData or similar browser-native
// representation) and return a list of OCR detections, each carrying:
//   - extracted text content
//   - bounding box coordinates relative to the viewport frame
//   - normalized confidence score (0.0 – 1.0)
//   - source tagged as "ocr"
//
// Intended backend: ONNX Runtime Web (WebGPU primary, WASM/CPU fallback).
// Model assets live under models/ocr/ — weights are NOT committed to Git.

import type { Detection } from "@redact-eye/shared-types";

/**
 * Input frame passed to the OCR pipeline.
 * The caller (browser extension / Person 1) provides this after capturing the viewport.
 *
 * PRIVACY NOTICE: This is raw visual data and must never be forwarded remotely.
 */
export interface OcrInput {
  /** Raw pixel data from the captured viewport frame. */
  imageData: ImageData;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
}

/**
 * Runs the OCR inference pipeline on a captured viewport frame and returns
 * a list of text detections suitable for PII classification.
 *
 * @param input - Raw viewport frame to analyse.
 * @returns Promise resolving to an array of `Detection` objects with `type: "text"`
 *          and `sources` containing `"ocr"`. The `text` field carries the recognised
 *          string — handle according to the PRIVACY NOTICE on `Detection.text`.
 *
 * TODO: Implement using ONNX Runtime Web.
 */
export async function runOcr(_input: OcrInput): Promise<Detection[]> {
  // TODO: load model session, pre-process image, run inference, post-process results
  throw new Error("runOcr: not implemented");
}
