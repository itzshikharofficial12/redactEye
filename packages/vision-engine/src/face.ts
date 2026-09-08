/**
 * Face Detection Inference Pipeline for RedactEye.
 *
 * Runs client-side face bounding-box detection using ONNX Runtime Web
 * (WebGPU primary with WebAssembly fallback) or ONNX Runtime Node (testing).
 *
 * Model: UltraFace Slim-320 (~1.1 MB) — detects face regions only.
 * No face recognition, no identity matching, no landmarks.
 *
 * PRIVACY NOTICE:
 * Visual frames processed by this module contain sensitive raw visual data
 * and must never be transmitted off-device or forwarded across network boundaries.
 * Detected face regions must be masked/blurred by the privacy engine before
 * any visual context is transmitted to the agent server.
 */

import type { Detection } from "@redact-eye/shared-types";
import { type RawImageData } from "./preprocess.js";
import {
  resizeAndNormalizeForFace,
  FACE_INPUT_WIDTH,
  FACE_INPUT_HEIGHT,
} from "./facePreprocess.js";
import {
  filterAndDecodeBoxes,
  nms,
} from "./facePostprocess.js";

/**
 * Input frame passed to the face detection pipeline.
 * Identical structure to OcrInput — kept separate so each pipeline can evolve independently.
 *
 * PRIVACY NOTICE: This is raw visual data and must never be forwarded remotely.
 */
export interface FaceDetectionInput {
  /** Raw pixel data from the captured viewport frame (RGBA layout). */
  imageData: ImageData | RawImageData;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
}

export type FaceExecutionProviderPreference = "webgpu" | "wasm" | "cpu";

/**
 * Configuration options for creating or running the face detection pipeline.
 */
export interface FaceDetectionOptions {
  /** File path, URL, or buffer for the face detection model (det.onnx). */
  modelPath?: string | Uint8Array | ArrayBuffer;
  /**
   * Minimum face confidence score to accept a detection.
   * Default: 0.7 — errs toward not missing faces since a missed face is a privacy failure.
   * Configurable: lower this (e.g. 0.5) to catch more faces at the risk of false positives.
   */
  scoreThreshold?: number;
  /** IoU threshold for Non-Maximum Suppression (default: 0.3). */
  nmsIoUThreshold?: number;
  /** Preferred execution providers in order of preference (default: ["webgpu", "wasm"]). */
  executionProviders?: FaceExecutionProviderPreference[];
  /** Optional injectable ONNX runtime instance (e.g. onnxruntime-node or onnxruntime-web). */
  ort?: any;
}

function generateId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return (
    "face-" +
    Math.random().toString(36).substring(2, 10) +
    "-" +
    Date.now().toString(36)
  );
}

/**
 * Stateful face detection pipeline holding a loaded ONNX inference session.
 */
export class FacePipeline {
  private readonly session: any;
  private readonly ort: any;
  private readonly options: FaceDetectionOptions;

  private constructor(
    session: any,
    ort: any,
    options: FaceDetectionOptions,
  ) {
    this.session = session;
    this.ort = ort;
    this.options = options;
  }

  /**
   * Initializes and returns a `FacePipeline` instance.
   *
   * @param options - Configuration options, including model path and runtime preferences.
   */
  public static async create(options: FaceDetectionOptions = {}): Promise<FacePipeline> {
    // 1. Resolve ONNX runtime (injected or dynamically imported)
    let ort = options.ort;
    if (!ort) {
      try {
        ort = await import("onnxruntime-web");
      } catch {
        ort = await import("onnxruntime-node");
      }
    }

    const providers = options.executionProviders ?? ["webgpu", "wasm"];
    const modelSource = options.modelPath ?? "models/face/det.onnx";

    // 2. Create inference session with provider fallback
    let session: any = null;
    let lastError: unknown = null;
    for (const provider of providers) {
      try {
        session = await ort.InferenceSession.create(modelSource, {
          executionProviders: [provider],
          graphOptimizationLevel: "all" as const,
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }

    // If all preferred providers failed, try default session create
    if (!session) {
      try {
        session = await ort.InferenceSession.create(modelSource);
      } catch {
        throw new Error(
          `Failed to initialize face detection ONNX session: ${String(lastError)}`
        );
      }
    }

    return new FacePipeline(session, ort, options);
  }

  /**
   * Runs face detection on an input frame and returns bounding-box detections.
   *
   * @param input - Raw visual frame and dimensions.
   * @returns Array of face detections matching `@redact-eye/shared-types`.
   */
  public async run(input: FaceDetectionInput): Promise<Detection[]> {
    const rawImage: RawImageData = {
      data: input.imageData.data,
      width: input.imageData.width ?? input.width,
      height: input.imageData.height ?? input.height,
    };

    // Stage 1: Pre-process (resize to 320×240 + normalize with (px-127)/128)
    const tensorData = resizeAndNormalizeForFace(rawImage);
    const inputTensor = new this.ort.Tensor("float32", tensorData, [
      1,
      3,
      FACE_INPUT_HEIGHT,
      FACE_INPUT_WIDTH,
    ]);

    // Stage 2: Inference
    const inputName = this.session.inputNames[0] ?? "input";
    const outputs = await this.session.run({ [inputName]: inputTensor });

    // Stage 3: Identify output tensors by their shape
    // UltraFace outputs: scores [1, N, 2] and boxes [1, N, 4]
    const outputNames = this.session.outputNames as string[];
    let scoresData: Float32Array;
    let boxesData: Float32Array;
    let numAnchors: number;

    const out0 = outputs[outputNames[0]!];
    const out1 = outputs[outputNames[1]!];

    if (out0.dims[2] === 2 && out1.dims[2] === 4) {
      // First output is scores, second is boxes
      scoresData = out0.data as Float32Array;
      boxesData = out1.data as Float32Array;
      numAnchors = out0.dims[1];
    } else if (out0.dims[2] === 4 && out1.dims[2] === 2) {
      // First output is boxes, second is scores
      boxesData = out0.data as Float32Array;
      scoresData = out1.data as Float32Array;
      numAnchors = out1.dims[1];
    } else {
      throw new Error(
        `Unexpected UltraFace output shapes: ${JSON.stringify(out0.dims)}, ${JSON.stringify(out1.dims)}`
      );
    }

    // Stage 4: Filter by score threshold + decode coordinates
    const scoreThreshold = this.options.scoreThreshold ?? 0.7;
    const nmsIoUThreshold = this.options.nmsIoUThreshold ?? 0.3;

    const candidates = filterAndDecodeBoxes(
      scoresData,
      boxesData,
      numAnchors,
      scoreThreshold,
      FACE_INPUT_WIDTH,
      FACE_INPUT_HEIGHT,
      rawImage.width,
      rawImage.height,
    );

    // Stage 5: Non-Maximum Suppression
    const kept = nms(candidates, nmsIoUThreshold);

    // Stage 6: Map to Detection[] contract
    return kept.map((c) => ({
      id: generateId(),
      type: "face" as const,
      bbox: c.bbox,
      confidence: Number(c.confidence.toFixed(4)),
      sources: ["face" as const],
      // No `text` field for face detections
    }));
  }
}

/** Default singleton pipeline instance for convenience. */
let defaultPipeline: FacePipeline | null = null;

/**
 * Convenience function running face detection on a captured viewport frame.
 *
 * @param input - Raw viewport frame to analyze.
 * @param options - Optional configuration options.
 * @returns Promise resolving to an array of `Detection` objects with `type: "face"`.
 */
export async function runFaceDetection(
  input: FaceDetectionInput,
  options?: FaceDetectionOptions,
): Promise<Detection[]> {
  if (!defaultPipeline || options) {
    const pipeline = await FacePipeline.create(options);
    if (!options) {
      defaultPipeline = pipeline;
    }
    return pipeline.run(input);
  }
  return defaultPipeline.run(input);
}
