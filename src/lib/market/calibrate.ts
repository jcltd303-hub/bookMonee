import { buyers } from "@/data/buyers";
import { CONDITION_FACTOR } from "@/lib/market/quote";
import type { Buyer, Condition } from "@/lib/types";

/**
 * Continuous calibration of the desk model.
 *
 * Every live quote the app receives is evidence about what a desk actually pays, and
 * the modelled `payRate` in `data/buyers.ts` is only a prior. This keeps a running
 * ratio per desk — observed offer divided by what the model would have predicted, with
 * condition and lane fit divided out — and shrinks the observed mean toward the prior
 * so three quotes cannot swing a desk.
 *
 * Pure and serialisable: the state is two numbers per desk, so it persists in the same
 * local store as everything else and survives a reload.
 */
export type Observation = {
  buyerId: string;
  /** What the desk quoted. */
  offerUsd: number;
  /** The demand prior the quote was made against. */
  demandUsd: number;
  condition: Condition;
  lane: "textbook" | "trade";
};

export type DeskCalibration = { n: number; ratioSum: number };
export type Calibration = Record<string, DeskCalibration>;

/**
 * How many prior-equivalent observations to hold the rate at.
 *
 * Twelve, so a single live quote moves a desk by under a tenth: enough to notice, not
 * enough for one mis-parsed quote or one odd book to reprice a desk.
 */
export const PRIOR_STRENGTH = 12;

/** A desk rate is never allowed outside this band of its prior. */
const RATE_BAND = { low: 0.3, high: 3 };

export function emptyCalibration(): Calibration {
  return {};
}

/** Predicted offer before jitter, used to isolate the desk's rate. */
function predicted(buyer: Buyer, obs: Observation): number {
  const laneFit = obs.lane === "textbook" ? buyer.textbookFit : buyer.tradeFit;
  return obs.demandUsd * buyer.payRate * CONDITION_FACTOR[obs.condition] * laneFit;
}

/**
 * Fold one observation in. Returns a new calibration object; the input is untouched so
 * React state changes are detectable.
 */
export function recordObservation(calibration: Calibration, obs: Observation): Calibration {
  const buyer = buyers.find((entry) => entry.id === obs.buyerId);
  if (!buyer || obs.offerUsd <= 0) return calibration;
  const base = predicted(buyer, obs);
  if (base <= 0) return calibration;
  // A desk that declines (zero quote) is not evidence of a lower rate — it is evidence
  // about that book, so only real offers move the rate.
  const ratio = Math.max(0.2, Math.min(5, obs.offerUsd / base));
  const current = calibration[obs.buyerId] ?? { n: 0, ratioSum: 0 };
  return {
    ...calibration,
    [obs.buyerId]: { n: current.n + 1, ratioSum: current.ratioSum + ratio },
  };
}

/** The rate to use for a desk, shrunk toward the modelled prior. */
export function adjustedRate(buyer: Buyer, calibration: Calibration): number {
  const state = calibration[buyer.id];
  if (!state || state.n === 0) return buyer.payRate;
  // The ratios are relative to what this desk was predicted to pay, so they scale the
  // prior rate rather than replacing it. (Blending a rate with a ratio sum — which is
  // what an earlier version did — silently makes the answer dimensional nonsense.)
  const scaled = (buyer.payRate * (PRIOR_STRENGTH + state.ratioSum)) / (PRIOR_STRENGTH + state.n);
  const bounded = Math.min(buyer.payRate * RATE_BAND.high, Math.max(buyer.payRate * RATE_BAND.low, scaled));
  return Math.round(bounded * 10000) / 10000;
}

/** Per-desk view for the Train tab. */
export function calibrationSummary(calibration: Calibration): {
  buyerId: string;
  buyerName: string;
  priorRate: number;
  adjustedRate: number;
  observations: number;
  meanRatio: number | null;
}[] {
  return buyers.map((buyer) => {
    const state = calibration[buyer.id];
    return {
      buyerId: buyer.id,
      buyerName: buyer.name,
      priorRate: buyer.payRate,
      adjustedRate: adjustedRate(buyer, calibration),
      observations: state?.n ?? 0,
      meanRatio: state && state.n ? Math.round((state.ratioSum / state.n) * 100) / 100 : null,
    };
  });
}

/** Effective rate per desk, for passing straight into `quotesFor`. */
export function ratesFor(calibration: Calibration): Record<string, number> {
  const out: Record<string, number> = {};
  for (const buyer of buyers) out[buyer.id] = adjustedRate(buyer, calibration);
  return out;
}

export function totalObservations(calibration: Calibration): number {
  return Object.values(calibration).reduce((sum, state) => sum + state.n, 0);
}
