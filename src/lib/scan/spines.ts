/**
 * Spine segmentation.
 *
 * A shelf is a row of vertical rectangles. That is enough structure to find spines
 * without a detector model: sum the horizontal gradient per column, and the column
 * where one spine ends and the next begins shows up as a peak. Bands between peaks
 * are candidates, and the tall-and-narrow ones are spines.
 *
 * Pure functions over a greyscale buffer, so this runs on any device at any frame
 * rate, is unit-testable in Node, and never downloads anything.
 */
export type Grey = { data: Float32Array; width: number; height: number };

export type SpineBox = {
  /** Left edge in source pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0..1 — edge strength inside the band, used to rank candidates. */
  score: number;
};

export type SegmentOptions = {
  /** Ignore bands narrower than this fraction of the frame width. */
  minWidthRatio?: number;
  /** Ignore bands wider than this fraction (those are shelf gaps, not spines). */
  maxWidthRatio?: number;
  /** Edge threshold, in standard deviations above the mean column gradient. */
  edgeSigmas?: number;
  /** Minimum spacing between edges, as a fraction of frame width. */
  minSpacingRatio?: number;
  /** How many candidates to return, best first. */
  limit?: number;
};

const DEFAULTS: Required<SegmentOptions> = {
  minWidthRatio: 0.02,
  maxWidthRatio: 0.16,
  edgeSigmas: 1.1,
  minSpacingRatio: 0.02,
  limit: 8,
};

/** Greyscale from RGBA pixels, luminance-weighted. */
export function toGrey(rgba: Uint8ClampedArray, width: number, height: number): Grey {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    data[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return { data, width, height };
}

/** Horizontal gradient energy per column: where one spine meets the next. */
export function gradientProfile(grey: Grey): Float32Array {
  const { data, width, height } = grey;
  const profile = new Float32Array(width);
  for (let x = 1; x < width - 1; x += 1) {
    let sum = 0;
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      sum += Math.abs(data[row + x + 1] - data[row + x - 1]);
    }
    profile[x] = sum / height;
  }
  return profile;
}

function smooth(profile: Float32Array, radius = 1): Float32Array {
  const out = new Float32Array(profile.length);
  for (let x = 0; x < profile.length; x += 1) {
    let sum = 0;
    let n = 0;
    for (let d = -radius; d <= radius; d += 1) {
      const i = x + d;
      if (i < 0 || i >= profile.length) continue;
      sum += profile[i];
      n += 1;
    }
    out[x] = sum / n;
  }
  return out;
}

function stats(values: Float32Array): { mean: number; std: number } {
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(sq / values.length) };
}

/** Column indices that look like spine boundaries, left to right. */
export function findEdges(profile: Float32Array, opts: SegmentOptions = {}): number[] {
  const { edgeSigmas, minSpacingRatio } = { ...DEFAULTS, ...opts };
  const smoothProfile = smooth(profile);
  const { mean, std } = stats(smoothProfile);
  const threshold = mean + edgeSigmas * std;
  const minSpacing = Math.max(2, Math.round(profile.length * minSpacingRatio));
  const edges: number[] = [];
  for (let x = 1; x < smoothProfile.length - 1; x += 1) {
    const v = smoothProfile[x];
    if (v < threshold) continue;
    // Local maximum only, so a fat boundary yields one edge rather than three.
    if (v < smoothProfile[x - 1] || v < smoothProfile[x + 1]) continue;
    if (edges.length && x - edges[edges.length - 1] < minSpacing) {
      if (v > smoothProfile[edges[edges.length - 1]]) edges[edges.length - 1] = x;
      continue;
    }
    edges.push(x);
  }
  return edges;
}

/** Candidate spine rectangles between consecutive edges, best first. */
export function spineBoxes(grey: Grey, opts: SegmentOptions = {}): SpineBox[] {
  const { minWidthRatio, maxWidthRatio, limit } = { ...DEFAULTS, ...opts };
  const profile = gradientProfile(grey);
  const edges = findEdges(profile, opts);
  if (edges.length < 2) return [];
  const minW = Math.max(6, Math.round(grey.width * minWidthRatio));
  const maxW = Math.round(grey.width * maxWidthRatio);
  const boxes: SpineBox[] = [];

  for (let i = 1; i < edges.length; i += 1) {
    const x0 = edges[i - 1];
    const x1 = edges[i];
    const w = x1 - x0;
    if (w < minW || w > maxW) continue;
    // Edge energy inside the band, normalised by the profile's own spread.
    let energy = 0;
    for (let x = x0; x <= x1; x += 1) energy += profile[x];
    energy /= Math.max(1, x1 - x0 + 1);
    const { mean, std } = stats(profile);
    const z = std > 0 ? (energy - mean) / std : 0;
    // Tall-and-narrow prior: a spine is much taller than it is wide.
    const aspect = grey.height / w;
    const aspectScore = Math.max(0, Math.min(1, (aspect - 2) / 8));
    boxes.push({
      x: x0,
      y: 0,
      w,
      h: grey.height,
      score: Math.round(Math.max(0, Math.min(1, 0.7 * Math.max(0, Math.min(1, z / 2)) + 0.3 * aspectScore)) * 1000) / 1000,
    });
  }

  return boxes.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Convenience: RGBA frame in, ranked spine boxes out. */
export function segmentFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: SegmentOptions = {},
): SpineBox[] {
  return spineBoxes(toGrey(rgba, width, height), opts);
}
