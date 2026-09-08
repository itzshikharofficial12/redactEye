#!/usr/bin/env bash
# ==============================================================================
# RedactEye Face Detection Model Download Script
#
# Downloads UltraFace Slim-320 ONNX model (with built-in anchor decoding)
# defined in download-manifest.json into models/face/.
#
# Usage:
#   bash models/face/download.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

MODEL_URL="https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/raw/master/models/onnx/version-slim-320.onnx"
MODEL_FILE="det.onnx"
MODEL_SHA256="e9adbd0f920ddcce9368434c4d34d72520dc0c19b526fd44b4ef49bde2c3b1a8"

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

echo "=== RedactEye Face Detection Model Setup ==="
echo "Target directory: ${SCRIPT_DIR}"

download_model "UltraFace Slim-320 Detection" "$MODEL_URL" "$MODEL_FILE" "$MODEL_SHA256"

echo "=== Face detection model is ready in ${SCRIPT_DIR} ==="
ls -lh "${MODEL_FILE}"
