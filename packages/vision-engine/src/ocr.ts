/**
 * OCR Inference Pipeline for RedactEye.
 *
 * Runs client-side text detection and recognition using ONNX Runtime Web
 * (WebGPU primary with WebAssembly fallback) or ONNX Runtime Node (testing).
 *
 * PRIVACY NOTICE:
 * Visual frames and recognized strings processed by this module contain sensitive raw visual data
 * and must never be transmitted off-device or forwarded across network boundaries.
 */

import type { Detection, BoundingBox } from "@redact-eye/shared-types";
import {
  type RawImageData,
  computeDetDimensions,
  resizeBilinear,
  normalizeForDet,
  cropAndNormalizeForRec,
} from "./preprocess.js";
import {
  extractBoxesFromHeatmap,
  ctcGreedyDecode,
} from "./postprocess.js";

/**
 * Input frame passed to the OCR pipeline.
 * The caller provides this after capturing the viewport frame.
 */
export interface OcrInput {
  /** Raw pixel data from the captured viewport frame (RGBA layout). */
  imageData: ImageData | RawImageData;
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
}

export type ExecutionProviderPreference = "webgpu" | "wasm" | "cpu";

/**
 * Configuration options for creating or running the OCR pipeline.
 */
export interface OcrPipelineOptions {
  /** File path, URL, or buffer for the detection model (det.onnx). */
  detModel?: string | Uint8Array | ArrayBuffer;
  /** File path, URL, or buffer for the recognition model (rec.onnx). */
  recModel?: string | Uint8Array | ArrayBuffer;
  /** Custom dictionary array or newline-delimited text. */
  dictionary?: readonly string[] | string;
  /** Threshold for binarizing detection probability map (default: 0.3). */
  detThreshold?: number;
  /** Minimum average score across candidate box pixels (default: 0.5). */
  boxThreshold?: number;
  /** Minimum recognition confidence score [0.0 - 1.0] to accept a detection (default: 0.2). */
  confidenceThreshold?: number;
  /** Preferred execution providers in order of preference (default: ["webgpu", "wasm"]). */
  executionProviders?: ExecutionProviderPreference[];
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
    "ocr-" +
    Math.random().toString(36).substring(2, 10) +
    "-" +
    Date.now().toString(36)
  );
}

/**
 * Stateful OCR pipeline holding loaded ONNX inference sessions and vocabulary dictionary.
 */
export class OcrPipeline {
  private readonly detSession: any;
  private readonly recSession: any;
  private readonly dictionary: readonly string[];
  private readonly ort: any;
  private readonly options: OcrPipelineOptions;

  private constructor(
    detSession: any,
    recSession: any,
    dictionary: readonly string[],
    ort: any,
    options: OcrPipelineOptions
  ) {
    this.detSession = detSession;
    this.recSession = recSession;
    this.dictionary = dictionary;
    this.ort = ort;
    this.options = options;
  }

  /**
   * Initializes and returns an `OcrPipeline` instance.
   *
   * @param options - Configuration options, including model paths and runtime preferences.
   */
  public static async create(options: OcrPipelineOptions = {}): Promise<OcrPipeline> {
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

    // 2. Helper to create inference session with provider fallback
    async function createSession(modelSource: string | Uint8Array | ArrayBuffer, modelName: string) {
      let lastError: unknown = null;
      for (const provider of providers) {
        try {
          const sessionOptions = {
            executionProviders: [provider],
            graphOptimizationLevel: "all" as const,
          };
          const session = await ort.InferenceSession.create(modelSource, sessionOptions);
          return session;
        } catch (err) {
          lastError = err;
          // Fall back to next provider
        }
      }
      // If all preferred providers failed, try default session create
      try {
        return await ort.InferenceSession.create(modelSource);
      } catch {
        throw new Error(
          `Failed to initialize ONNX session for ${modelName}: ${String(lastError)}`
        );
      }
    }

    const detModelSource = options.detModel ?? "models/ocr/det.onnx";
    const recModelSource = options.recModel ?? "models/ocr/rec.onnx";

    const [detSession, recSession] = await Promise.all([
      createSession(detModelSource, "det"),
      createSession(recModelSource, "rec"),
    ]);

    // 3. Resolve dictionary
    let dictionary: readonly string[] = [];
    if (Array.isArray(options.dictionary)) {
      dictionary = options.dictionary;
    } else if (typeof options.dictionary === "string") {
      dictionary = options.dictionary.split(/\r?\n/).filter((l) => l.length > 0);
    } else {
      // Resolve default en_dict.txt relative to this module's location, NOT process.cwd()
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const moduleDir = path.dirname(fileURLToPath(import.meta.url));
        const candidatePaths = [
          path.resolve(moduleDir, "../../../models/ocr/en_dict.txt"),
          path.resolve(moduleDir, "../../models/ocr/en_dict.txt"),
        ];
        const dictPath = candidatePaths.find((p) => fs.existsSync(p));
        if (dictPath) {
          const raw = fs.readFileSync(dictPath, "utf-8");
          dictionary = raw.split(/\r?\n/).filter((l) => l.length > 0);
        } else {
          throw new Error(
            `Default OCR dictionary (en_dict.txt) not found. Checked: ${candidatePaths.join(", ")}`
          );
        }
      } catch (err: any) {
        throw new Error(`Failed to load default OCR dictionary: ${err.message}`);
      }
    }

    // Fail loudly if dictionary cannot be loaded or is empty
    if (!dictionary || dictionary.length === 0) {
      throw new Error(
        "OCR dictionary is empty or failed to load. OcrPipeline requires a valid non-empty vocabulary dictionary."
      );
    }

    return new OcrPipeline(detSession, recSession, dictionary, ort, options);
  }

  /**
   * Runs the full OCR detection and recognition pipeline on an input frame.
   *
   * @param input - Raw visual frame and dimensions.
   * @returns Array of text detections matching `@redact-eye/shared-types`.
   */
  public async run(input: OcrInput): Promise<Detection[]> {
    const { width, height } = input;
    const rawImage: RawImageData = {
      data: input.imageData.data,
      width: input.imageData.width ?? width,
      height: input.imageData.height ?? height,
    };

    // Stage 1: Pre-process for detection (resizing to 32-multiples + NCHW normalization)
    const { targetWidth, targetHeight, scaleX, scaleY } = computeDetDimensions(
      rawImage.width,
      rawImage.height,
      960
    );
    const resizedDet = resizeBilinear(rawImage, targetWidth, targetHeight);
    const detTensorData = normalizeForDet(resizedDet);
    const detTensor = new this.ort.Tensor("float32", detTensorData, [
      1,
      3,
      targetHeight,
      targetWidth,
    ]);

    // Stage 2: Detection inference (DBNet)
    const detInputName = this.detSession.inputNames[0] ?? "x";
    const detOutputName = this.detSession.outputNames[0] ?? "fetch_name_0";
    const detOutputs = await this.detSession.run({ [detInputName]: detTensor });
    const probMap = detOutputs[detOutputName].data as Float32Array;

    // Stage 3: Post-process detection heatmap (CCL + unclip bounding boxes)
    const regions = extractBoxesFromHeatmap(
      probMap,
      targetWidth,
      targetHeight,
      scaleX,
      scaleY,
      {
        binThreshold: this.options.detThreshold ?? 0.3,
        boxThreshold: this.options.boxThreshold ?? 0.5,
        origWidth: rawImage.width,
        origHeight: rawImage.height,
      }
    );

    if (regions.length === 0) {
      return [];
    }

    // Stage 4 & 5: Pre-process each crop, run recognition, decode CTC logits
    const detections: Detection[] = [];
    const minConfidence = this.options.confidenceThreshold ?? 0.2;
    const recInputName = this.recSession.inputNames[0] ?? "x";
    const recOutputName = this.recSession.outputNames[0] ?? "fetch_name_0";

    for (const region of regions) {
      if (region.bbox.width < 4 || region.bbox.height < 4) {
        continue;
      }

      const { tensor, width: cropW, height: cropH } = cropAndNormalizeForRec(
        rawImage,
        region.bbox,
        48
      );

      const recTensor = new this.ort.Tensor("float32", tensor, [
        1,
        3,
        cropH,
        cropW,
      ]);

      const recOutputs = await this.recSession.run({ [recInputName]: recTensor });
      const logitsTensor = recOutputs[recOutputName];
      const logitsData = logitsTensor.data as Float32Array;
      const seqLen = logitsTensor.dims[1];
      const numClasses = logitsTensor.dims[2];

      const decoded = ctcGreedyDecode(
        logitsData,
        seqLen,
        numClasses,
        this.dictionary
      );

      if (decoded.text.length > 0 && decoded.confidence >= minConfidence) {
        // Combined confidence: geometric mean of detection score and recognition score
        const finalConfidence = Number(
          Math.min(
            1.0,
            Math.max(0.0, Math.sqrt(region.score * decoded.confidence))
          ).toFixed(4)
        );

        detections.push({
          id: generateId(),
          type: "text",
          bbox: region.bbox,
          confidence: finalConfidence,
          sources: ["ocr"],
          text: decoded.text,
        });
      }
    }

    return detections;
  }
}

/** Default singleton pipeline instance for convenience. */
let defaultPipeline: OcrPipeline | null = null;

/**
 * Convenience function running OCR inference on a captured viewport frame.
 *
 * @param input - Raw viewport frame to analyze.
 * @param options - Optional configuration options.
 * @returns Promise resolving to an array of `Detection` objects conforming to `@redact-eye/shared-types`.
 */
export async function runOcr(
  input: OcrInput,
  options?: OcrPipelineOptions
): Promise<Detection[]> {
  if (!defaultPipeline || options) {
    const pipeline = await OcrPipeline.create(options);
    if (!options) {
      defaultPipeline = pipeline;
    }
    return pipeline.run(input);
  }
  return defaultPipeline.run(input);
}
