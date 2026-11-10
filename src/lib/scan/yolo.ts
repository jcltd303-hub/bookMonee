/**
 * YOLO output decoding, as pure functions.
 *
 * A spine detector exported from any YOLO-family trainer returns one of two shapes:
 * `[1, 4 + classes, anchors]` (v8/v11, transposed) or `[1, anchors, 4 + 1 + classes]`.
 * Both are centre-based. This turns either into pixel boxes, which is the part worth
 * testing without a model or a browser in the loop.
 */
export type RawBox = { x: number; y: number; w: number; h: number; score: number };

export type Letterbox = {
  /** Scale applied to the source before padding. */
  scale: number;
  padX: number;
  padY: number;
};

/** Undo letterboxing: model-space pixels back to source-image pixels. */
export function unletterbox(box: RawBox, box3: Letterbox): RawBox {
  const x = (box.x - box3.padX) / box3.scale;
  const y = (box.y - box3.padY) / box3.scale;
  const w = box.w / box3.scale;
  const h = box.h / box3.scale;
  return { x, y, w, h, score: box.score };
}

/**
 * Decode a flat YOLO tensor into candidate boxes.
 *
 * `dims` is the tensor shape without the batch axis. Values are read row-major, so
 * `[4 + classes, anchors]` is column-major over anchors — the transposed layout most
 * exporters emit — and `[anchors, 4 + classes]` is the other. The caller says which.
 */
export function decodeYolo(
  data: Float32Array,
  dims: [number, number],
  opts: { transposed: boolean; minScore: number },
): RawBox[] {
  const [rows, cols] = dims;
  const boxes: RawBox[] = [];
  if (opts.transposed) {
    // rows = 4 + classes, cols = anchors
    const anchors = cols;
    const classes = rows - 4;
    if (classes < 1) return [];
    for (let a = 0; a < anchors; a += 1) {
      let best = 0;
      for (let c = 0; c < classes; c += 1) {
        const score = data[(4 + c) * anchors + a];
        if (score > best) best = score;
      }
      if (best < opts.minScore) continue;
      boxes.push({
        x: data[0 * anchors + a],
        y: data[1 * anchors + a],
        w: data[2 * anchors + a],
        h: data[3 * anchors + a],
        score: best,
      });
    }
    return boxes;
  }
  // rows = anchors, cols = 4 + classes
  const classes = cols - 4;
  if (classes < 1) return [];
  for (let a = 0; a < rows; a += 1) {
    let best = 0;
    for (let c = 0; c < classes; c += 1) {
      const score = data[a * cols + 4 + c];
      if (score > best) best = score;
    }
    if (best < opts.minScore) continue;
    boxes.push({
      x: data[a * cols + 0],
      y: data[a * cols + 1],
      w: data[a * cols + 2],
      h: data[a * cols + 3],
      score: best,
    });
  }
  return boxes;
}

/**
 * Axis-aligned bounds of a rotated box.
 *
 * Ultralytics OBB models — and the best public book-spine work is oriented-box — return a
 * centre, width, height and angle. The crop pipeline takes axis-aligned boxes, so the
 * rotation is resolved into its bounding rectangle. For a spine tilted a few degrees that
 * is a slightly padded crop, which costs nothing; ignoring the angle would cut the text.
 */
export function rotatedToAabb(cx: number, cy: number, w: number, h: number, angleRad: number): RawBox {
  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));
  const width = w * cos + h * sin;
  const height = w * sin + h * cos;
  return { x: cx, y: cy, w: width, h: height, score: 0 };
}

/**
 * Decode an oriented-box tensor: `[4 + classes + 1, anchors]`, where the trailing row is
 * the angle in radians. Same layout otherwise as the axis-aligned decoder.
 */
export function decodeObb(
  data: Float32Array,
  dims: [number, number],
  opts: { minScore: number },
): RawBox[] {
  const [rows, anchors] = dims;
  const classes = rows - 5;
  if (classes < 1) return [];
  const boxes: RawBox[] = [];
  for (let a = 0; a < anchors; a += 1) {
    let best = 0;
    for (let c = 0; c < classes; c += 1) {
      const score = data[(4 + c) * anchors + a];
      if (score > best) best = score;
    }
    if (best < opts.minScore) continue;
    const cx = data[0 * anchors + a];
    const cy = data[1 * anchors + a];
    const w = data[2 * anchors + a];
    const h = data[3 * anchors + a];
    const angle = data[(rows - 1) * anchors + a];
    const box = rotatedToAabb(cx, cy, w, h, angle);
    boxes.push({ ...box, score: best });
  }
  return boxes;
}

function iou(a: RawBox, b: RawBox): number {
  const ax2 = a.x + a.w / 2;
  const ay2 = a.y + a.h / 2;
  const bx2 = b.x + b.w / 2;
  const by2 = b.y + b.h / 2;
  const overlapW = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x - a.w / 2, b.x - b.w / 2));
  const overlapH = Math.max(0, Math.min(ay2, by2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));
  const overlap = overlapW * overlapH;
  if (overlap <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Greedy non-maximum suppression, highest score first. */
export function nonMaxSuppression(boxes: RawBox[], threshold = 0.45): RawBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: RawBox[] = [];
  for (const box of sorted) {
    if (kept.some((other) => iou(box, other) > threshold)) continue;
    kept.push(box);
  }
  return kept;
}

/** Centre-based model boxes to top-left pixel boxes, clipped to the frame. */
export function toFrameBoxes(
  boxes: RawBox[],
  letterbox: Letterbox,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number; score: number }[] {
  const out: { x: number; y: number; w: number; h: number; score: number }[] = [];
  for (const raw of boxes) {
    const box = unletterbox(raw, letterbox);
    const x = Math.round(box.x - box.w / 2);
    const y = Math.round(box.y - box.h / 2);
    const w = Math.round(box.w);
    const h = Math.round(box.h);
    if (w < 8 || h < 24) continue;
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(width, x + w);
    const bottom = Math.min(height, y + h);
    if (right - left < 8 || bottom - top < 24) continue;
    out.push({ x: left, y: top, w: right - left, h: bottom - top, score: Math.round(box.score * 1000) / 1000 });
  }
  return out;
}
