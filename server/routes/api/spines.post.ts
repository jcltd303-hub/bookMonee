/**
 * Spine detection proxy.
 *
 * The edge-detection segmenter is a heuristic and it merges adjacent books; a trained
 * detector does the job properly. Roboflow Universe hosts exactly that model for
 * bookshelves (open-shelves), and this route forwards one frame to it so the API key
 * stays server-side.
 *
 *   ROBOFLOW_API_KEY   your key
 *   ROBOFLOW_MODEL     e.g. open-shelves/1   (default)
 *   ROBOFLOW_CONFIDENCE minimum confidence, default 0.4
 *   ROBOFLOW_API_URL   override for testing, default https://detect.roboflow.com
 *
 * Answers 501 when unconfigured, which the app treats as "use the local segmenter" —
 * detection must never be a hard dependency of scanning a shelf.
 *
 * Boxes come back as *fractions* of the frame (0..1), so the client can map them onto
 * whatever resolution it captured without knowing what was sent.
 */
import { defineEventHandler, readBody, setResponseStatus } from "h3";

type Prediction = { x: number; y: number; width: number; height: number; confidence?: number; class?: string };

export default defineEventHandler(async (event) => {
  const key = process.env.ROBOFLOW_API_KEY;
  if (!key) {
    setResponseStatus(event, 501);
    return { error: "ROBOFLOW_API_KEY is not configured on this deployment" };
  }

  const body = (await readBody(event).catch(() => null)) as { image?: string } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!image) {
    setResponseStatus(event, 400);
    return { error: "image (base64) is required" };
  }

  const base = (process.env.ROBOFLOW_API_URL ?? "https://detect.roboflow.com").replace(/\/$/, "");
  const model = process.env.ROBOFLOW_MODEL ?? "open-shelves/1";
  const confidence = process.env.ROBOFLOW_CONFIDENCE ?? "0.4";
  const url = `${base}/${model}?api_key=${encodeURIComponent(key)}&confidence=${encodeURIComponent(confidence)}&format=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image }).toString(),
    });
    if (!response.ok) {
      setResponseStatus(event, 502);
      return { error: `roboflow returned ${response.status}` };
    }
    const payload = (await response.json()) as {
      predictions?: Prediction[];
      image?: { width?: number; height?: number };
    };
    const width = payload.image?.width ?? 0;
    const height = payload.image?.height ?? 0;
    if (!width || !height) {
      setResponseStatus(event, 502);
      return { error: "roboflow did not report the image size" };
    }
    const boxes = (payload.predictions ?? []).map((p) => ({
      x: (p.x - p.width / 2) / width,
      y: (p.y - p.height / 2) / height,
      w: p.width / width,
      h: p.height / height,
      score: Math.round((p.confidence ?? 0) * 1000) / 1000,
    }));
    return { boxes, detector: model };
  } catch (error) {
    setResponseStatus(event, 504);
    return { error: error instanceof Error ? error.message : "roboflow request failed" };
  } finally {
    clearTimeout(timer);
  }
});
