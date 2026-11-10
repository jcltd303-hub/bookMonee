import { nonMaxSuppression, decodeObb, decodeYolo, toFrameBoxes, type Letterbox } from "@/lib/scan/yolo";
import type { SpineBox } from "@/lib/scan/spines";

/**
 * On-device spine detection with a FOSS model.
 *
 * No API key, no cloud call, no per-request cost: a YOLO-family detector exported to
 * ONNX runs in the browser through ONNX Runtime Web (MIT). The model file is the
 * deployer's choice — any bookshelf/spine detector exported with
 * `yolo export format=onnx` works, including one trained on the open-shelves dataset.
 *
 * The model is optional. `public/models/spines.onnx` is gitignored, so a deployment
 * without it simply falls back to the local segmenter; the runtime is imported lazily so
 * the ~1.5MB of WASM is never downloaded by anyone who has no model.
 */
export type DetectorResult = { boxes: SpineBox[]; detector: string };

const MODEL_URL = "/models/spines.onnx";
/**
 * What the model outputs. Ultralytics OBB exports add an angle channel, and the public
 * book-spine work that handles tilted books is oriented — so the task is configuration,
 * not a guess: set VITE_SPINE_MODEL_TASK=obb when you export that way.
 */
const TASK = (import.meta.env as Record<string, string | undefined>).VITE_SPINE_MODEL_TASK === "obb" ? "obb" : "detect";
const INPUT = 640;
const MIN_SCORE = 0.35;
const IOU = 0.45;

type Ort = typeof import("onnxruntime-web");
type Session = Awaited<ReturnType<Ort["InferenceSession"]["create"]>>;

let sessionPromise: Promise<Session | null> | null = null;
/** Set once the deployment proves it has no model, so we stop asking. */
let unavailable = false;

async function loadSession(): Promise<Session | null> {
  if (unavailable) return null;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    try {
      // Cheap existence check first: a 404 here avoids pulling 1.5MB of WASM.
      const head = await fetch(MODEL_URL, { method: "HEAD" });
      if (!head.ok) {
        unavailable = true;
        return null;
      }
      const ort = await import("onnxruntime-web");
      ort.env.wasm.numThreads = 1;
      return await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
    } catch {
      unavailable = true;
      return null;
    }
  })();
  return sessionPromise;
}

/** Letterbox the frame into the model's square input, keeping aspect ratio. */
function letterbox(canvas: HTMLCanvasElement): { tensor: Float32Array; box: Letterbox } {
  const scale = Math.min(INPUT / canvas.width, INPUT / canvas.height);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const padX = Math.round((INPUT - w) / 2);
  const padY = Math.round((INPUT - h) / 2);

  const target = document.createElement("canvas");
  target.width = INPUT;
  target.height = INPUT;
  const ctx = target.getContext("2d");
  if (!ctx) return { tensor: new Float32Array(3 * INPUT * INPUT), box: { scale, padX, padY } };
  ctx.fillStyle = "#727272";
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(canvas, padX, padY, w, h);

  const pixels = ctx.getImageData(0, 0, INPUT, INPUT).data;
  const tensor = new Float32Array(3 * INPUT * INPUT);
  const plane = INPUT * INPUT;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    tensor[p] = pixels[i] / 255;
    tensor[plane + p] = pixels[i + 1] / 255;
    tensor[2 * plane + p] = pixels[i + 2] / 255;
  }
  return { tensor, box: { scale, padX, padY } };
}

export async function detectSpines(canvas: HTMLCanvasElement): Promise<DetectorResult | null> {
  const session = await loadSession();
  if (!session) return null;
  try {
    const ort = await import("onnxruntime-web");
    const { tensor, box } = letterbox(canvas);
    const input = new ort.Tensor("float32", tensor, [1, 3, INPUT, INPUT]);
    const name = session.inputNames[0];
    const outputs = await session.run({ [name]: input });
    const first = outputs[session.outputNames[0]];
    const dims = first.dims as number[];
    const data = first.data as Float32Array;

    // Exports come as [1, channels, anchors]; channels is 4+classes for a detector and
    // 5+classes for an oriented-box model.
    const [, rows, anchors] = dims.length === 3 ? dims : [1, dims[1] ?? 0, dims[2] ?? 0];
    const raw =
      TASK === "obb"
        ? decodeObb(data, [rows, anchors], { minScore: MIN_SCORE })
        : decodeYolo(data, [rows, anchors], { transposed: rows < anchors, minScore: MIN_SCORE });

    const boxes = toFrameBoxes(nonMaxSuppression(raw, IOU), box, canvas.width, canvas.height);
    if (!boxes.length) return null;
    return { boxes: boxes.sort((x, y) => y.score - x.score), detector: "onnx" };
  } catch {
    return null;
  }
}
