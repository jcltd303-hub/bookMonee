import { buyers } from "@/data/buyers";

/**
 * Live buyback quotes.
 *
 * The desks do not publish APIs, and their quote pages block automated collection —
 * `data/books.json` already says so. So this does not pretend to scrape them: it calls
 * *one* endpoint that you configure, which is expected to be a proxy or an aggregator
 * you have an account with (BookScouter's API is the realistic one, since it already
 * aggregates these desks).
 *
 *   VITE_QUOTE_API_URL   e.g. https://your-proxy.example/api/quotes
 *   VITE_QUOTE_API_KEY   optional, sent as a bearer token
 *
 * Contract — GET `{url}?isbn={isbn}` returning:
 *
 *   { "offers": [ { "buyerId": "booksrun", "usd": 4.25 },
 *                 { "buyer": "World of Books", "offerUsd": 2.10 } ] }
 *
 * Buyer names are matched loosely, so an aggregator's own labels work. Anything
 * unrecognised is dropped rather than guessed at. Every failure is silent by design:
 * a shelf read must not break because a proxy is down, and the modelled quotes remain.
 */
export type LiveOffer = { buyerId: string; offerUsd: number };

export type LiveResult = {
  isbn: string;
  offers: LiveOffer[];
  at: number;
  ok: boolean;
  error?: string;
};

const CACHE_KEY = "spine-route.live.v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

function env(key: string): string {
  // `import.meta.env` only exists under Vite; guard so the module can be imported by
  // the Node test bundle without blowing up at call time.
  const bag = (import.meta as { env?: Record<string, string | undefined> }).env;
  const value = bag?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Where quotes come from: an explicit browser-side endpoint if one is configured, else
 * this deployment's own proxy (`server/routes/api/quotes.get.ts`), which holds the key.
 */
export function quoteEndpoint(): string {
  return env("VITE_QUOTE_API_URL") || "/api/quotes";
}

/** There is always somewhere to ask; whether it answers is a separate question. */
export function liveQuotesEnabled(): boolean {
  return true;
}

/** Match an aggregator's label to one of our desk ids. */
export function matchBuyer(label: string): string | null {
  const needle = label.toLowerCase().replace(/[^a-z]/g, "");
  if (!needle) return null;
  const byId = buyers.find((buyer) => buyer.id === needle);
  if (byId) return byId.id;
  const byName = buyers.find((buyer) => {
    const name = buyer.name.toLowerCase().replace(/[^a-z]/g, "");
    return name === needle || name.startsWith(needle) || needle.startsWith(name);
  });
  return byName?.id ?? null;
}

type RawOffer = { buyerId?: string; buyer?: string; usd?: number; offerUsd?: number };

/** Normalise whatever shape came back into our desk ids. */
export function normaliseOffers(payload: unknown): LiveOffer[] {
  const raw = (payload as { offers?: RawOffer[] } | null)?.offers;
  if (!Array.isArray(raw)) return [];
  const offers: LiveOffer[] = [];
  for (const entry of raw) {
    const buyerId = entry.buyerId ? matchBuyer(entry.buyerId) : entry.buyer ? matchBuyer(entry.buyer) : null;
    const value = entry.offerUsd ?? entry.usd;
    if (!buyerId || typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    offers.push({ buyerId, offerUsd: Math.round(value * 100) / 100 });
  }
  // One offer per desk: the best.
  const best = new Map<string, number>();
  for (const offer of offers) best.set(offer.buyerId, Math.max(best.get(offer.buyerId) ?? 0, offer.offerUsd));
  return [...best.entries()].map(([buyerId, offerUsd]) => ({ buyerId, offerUsd }));
}

function readCache(): Record<string, LiveResult> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, LiveResult>;
  } catch {
    return {};
  }
}

function writeCache(result: LiveResult): void {
  if (typeof localStorage === "undefined") return;
  try {
    const cache = readCache();
    cache[result.isbn] = result;
    const fresh = Object.entries(cache)
      .filter(([, entry]) => Date.now() - entry.at < CACHE_TTL_MS)
      .slice(-200);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* storage full or blocked */
  }
}

export function cachedLive(isbn: string): LiveResult | null {
  const hit = readCache()[isbn];
  if (!hit) return null;
  return Date.now() - hit.at < CACHE_TTL_MS ? hit : null;
}

/**
 * Fetch live quotes for one ISBN. Never throws: a null return means "no live data,
 * use the model", which is the same path as an unconfigured endpoint.
 */
export async function fetchLiveQuotes(isbn: string, opts: { force?: boolean } = {}): Promise<LiveResult | null> {
  const url = quoteEndpoint();
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (clean.length < 10) return null;
  if (!opts.force) {
    const hit = cachedLive(clean);
    if (hit) return hit;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const key = env("VITE_QUOTE_API_KEY");
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}isbn=${encodeURIComponent(clean)}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!response.ok) {
      // 501 means the deployment has no quote source configured; that is a normal state,
      // not an error to report to the reader.
      const failed: LiveResult = {
        isbn: clean,
        offers: [],
        at: Date.now(),
        ok: false,
        error: response.status === 501 ? "no quote source configured" : `HTTP ${response.status}`,
      };
      return failed;
    }
    const offers = normaliseOffers(await response.json());
    const result: LiveResult = { isbn: clean, offers, at: Date.now(), ok: true };
    writeCache(result);
    return result;
  } catch (error) {
    return {
      isbn: clean,
      offers: [],
      at: Date.now(),
      ok: false,
      error: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Live offers as the map the quote engine wants. */
export function offersByDesk(result: LiveResult | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const offer of result?.offers ?? []) out[offer.buyerId] = offer.offerUsd;
  return out;
}
