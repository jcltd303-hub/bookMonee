import { useMemo } from "react";
import { PackageOpen, Trash2, Truck } from "lucide-react";
import { buyers } from "@/data/buyers";
import { UNIT_COST_USD } from "@/lib/market/quote";
import { packBins } from "@/lib/market/pack";
import { formatUsd } from "@/lib/geo";
import { useRun } from "@/lib/store";
import type { Bin, DeskItem, QuoteBook } from "@/lib/types";

export function DeskTab() {
  const picks = useRun((s) => s.picks);
  const desk = useRun((s) => s.desk);
  const stage = useRun((s) => s.stage);
  const unstage = useRun((s) => s.unstage);
  const flushBin = useRun((s) => s.flushBin);
  const clearDesk = useRun((s) => s.clearDesk);

  const staged: Bin[] = useMemo(() => {
    const bins = buyers
      .map((buyer) => {
        const items = desk[buyer.id] ?? [];
        const stagedUsd = round(items.reduce((sum, item) => sum + item.offerUsd, 0));
        const clearsThreshold = stagedUsd >= buyer.thresholdUsd;
        const costUsd = round(items.length * UNIT_COST_USD);
        return {
          buyerId: buyer.id,
          buyerName: buyer.name,
          items,
          stagedUsd,
          thresholdUsd: buyer.thresholdUsd,
          costUsd,
          frictionUsd: clearsThreshold ? buyer.frictionUsd : 0,
          netUsd: round(stagedUsd - costUsd - (clearsThreshold ? buyer.frictionUsd : 0)),
          clearsThreshold,
          gapUsd: Math.max(0, round(buyer.thresholdUsd - stagedUsd)),
        } satisfies Bin;
      })
      .filter((bin) => bin.items.length > 0);
    return bins;
  }, [desk]);

  const plan = useMemo(() => {
    const shelfBooks: QuoteBook[] = picks.map((pick) => ({
      isbn: pick.isbn,
      title: pick.title,
      demandUsd: pick.priorUsd,
      lane: pick.lane,
      condition: pick.condition,
    }));
    return packBins(shelfBooks, desk);
  }, [picks, desk]);

  const stagedNet = round(staged.reduce((sum, bin) => sum + bin.netUsd, 0));
  const stagedGross = round(staged.reduce((sum, bin) => sum + bin.stagedUsd, 0));

  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xl">The desk</h2>
        <p className="text-sm text-muted">
          Books are worth nothing until a prepaid label clears. The packer sorts every scanned copy into the desk that pays best, then pads the cheap ones in to reach each label minimum.
        </p>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">Staged</dt>
            <dd className="tabular-nums text-lg">{formatUsd(stagedGross)}</dd>
          </div>
          <div>
            <dt className="text-muted">After cost</dt>
            <dd className="tabular-nums text-lg text-primary">{formatUsd(stagedNet)}</dd>
          </div>
          <div>
            <dt className="text-muted">Bins</dt>
            <dd className="tabular-nums text-lg">{staged.length}</dd>
          </div>
        </dl>
        {staged.length ? (
          <button type="button" onClick={clearDesk} className="h-10 rounded-xl border border-border text-sm font-semibold text-muted">
            Empty every bin
          </button>
        ) : null}
      </section>

      {staged.length ? (
        <section className="grid gap-2">
          <h2 className="text-xl">Bins waiting on a label</h2>
          {staged.map((bin) => (
            <article key={bin.buyerId} className="grid gap-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{bin.buyerName}</span>
                <span className="tabular-nums text-sm text-primary">{formatUsd(bin.stagedUsd)}</span>
              </div>
              {bin.thresholdUsd > 0 ? (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full ${bin.clearsThreshold ? "bg-primary" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, Math.round((bin.stagedUsd / bin.thresholdUsd) * 100))}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted tabular-nums">
                    {bin.clearsThreshold
                      ? `Label clears at ${formatUsd(bin.thresholdUsd)} · net ${formatUsd(bin.netUsd)}`
                      : `${formatUsd(bin.gapUsd)} short of the ${formatUsd(bin.thresholdUsd)} label`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">No published minimum · net {formatUsd(bin.netUsd)}</p>
              )}
              <ul className="grid gap-1">
                {bin.items.map((item) => (
                  <li key={item.isbn} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{item.title || item.isbn}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-muted">{formatUsd(item.offerUsd)}</span>
                      <button type="button" onClick={() => unstage(bin.buyerId, item.isbn)} aria-label={`Remove ${item.title}`} className="text-muted">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => flushBin(bin.buyerId)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-fg"
              >
                <Truck className="size-4" />
                {bin.clearsThreshold ? `Ship and log ${formatUsd(bin.stagedUsd)}` : `Ship anyway (rejected, −${formatUsd(bin.stagedUsd)})`}
              </button>
            </article>
          ))}
        </section>
      ) : null}

      {plan.hints.length ? (
        <section className="grid gap-2 rounded-xl border border-border bg-surface-2 p-4">
          <h2 className="text-lg">Padding</h2>
          {plan.hints.map((hint) => (
            <p key={hint.buyerId} className="text-sm text-fg">
              {hint.text}
            </p>
          ))}
        </section>
      ) : null}

      <section className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl">What the packer would do</h2>
          <span className="text-sm tabular-nums text-muted">
            {picks.length} scanned · net {formatUsd(plan.netUsd)}
          </span>
        </div>
        <p className="text-sm text-muted">
          Gross {formatUsd(plan.grossUsd)} − {formatUsd(plan.costUsd)} at 99¢ a copy − {formatUsd(plan.frictionUsd)} packaging = {formatUsd(plan.netUsd)}.
        </p>
        {picks.length === 0 ? (
          <p className="text-sm text-muted">Scan a shelf first. The packer needs books before it can sort them.</p>
        ) : null}
        {plan.bins.map((bin) => {
          const stagedIds = new Set((desk[bin.buyerId] ?? []).map((item) => item.isbn));
          const fresh = bin.items.filter((item) => !stagedIds.has(item.isbn));
          return (
            <article key={bin.buyerId} className="grid gap-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{bin.buyerName}</span>
                <span className="tabular-nums text-sm">{formatUsd(bin.stagedUsd)}</span>
              </div>
              <p className="text-sm text-muted">
                {bin.items.length} book{bin.items.length === 1 ? "" : "s"} ·{" "}
                {bin.clearsThreshold ? "label clears" : `${formatUsd(bin.gapUsd)} short`} · net {formatUsd(bin.netUsd)}
              </p>
              {fresh.length ? (
                <button
                  type="button"
                  onClick={() => fresh.forEach((item: DeskItem) => stage(bin.buyerId, item))}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
                >
                  <PackageOpen className="size-4" />
                  Stage {fresh.length} book{fresh.length === 1 ? "" : "s"}
                </button>
              ) : (
                <p className="text-sm text-primary">Already staged.</p>
              )}
            </article>
          );
        })}
        {plan.skipped.length ? (
          <details className="rounded-xl border border-border bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Skipped ({plan.skipped.length})</summary>
            <ul className="mt-2 grid gap-1 text-muted">
              {plan.skipped.map((entry) => (
                <li key={entry.isbn}>
                  {entry.title || entry.isbn} · best {formatUsd(entry.bestOfferUsd)} · {entry.why}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="grid gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        <h2 className="text-lg text-fg">Why 99¢ matters</h2>
        <p>
          With a flat {formatUsd(UNIT_COST_USD)} acquisition cost the trade is pure spread: a copy has to beat 99¢ plus its share of packaging, and any quote under that is a pass no matter how good the book looks.
        </p>
        <p>
          The packer only stages a book that beats cost, then uses the near-worthless quotes as padding to reach a label minimum. That is why a $2 paperback is worth taking when it unlocks a $7.50 label, and worthless otherwise.
        </p>
      </section>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
