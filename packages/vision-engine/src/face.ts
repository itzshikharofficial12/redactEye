// TODO: Implement face detection inference pipeline.
//
// This module will accept a raw screenshot frame and return a list of face detections,
// each carrying:
//   - type: "face"
//   - bounding box coordinates relative to the viewport frame
//   - normalized confidence score (0.0 – 1.0)
//   - source tagged as "face"
//
// Intended backend: ONNX Runtime Web (WebGPU primary, WASM/CPU fallback).
// Model assets live under models/face/ — weights are NOT committed to Git.
//
// PRIVACY NOTICE: Detected face regions must be masked/blurred by the privacy engine
// before any visual context is transmitted to the agent server.

import type { Detection } from "@redact-eye/shared-types";

/**
 * Input frame passed to the face detection pipeline.
 * Identical structure to OcrInput — kept separate so each pipeline can evolve independently.
 *
 * PRIVACY NOTICE: This is raw visual data and must never be forwarded remotely.
 */
export interface FaceDetectionInput {
  /** Raw pixel data from the captured viewport frame. */
  imageData: ImageData;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
}

/**
 * Runs face detection on a captured viewport frame and returns a list of
 * face region detections for use by the privacy engine.
 *
 * @param input - Raw viewport frame to analyse.
 * @returns Promise resolving to an array of `Detection` objects with `type: "face"`
 *          and `sources` containing `"face"`. The `text` field is unused for face detections.
 *
 * TODO: Implement using ONNX Runtime Web.
 */
export async function runFaceDetection(_input: FaceDetectionInput): Promise<Detection[]> {
  // TODO: load model session, pre-process image, run inference, post-process bounding boxes
  throw new Error("runFaceDetection: not implemented");
}
