import type { SpineBox } from "@/lib/scan/spines";

/**
 * On-device spine OCR.
 *
 * Spines are the awkward case for OCR: the text runs vertically, it is stylised,
 * and it is usually a few dozen pixels wide. Three things make it work:
 *
 *  1. Rotate. Read every spine at 90° and 270° and keep whichever produced a
 *     confident read — publishers print top-to-bottom and bottom-to-top both.
 *  2. Scale. Tesseract wants roughly 30px cap height. A 40px-wide spine already
 *     has it; a 14px-wide one gets upscaled until it does.
 *  3. Binarise. Shelf lighting is uneven and spines are often low contrast
 *     (debossed or foil). Otsu on the crop beats handing grey to the engine.
 *
 * The engine is Tesseract WASM, loaded lazily on first use and served from this
 * site rather than a CDN, so a shelf in a park reads the same as a shelf at home.
 * The WASM core and model are copied into public/tesseract by
 * scripts/copy-ocr-assets.mjs.
 */
export type OcrStage = "loading" | "reading" | "done" | "error";

export type OcrProgress = { stage: OcrStage; progress: number; detail: string };

export type SpineRead = {
  box: SpineBox;
  /** Raw engine text, newlines collapsed. */
  text: string;
  confidence: number;
  /** Which rotation produced the read: 90 or 270 degrees. */
  rotation: 90 | 270;
};

type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

const ASSET_BASE = "/tesseract";
const MIN_CONFIDENCE = 30;
const MIN_LETTERS = 3;
const TARGET_CAP_HEIGHT = 30;

let workerPromise: Promise<OcrWorker> | null = null;

/** WebAssembly SIMD support decides which core build the engine needs. */
function supportsSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
}

/** Load (once) the Tesseract worker, reporting download progress for the model. */
export async function loadOcr(onProgress?: (progress: OcrProgress) => void): Promise<OcrWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    const core = supportsSimd() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js";
    const worker = (await createWorker("eng", 1, {
      workerPath: `${ASSET_BASE}/worker.min.js`,
      corePath: `${ASSET_BASE}/${core}`,
      langPath: ASSET_BASE,
      gzip: true,
      logger: (message: { status: string; progress: number }) => {
        onProgress?.({
          stage: "loading",
          progress: Math.round((message.progress ?? 0) * 100),
          detail: message.status,
        });
      },
    })) as unknown as OcrWorker;
    return worker;
  })();
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

export async function releaseOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    /* already gone */
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Otsu threshold over a greyscale histogram. */
export function otsuThreshold(grey: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < grey.length; i += 1) histogram[grey[i]] += 1;
  const total = grey.length;
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

/**
 * Crop one spine out of the frame, rotate it upright, scale it to a readable cap
 * height, and binarise it. Returns null when the crop is too small to bother with.
 */
export function prepareSpine(
  source: HTMLCanvasElement,
  box: SpineBox,
  rotation: 90 | 270,
): HTMLCanvasElement | null {
  const scale = Math.min(5, Math.max(1, TARGET_CAP_HEIGHT / Math.max(6, box.w)));
  const cropW = box.w;
  const cropH = box.h;
  if (cropW < 6 || cropH < 40) return null;

  // Rotating a tall crop makes a wide one: width becomes height and vice versa.
  const outW = cropH * scale;
  const outH = cropW * scale;
  if (outW > 4000 || outH > 4000) return null;

  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, box.x, box.y, cropW, cropH, -outH / 2, -outW / 2, outH, outW);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grey = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < frame.data.length; i += 4, p += 1) {
    grey[p] = 0.299 * frame.data[i] + 0.587 * frame.data[i + 1] + 0.114 * frame.data[i + 2];
  }
  const threshold = otsuThreshold(grey);
  for (let i = 0, p = 0; i < frame.data.length; i += 4, p += 1) {
    const value = grey[p] > threshold ? 255 : 0;
    frame.data[i] = value;
    frame.data[i + 1] = value;
    frame.data[i + 2] = value;
    frame.data[i + 3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

function letters(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s'&:.,()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read one spine, trying both vertical orientations. */
export async function readSpine(
  worker: OcrWorker,
  source: HTMLCanvasElement,
  box: SpineBox,
): Promise<SpineRead | null> {
  let best: SpineRead | null = null;
  for (const rotation of [90, 270] as const) {
    const crop = prepareSpine(source, box, rotation);
    if (!crop) continue;
    const { data } = await worker.recognize(crop);
    const text = clean(data.text ?? "");
    const confidence = Math.round(data.confidence ?? 0);
    const candidate: SpineRead = { box, text, confidence, rotation };
    const usable = confidence >= MIN_CONFIDENCE && letters(text) >= MIN_LETTERS;
    const currentUsable = best ? best.confidence >= MIN_CONFIDENCE && letters(best.text) >= MIN_LETTERS : false;
    if (!best) best = candidate;
    else if (usable && (!currentUsable || confidence * letters(text) > best.confidence * letters(best.text))) {
      best = candidate;
    }
  }
  if (!best) return null;
  if (best.confidence < MIN_CONFIDENCE || letters(best.text) < MIN_LETTERS) return null;
  return best;
}

/** Read a ranked list of spine boxes, reporting progress per spine. */
export async function readShelf(
  source: HTMLCanvasElement,
  boxes: SpineBox[],
  onProgress?: (progress: OcrProgress) => void,
  limit = 6,
): Promise<SpineRead[]> {
  const worker = await loadOcr(onProgress);
  const reads: SpineRead[] = [];
  const candidates = boxes.slice(0, limit);
  for (let i = 0; i < candidates.length; i += 1) {
    onProgress?.({ stage: "reading", progress: Math.round((i / candidates.length) * 100), detail: `spine ${i + 1} of ${candidates.length}` });
    try {
      const read = await readSpine(worker, source, candidates[i]);
      if (read) reads.push(read);
    } catch {
      /* one bad crop should not kill the shelf */
    }
  }
  onProgress?.({ stage: "done", progress: 100, detail: `${reads.length} of ${candidates.length} readable` });
  return reads;
}
