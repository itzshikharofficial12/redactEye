#!/usr/bin/env bash
# ==============================================================================
# RedactEye OCR Models Download Script
#
# Downloads PP-OCRv4 mobile ONNX models (detection + English recognition)
# defined in download-manifest.json into models/ocr/.
#
# Usage:
#   bash models/ocr/download.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

DET_URL="https://huggingface.co/xberg-io/paddleocr-onnx-models/resolve/main/v2/det/mobile.onnx"
DET_FILE="det.onnx"
DET_SHA256="c8d9b07063420ce5365c74e42532de48238feeeedcdb7a330b195708bc38a93f"

REC_URL="https://huggingface.co/xberg-io/paddleocr-onnx-models/resolve/main/v2/rec/en_mobile/model.onnx"
REC_FILE="rec.onnx"
REC_SHA256="70b2450eed39599af6b996c27a2f1a0ef30eeb49f9f66dd3e74f28f652befc89"

compute_sha256() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    echo "Warning: neither shasum nor sha256sum found, skipping checksum verification."
    echo ""
  fi
}

download_model() {
  local name="$1"
  local url="$2"
  local target="$3"
  local expected_sha="$4"

  if [ -f "$target" ]; then
    echo "Checking existing ${target}..."
    local actual_sha
    actual_sha=$(compute_sha256 "$target")
    if [ -n "$actual_sha" ] && [ "$actual_sha" = "$expected_sha" ]; then
      echo "  ${target} already exists and checksum verified. Skipping."
      return 0
    else
      echo "  ${target} checksum mismatch or corrupt. Re-downloading."
      rm -f "$target"
    fi
  fi

  echo "Downloading ${name} from ${url}..."
  curl -L --fail --progress-bar "$url" -o "${target}.tmp"
  mv "${target}.tmp" "$target"

  local verify_sha
  verify_sha=$(compute_sha256 "$target")
  if [ -n "$verify_sha" ] && [ "$verify_sha" != "$expected_sha" ]; then
    echo "Error: Checksum mismatch for ${target}!"
    echo "  Expected: ${expected_sha}"
    echo "  Actual:   ${verify_sha}"
    rm -f "$target"
    exit 1
  fi
  echo "  ${target} downloaded successfully and verified."
}

echo "=== RedactEye OCR Model Setup ==="
echo "Target directory: ${SCRIPT_DIR}"

download_model "DBNet Mobile Detection" "$DET_URL" "$DET_FILE" "$DET_SHA256"
download_model "SVTR/LCNet English Recognition" "$REC_URL" "$REC_FILE" "$REC_SHA256"

echo "=== OCR models are ready in ${SCRIPT_DIR} ==="
ls -lh "${DET_FILE}" "${REC_FILE}" "${SCRIPT_DIR}/en_dict.txt"
