import { useEffect, useRef, useState } from "react";
import { Camera, Gauge, ScanLine } from "lucide-react";
import { blurCue, sharpnessOf, watchSharpness, type Sharpness } from "@/lib/scan/blur";

/**
 * Barcode verifier.
 *
 * Not the primary way to read a shelf: spines rarely carry a barcode, and the one
 * that matters is on the back cover. This is the confirmation step — when OCR has
 * guessed a title and you want certainty, or when a spine reads as nothing at all.
 */
export function BarcodeVerify({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [gate, setGate] = useState(true);
  const [sample, setSample] = useState<Sharpness | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cameraOn || !gate) return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    stopWatchRef.current = watchSharpness(video, canvas, setSample);
    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
  }, [cameraOn, gate]);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopWatchRef.current?.();
    },
    [],
  );

  async function startCamera() {
    setCameraOn(true);
    setError("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result, _err, controls) => {
          const text = result?.getText();
          if (!text) return;
          if (gate) {
            const canvas = canvasRef.current ?? document.createElement("canvas");
            canvasRef.current = canvas;
            const now = videoRef.current ? sharpnessOf(videoRef.current, canvas) : null;
            if (now) setSample(now);
            if (now && now.verdict === "blurry") {
              setError("Blurry frame — hold still and try again.");
              return;
            }
          }
          controls.stop();
          stopRef.current = null;
          setCameraOn(false);
          onCode(text);
        },
      );
      stopRef.current = () => controls.stop();
    } catch {
      setCameraOn(false);
      setError("Camera did not start. Type the ISBN instead.");
    }
  }

  function stopCamera() {
    stopRef.current?.();
    stopRef.current = null;
    setCameraOn(false);
  }

  return (
    <div className="grid gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <ScanLine className="size-4 text-primary" />
        <h3 className="text-lg">Verify by barcode</h3>
      </div>
      <p className="text-sm text-muted">
        For confirming a read, or for a spine the camera could not read. The blur gate drops decodes that land on motion blur.
      </p>
      {cameraOn ? <video ref={videoRef} className="h-44 w-full rounded-xl bg-bg object-cover" muted playsInline /> : null}
      {cameraOn && gate ? (
        <div className="grid gap-1 rounded-xl border border-border bg-bg px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-muted">
              <Gauge className="size-4" /> Frame gate
            </span>
            <span className="tabular-nums text-fg">{sample ? `${Math.round(sample.score * 100)}%` : "—"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full ${sample?.verdict === "sharp" ? "bg-primary" : sample?.verdict === "soft" ? "bg-accent" : "bg-muted"}`}
              style={{ width: `${Math.round((sample?.score ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted">{sample ? blurCue(sample) : "Waiting for a frame."}</p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {cameraOn ? (
          <button type="button" onClick={stopCamera} className="h-11 rounded-xl border border-border text-sm font-semibold">
            Stop camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
          >
            <Camera className="size-4" />
            Scan barcode
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={gate} onChange={(event) => setGate(event.target.checked)} className="size-5 accent-primary" />
          Blur gate
        </label>
      </div>
      {error ? <p className="text-sm text-primary">{error}</p> : null}
    </div>
  );
}
