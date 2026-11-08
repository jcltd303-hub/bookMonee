import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Gauge } from "lucide-react";
import { books } from "@/lib/catalog";
import { judgeShelf } from "@/lib/agents/decide";
import { demandByIsbn } from "@/lib/agents/rag";
import { lookupBook, isOffline } from "@/lib/catalog/lookup";
import { blurCue, sharpnessOf, watchSharpness, type Sharpness } from "@/lib/scan/blur";
import { quotesFor, offerFrom, UNIT_COST_USD } from "@/lib/market/quote";
import { buyers, comparatorUrl } from "@/data/buyers";
import { actionLabel, greedy } from "@/lib/agents/qlearn";
import { featuresOf, makeEnv } from "@/lib/agents/sim";
import { formatUsd, toIsbn13 } from "@/lib/geo";
import { useRun } from "@/lib/store";
import type { BuyerQuote, Judgement, QuoteBook } from "@/lib/types";

export function ScanTab() {
  const condition = useRun((s) => s.condition);
  const leaveCount = useRun((s) => s.leaveCount);
  const shelf = useRun((s) => s.shelf);
  const picks = useRun((s) => s.picks);
  const desk = useRun((s) => s.desk);
  const q = useRun((s) => s.q);
  const offline = useRun((s) => s.offline);
  const quotes = useRun((s) => s.quotes);
  const setCondition = useRun((s) => s.setCondition);
  const setLeaveCount = useRun((s) => s.setLeaveCount);
  const setOffline = useRun((s) => s.setOffline);
  const pushPick = useRun((s) => s.pushPick);
  const setQuotes = useRun((s) => s.setQuotes);
  const stage = useRun((s) => s.stage);
  const [isbn, setIsbn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [gate, setGate] = useState(true);
  const [sample, setSample] = useState<Sharpness | null>(null);
  const [sessionTakes, setSessionTakes] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const top = books.books[0];
  const novel = books.books.find((book) => book.lane === "trade");

  useEffect(() => {
    if (!cameraOn || !gate) return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    return watchSharpness(video, canvas, setSample);
  }, [cameraOn, gate]);

  async function judge(raw: string) {
    const code = toIsbn13(raw);
    if (!code) {
      setError("That is not a 10 or 13 digit ISBN.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const meta = await lookupBook(code, { offline: offline || isOffline() });
      setSource(meta.source);
      const known = demandByIsbn(code);
      const pick = judgeShelf({
        isbn: code,
        title: meta.title || known?.title || "",
        author: meta.author || known?.author || "",
        subjects: meta.subjects.length ? meta.subjects : known ? [known.subject] : [],
        condition,
        leavesLeft: Math.max(0, leaveCount - sessionTakes),
        net: shelf,
      });
      if (pick.decision === "take") setSessionTakes((count) => count + 1);
      pushPick(pick);
      setIsbn(code);
      setQuotes(quotesFor(bookOf(pick), stagedUsd(desk)));
    } catch {
      setError("Lookup failed. The prior list still works if you retry.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setCameraOn(true);
    setError("");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        const text = result?.getText();
        if (!text) return;
        if (gate) {
          const canvas = canvasRef.current ?? document.createElement("canvas");
          canvasRef.current = canvas;
          const now = videoRef.current ? sharpnessOf(videoRef.current, canvas) : null;
          if (now && now.verdict === "blurry") {
            setSample(now);
            setError("Blurry frame — hold still and sweep again.");
            return;
          }
          if (now) setSample(now);
        }
        controls.stop();
        stopRef.current = null;
        setCameraOn(false);
        void judge(text);
      });
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

  const agentCall = useMemo(() => {
    if (!quotes.length) return null;
    const book = picks[0] ? bookOf(picks[0]) : null;
    if (!book) return null;
    const env = makeEnv();
    for (const buyer of buyers) {
      const list = desk[buyer.id] ?? [];
      const index = buyers.findIndex((entry) => entry.id === buyer.id);
      env.bins[index] = list.reduce((sum, item) => sum + item.offerUsd, 0);
      env.counts[index] = list.length;
    }
    const offers = buyers.map((buyer) => offerFrom(book, buyer));
    const action = greedy(q, featuresOf({ offers }, env));
    return { action, label: actionLabel(action) };
  }, [quotes, picks, desk, q]);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xl">Shelf</h2>
        <p className="text-sm text-muted">
          Scan a spine barcode. The gate throws away blurry frames, the lookup runs on this phone first, and every desk quotes the copy before you pick it up.
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Replacements in your bag</span>
          <span className="flex items-center gap-2">
            <button type="button" className="size-11 rounded-xl border border-border text-lg" onClick={() => setLeaveCount(Math.max(0, leaveCount - 1))} aria-label="Fewer replacements">
              −
            </button>
            <span className="w-6 text-center tabular-nums">{leaveCount}</span>
            <button type="button" className="size-11 rounded-xl border border-border text-lg" onClick={() => setLeaveCount(Math.min(8, leaveCount + 1))} aria-label="More replacements">
              +
            </button>
          </span>
        </div>
        <p className="text-sm text-muted tabular-nums">{Math.max(0, leaveCount - sessionTakes)} still unused this box</p>
        <div className="grid grid-cols-3 gap-2">
          {(["good", "fair", "poor"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCondition(value)}
              className={`h-11 rounded-xl border text-sm font-semibold capitalize ${condition === value ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface-2 text-fg"}`}
            >
              {value}
            </button>
          ))}
        </div>
        {cameraOn ? <video ref={videoRef} className="h-48 w-full rounded-xl bg-bg object-cover" muted playsInline /> : null}
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
            <button type="button" onClick={() => void startCamera()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold">
              <Camera className="size-4" />
              Camera
            </button>
          )}
          <button type="button" onClick={() => setSessionTakes(0)} className="h-11 rounded-xl border border-border text-sm font-semibold">
            New box
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={gate} onChange={(event) => setGate(event.target.checked)} className="size-5 accent-primary" />
            Blur gate
          </label>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} className="size-5 accent-primary" />
            On-device only
          </label>
        </div>
        <form
          className="grid grid-cols-[1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void judge(isbn);
          }}
        >
          <input
            value={isbn}
            onChange={(event) => setIsbn(event.target.value)}
            inputMode="numeric"
            placeholder="ISBN"
            aria-label="ISBN"
            className="h-11 rounded-xl border border-border bg-bg px-3 text-fg outline-none"
          />
          <button type="submit" disabled={busy} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-60">
            {busy ? "Checking" : "Check"}
          </button>
        </form>
        {error ? <p className="text-sm text-primary">{error}</p> : null}
        {source ? (
          <p className="text-xs text-muted">
            Resolved {source === "on-device" ? "from the bundled catalog" : source === "cache" ? "from this phone's cache" : source === "openlibrary" ? "from Open Library, direct from the browser" : "nowhere — no catalog hit"}.
          </p>
        ) : null}
        <div className="grid gap-2">
          {top ? (
            <button type="button" onClick={() => void judge(top.isbn13)} className="h-11 rounded-xl border border-border px-3 text-left text-sm">
              Try a high prior · {top.title}
            </button>
          ) : null}
          {novel ? (
            <button type="button" onClick={() => void judge(novel.isbn13)} className="h-11 rounded-xl border border-border px-3 text-left text-sm">
              Try a leave · {novel.title}
            </button>
          ) : null}
        </div>
      </section>

      {quotes.length && picks[0] ? (
        <QuoteBench
          book={bookOf(picks[0])}
          quotes={quotes}
          agentCall={agentCall}
          onStage={(quote) => stage(quote.buyerId, itemOf(picks[0], quote.offerUsd))}
        />
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-xl">This shelf</h2>
        {picks.length === 0 ? <p className="text-sm text-muted">Nothing scanned yet.</p> : null}
        {picks.map((pick) => (
          <PickCard key={pick.isbn} pick={pick} />
        ))}
      </section>
      <DemandList />
    </div>
  );
}

function QuoteBench({
  book,
  quotes,
  agentCall,
  onStage,
}: {
  book: QuoteBook;
  quotes: BuyerQuote[];
  agentCall: { action: number; label: string } | null;
  onStage: (quote: BuyerQuote) => void;
}) {
  const best = quotes.find((quote) => quote.offerUsd > 0 && quote.netUsd > 0);
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl">Desk quotes</h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">modelled</span>
      </div>
      <p className="text-sm text-muted">
        Cost is a flat {formatUsd(UNIT_COST_USD)} a copy. Spread is what the desk pays minus that cost, before packaging.
      </p>
      {agentCall ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg">
          Agent says <span className="font-semibold">{agentCall.label}</span> for this copy.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {quotes.map((quote) => {
          const isBest = best?.buyerId === quote.buyerId;
          return (
            <li key={quote.buyerId} className={`grid gap-1 rounded-xl border p-3 ${isBest ? "border-primary" : "border-border"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{quote.buyerName}</span>
                <span className={`tabular-nums ${quote.netUsd > 0 ? "text-primary" : "text-muted"}`}>
                  {quote.offerUsd > 0 ? `${formatUsd(quote.offerUsd)} · ${quote.netUsd > 0 ? "+" : ""}${formatUsd(quote.netUsd)}` : "no quote"}
                </span>
              </div>
              <p className="text-sm text-muted">
                {quote.thresholdUsd > 0
                  ? `${formatUsd(quote.stagedUsd)} staged · ${quote.gapUsd > 0 ? `${formatUsd(quote.gapUsd)} to the label` : "label already clears"}`
                  : "no published label minimum"}
              </p>
              {quote.offerUsd > 0 && quote.netUsd > 0 ? (
                <button type="button" onClick={() => onStage(quote)} className="mt-1 h-9 rounded-lg border border-border text-sm font-semibold">
                  Stage to {quote.buyerName}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <a href={comparatorUrl(book.isbn)} className="text-sm font-semibold text-accent">
        Check a real quote before shipping
      </a>
    </section>
  );
}

function PickCard({ pick }: { pick: Judgement }) {
  const [cover, setCover] = useState(true);
  return (
    <article className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border bg-surface p-3">
      {cover ? (
        <img
          src={pick.coverUrl}
          alt=""
          crossOrigin="anonymous"
          className="h-20 w-14 rounded-md object-cover"
          onError={() => setCover(false)}
        />
      ) : (
        <div className="h-20 w-14 rounded-md bg-surface-2" />
      )}
      <div className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{pick.decision}</p>
        <h3 className="text-lg leading-tight">{pick.title}</h3>
        <p className="text-sm text-muted">{pick.author}</p>
        <p className="text-sm tabular-nums">
          {formatUsd(pick.scoreUsd)} expected · band {formatUsd(pick.lowUsd)}–{formatUsd(pick.highUsd)}
        </p>
        <p className="text-sm text-muted">{pick.reason}</p>
        {pick.similar.length ? (
          <p className="text-sm text-muted">
            Similar demand: {pick.similar.map((item) => `${item.title} (${Math.round(item.sim * 100)}%)`).join(", ")}
          </p>
        ) : null}
        <a href={comparatorUrl(pick.isbn)} className="text-sm font-semibold text-accent">
          Compare live buyback quotes
        </a>
      </div>
    </article>
  );
}

function DemandList() {
  return (
    <section className="grid gap-2">
      <h2 className="text-xl">Demand priors</h2>
      <p className="text-sm text-muted">{books.meta.note}</p>
      <ol className="grid gap-2">
        {books.books.map((book) => (
          <li key={book.isbn13} className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {book.rank}. {book.title}
              </span>
              <span className="tabular-nums text-primary">{formatUsd(book.expectedUsd)}</span>
            </p>
            <p className="text-sm text-muted">
              {book.author} · {book.subject} · {formatUsd(book.lowUsd)}–{formatUsd(book.highUsd)} · check {book.checkOrder[0]}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function bookOf(pick: Judgement): QuoteBook {
  return {
    isbn: pick.isbn,
    title: pick.title,
    demandUsd: pick.priorUsd,
    lane: pick.lane,
    condition: pick.condition,
  };
}

function itemOf(pick: Judgement, offerUsd: number) {
  return {
    isbn: pick.isbn,
    title: pick.title,
    offerUsd,
    demandUsd: pick.priorUsd,
    lane: pick.lane,
    condition: pick.condition,
  };
}

function stagedUsd(desk: Record<string, { offerUsd: number }[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [buyerId, list] of Object.entries(desk)) {
    totals[buyerId] = Math.round(list.reduce((sum, item) => sum + item.offerUsd, 0) * 100) / 100;
  }
  return totals;
}
