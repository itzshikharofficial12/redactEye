# Evaluation Framework (`evaluation/`)

This directory contains evaluation datasets, benchmarking harnesses, metrics scoring scripts, and benchmark result logs for RedactEye.

## Ownership
- **Primary Owner:** Person 3 — Server / Agent / Evaluation

## Key Evaluation Pillars
1. **Visual Perception Accuracy:** Correct identification of interactive elements, text layout, and coordinate bounding boxes.
2. **PII Detection Precision & Recall:** Rate of successfully detected sensitive fields and text without false negatives.
3. **Redaction Precision:** Accurate masking without over-redaction or sensitive information leakage.
4. **Client-Side Resource Utilization:** In-browser memory footprint, CPU load, and WebGPU utilization.
5. **End-to-End Latency:** Total turnaround time of the perceive-redact-reason-act loop.

## Subdirectories
- [`datasets/`](datasets/) — Benchmark dataset manifests and annotations
- [`benchmarks/`](benchmarks/) — Automated test scripts and runner harnesses
- [`metrics/`](metrics/) — Metric definitions and scoring calculators
- [`results/`](results/) — Output logs, run traces, and benchmarking reports
