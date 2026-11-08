import { useState } from "react";
import { Brain, Play } from "lucide-react";
import { buyers, buyerName } from "@/data/buyers";
import { policyTable } from "@/lib/agents/qlearn";
import { formatUsd } from "@/lib/geo";
import { useRun } from "@/lib/store";

export function TrainTab() {
  const payouts = useRun((s) => s.payouts);
  const walker = useRun((s) => s.walker);
  const shelf = useRun((s) => s.shelf);
  const memory = useRun((s) => s.memory);
  const picks = useRun((s) => s.picks);
  const route = useRun((s) => s.route);
  const activeStopId = useRun((s) => s.activeStopId);
  const logPayout = useRun((s) => s.logPayout);
  const q = useRun((s) => s.q);
  const qProgress = useRun((s) => s.qProgress);
  const qRunning = useRun((s) => s.qRunning);
  const trainQ = useRun((s) => s.trainQ);
  const lastTake = picks.find((pick) => pick.decision === "take");
  const leg = route.find((item) => item.stop.id === activeStopId) ?? route[0];
  const [usd, setUsd] = useState("");
  const [buyerId, setBuyerId] = useState(buyers[0].id);
  const [accepted, setAccepted] = useState(true);
  const [isbn, setIsbn] = useState(lastTake?.isbn ?? "");
  const [title, setTitle] = useState(lastTake?.title ?? "");
  const boxes = Object.entries(memory).sort((a, b) => b[1].reward - a[1].reward);
  const earned = payouts.reduce((sum, payout) => sum + payout.usd, 0);
  const policy = policyTable(q);

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          <h2 className="text-xl">Trading agent</h2>
        </div>
        <p className="text-sm text-muted">
          Q-learning over three actions — skip, stage to the best desk, or ship the ready bin. The packer picks which desk, because the agent cannot see five desks at once; it decides whether a copy is worth the 99¢ at all. It trains here on this phone against a simulated market, because one real shelf a day is far too little signal to learn from.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Shelves simulated</dt>
            <dd className="tabular-nums text-lg">{q.episodes.toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt className="text-muted">Updates</dt>
            <dd className="tabular-nums text-lg">{q.steps.toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt className="text-muted">Mean reward / shelf</dt>
            <dd className="tabular-nums text-lg">{formatUsd(q.avgReward)}</dd>
          </div>
          <div>
            <dt className="text-muted">Exploration ε</dt>
            <dd className="tabular-nums text-lg">{q.eps.toFixed(3)}</dd>
          </div>
        </dl>
        {qRunning || qProgress > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary" style={{ width: `${qProgress}%` }} />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={qRunning}
            onClick={() => void trainQ(600)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
          >
            <Play className="size-4" />
            Train 600
          </button>
          <button
            type="button"
            disabled={qRunning}
            onClick={() => void trainQ(3000)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-fg disabled:opacity-60"
          >
            {qRunning ? "Training" : "Train 3,000"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-normal">Situation</th>
              <th className="font-normal">Policy</th>
            </tr>
          </thead>
          <tbody>
            {policy.map((row) => (
              <tr key={row.label}>
                <td className="py-1 text-muted">{row.label}</td>
                <td className="py-1 font-semibold">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Weights live in this browser's storage. Ship a bin on the Desk tab and that real outcome becomes a training step.
        </p>
      </section>

      <section className="grid gap-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xl">Route priors</h2>
        <p className="text-sm text-muted">
          Two small residual nets correct the walker's distance-and-demand guess and the shelf's condition guess from the cash you actually receive. They are the cheap prior under the trading agent, not the decision maker.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Walker steps</dt>
            <dd className="tabular-nums text-lg">{walker.steps}</dd>
          </div>
          <div>
            <dt className="text-muted">Shelf steps</dt>
            <dd className="tabular-nums text-lg">{shelf.steps}</dd>
          </div>
          <div>
            <dt className="text-muted">Logged cash</dt>
            <dd className="tabular-nums text-lg">{formatUsd(earned)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last shelf loss</dt>
            <dd className="tabular-nums text-lg">{shelf.lastLoss.toFixed(3)}</dd>
          </div>
        </dl>
      </section>

      <form
        className="grid gap-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = Number(usd);
          if (!isbn || Number.isNaN(amount)) return;
          const pick = picks.find((item) => item.isbn === isbn);
          logPayout({
            isbn,
            title: title || pick?.title || isbn,
            usd: amount,
            buyerId,
            accepted,
            stopId: leg?.stop.id ?? "",
            miles: leg?.miles ?? 0,
            features: pick?.features,
            heuristicUsd: pick?.heuristicUsd,
            walkerFeatures: leg?.features,
            walkerHeuristic: leg?.heuristicUsd,
          });
          setUsd("");
        }}
      >
        <h2 className="text-xl">Log a payout</h2>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">ISBN</span>
          <input value={isbn} onChange={(event) => setIsbn(event.target.value)} className="h-11 rounded-xl border border-border bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 rounded-xl border border-border bg-bg px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Dollars received</span>
          <input value={usd} onChange={(event) => setUsd(event.target.value)} inputMode="decimal" className="h-11 rounded-xl border border-border bg-bg px-3 tabular-nums" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Buyer</span>
          <select value={buyerId} onChange={(event) => setBuyerId(event.target.value)} className="h-11 rounded-xl border border-border bg-bg px-3">
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="size-5 accent-primary" />
          They accepted it. Uncheck if they rejected or paid nothing.
        </label>
        <button type="submit" className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-fg">
          Train on this payout
        </button>
        <p className="text-sm text-muted">
          {leg ? `Walker credit goes to ${leg.stop.name}.` : "Plan a loop first if you want the walker to learn which box paid."}
        </p>
      </form>

      <section className="grid gap-2">
        <h2 className="text-xl">Buyers on the desk</h2>
        <p className="text-sm text-muted">
          Five buyers with a prepaid label and a cash payout. BookScouter is only the comparison board. Vendors that pay in gift cards are not listed.
        </p>
        {buyers.map((buyer) => (
          <article key={buyer.id} className="rounded-xl border border-border bg-surface p-3">
            <a href={buyer.url} className="font-semibold">
              {buyer.name}
            </a>
            <p className="text-sm text-muted">{buyer.bestAt}</p>
            <p className="text-sm text-fg">{buyer.prepaid}</p>
            <p className="text-sm text-muted">
              {buyer.payment} · {buyer.speed} · min {buyer.minimum}
            </p>
            <p className="text-sm text-muted">{buyer.trust}</p>
            <p className="text-xs text-muted">
              Model: pays {Math.round(buyer.payRate * 100)}% of the prior · label {buyer.thresholdUsd > 0 ? formatUsd(buyer.thresholdUsd) : "none"} · packaging {formatUsd(buyer.frictionUsd)}
            </p>
          </article>
        ))}
      </section>

      {boxes.length ? (
        <section className="grid gap-2">
          <h2 className="text-xl">Boxes that have paid</h2>
          <ul className="grid gap-2">
            {boxes.map(([id, stats]) => (
              <li key={id} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                <span className="font-semibold">{id}</span>
                <span className="text-muted">
                  {" "}
                  · {stats.visits} visit{stats.visits === 1 ? "" : "s"} · {formatUsd(stats.reward)} total
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {payouts.length ? (
        <section className="grid gap-2">
          <h2 className="text-xl">Ledger</h2>
          <ul className="grid gap-2">
            {payouts.map((payout) => (
              <li key={payout.id} className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                <span>
                  <span className="font-semibold">{payout.title}</span>
                  <span className="block text-sm text-muted">
                    {buyerName(payout.buyerId)}
                    {payout.accepted ? "" : " · rejected"}
                  </span>
                </span>
                <span className="tabular-nums text-primary">{formatUsd(payout.usd)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
