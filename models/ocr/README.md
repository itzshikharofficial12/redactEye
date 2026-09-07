# OCR Models (`models/ocr`)

This directory contains configuration, manifests, and character vocabularies for RedactEye's client-side Optical Character Recognition (OCR) pipeline within `@redact-eye/vision-engine`.

Model binaries (`*.onnx`) are strictly excluded from git per `.gitignore` and must be downloaded locally via the provided setup script.

---

## 1. Prerequisites & Setup

Before running tests or the vision pipeline locally, download the required ONNX model weights:

```bash
bash models/ocr/download.sh
```

> [!NOTE]
> The test suite does **not** auto-download models from the network during `npm test`. If the models are absent, tests in `@redact-eye/vision-engine` will **gracefully skip** with an informative message.

To verify model setup:
```bash
ls -lh models/ocr/*.onnx models/ocr/en_dict.txt
```

---

## 2. Model Architecture & Size Budget

RedactEye uses the lightweight mobile models from **PaddleOCR (PP-OCRv4 mobile series)**, chosen specifically for client-side edge inference in browsers (via WebGPU with WebAssembly fallback):

| Task | Architecture | Filename | Size | Input Tensor | Output Tensor |
|---|---|---|---|---|---|
| **Text Detection** | DBNet Mobile (PP-OCRv4) | `det.onnx` | 4.76 MB | `[1, 3, H, W]` (fp32, NCHW) | `[1, 1, H, W]` (fp32 probability map) |
| **Text Recognition** | SVTR/LCNet Mobile (PP-OCRv4) | `rec.onnx` | 7.84 MB | `[1, 3, 48, W]` (fp32, NCHW) | `[1, seq_len, 438]` (fp32 CTC logits) |
| **Character Dictionary** | Plain text character set | `en_dict.txt` | 1.4 KB | N/A | 437 characters + blank token at index 0 |

**Total model budget**: ~12.6 MB (well within standard browser extension resource limits).

---

## 3. Pipeline Stages

1. **Detection Pre-processing**:
   - Resizes viewport screenshot preserving aspect ratio to dimensions divisible by 32 (standard DBNet receptive field requirement).
   - Normalizes RGB values using ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.
   - Transposes from HWC (canvas/ImageData) to NCHW float32 tensor.

2. **Detection Inference**:
   - Runs `det.onnx` via ONNX Runtime Web.
   - Primary execution provider: `webgpu`.
   - Fallback execution provider: `wasm`.

3. **Detection Post-processing**:
   - Thresholds DBNet probability map at `thresh = 0.3`.
   - Connected component labeling (CCL) extracts distinct text regions.
   - Filters out components below minimum area / score threshold (`box_thresh = 0.5`).
   - Unclips / expands bounding boxes to recover original text contours.
   - Maps bounding box coordinates back to the original viewport frame.

4. **Recognition Pre-processing**:
   - Crops each detected text bounding box from the original viewport frame.
   - Resizes cropped text slice to fixed height $H = 48$ with proportional width.
   - Normalizes pixel values into NCHW float32 tensor.

5. **Recognition Inference & CTC Decode**:
   - Runs `rec.onnx` producing CTC logits of shape `[1, seq_len, 438]`.
   - Greedy CTC decoding:
     - Argmax along class dimension at each time step.
     - Collapses consecutive duplicate tokens.
     - Strips blank tokens (class index 0).
     - Maps indices $1 \dots 437$ to characters using `en_dict.txt`.
   - Averages token probabilities to compute a normalized `[0.0, 1.0]` confidence score.

6. **Contract Output**:
   - Emits `Detection[]` conforming to `@redact-eye/shared-types` (`type: "text"`, `sources: ["ocr"]`, bounding box, confidence, and recognized text).
