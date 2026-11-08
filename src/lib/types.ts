export type StopKind = "bookcase" | "pantry" | "fridge";

export type Stop = {
  id: string;
  name: string;
  kind: StopKind;
  lat: number;
  lon: number;
  address: string;
  neighborhood: string;
  charter: string;
  notes: string;
  access: string;
  profitEligible: boolean;
  source: string;
  sourceId: string;
  sourceUrl: string;
  extract: string;
};

export type LibrariesFile = {
  meta: {
    name: string;
    definitive: boolean;
    asOf: string;
    bookcases: number;
    mutualAid: number;
    bbox: { south: number; west: number; north: number; east: number; label: string };
    whyNotDefinitive: string[];
    osmCredit: string;
    refresh: string;
  };
  stops: Stop[];
};

export type DemandBook = {
  isbn13: string;
  title: string;
  author: string;
  subject: string;
  lane: "textbook" | "trade";
  expectedUsd: number;
  lowUsd: number;
  highUsd: number;
  checkOrder: string[];
  confidence: string;
  asOf: string;
  method: string;
  note: string;
  rank: number;
};

export type BooksFile = {
  meta: { name: string; asOf: string; definitivePrices: boolean; note: string };
  books: DemandBook[];
};

export type LatLng = { lat: number; lon: number };

export type Buyer = {
  id: string;
  name: string;
  /** Prepaid-label minimum in dollars. 0 means no published minimum. */
  thresholdUsd: number;
  /** Share of the demand prior this buyer pays at good condition. Modelled, not scraped. */
  payRate: number;
  textbookFit: number;
  tradeFit: number;
  /** Below this they quote nothing. */
  floorUsd: number;
  /** Packaging and handling charged once per shipment. */
  frictionUsd: number;
  bestAt: string;
  prepaid: string;
  payment: string;
  speed: string;
  minimum: string;
  trust: string;
  url: string;
};

export type PlannedLeg = {
  stop: Stop;
  miles: number;
  heuristicUsd: number;
  residual: number;
  scoreUsd: number;
  features: number[];
};

export type Judgement = {
  isbn: string;
  title: string;
  author: string;
  subject: string;
  decision: "take" | "leave";
  reason: string;
  scoreUsd: number;
  heuristicUsd: number;
  /** Demand prior before the condition deduction, so the desk model can apply its own. */
  priorUsd: number;
  lane: "textbook" | "trade";
  condition: Condition;
  residual: number;
  lowUsd: number;
  highUsd: number;
  checkOrder: string[];
  features: number[];
  similar: { title: string; sim: number; expectedUsd: number }[];
  coverUrl: string;
};

export type Payout = {
  id: string;
  at: number;
  isbn: string;
  title: string;
  usd: number;
  buyerId: string;
  accepted: boolean;
  stopId: string;
  miles: number;
};

export type Condition = "good" | "fair" | "poor";

export type QuoteBook = {
  isbn: string;
  title: string;
  demandUsd: number;
  lane: "textbook" | "trade";
  condition: Condition;
};

export type BuyerQuote = {
  buyerId: string;
  buyerName: string;
  offerUsd: number;
  thresholdUsd: number;
  stagedUsd: number;
  gapUsd: number;
  netUsd: number;
  modelled: boolean;
};

export type DeskItem = {
  isbn: string;
  title: string;
  offerUsd: number;
  demandUsd: number;
  lane: "textbook" | "trade";
  condition: Condition;
};

export type Bin = {
  buyerId: string;
  buyerName: string;
  items: DeskItem[];
  stagedUsd: number;
  thresholdUsd: number;
  costUsd: number;
  frictionUsd: number;
  netUsd: number;
  clearsThreshold: boolean;
  gapUsd: number;
};

export type PackHint = { buyerId: string; buyerName: string; needUsd: number; text: string };

export type Skipped = { isbn: string; title: string; bestOfferUsd: number; why: string };

export type PackResult = {
  bins: Bin[];
  grossUsd: number;
  costUsd: number;
  frictionUsd: number;
  netUsd: number;
  skipped: Skipped[];
  hints: PackHint[];
  modelled: boolean;
};
