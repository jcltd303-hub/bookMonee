import { buyers } from "@/data/buyers";
import type { Buyer, BuyerQuote, Condition, QuoteBook } from "@/lib/types";

/** Flat acquisition cost of a traded paperback, per the 99¢ supply constraint. */
export const UNIT_COST_USD = 0.99;

/** Condition deductions: what a desk knocks off for wear, writing, and damage. */
export const CONDITION_FACTOR: Record<Condition, number> = {
  good: 1,
  fair: 0.55,
  poor: 0.2,
};

/** Deterministic 32-bit hash so a quote is stable across reloads and devices. */
function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** ±span jitter, seeded by book and desk. Keeps one ISBN from looking identical everywhere. */
function jitter(key: string, span = 0.12): number {
  const unit = hash32(key) / 0xffffffff;
  return (unit * 2 - 1) * span;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What one desk would pay for one copy.
 *
 * Offer = demand prior × desk pay rate × condition factor × lane fit × seeded jitter.
 * Textbooks in poor condition quote zero: every desk rejects water damage and broken
 * bindings on course books, so the model does too instead of returning a small number.
 */
export function offerFrom(book: QuoteBook, buyer: Buyer): number {
  if (book.lane === "textbook" && book.condition === "poor") return 0;
  const laneFit = book.lane === "textbook" ? buyer.textbookFit : buyer.tradeFit;
  const raw =
    book.demandUsd *
    buyer.payRate *
    CONDITION_FACTOR[book.condition] *
    laneFit *
    (1 + jitter(`${book.isbn}:${buyer.id}`));
  const value = Math.max(0, cents(raw));
  return value < buyer.floorUsd ? 0 : value;
}

/** Every desk's quote for one book, with the spread against the 99¢ cost and the bin gap. */
export function quotesFor(book: QuoteBook, staged: Record<string, number> = {}): BuyerQuote[] {
  return buyers
    .map((buyer) => {
      const offerUsd = offerFrom(book, buyer);
      const stagedUsd = cents(staged[buyer.id] ?? 0);
      const gapUsd = Math.max(0, cents(buyer.thresholdUsd - stagedUsd));
      return {
        buyerId: buyer.id,
        buyerName: buyer.name,
        offerUsd,
        thresholdUsd: buyer.thresholdUsd,
        stagedUsd,
        gapUsd,
        netUsd: cents(offerUsd - UNIT_COST_USD),
        modelled: true,
      };
    })
    .sort((a, b) => b.netUsd - a.netUsd || b.offerUsd - a.offerUsd);
}

/** The single best desk for this copy, or undefined when nobody beats the 99¢ cost. */
export function bestQuote(quotes: BuyerQuote[]): BuyerQuote | undefined {
  return quotes.find((quote) => quote.offerUsd > 0 && quote.netUsd > 0);
}

/** Total dollars already staged per desk, from staged items. */
export function stagedTotals(items: Record<string, { offerUsd: number }[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [buyerId, list] of Object.entries(items)) {
    totals[buyerId] = cents(list.reduce((sum, item) => sum + item.offerUsd, 0));
  }
  return totals;
}
