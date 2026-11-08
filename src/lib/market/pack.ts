import { buyers } from "@/data/buyers";
import { UNIT_COST_USD, offerFrom } from "@/lib/market/quote";
import type { Bin, DeskItem, PackHint, PackResult, QuoteBook, Skipped } from "@/lib/types";

/** Extra weight given to a book that closes a prepaid-label gap, as a share of the gap it fills. */
const PADDING_WEIGHT = 0.35;

type WorkingBin = { buyerId: string; items: DeskItem[]; usd: number };

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function binOf(buyerId: string): WorkingBin {
  return { buyerId, items: [], usd: 0 };
}

/**
 * Multi-buyer bin packing under prepaid-label thresholds.
 *
 * Two passes:
 *  1. Greedy by marginal value. A book goes to the desk with the best
 *     `offer − 0.99` plus a padding bonus when that desk is still short of its
 *     free-shipping minimum. Books that beat nothing are skipped, not staged.
 *  2. Gap closing. Any desk still under its threshold gets cheap books moved in
 *     (from the skip pile, or from a desk that already clears its own label) as long
 *     as the shipment stays net-positive. This is the "threshold padding" the desk
 *     model needs: a $2 quote is worth taking when it unlocks a $7.50 label.
 *
 * Everything is deterministic: same shelf in, same bins out.
 */
export function packBins(
  books: QuoteBook[],
  staged: Record<string, DeskItem[]> = {},
): PackResult {
  const bins = new Map<string, WorkingBin>();
  for (const buyer of buyers) bins.set(buyer.id, binOf(buyer.id));

  for (const [buyerId, list] of Object.entries(staged)) {
    const bin = bins.get(buyerId);
    if (!bin) continue;
    bin.items = [...list];
    bin.usd = cents(list.reduce((sum, item) => sum + item.offerUsd, 0));
  }

  const skipped: Skipped[] = [];
  const pending: { book: QuoteBook; offers: { buyerId: string; offerUsd: number }[] }[] = [];

  for (const book of books) {
    const offers = buyers
      .map((buyer) => ({ buyerId: buyer.id, offerUsd: offerFrom(book, buyer) }))
      .filter((offer) => offer.offerUsd > 0);
    if (!offers.length) {
      skipped.push({
        isbn: book.isbn,
        title: book.title,
        bestOfferUsd: 0,
        why: "No desk quotes this copy at this condition.",
      });
      continue;
    }
    pending.push({ book, offers });
  }

  // Pass 1 — greedy by marginal value, with padding credit for short bins.
  const order = [...pending].sort((a, b) => {
    const bestA = Math.max(...a.offers.map((offer) => offer.offerUsd));
    const bestB = Math.max(...b.offers.map((offer) => offer.offerUsd));
    return bestB - bestA;
  });

  for (const { book, offers } of order) {
    let choice: { buyerId: string; score: number; offerUsd: number } | null = null;
    for (const offer of offers) {
      const bin = bins.get(offer.buyerId);
      if (!bin) continue;
      const buyer = buyers.find((item) => item.id === offer.buyerId);
      const threshold = buyer?.thresholdUsd ?? 0;
      const gap = Math.max(0, threshold - bin.usd);
      const padding = gap > 0 ? PADDING_WEIGHT * Math.min(offer.offerUsd, gap) : 0;
      const score = cents(offer.offerUsd - UNIT_COST_USD + padding);
      if (!choice || score > choice.score) {
        choice = { buyerId: offer.buyerId, score, offerUsd: offer.offerUsd };
      }
    }
    if (!choice || choice.score <= 0) {
      skipped.push({
        isbn: book.isbn,
        title: book.title,
        bestOfferUsd: Math.max(...offers.map((offer) => offer.offerUsd)),
        why: "Best quote does not clear the 99¢ acquisition cost plus friction.",
      });
      continue;
    }
    const bin = bins.get(choice.buyerId)!;
    bin.items.push(item(book, choice.offerUsd));
    bin.usd = cents(bin.usd + choice.offerUsd);
  }

  // Pass 2 — close remaining gaps. A bin only ships if it clears its label, so padding
  // is committed only when it actually closes the gap: either one cheap book that gets
  // there on its own, or a donor move from a bin that stays above its own threshold.
  for (const buyer of buyers) {
    const bin = bins.get(buyer.id)!;
    let gap = Math.max(0, buyer.thresholdUsd - bin.usd);
    if (gap <= 0) continue;

    // Cheapest skipped book that closes the gap alone, or a donor that does.
    const candidates = skipped
      .map((entry) => ({ entry, book: pending.find((row) => row.book.isbn === entry.isbn)?.book }))
      .filter((row): row is { entry: Skipped; book: QuoteBook } => Boolean(row.book))
      .map((row) => ({ ...row, offerUsd: offerFrom(row.book, buyer) }))
      .filter((row) => row.offerUsd > 0)
      .sort((a, b) => b.offerUsd - a.offerUsd);

    for (const candidate of candidates) {
      if (candidate.offerUsd < gap) continue;
      bin.items.push(item(candidate.book, candidate.offerUsd));
      bin.usd = cents(bin.usd + candidate.offerUsd);
      candidate.entry.why = `Padding that closes ${buyer.name}'s ${buyer.thresholdUsd.toFixed(2)} label.`;
      candidate.entry.bestOfferUsd = candidate.offerUsd;
      gap = Math.max(0, buyer.thresholdUsd - bin.usd);
      break;
    }
    if (gap <= 0) continue;

    for (const other of buyers) {
      if (gap <= 0) break;
      if (other.id === buyer.id) continue;
      const source = bins.get(other.id)!;
      if (source.usd < other.thresholdUsd) continue; // the donor still needs its own label
      for (const candidate of [...source.items]) {
        const book: QuoteBook = {
          isbn: candidate.isbn,
          title: candidate.title,
          demandUsd: candidate.demandUsd,
          lane: candidate.lane,
          condition: candidate.condition,
        };
        const offerUsd = offerFrom(book, buyer);
        if (offerUsd < gap) continue; // only a move that closes the gap on its own
        // Never destroy value to close a label: the target desk must pay at least as much.
        if (offerUsd < candidate.offerUsd) continue;
        if (cents(source.usd - candidate.offerUsd) < other.thresholdUsd) continue;
        source.items = source.items.filter((entry) => entry.isbn !== candidate.isbn);
        source.usd = cents(source.usd - candidate.offerUsd);
        bin.items.push(item(book, offerUsd));
        bin.usd = cents(bin.usd + offerUsd);
        gap = Math.max(0, buyer.thresholdUsd - bin.usd);
        break;
      }
    }
  }

  const result: Bin[] = [];
  for (const bin of bins.values()) {
    if (!bin.items.length) continue;
    const buyer = buyers.find((item) => item.id === bin.buyerId)!;
    const clearsThreshold = bin.usd >= buyer.thresholdUsd;
    if (!clearsThreshold) {
      // Never stage a shipment that cannot clear its label: those books are a 99¢ loss each.
      for (const entry of bin.items) {
        skipped.push({
          isbn: entry.isbn,
          title: entry.title,
          bestOfferUsd: entry.offerUsd,
          why: `Held: $${Math.max(0, buyer.thresholdUsd - bin.usd).toFixed(2)} short of ${buyer.name}'s label.`,
        });
      }
      continue;
    }
    const costUsd = cents(bin.items.length * UNIT_COST_USD);
    result.push({
      buyerId: bin.buyerId,
      buyerName: buyer.name,
      items: bin.items,
      stagedUsd: cents(bin.usd),
      thresholdUsd: buyer.thresholdUsd,
      costUsd,
      frictionUsd: buyer.frictionUsd,
      netUsd: cents(bin.usd - costUsd - buyer.frictionUsd),
      clearsThreshold: true,
      gapUsd: 0,
    });
  }
  result.sort((a, b) => b.netUsd - a.netUsd);

  const grossUsd = cents(result.reduce((sum, bin) => sum + bin.stagedUsd, 0));
  const costUsd = cents(result.reduce((sum, bin) => sum + bin.costUsd, 0));
  const frictionUsd = cents(result.reduce((sum, bin) => sum + bin.frictionUsd, 0));
  const netUsd = cents(grossUsd - costUsd - frictionUsd);

  const heldByBuyer = new Map<string, number>();
  for (const entry of skipped) {
    const match = /short of (.+)'s label\.$/.exec(entry.why);
    if (match) heldByBuyer.set(match[1], (heldByBuyer.get(match[1]) ?? 0) + entry.bestOfferUsd);
  }
  const hints: PackHint[] = [...heldByBuyer.entries()].map(([name, heldUsd]) => {
    const buyer = buyers.find((item) => item.name === name);
    const threshold = buyer?.thresholdUsd ?? 0;
    const needUsd = cents(Math.max(0, threshold - heldUsd));
    return {
      buyerId: buyer?.id ?? name,
      buyerName: name,
      needUsd,
      text: `$${needUsd.toFixed(2)} more at ${name} and the $${threshold.toFixed(2)} label clears.`,
    };
  });

  return { bins: result, grossUsd, costUsd, frictionUsd, netUsd, skipped, hints, modelled: true };
}

function item(book: QuoteBook, offerUsd: number): DeskItem {
  return {
    isbn: book.isbn,
    title: book.title,
    offerUsd,
    demandUsd: book.demandUsd,
    lane: book.lane,
    condition: book.condition,
  };
}

/** Cash actually received when a staged bin ships, after the 99¢ cost and packaging. */
export function binCash(bin: Bin): { cashUsd: number; costUsd: number; netUsd: number } {
  const costUsd = cents(bin.items.length * UNIT_COST_USD);
  const cashUsd = bin.clearsThreshold ? bin.stagedUsd : 0;
  return { cashUsd, costUsd, netUsd: cents(cashUsd - costUsd) };
}
