import { bookcases } from "@/lib/catalog";
import { milesBetween } from "@/lib/geo";
import type { DemandBook, Judgement, LatLng, PlannedLeg, Stop } from "@/lib/types";
import { demandByIsbn, nearestDemand } from "@/lib/agents/rag";
import { forward, type Net } from "@/lib/agents/net";

export const WALKER_INPUT = 6;
export const SHELF_INPUT = 6;
const COLD_BOX_USD = 4;
const MILE_COST = 0.25;

export type BoxMemory = { visits: number; reward: number; lastAt: number };

export function walkerFeatures(
  miles: number,
  memory: BoxMemory | undefined,
  stopsSoFar: number,
  maxStops: number,
): number[] {
  const visits = memory?.visits ?? 0;
  const days = memory?.lastAt ? (Date.now() - memory.lastAt) / 86_400_000 : 45;
  return [
    Math.min(miles / 4, 3),
    Math.min((memory && visits ? memory.reward / visits : COLD_BOX_USD) / 40, 2),
    Math.min(visits / 5, 2),
    Math.min(days / 45, 2),
    stopsSoFar / Math.max(1, maxStops),
    visits === 0 ? 1 : 0,
  ];
}

export function planRoute(args: {
  start: LatLng;
  maxStops: number;
  mileBudget: number;
  memory: Record<string, BoxMemory>;
  net: Net;
  /** Restrict the loop to a region or a pre-filtered stop list. */
  stops?: Stop[];
}): PlannedLeg[] {
  const pool = args.stops ?? bookcases;
  const byId = new Map(pool.map((stop) => [stop.id, stop]));
  const remaining = new Set(pool.map((stop) => stop.id));
  const legs: PlannedLeg[] = [];
  let cursor = args.start;
  let walked = 0;
  while (legs.length < args.maxStops) {
    let best: PlannedLeg | null = null;
    for (const id of remaining) {
      const stop = byId.get(id);
      if (!stop) continue;
      const miles = milesBetween(cursor, stop);
      if (walked + miles > args.mileBudget && legs.length > 0) continue;
      const memory = args.memory[stop.id];
      const avg = memory?.visits ? memory.reward / memory.visits : COLD_BOX_USD;
      const heuristicUsd = avg - MILE_COST * miles;
      const features = walkerFeatures(miles, memory, legs.length, args.maxStops);
      const residual = forward(args.net, features).q;
      const scoreUsd = heuristicUsd + residual;
      const leg: PlannedLeg = { stop, miles, heuristicUsd, residual, scoreUsd, features };
      if (!best || leg.scoreUsd > best.scoreUsd) best = leg;
    }
    if (!best || (legs.length > 0 && best.scoreUsd < 0.4)) break;
    legs.push(best);
    remaining.delete(best.stop.id);
    walked += best.miles;
    cursor = best.stop;
  }
  return legs;
}

const TEXTBOOK_WORDS = [
  "biology",
  "chemistry",
  "medicine",
  "nursing",
  "physics",
  "accounting",
  "calculus",
  "anatomy",
  "pathology",
  "pharmac",
  "physiology",
  "engineering",
  "algorithm",
  "economics",
];

export function judgeShelf(args: {
  isbn: string;
  title: string;
  author: string;
  subjects: string[];
  condition: "good" | "fair" | "poor";
  leavesLeft: number;
  net: Net;
}): Judgement {
  const exact = demandByIsbn(args.isbn);
  const query = `${args.title} ${args.author} ${args.subjects.join(" ")}`;
  const similar = nearestDemand(query, 3).map((row) => ({
    title: row.book.title,
    sim: row.sim,
    expectedUsd: row.book.expectedUsd,
  }));
  const rag = similar[0];
  const textbookish =
    exact?.lane === "textbook" ||
    TEXTBOOK_WORDS.some((word) => query.toLowerCase().includes(word));
  let prior = exact?.expectedUsd ?? (rag && rag.sim > 0.18 ? rag.expectedUsd * rag.sim : textbookish ? 8 : 1);
  if (!exact && rag) prior *= 0.85;
  const conditionFactor = args.condition === "good" ? 1 : args.condition === "fair" ? 0.55 : 0.25;
  const heuristic = prior * conditionFactor;
  const features = [
    Math.min(heuristic / 80, 2),
    textbookish ? 1 : 0,
    args.condition === "good" ? 1 : args.condition === "fair" ? 0.45 : 0.1,
    exact ? 1 : 0,
    rag?.sim ?? 0,
    Math.min(args.leavesLeft / 3, 1),
  ];
  const residual = forward(args.net, features).q;
  const scoreUsd = Math.max(0, heuristic + residual);
  const band = exact ?? ragBook(rag);
  const noLeave = args.leavesLeft <= 0;
  const worth = scoreUsd >= 8 && args.condition !== "poor";
  const decision = worth && !noLeave ? "take" : "leave";
  const reason = noLeave
    ? "Leave it. Your bag has no replacement copy, and the box is a trade, not a warehouse."
    : decision === "take"
      ? exact
        ? `Demand prior for this work is ${money(exact.expectedUsd)} at ${exact.subject}. Confirm the edition, then check ${exact.checkOrder[0]}.`
        : `No exact prior. Closest demand is “${rag?.title ?? "unknown"}” (${Math.round((rag?.sim ?? 0) * 100)}% overlap).`
      : args.condition === "poor"
        ? "Leave it. Buyers reject water damage, heavy highlighting, and broken bindings."
        : scoreUsd < 3
          ? "Leave it. Trade paperbacks and kids' books usually clear under a dollar, often nothing."
          : "Leave it. The expected cash does not clear an $8 floor after condition.";
  return {
    isbn: args.isbn,
    title: args.title || exact?.title || "Unknown title",
    author: args.author || exact?.author || "",
    subject: exact?.subject || args.subjects[0] || "unknown",
    decision,
    reason,
    scoreUsd,
    heuristicUsd: heuristic,
    priorUsd: prior,
    lane: textbookish ? "textbook" : "trade",
    condition: args.condition,
    residual,
    lowUsd: band?.lowUsd ?? 0,
    highUsd: band?.highUsd ?? Math.max(scoreUsd * 1.8, 4),
    checkOrder: exact?.checkOrder ?? (textbookish ? ["booksrun", "valore", "textbookrush"] : ["worldofbooks", "topdollar"]),
    features,
    similar,
    coverUrl: `https://covers.openlibrary.org/b/isbn/${args.isbn}-M.jpg`,
  };
}

function ragBook(rag: { title: string; sim: number; expectedUsd: number } | undefined): DemandBook | undefined {
  if (!rag) return undefined;
  return {
    isbn13: "",
    title: rag.title,
    author: "",
    subject: "",
    lane: "textbook",
    expectedUsd: rag.expectedUsd,
    lowUsd: 0,
    highUsd: rag.expectedUsd * 2,
    checkOrder: [],
    confidence: "low",
    asOf: "",
    method: "rag",
    note: "",
    rank: 0,
  };
}

function money(usd: number): string {
  return `$${usd.toFixed(0)}`;
}

export function nearestStops(origin: LatLng, count: number, stops?: Stop[]): { stop: Stop; miles: number }[] {
  return (stops ?? bookcases)
    .map((stop) => ({ stop, miles: milesBetween(origin, stop) }))
    .sort((a, b) => a.miles - b.miles)
    .slice(0, count);
}
