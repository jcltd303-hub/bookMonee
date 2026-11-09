/**
 * Frame pixels, without a DOM.
 *
 * These are the operations that used to live inside canvas calls: crop a spine,
 * rotate it upright, scale it, binarise it. Keeping them as pure functions over an
 * RGBA buffer means the browser and the Node benchmark run the exact same code —
 * otherwise the benchmark measures a copy, and a copy drifts.
 *
 * Everything here is plain arithmetic: no canvas, no document, no dependencies.
 */
export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

export type CropRect = { x: number; y: number; w: number; h: number };

/** Otsu threshold over a greyscale histogram. */
export function otsuThreshold(grey: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grey.length; i += 1) histogram[grey[i]] += 1;
  const total = grey.length;
  if (!total) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += histogram[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Greyscale luminance plane from RGBA. */
export function greyFrom(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    grey[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return grey;
}

/**
 * Bilinear sample of one RGBA channel at fractional coordinates.
 *
 * The row stride is `width * 4`, not `width`: treating the interleaved buffer as a
 * single-channel plane silently shifts every row and produces a garbled crop, which
 * the OCR then reports as noise.
 */
function sampleChannel(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const at = (px: number, py: number) => src[(py * width + px) * 4 + channel];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Crop, rotate and scale one spine in a single resample.
 *
 * Rotation is quarter-turns only (90 / 270), which is all a spine ever needs, and
 * the sampling is done in source space so there is one interpolation instead of
 * three. `scale` above 1 upsamples: a 14px-wide spine has to reach a readable cap
 * height before the engine sees it.
 */
export function cropRotateScale(
  source: Rgba,
  box: CropRect,
  rotation: 0 | 90 | 180 | 270,
  scale: number,
): Rgba | null {
  const cropW = Math.max(1, Math.round(box.w));
  const cropH = Math.max(1, Math.round(box.h));
  if (cropW < 4 || cropH < 8) return null;

  const quarter = rotation === 90 || rotation === 270;
  const outW = Math.round((quarter ? cropH : cropW) * scale);
  const outH = Math.round((quarter ? cropW : cropH) * scale);
  if (outW < 4 || outH < 4 || outW > 4096 || outH > 4096) return null;

  const data = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      // Where this output pixel lands inside the crop, before rotation.
      let u = (x + 0.5) / scale;
      let v = (y + 0.5) / scale;
      let sx: number;
      let sy: number;
      if (rotation === 0) {
        sx = u;
        sy = v;
      } else if (rotation === 90) {
        // Output is the crop turned clockwise: u runs down the crop, v runs back.
        sx = v;
        sy = cropH - u;
      } else if (rotation === 180) {
        sx = cropW - u;
        sy = cropH - v;
      } else {
        sx = cropW - v;
        sy = u;
      }
      if (sx < 0 || sy < 0 || sx >= cropW || sy >= cropH) continue;
      const gx = box.x + sx;
      const gy = box.y + sy;
      const out = (y * outW + x) * 4;
      data[out] = sampleChannel(source.data, source.width, source.height, gx, gy, 0);
      data[out + 1] = sampleChannel(source.data, source.width, source.height, gx, gy, 1);
      data[out + 2] = sampleChannel(source.data, source.width, source.height, gx, gy, 2);
      data[out + 3] = 255;
    }
  }
  return { data, width: outW, height: outH };
}

/**
 * Height of the ink band in a binarised crop.
 *
 * This is the measurement the upscaling needs: on a real shelf the type is much
 * smaller than the spine is wide, so keying the scale to spine width leaves wide
 * spines at 1x with tiny text. The ink band is the actual cap height.
 */
export function inkBandHeight(image: Rgba): number {
  let first = -1;
  let last = -1;
  for (let y = 0; y < image.height; y += 1) {
    let ink = 0;
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4] < 128) ink += 1;
    }
    if (ink / image.width > 0.02) {
      if (first < 0) first = y;
      last = y;
    }
  }
  return first < 0 ? 0 : last - first + 1;
}

/**
 * Hard black/white split at the Otsu threshold, forced to dark-text-on-light.
 *
 * Half the spines on a real shelf are white type on a coloured or photographic
 * ground, and Otsu happily returns that the right way round — which hands the engine
 * a black page with white letters and it reads noise. Measured on real crops, the
 * failing spines binarised to 73-78% ink; the ones that read were 13-16%. So when the
 * split comes out mostly dark, the polarity is flipped back.
 */
export function binarise(image: Rgba): Rgba {
  const grey = greyFrom(image.data);
  const threshold = otsuThreshold(grey);
  let dark = 0;
  for (let p = 0; p < grey.length; p += 1) if (grey[p] <= threshold) dark += 1;
  const invert = dark / Math.max(1, grey.length) > 0.5;
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    const above = grey[p] > threshold;
    const value = (invert ? !above : above) ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width: image.width, height: image.height };
}
