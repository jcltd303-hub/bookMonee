import type { SpineBox } from "@/lib/scan/spines";

/**
 * Trained spine detection, with the local segmenter as the fallback.
 *
 * The heuristic segmenter is decent on a clean row and poor where books touch: it merges
 * neighbours, which is why three spines in the benchmark are never read at all. A
 * detector trained on bookshelves does that part properly. This calls one through the
 * deployment's own proxy, so the Roboflow key never reaches the browser.
 *
 * Everything here fails soft: no configuration, a timeout or a bad response all return
 * null, and the caller falls back to `segmentFrame`. Scanning a shelf must not depend on
 * a third party being up.
 */
export type DetectorResult = { boxes: SpineBox[]; detector: string };

const MAX_SEND_WIDTH = 1100;
const TIMEOUT_MS = 12000;

/** Fractional boxes from the proxy, mapped onto the captured frame. */
export function boxesFromFractions(
  boxes: { x: number; y: number; w: number; h: number; score: number }[],
  width: number,
  height: number,
): SpineBox[] {
  const out: SpineBox[] = [];
  for (const box of boxes) {
    const x = Math.round(box.x * width);
    const y = Math.round(box.y * height);
    const w = Math.round(box.w * width);
    const h = Math.round(box.h * height);
    // Reject degenerate and absurd boxes rather than feeding them to OCR.
    if (w < 8 || h < 24) continue;
    if (x < -4 || y < -4 || x + w > width + 4 || y + h > height + 4) continue;
    out.push({
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: Math.min(w, width - Math.max(0, x)),
      h: Math.min(h, height - Math.max(0, y)),
      score: Math.round(box.score * 1000) / 1000,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Encode a frame small enough to upload. */
function encode(canvas: HTMLCanvasElement): string | null {
  const scale = Math.min(1, MAX_SEND_WIDTH / Math.max(1, canvas.width));
  const target = document.createElement("canvas");
  target.width = Math.round(canvas.width * scale);
  target.height = Math.round(canvas.height * scale);
  const ctx = target.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target.toDataURL("image/jpeg", 0.85);
}

/** Once the deployment says it has no detector, stop asking on every read. */
let detectorDisabled = false;

export async function detectSpines(canvas: HTMLCanvasElement): Promise<DetectorResult | null> {
  if (detectorDisabled) return null;
  const image = encode(canvas);
  if (!image) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("/api/spines", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    if (!response.ok) {
      if (response.status === 501) detectorDisabled = true;
      return null;
    }
    const payload = (await response.json()) as {
      boxes?: { x: number; y: number; w: number; h: number; score: number }[];
      detector?: string;
    };
    if (!Array.isArray(payload.boxes) || !payload.boxes.length) return null;
    const boxes = boxesFromFractions(payload.boxes, canvas.width, canvas.height);
    if (!boxes.length) return null;
    return { boxes, detector: payload.detector ?? "roboflow" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
