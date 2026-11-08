import type { DeskItem, Judgement, QuoteBook } from "@/lib/types";

/** A judgement carries the demand prior and lane, which is exactly what a quote needs. */
export function quoteBookFromPick(pick: Judgement): QuoteBook {
  return {
    isbn: pick.isbn,
    title: pick.title,
    demandUsd: pick.priorUsd,
    lane: pick.lane,
    condition: pick.condition,
  };
}

export function deskItemFromPick(pick: Judgement, offerUsd: number): DeskItem {
  return {
    isbn: pick.isbn,
    title: pick.title,
    offerUsd,
    demandUsd: pick.priorUsd,
    lane: pick.lane,
    condition: pick.condition,
  };
}

/** Dollars already staged per desk, from the store's desk map. */
export function stagedUsd(desk: Record<string, { offerUsd: number }[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [buyerId, list] of Object.entries(desk)) {
    totals[buyerId] = Math.round(list.reduce((sum, item) => sum + item.offerUsd, 0) * 100) / 100;
  }
  return totals;
}
