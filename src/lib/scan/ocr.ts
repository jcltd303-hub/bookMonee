import { binarise, cropRotateScale, inkBandHeight, type CropRect, type Rgba } from "@/lib/scan/pixels";
import { assess, type Plausibility } from "@/lib/scan/plausibility";
import type { SpineBox } from "@/lib/scan/spines";

/**
 * On-device spine OCR.
 *
 * Spines are the awkward case for OCR: the text runs vertically, it is stylised, and
 * it is usually a few dozen pixels wide. Three things make it work:
 *
 *  1. Rotate. Read every spine at 90° and 270° — publishers print top-to-bottom and
 *     bottom-to-top both — and fall back to 0° for a phone held sideways.
 *  2. Scale. Tesseract wants roughly 30px cap height, so a narrow spine is upsampled.
 *  3. Binarise. Shelf lighting is uneven and spines are often low contrast.
 *
 * A read is only accepted if the text passes the plausibility gate, not just the
 * engine's confidence: confidence measures segmentation, not language, and it scores
 * unrotated vertical text highly while returning symbol soup.
 *
 * The recogniser is injected, so the browser passes canvas crops and the Node
 * benchmark passes PNG buffers — the same crop, rotate, binarise and gate code runs
 * in both. That is what makes the benchmark meaningful.
 */
export type OcrStage = "loading" | "reading" | "done" | "error";

export type OcrProgress = { stage: OcrStage; progress: number; detail: string };

export type Recognizer = (image: Rgba) => Promise<{ text: string; confidence: number }>;

export type SpineRead = {
  box: SpineBox;
  /** Raw engine text, whitespace collapsed. */
  text: string;
  confidence: number;
  rotation: 0 | 90 | 270;
  plausibility: Plausibility;
};

type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

const ASSET_BASE = "/tesseract";
const MIN_CONFIDENCE = 30;
/** Vertical first: a spine in a shelf frame is the normal case. 0° is the fallback. */
const ROTATIONS: (0 | 90 | 270)[] = [90, 270, 0];
const TARGET_CAP_HEIGHT = 34;

let workerPromise: Promise<OcrWorker> | null = null;

/** WebAssembly SIMD support decides which core build the engine needs. */
export function supportsSimd(): boolean {
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

/** Load (once) the Tesseract worker, reporting model download progress. */
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

/**
 * The prepared crop for one spine and one rotation: rotated, scaled, binarised.
 *
 * Two passes. The first renders at 1x to measure how tall the ink actually is —
 * spine width says nothing about type size, and on a real shelf a 170px spine can
 * carry 30px letters. The second pass rescales so the cap height lands where the
 * engine wants it.
 *
 * Known limitation, measured on real photographs: `inkBandHeight` takes the full
 * span of ink rows, so anything else dark in the crop — a neighbouring spine, a
 * shelf-label sticker, a shadow — inflates the measurement and suppresses the
 * upscale. A 32px-tall crop of 14px type stayed at 1x for that reason. The fix is a
 * robust line-height estimate (median ink-run length, or the tallest component)
 * rather than the span; the bench's --dump flag exists to check that change.
 */
export function prepareCrop(source: Rgba, box: CropRect, rotation: 0 | 90 | 180 | 270): Rgba | null {
  const probe = cropRotateScale(source, box, rotation, 1);
  if (!probe) return null;
  const measured = binarise(probe);
  const band = inkBandHeight(measured);
  if (band < 4) return measured;
  const scale = Math.min(6, Math.max(0.5, TARGET_CAP_HEIGHT / band));
  if (Math.abs(scale - 1) < 0.12) return measured;
  const scaled = cropRotateScale(source, box, rotation, scale);
  return scaled ? binarise(scaled) : measured;
}

function collapse(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s'&:.,()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read one spine: try each rotation, keep the most believable read.
 *
 * Ranking is plausibility first, then confidence — a confident read of symbol soup
 * should never beat a shakier read of real words.
 */
export async function readSpineWith(
  source: Rgba,
  box: CropRect,
  recognize: Recognizer,
  vocabulary?: Set<string>,
  opts: { gate?: boolean } = {},
): Promise<SpineRead | null> {
  const gateOn = opts.gate !== false;
  let best: { read: SpineRead; rank: number } | null = null;

  for (const rotation of ROTATIONS) {
    const crop = prepareCrop(source, box, rotation);
    if (!crop) continue;
    let result: { text: string; confidence: number };
    try {
      result = await recognize(crop);
    } catch {
      continue;
    }
    const text = collapse(result.text ?? "");
    const confidence = Math.round(result.confidence ?? 0);
    const plausibility = assess(text, vocabulary);
    const read: SpineRead = {
      box: box as SpineBox,
      text,
      confidence,
      rotation,
      plausibility,
    };
    if (confidence < MIN_CONFIDENCE) continue;
    if (gateOn && !plausibility.plausible) continue;
    // Gate on: believability leads. Gate off: the old confidence-times-letters rank,
    // so the benchmark's A/B compares against what the code actually did before.
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    const rank = gateOn
      ? plausibility.score * 0.7 + (confidence / 100) * 0.3
      : (confidence / 100) * Math.min(1, letters / 20);
    if (!best || rank > best.rank) best = { read, rank };
    // A strong read on the first vertical rotation is enough; skip the rest.
    if (plausibility.plausible && plausibility.knownRatio > 0 && confidence >= 55) break;
  }

  return best?.read ?? null;
}

/** Browser adaptor: RGBA buffer in, canvas out to the engine. */
function canvasRecognizer(worker: OcrWorker): Recognizer {
  return async (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { text: "", confidence: 0 };
    const frame = ctx.createImageData(image.width, image.height);
    frame.data.set(image.data);
    ctx.putImageData(frame, 0, 0);
    const { data } = await worker.recognize(canvas);
    return { text: data.text ?? "", confidence: data.confidence ?? 0 };
  };
}

/** Read a ranked list of spine boxes from a captured frame, reporting progress. */
export async function readShelf(
  source: Rgba,
  boxes: SpineBox[],
  onProgress?: (progress: OcrProgress) => void,
  limit = 6,
  vocabulary?: Set<string>,
): Promise<SpineRead[]> {
  const worker = await loadOcr(onProgress);
  const recognize = canvasRecognizer(worker);
  const reads: SpineRead[] = [];
  const candidates = boxes.slice(0, limit);
  for (let i = 0; i < candidates.length; i += 1) {
    onProgress?.({
      stage: "reading",
      progress: Math.round((i / candidates.length) * 100),
      detail: `spine ${i + 1} of ${candidates.length}`,
    });
    try {
      const read = await readSpineWith(source, candidates[i], recognize, vocabulary);
      if (read) reads.push(read);
    } catch {
      /* one bad crop should not kill the shelf */
    }
  }
  onProgress?.({
    stage: "done",
    progress: 100,
    detail: `${reads.length} of ${candidates.length} readable`,
  });
  return reads;
}

/** ImageData (browser) to the plain RGBA buffer the pipeline works on. */
export function imageDataToRgba(image: ImageData): Rgba {
  return { data: image.data, width: image.width, height: image.height };
}
