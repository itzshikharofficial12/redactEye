# Face Detection Model — UltraFace Slim-320

## Overview

RedactEye uses the **UltraFace Slim-320** model for bounding-box-only face detection.
Detected face regions are passed to the privacy engine for redaction (blur/mask) before
any visual context is forwarded to the agent server.

> **Privacy constraint:** This pipeline performs detection only — no face recognition,
> no identity matching, no landmark extraction, no embeddings.

## Model Details

| Property | Value |
|---|---|
| **Architecture** | Ultra-Light-Fast-Generic-Face-Detector (SSD-based, slim backbone) |
| **Source** | [Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB) |
| **ONNX File** | `version-slim-320.onnx` (saved locally as `det.onnx`) |
| **File Size** | ~1.1 MB (FP32) |
| **License** | MIT |
| **Parameters** | ~250K |

## Why UltraFace Slim-320?

| Candidate | Size | Verdict |
|---|---|---|
| **UltraFace Slim-320** | ~1.1 MB | ✅ Chosen — simplest I/O (2 output tensors: scores + boxes), standard NMS, wide ONNX support |
| YuNet (OpenCV Zoo) | ~233 KB | ❌ 15-element output with landmarks/priors, OpenCV-specific post-processing |
| BlazeFace | ~200 KB | ❌ TFLite/MediaPipe ecosystem, unofficial ONNX exports |
| UltraFace RFB-320 | ~1.1 MB | ❌ Same size, negligible accuracy gain for UI screenshots |

## Input Tensor Specification

| Property | Value |
|---|---|
| **Name** | `input` |
| **Shape** | `[1, 3, 240, 320]` (Batch, Channels, Height, Width — NCHW) |
| **Data Type** | `float32` |

### Preprocessing

1. **Resize** image to 320x240 using bilinear interpolation
2. **Normalize** each pixel channel: `(pixel_value - 127) / 128`
3. **Transpose** from HWC to CHW (NCHW layout)

> Note: This is NOT ImageNet normalization — UltraFace uses `(px - 127) / 128`.

## Output Tensor Specification

The `version-slim-320` variant produces two output tensors with decoded anchor coordinates:

### Output 1: Scores
| Property | Value |
|---|---|
| **Name** | `scores` |
| **Shape** | `[1, 4420, 2]` |
| **Format** | `[background_probability, face_probability]` per anchor |

### Output 2: Boxes
| Property | Value |
|---|---|
| **Name** | `boxes` |
| **Shape** | `[1, 4420, 4]` |
| **Format** | `[x_min, y_min, x_max, y_max]` — coordinates normalized to input dimensions |

## Post-Processing Pipeline

1. **Score threshold filter** (default: 0.7, configurable via `scoreThreshold`)
   - Keep anchors where `face_probability > threshold`
2. **Coordinate rescaling**
   - Map box coords from 320x240 input space to original image pixel space
   - Convert `[x_min, y_min, x_max, y_max]` to `{ x, y, width, height }` (BoundingBox interface)
3. **Non-Maximum Suppression (NMS)** (IoU threshold: 0.3)
   - Sort candidates by confidence descending
   - Greedily suppress overlapping boxes (IoU > threshold)

## Setup

```bash
# Download model weights (one-time, ~1.1 MB)
bash models/face/download.sh
```

Model weights are **NOT** committed to Git (`.gitignore`d). Each developer must
run the download script manually before running face detection tests.
