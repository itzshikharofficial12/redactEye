/**
 * Post-processing routines for RedactEye OCR pipeline.
 *
 * Implements:
 * 1. DBNet text region extraction: probability thresholding, connected component labeling (CCL),
 *    mean score filtering, unclip polygon expansion, and coordinate re-scaling.
 * 2. CTC greedy decoding: argmax token selection, duplicate collapsing, blank removal,
 *    and softmax confidence calculation.
 */

import type { BoundingBox } from "@redact-eye/shared-types";

export interface CandidateRegion {
  bbox: BoundingBox;
  score: number;
}

export interface PostprocessDetOptions {
  binThreshold?: number;
  boxThreshold?: number;
  minArea?: number;
  unclipRatio?: number;
  origWidth?: number;
  origHeight?: number;
}

/**
 * Extracts bounding boxes from the DBNet detection probability map.
 *
 * @param probMap - Flattened Float32Array of shape [1, 1, height, width] with values in [0, 1].
 * @param width - Width of the detection heatmap.
 * @param height - Height of the detection heatmap.
 * @param scaleX - Horizontal scale factor (detWidth / origWidth).
 * @param scaleY - Vertical scale factor (detHeight / origHeight).
 * @param options - Tunable thresholds for detection filtering.
 */
export function extractBoxesFromHeatmap(
  probMap: Float32Array,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  options: PostprocessDetOptions = {}
): CandidateRegion[] {
  const binThreshold = options.binThreshold ?? 0.3;
  const boxThreshold = options.boxThreshold ?? 0.5;
  const minArea = options.minArea ?? 16;
  const unclipRatio = options.unclipRatio ?? 1.5;
  const origWidth = options.origWidth ?? width / scaleX;
  const origHeight = options.origHeight ?? height / scaleY;

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const regions: CandidateRegion[] = [];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (visited[idx] || probMap[idx]! < binThreshold) {
        continue;
      }

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let scoreSum = 0;
      let count = 0;

      let head = 0;
      let tail = 0;
      queue[tail++] = idx;
      visited[idx] = 1;

      while (head < tail) {
        const curr = queue[head++]!;
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        scoreSum += probMap[curr]!;
        count++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 4-connected neighbors
        if (cy > 0) {
          const up = curr - width;
          if (!visited[up] && probMap[up]! >= binThreshold) {
            visited[up] = 1;
            queue[tail++] = up;
          }
        }
        if (cy < height - 1) {
          const down = curr + width;
          if (!visited[down] && probMap[down]! >= binThreshold) {
            visited[down] = 1;
            queue[tail++] = down;
          }
        }
        if (cx > 0) {
          const left = curr - 1;
          if (!visited[left] && probMap[left]! >= binThreshold) {
            visited[left] = 1;
            queue[tail++] = left;
          }
        }
        if (cx < width - 1) {
          const right = curr + 1;
          if (!visited[right] && probMap[right]! >= binThreshold) {
            visited[right] = 1;
            queue[tail++] = right;
          }
        }
      }

      const meanScore = scoreSum / count;
      if (meanScore < boxThreshold || count < minArea) {
        continue;
      }

      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;

      // DBNet unclip expansion: distance = (area * unclipRatio) / perimeter
      const perimeter = 2 * (boxW + boxH);
      const unclipDistance = (boxW * boxH * unclipRatio) / Math.max(1, perimeter);

      const x0 = Math.max(0, Math.floor(minX - unclipDistance));
      const y0 = Math.max(0, Math.floor(minY - unclipDistance));
      const x1 = Math.min(width, Math.ceil(maxX + 1 + unclipDistance));
      const y1 = Math.min(height, Math.ceil(maxY + 1 + unclipDistance));

      // Map back to original coordinate system
      const origX = Math.max(0, Math.min(origWidth, x0 / scaleX));
      const origY = Math.max(0, Math.min(origHeight, y0 / scaleY));
      const origW = Math.min(origWidth - origX, (x1 - x0) / scaleX);
      const origH = Math.min(origHeight - origY, (y1 - y0) / scaleY);

      const finalX = Math.max(0, Math.min(origWidth, Math.round(origX)));
      const finalY = Math.max(0, Math.min(origHeight, Math.round(origY)));
      const finalW = Math.max(0, Math.min(origWidth - finalX, Math.round(origW)));
      const finalH = Math.max(0, Math.min(origHeight - finalY, Math.round(origH)));

      if (finalW >= 3 && finalH >= 3) {
        regions.push({
          bbox: { x: finalX, y: finalY, width: finalW, height: finalH },
          score: Math.min(1.0, Math.max(0.0, meanScore)),
        });
      }
    }
  }

  // Sort candidate regions top-to-bottom, left-to-right (reading order)
  regions.sort((a, b) => {
    const yDiff = a.bbox.y - b.bbox.y;
    if (Math.abs(yDiff) > 10) return yDiff;
    return a.bbox.x - b.bbox.x;
  });

  return regions;
}

export interface DecodeResult {
  text: string;
  confidence: number;
}

/**
 * CTC greedy decoder for text recognition model logits.
 *
 * @param logits - Flattened Float32Array of shape [1, seqLen, numClasses].
 * @param seqLen - Number of temporal frames in the sequence.
 * @param numClasses - Number of classes (e.g. 438, where class 0 is blank token).
 * @param dictionary - Character mapping array where index maps directly to character.
 */
export function ctcGreedyDecode(
  logits: Float32Array,
  seqLen: number,
  numClasses: number,
  dictionary: readonly string[]
): DecodeResult {
  const chars: string[] = [];
  const tokenConfs: number[] = [];
  let prevIdx = -1;

  for (let t = 0; t < seqLen; t++) {
    const stepOffset = t * numClasses;
    let maxIdx = 0;
    let maxVal = -Infinity;

    for (let c = 0; c < numClasses; c++) {
      const val = logits[stepOffset + c]!;
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }

    // Index 0 is CTC blank token; collapse consecutive identical non-blank tokens
    if (maxIdx !== 0 && maxIdx !== prevIdx) {
      if (maxIdx < dictionary.length) {
        chars.push(dictionary[maxIdx]!);
        tokenConfs.push(Math.min(1.0, Math.max(0.0, maxVal)));
      }
    }

    prevIdx = maxIdx;
  }

  const text = chars.join("").trim();
  if (text.length === 0) {
    return { text: "", confidence: 0 };
  }

  const avgConfidence =
    tokenConfs.reduce((sum, c) => sum + c, 0) / tokenConfs.length;

  return {
    text,
    confidence: Math.min(1.0, Math.max(0.0, avgConfidence)),
  };
}
