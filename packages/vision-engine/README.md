# Vision Engine Package (`packages/vision-engine`)

This package is dedicated to on-device visual perception and local machine learning inference running directly within the browser runtime.

## Ownership
- **Primary Owner:** Person 2 — Local Vision / Privacy

## Eventual Responsibilities
- Managing in-browser inference sessions using WebGPU, ONNX Runtime Web, and WebAssembly
- Optical Character Recognition (OCR) pipeline on captured viewport frames
- Visual face detection for privacy protection
- Interactive UI element detection and visual grounding
- Extracting localized bounding boxes and aligning coordinates with DOM elements
- Providing performance-optimized inference pipelines with graceful fallback modes (e.g., WebGPU to WASM/CPU)
