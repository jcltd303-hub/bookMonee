import { useState } from "react";
import { Keyboard } from "lucide-react";
import { books } from "@/lib/catalog";
import { judgeShelf } from "@/lib/agents/decide";
import { demandByIsbn } from "@/lib/agents/rag";
import { lookupBook, isOffline } from "@/lib/catalog/lookup";
import { quotesFor, UNIT_COST_USD } from "@/lib/market/quote";
import { quoteBookFromPick, stagedUsd } from "@/lib/market/from-judgement";
import { comparatorUrl } from "@/data/buyers";
import { formatUsd, toIsbn13 } from "@/lib/geo";
import { useRun } from "@/lib/store";
import { BarcodeVerify } from "@/components/barcode-verify";
import { ShelfScanner } from "@/components/shelf-scanner";
import type { BuyerQuote, Judgement, QuoteBook } from "@/lib/types";

/**
 * Scan tab.
 *
 * The shelf is the input, not the barcode. Camera frames go through spine
 * segmentation and OCR; a barcode is the confirmation path, and manual entry is the
 * last resort. Everything here runs on the phone.
 */
export function ScanTab() {
  const condition = useRun((s) => s.condition);
  const leaveCount = useRun((s) => s.leaveCount);
  const boxTakes = useRun((s) => s.boxTakes);
  const shelf = useRun((s) => s.shelf);
  const picks = useRun((s) => s.picks);
  const desk = useRun((s) => s.desk);
  const offline = useRun((s) => s.offline);
  const quotes = useRun((s) => s.quotes);
  const setCondition = useRun((s) => s.setCondition);
  const setLeaveCount = useRun((s) => s.setLeaveCount);
  const setOffline = useRun((s) => s.setOffline);
  const pushPick = useRun((s) => s.pushPick);
  const setQuotes = useRun((s) => s.setQuotes);
  const noteTake = useRun((s) => s.noteTake);
  const resetBox = useRun((s) => s.resetBox);
  const stage = useRun((s) => s.stage);

  const [mode, setMode] = useState<"shelf" | "barcode">("shelf");
  const [isbn, setIsbn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const top = books.books[0];
  const novel = books.books.find((book) => book.lane === "trade");
  const leavesLeft = Math.max(0, leaveCount - boxTakes);

  async function judgeIsbn(raw: string) {
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
        leavesLeft,
        net: shelf,
      });
      pushPick(pick);
      setQuotes(quotesFor(quoteBookFromPick(pick), stagedUsd(desk)));
      if (pick.decision === "take") noteTake();
      setIsbn(code);
    } catch {
      setError("Lookup failed. The prior list still works if you retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl">Shelf</h2>
          <span className="text-sm tabular-nums text-muted">{leavesLeft} replacements left</span>
        </div>
        <p className="text-sm text-muted">
          Pan across the spines. Each one is read on device, matched to a book, and quoted by every desk before you pick it up.
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("shelf")}
            className={`h-10 rounded-xl border text-sm font-semibold ${mode === "shelf" ? "border-primary text-fg" : "border-border text-muted"}`}
          >
            Read spines
          </button>
          <button
            type="button"
            onClick={() => setMode("barcode")}
            className={`h-10 rounded-xl border text-sm font-semibold ${mode === "barcode" ? "border-primary text-fg" : "border-border text-muted"}`}
          >
            Barcode
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} className="size-5 accent-primary" />
          On-device only (skip Open Library)
        </label>
        <button type="button" onClick={resetBox} className="h-9 rounded-xl border border-border text-sm font-semibold text-muted">
          New box
        </button>
      </section>

      {mode === "shelf" ? <ShelfScanner onVerify={() => setMode("barcode")} /> : <BarcodeVerify onCode={(code) => void judgeIsbn(code)} />}

      <details className="rounded-xl border border-border bg-surface p-4" open={mode === "barcode"}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Keyboard className="size-4" />
          Type an ISBN
        </summary>
        <form
          className="mt-3 grid grid-cols-[1fr_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void judgeIsbn(isbn);
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
        {error ? <p className="mt-2 text-sm text-primary">{error}</p> : null}
        {source ? (
          <p className="mt-2 text-xs text-muted">
            Resolved {source === "on-device" ? "from the bundled catalog" : source === "cache" ? "from this phone's cache" : source === "openlibrary" ? "from Open Library, direct from the browser" : "nowhere — no catalog hit"}.
          </p>
        ) : null}
        <div className="mt-3 grid gap-2">
          {top ? (
            <button type="button" onClick={() => void judgeIsbn(top.isbn13)} className="h-11 rounded-xl border border-border px-3 text-left text-sm">
              Try a high prior · {top.title}
            </button>
          ) : null}
          {novel ? (
            <button type="button" onClick={() => void judgeIsbn(novel.isbn13)} className="h-11 rounded-xl border border-border px-3 text-left text-sm">
              Try a leave · {novel.title}
            </button>
          ) : null}
        </div>
      </details>

      {quotes.length && picks[0] ? (
        <QuoteBench
          book={quoteBookFromPick(picks[0])}
          quotes={quotes}
          onStage={(quote) =>
            stage(quote.buyerId, {
              isbn: picks[0].isbn,
              title: picks[0].title,
              offerUsd: quote.offerUsd,
              demandUsd: picks[0].priorUsd,
              lane: picks[0].lane,
              condition: picks[0].condition,
            })
          }
        />
      ) : null}

      <section className="grid gap-2">
        <h2 className="text-xl">This shelf</h2>
        {picks.length === 0 ? <p className="text-sm text-muted">Nothing read yet.</p> : null}
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
  onStage,
}: {
  book: QuoteBook;
  quotes: BuyerQuote[];
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
        {book.title || book.isbn} · cost is a flat {formatUsd(UNIT_COST_USD)} a copy. Spread is what the desk pays minus that cost, before packaging.
      </p>
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
  const isbnLike = /^\d{10,13}$/.test(pick.isbn);
  return (
    <article className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-border bg-surface p-3">
      {cover && isbnLike ? (
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
        {isbnLike ? (
          <a href={comparatorUrl(pick.isbn)} className="text-sm font-semibold text-accent">
            Compare live buyback quotes
          </a>
        ) : null}
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
