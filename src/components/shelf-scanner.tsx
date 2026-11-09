import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, Loader2, X } from "lucide-react";
import { judgeShelf } from "@/lib/agents/decide";
import { quotesFor } from "@/lib/market/quote";
import { quoteBookFromPick, stagedUsd } from "@/lib/market/from-judgement";
import { imageDataToRgba, readShelf, releaseOcr, type OcrProgress, type SpineRead } from "@/lib/scan/ocr";
import { resolveSpine, resolveText, type SpineGuess } from "@/lib/scan/resolve";
import { segmentFrame, type SpineBox } from "@/lib/scan/spines";
import { catalogVocabulary } from "@/lib/agents/rag";
import { blurCue, sharpnessOf, watchSharpness, type Sharpness } from "@/lib/scan/blur";
import { toIsbn13 } from "@/lib/geo";
import { useRun } from "@/lib/store";

/**
 * Shelf scanner.
 *
 * Point the phone at a row of spines. The overlay shows what the segmenter thinks is
 * a spine, and "Read shelf" runs OCR on the strongest candidates. Every read is
 * resolved to a book, quoted by every desk, and offered as a take.
 *
 * Barcodes are the fallback, not the method: most spines have no barcode, and the
 * ones that do are on the back cover, which is the side you cannot see while walking
 * a shelf.
 */
type ShelfResult = {
  read: SpineRead;
  guesses: SpineGuess[];
  taken: boolean;
};

const DETECT_INTERVAL_MS = 600;
const DETECT_WIDTH = 320;

export function ShelfScanner({ onVerify }: { onVerify: () => void }) {
  const condition = useRun((s) => s.condition);
  const leaveCount = useRun((s) => s.leaveCount);
  const boxTakes = useRun((s) => s.boxTakes);
  const shelf = useRun((s) => s.shelf);
  const desk = useRun((s) => s.desk);
  const offline = useRun((s) => s.offline);
  const pushPick = useRun((s) => s.pushPick);
  const setQuotes = useRun((s) => s.setQuotes);
  const noteTake = useRun((s) => s.noteTake);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<number | null>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [boxes, setBoxes] = useState<SpineBox[]>([]);
  const [sharpness, setSharpness] = useState<Sharpness | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [results, setResults] = useState<ShelfResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const leavesLeft = Math.max(0, leaveCount - boxTakes);

  const stopCamera = useCallback(() => {
    if (detectRef.current) window.clearInterval(detectRef.current);
    detectRef.current = null;
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setBoxes([]);
    setSharpness(null);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => () => void releaseOcr(), []);

  /** Live segmentation, downscaled: cheap enough to run while you pan. */
  const startDetection = useCallback(() => {
    if (detectRef.current) return;
    detectRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const scale = DETECT_WIDTH / video.videoWidth;
      const canvas = workRef.current ?? document.createElement("canvas");
      workRef.current = canvas;
      canvas.width = DETECT_WIDTH;
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setBoxes(segmentFrame(frame.data, canvas.width, canvas.height, { limit: 8 }));
    }, DETECT_INTERVAL_MS);
  }, []);

  /** Paint the current candidates over the preview. */
  useEffect(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    if (!width || !height) return;
    overlay.width = width;
    overlay.height = height;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    // Boxes are in DETECT_WIDTH space; the overlay is CSS pixels.
    const scale = width / DETECT_WIDTH;
    for (const box of boxes) {
      ctx.strokeStyle = box.score > 0.35 ? "rgba(214,178,94,0.95)" : "rgba(214,178,94,0.45)";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x * scale, 0, Math.max(2, box.w * scale), height);
    }
  }, [boxes]);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setCameraOn(true);
      startDetection();
      const canvas = blurCanvasRef.current ?? document.createElement("canvas");
      blurCanvasRef.current = canvas;
      if (video) stopWatchRef.current = watchSharpness(video, canvas, setSharpness);
    } catch {
      setError("Camera did not start. Check the browser permission and try again.");
      stopCamera();
    }
  }

  async function readCurrentShelf() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("No camera frame yet.");
      return;
    }
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const capture = document.createElement("canvas");
      capture.width = video.videoWidth;
      capture.height = video.videoHeight;
      const ctx = capture.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(video, 0, 0);

      // Segment at detection resolution, then map the boxes back to full resolution
      // so crops are taken from the sharpest frame we have.
      const scale = DETECT_WIDTH / capture.width;
      const small = document.createElement("canvas");
      small.width = DETECT_WIDTH;
      small.height = Math.round(capture.height * scale);
      const smallCtx = small.getContext("2d", { willReadFrequently: true });
      if (!smallCtx) throw new Error("no 2d context");
      smallCtx.drawImage(capture, 0, 0, small.width, small.height);
      const frame = smallCtx.getImageData(0, 0, small.width, small.height);
      const candidates = segmentFrame(frame.data, small.width, small.height, { limit: 6 });
      if (!candidates.length) {
        setError("No spines found. Get closer, fill the frame with the shelf, and keep it steady.");
        setBusy(false);
        return;
      }
      const scaled: SpineBox[] = candidates.map((box) => ({
        x: Math.round(box.x / scale),
        y: 0,
        w: Math.max(6, Math.round(box.w / scale)),
        h: capture.height,
        score: box.score,
      }));

      setProgress({ stage: "loading", progress: 0, detail: "starting the OCR engine" });
      const fullFrame = ctx.getImageData(0, 0, capture.width, capture.height);
      const reads = await readShelf(imageDataToRgba(fullFrame), scaled, setProgress, 6, catalogVocabulary);
      if (!reads.length) {
        setError("Read the frames but no text came back. Try a brighter angle or a steadier hand.");
        setBusy(false);
        return;
      }
      const resolved: ShelfResult[] = [];
      for (const read of reads) {
        const guesses = await resolveSpine(read, { offline });
        resolved.push({ read, guesses, taken: false });
      }
      setResults(resolved);
    } catch {
      setError("Reading failed. The first read has to download the OCR engine once — check the connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  /** Re-resolve a spine after the reader corrects what the engine misheard. */
  async function retry(result: ShelfResult, text: string) {
    setBusy(true);
    try {
      const guesses = await resolveText(text, result.read.confidence, { offline });
      if (!guesses.length) return;
      setResults((current) =>
        current.map((entry) =>
          entry.read.text === result.read.text
            ? { ...entry, guesses, read: { ...entry.read, text } }
            : entry,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function take(result: ShelfResult, guess: SpineGuess) {
    const read = guess.isbn ? toIsbn13(guess.isbn) : null;
    const isbn = read ?? `ocr-${hash(result.read.text)}`;
    const pick = judgeShelf({
      isbn,
      title: guess.title,
      author: guess.author,
      subjects: guess.subject ? [guess.subject] : [],
      condition,
      leavesLeft,
      net: shelf,
    });
    pushPick(pick);
    setQuotes(quotesFor(quoteBookFromPick(pick), stagedUsd(desk)));
    if (pick.decision === "take") noteTake();
    setResults((current) =>
      current.map((entry) => (entry.read.text === result.read.text ? { ...entry, taken: true } : entry)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <div className="relative h-72 w-full bg-bg">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
          {!cameraOn ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <p className="text-sm text-muted">
                Point the camera at a row of spines. Brass boxes are the spines it can see.
              </p>
            </div>
          ) : null}
        </div>
        <div className="grid gap-2 border-t border-border px-3 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-muted">
              <BookOpen className="size-4" />
              {cameraOn ? `${boxes.length} spine${boxes.length === 1 ? "" : "s"} in view` : "Camera off"}
            </span>
            <span className="tabular-nums text-muted">
              {sharpness ? `focus ${Math.round(sharpness.score * 100)}%` : ""}
            </span>
          </div>
          {cameraOn && sharpness && sharpness.verdict !== "sharp" ? (
            <p className="text-xs text-accent">{blurCue(sharpness)}</p>
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
                Camera
              </button>
            )}
            <button
              type="button"
              disabled={!cameraOn || busy}
              onClick={() => void readCurrentShelf()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <BookOpen className="size-4" />}
              {busy ? "Reading" : "Read shelf"}
            </button>
          </div>
          {progress ? (
            <div className="grid gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.progress}%` }} />
              </div>
              <p className="text-xs text-muted">
                {progress.stage === "loading"
                  ? `Loading the OCR engine — ${progress.detail} ${progress.progress}% (first read only)`
                  : progress.detail}
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          <p className="text-xs text-muted">
            Reading happens on this phone with a Tesseract model that ships with the app. The first read of a session loads it, about 7 MB, then it stays cached.
          </p>
        </div>
      </div>

      {results.length ? (
        <section className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg">Read off the shelf</h3>
            <button type="button" onClick={onVerify} className="text-sm font-semibold text-accent">
              Verify a barcode
            </button>
          </div>
          {results.map((result) => (
            <SpineCard
              key={result.read.text + result.read.box.x}
              result={result}
              leavesLeft={leavesLeft}
              onTake={take}
              onRetry={(text) => void retry(result, text)}
              onDismiss={() =>
                setResults((current) => current.filter((entry) => entry.read.text !== result.read.text))
              }
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function SpineCard({
  result,
  leavesLeft,
  onTake,
  onRetry,
  onDismiss,
}: {
  result: ShelfResult;
  leavesLeft: number;
  onTake: (result: ShelfResult, guess: SpineGuess) => void;
  onRetry: (text: string) => void;
  onDismiss: () => void;
}) {
  const [choice, setChoice] = useState(0);
  const [draft, setDraft] = useState(result.read.text);
  const guess = result.guesses[choice];
  if (!guess) return null;
  return (
    <article className="grid gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            OCR {result.read.confidence}% · {result.read.rotation}°
          </p>
          <h4 className="text-base leading-tight">{guess.title || "Unreadable"}</h4>
          <p className="text-sm text-muted">
            {guess.author || "no author read"}
            {guess.isbn ? ` · ${guess.isbn}` : ""}
          </p>
        </div>
        {result.taken ? <Check className="size-5 text-primary" /> : null}
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-muted">What the camera read — edit it if it misheard</span>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-border bg-bg px-2 text-xs text-fg outline-none"
            aria-label="Corrected spine text"
          />
          <button
            type="button"
            disabled={draft.trim() === result.read.text.trim() || !draft.trim()}
            onClick={() => onRetry(draft)}
            className="h-10 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-40"
          >
            Find book
          </button>
        </div>
      </label>
      <p className="text-xs text-muted">
        Matched by {labelFor(guess.source)}
        {guess.similarity ? ` · ${Math.round(guess.similarity * 100)}%` : ""}
        {result.read.confidence < 55 ? " · low confidence, check the title" : ""}
      </p>
      {result.guesses.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {result.guesses.map((option, index) => (
            <button
              key={option.title + index}
              type="button"
              onClick={() => setChoice(index)}
              className={`h-8 rounded-full border px-2 text-xs font-semibold ${index === choice ? "border-primary bg-primary text-primary-fg" : "border-border text-fg"}`}
            >
              {option.title.slice(0, 22) || option.source}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={result.taken || leavesLeft <= 0}
          onClick={() => onTake(result, guess)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-fg disabled:opacity-50"
        >
          {result.taken ? "Added" : leavesLeft <= 0 ? "No replacement" : "Take it"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
        >
          <X className="size-4" />
          Not this
        </button>
      </div>
    </article>
  );
}

function labelFor(source: SpineGuess["source"]): string {
  if (source === "isbn") return "ISBN read off the spine";
  if (source === "catalog") return "the bundled catalog";
  if (source === "openlibrary") return "Open Library";
  return "the raw text only";
}

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
