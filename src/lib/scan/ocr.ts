import { contrastStretch, cropRotateScale, type CropRect, type Rgba } from "@/lib/scan/pixels";
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
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const ASSET_BASE = "/tesseract";
const MIN_CONFIDENCE = 30;
/** Vertical first: a spine in a shelf frame is the normal case. 0° is the fallback. */
const ROTATIONS: (0 | 90 | 270)[] = [90, 270, 0];
/** Longest side of a prepared crop. Beyond this the WASM engine runs out of memory. */
const MAX_CROP_PX = 2400;
/** Tesseract's "uniform block" mode: a crop is one line of spine text, not a page. */
const PAGE_SEG_MODE = "6";

/**
 * How many engines to run at once.
 *
 * Measured on a two-core machine, two workers is *worse* than one: wall time went from
 * 18.4s to 19.4s for the same fixture set and each read took twice as long, because the
 * engines contend for the same cores. A phone has more, so this asks the device rather
 * than assuming, and stays at one engine on anything small.
 */
function poolSize(): number {
  const cores = typeof navigator === "undefined" ? 1 : navigator.hardwareConcurrency ?? 2;
  return cores >= 4 ? 2 : 1;
}
const POOL_SIZE = typeof navigator === "undefined" ? 1 : poolSize();
let poolPromise: Promise<OcrWorker[]> | null = null;

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

async function createOne(onProgress?: (progress: OcrProgress) => void): Promise<OcrWorker> {
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
  // One line per crop, not a page layout: the default page-segmentation mode reads a
  // 25:1 spine strip as a column of fragments and mangles it.
  await worker.setParameters({ tessedit_pageseg_mode: PAGE_SEG_MODE });
  return worker;
}

/** Load (once) a small pool of workers, reporting model download progress. */
export async function loadOcr(onProgress?: (progress: OcrProgress) => void): Promise<OcrWorker[]> {
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const workers: OcrWorker[] = [];
    for (let i = 0; i < POOL_SIZE; i += 1) workers.push(await createOne(onProgress));
    return workers;
  })();
  try {
    return await poolPromise;
  } catch (error) {
    poolPromise = null;
    throw error;
  }
}

export async function releaseOcr(): Promise<void> {
  const pending = poolPromise;
  poolPromise = null;
  if (!pending) return;
  try {
    const workers = await pending;
    await Promise.all(workers.map((worker) => worker.terminate().catch(() => undefined)));
  } catch {
    /* already gone */
  }
}

/**
 * The prepared crop for one spine and one rotation: rotated, upscaled, contrast
 * stretched.
 *
 * The scale is a flat 2x for anything small, which is what a grid search over six
 * real spine photographs picked: 2x beat both 1x and 3x at every segmentation mode,
 * and 3x mostly amplified sensor noise. It also sidesteps the earlier approach of
 * measuring an ink band, which was polluted by neighbouring spines and shelf stickers
 * and so declined to upscale exactly when it was needed.
 */
export function prepareCrop(source: Rgba, box: CropRect, rotation: 0 | 90 | 180 | 270): Rgba | null {
  // 3x, measured on the user's own shelf photographs: a flat 2x read 8 of 17 expected
  // titles, 3x read 10 of 17, and scaling only the narrow spines scored 9. It costs
  // roughly 3s a spine against 1.3s, which is why reads stream in one at a time.
  // The cap keeps the long side inside the engine's memory budget — leptonica's
  // allocations fail on 2800px strips — so wide spines scale less automatically.
  const targetScale = 3;
  const longSide = Math.max(box.w, box.h);
  const scale = Math.min(targetScale, Math.max(0.5, MAX_CROP_PX / Math.max(1, longSide)));
  const crop = cropRotateScale(source, box, rotation, scale);
  return crop ? contrastStretch(crop) : null;
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
    // Known words first: a correct read of a spine usually contains at least one word
    // the vocabulary recognises, while a wrong rotation produces letter soup that can
    // still score well on shape. Confidence is a weak tiebreaker — on real photos the
    // right rotation is often the less confident one.
    const rank = gateOn
      ? plausibility.knownRatio * 1 + plausibility.score * 0.5 + (confidence / 100) * 0.2
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

/**
 * Read a ranked list of spine boxes, streaming each result as it lands.
 *
 * Spines are read two at a time on a pool of workers, and `onRead` fires per spine, so
 * the first result appears in about a second instead of after the whole shelf. Reading
 * six spines sequentially is eight seconds of a progress bar; this is roughly half.
 */
export async function readShelf(
  source: Rgba,
  boxes: SpineBox[],
  onProgress?: (progress: OcrProgress) => void,
  limit = 6,
  vocabulary?: Set<string>,
  onRead?: (read: SpineRead) => void,
): Promise<SpineRead[]> {
  const workers = await loadOcr(onProgress);
  const recognizers = workers.map(canvasRecognizer);
  const candidates = boxes.slice(0, limit);
  const reads: SpineRead[] = [];
  let finished = 0;
  let next = 0;

  const runOne = async (recognizer: Recognizer) => {
    while (next < candidates.length) {
      const index = next;
      next += 1;
      try {
        const read = await readSpineWith(source, candidates[index], recognizer, vocabulary);
        if (read) {
          reads.push(read);
          onRead?.(read);
        }
      } catch {
        /* one bad crop should not kill the shelf */
      }
      finished += 1;
      onProgress?.({
        stage: "reading",
        progress: Math.round((finished / candidates.length) * 100),
        detail: `read ${finished} of ${candidates.length}`,
      });
    }
  };

  await Promise.all(recognizers.map((recognizer) => runOne(recognizer)));
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
