/**
 * Image preprocessing routines for RedactEye OCR pipeline.
 *
 * Implements bilinear resizing, cropping, and tensor normalization in pure TypeScript
 * so that both Node.js test runners and browser WebGPU/WASM environments run without
 * requiring native platform-specific canvas or image processing libraries.
 */

export interface RawImageData {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

/**
 * Calculates resized dimensions for detection model such that both width and height
 * are multiples of 32 (DBNet requirement) while limiting the maximum side length.
 */
export function computeDetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxSideLen = 960
): { targetWidth: number; targetHeight: number; scaleX: number; scaleY: number } {
  const maxDim = Math.max(srcWidth, srcHeight);
  let ratio = 1.0;
  if (maxDim > maxSideLen) {
    ratio = maxSideLen / maxDim;
  }

  let targetWidth = Math.round((srcWidth * ratio) / 32) * 32;
  let targetHeight = Math.round((srcHeight * ratio) / 32) * 32;

  targetWidth = Math.max(32, targetWidth);
  targetHeight = Math.max(32, targetHeight);

  return {
    targetWidth,
    targetHeight,
    scaleX: targetWidth / srcWidth,
    scaleY: targetHeight / srcHeight,
  };
}

/**
 * Performs bilinear image resizing from RGBA source buffer to destination buffer.
 */
export function resizeBilinear(
  src: RawImageData,
  dstWidth: number,
  dstHeight: number
): RawImageData {
  const { data: srcData, width: srcW, height: srcH } = src;
  const dstData = new Uint8Array(dstWidth * dstHeight * 4);

  const scaleX = srcW / dstWidth;
  const scaleY = srcH / dstHeight;

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = (dy + 0.5) * scaleY - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy1 = sy - y0;
    const wy0 = 1.0 - wy1;

    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = (dx + 0.5) * scaleX - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx1 = sx - x0;
      const wx0 = 1.0 - wx1;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx01 = (y0 * srcW + x1) * 4;
      const idx10 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const dstIdx = (dy * dstWidth + dx) * 4;

      for (let c = 0; c < 4; c++) {
        const top = srcData[idx00 + c]! * wx0 + srcData[idx01 + c]! * wx1;
        const bottom = srcData[idx10 + c]! * wx0 + srcData[idx11 + c]! * wx1;
        dstData[dstIdx + c] = Math.round(top * wy0 + bottom * wy1);
      }
    }
  }

  return { data: dstData, width: dstWidth, height: dstHeight };
}

/**
 * Normalizes an RGBA image into NCHW Float32Array for the DBNet detection model.
 * Uses ImageNet mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225].
 */
export function normalizeForDet(image: RawImageData): Float32Array {
  const { data, width, height } = image;
  const numPixels = width * height;
  const tensor = new Float32Array(3 * numPixels);

  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  for (let i = 0; i < numPixels; i++) {
    const srcIdx = i * 4;
    const r = data[srcIdx]! / 255.0;
    const g = data[srcIdx + 1]! / 255.0;
    const b = data[srcIdx + 2]! / 255.0;

    tensor[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    tensor[gOffset + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    tensor[bOffset + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  return tensor;
}

/**
 * Crops an axis-aligned bounding box from the source image.
 */
export function cropRegion(
  src: RawImageData,
  bbox: { x: number; y: number; width: number; height: number }
): RawImageData {
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(src.width, Math.ceil(bbox.x + bbox.width));
  const y1 = Math.min(src.height, Math.ceil(bbox.y + bbox.height));

  const cropW = Math.max(1, x1 - x0);
  const cropH = Math.max(1, y1 - y0);

  const cropData = new Uint8Array(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    const srcRowStart = ((y0 + y) * src.width + x0) * 4;
    const dstRowStart = y * cropW * 4;
    cropData.set(
      src.data.subarray(srcRowStart, srcRowStart + cropW * 4),
      dstRowStart
    );
  }

  return { data: cropData, width: cropW, height: cropH };
}

/**
 * Crops and normalizes a text box into NCHW Float32Array for the SVTR recognition model.
 * Resizes to fixed height of 48 pixels and normalizes via (pixel / 255.0 - 0.5) / 0.5.
 */
export function cropAndNormalizeForRec(
  src: RawImageData,
  bbox: { x: number; y: number; width: number; height: number },
  targetHeight = 48
): { tensor: Float32Array; width: number; height: number } {
  const cropped = cropRegion(src, bbox);

  const aspect = cropped.width / cropped.height;
  // Ensure minimum width of 16 and round to integer
  const targetWidth = Math.max(16, Math.round(targetHeight * aspect));

  const resized = resizeBilinear(cropped, targetWidth, targetHeight);
  const numPixels = targetWidth * targetHeight;
  const tensor = new Float32Array(3 * numPixels);

  const gOffset = numPixels;
  const bOffset = 2 * numPixels;

  for (let i = 0; i < numPixels; i++) {
    const srcIdx = i * 4;
    const r = resized.data[srcIdx]! / 255.0;
    const g = resized.data[srcIdx + 1]! / 255.0;
    const b = resized.data[srcIdx + 2]! / 255.0;

    tensor[i] = (r - 0.5) / 0.5;
    tensor[gOffset + i] = (g - 0.5) / 0.5;
    tensor[bOffset + i] = (b - 0.5) / 0.5;
  }

  return { tensor, width: targetWidth, height: targetHeight };
}
