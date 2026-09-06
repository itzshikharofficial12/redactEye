# Models Repository (`models/`)

This directory is reserved for machine learning model assets, configurations, quantization scripts, and conversion metadata.

## Ownership
- **Primary Owner:** Person 2 — Local Vision / Privacy

## Storage Guidelines
> **IMPORTANT: Large model binary files (`.onnx`, `.pt`, `.bin`, `.safetensors`, `.pth`) must NOT be committed to Git.**
>
> Model weights must be hosted externally (e.g., Hugging Face Hub, Cloud Storage) or pulled down via automated setup scripts into local directories ignored by `.gitignore`. This repository tracks model metadata, schemas, export configurations, and download manifests only.

## Subdirectories
- [`vision/`](vision/) — General visual perception models and encoders
- [`ocr/`](ocr/) — Optical Character Recognition models optimized for web text
- [`face/`](face/) — Face detection models for privacy masking
- [`ui-detection/`](ui-detection/) — UI component and interactive element detectors
