/**
 * On-device frame-quality gate.
 *
 * A phone panned across a shelf produces mostly blurry frames, and a blurry spine is
 * a wrong ISBN. This scores each frame with a Laplacian variance on a 160px grey copy
 * — cheap enough to run every 250ms on a mid-range phone — and returns a verdict the
 * scan UI turns into a "slow down" cue instead of a bad decode.
 */
export type Sharpness = {
  /** 0 (smeared) to 1 (crisp). */
  score: number;
  verdict: "sharp" | "soft" | "blurry";
};

const WIDTH = 160;
const HEIGHT = 120;

export function classify(score: number): Sharpness {
  return { score, verdict: score >= 0.55 ? "sharp" : score >= 0.25 ? "soft" : "blurry" };
}

/** Laplacian variance of the current video frame, normalised to 0..1. */
export function sharpnessOf(video: HTMLVideoElement, canvas: HTMLCanvasElement): Sharpness | null {
  if (typeof document === "undefined") return null;
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
  const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const grey = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    for (let x = 1; x < WIDTH - 1; x += 1) {
      const i = y * WIDTH + x;
      const lap =
        -4 * grey[i] +
        grey[i - 1] +
        grey[i + 1] +
        grey[i - WIDTH] +
        grey[i + WIDTH];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (!n) return null;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  // Empirically, crisp print under office light lands around 140; motion blur under 40.
  return classify(Math.max(0, Math.min(1, variance / 140)));
}

/** Sample sharpness on a timer while the camera is open. Returns a stop function. */
export function watchSharpness(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onSample: (sample: Sharpness) => void,
  intervalMs = 260,
): () => void {
  const id = window.setInterval(() => {
    const sample = sharpnessOf(video, canvas);
    if (sample) onSample(sample);
  }, intervalMs);
  return () => window.clearInterval(id);
}

export function blurCue(sample: Sharpness): string {
  if (sample.verdict === "blurry") return "Too much blur — slow the sweep and hold still.";
  if (sample.verdict === "soft") return "Getting soft — ease off the pan.";
  return "Frame is crisp. Hold it on the barcode.";
}
