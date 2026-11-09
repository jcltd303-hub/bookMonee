/**
 * Live quote proxy.
 *
 * The browser must not hold the aggregator's API key, so the key lives here as a
 * server environment variable and the app calls this route same-origin. Configure it in
 * the Vercel project:
 *
 *   QUOTE_API_URL   upstream endpoint that accepts ?isbn=
 *   QUOTE_API_KEY   sent upstream as a bearer token (optional)
 *
 * With neither set the route answers 501 and the app quietly keeps using its modelled
 * quotes — a shelf read must never depend on this being configured.
 */
import { defineEventHandler, getQuery, setResponseStatus } from "h3";

type Upstream = { offers?: { buyerId?: string; buyer?: string; usd?: number; offerUsd?: number }[] };

export default defineEventHandler(async (event) => {
  const upstream = process.env.QUOTE_API_URL;
  if (!upstream) {
    setResponseStatus(event, 501);
    return { error: "QUOTE_API_URL is not configured on this deployment" };
  }

  const isbn = String(getQuery(event).isbn ?? "").replace(/[^0-9Xx]/g, "");
  if (isbn.length < 10) {
    setResponseStatus(event, 400);
    return { error: "a 10 or 13 digit isbn is required" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const key = process.env.QUOTE_API_KEY;
    const response = await fetch(`${upstream}${upstream.includes("?") ? "&" : "?"}isbn=${encodeURIComponent(isbn)}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!response.ok) {
      setResponseStatus(event, 502);
      return { error: `upstream returned ${response.status}` };
    }
    const payload = (await response.json()) as Upstream;
    if (!Array.isArray(payload.offers)) {
      setResponseStatus(event, 502);
      return { error: "upstream did not return an offers array" };
    }
    // Pass through unchanged; the client normalises desk names and drops unknowns.
    return { offers: payload.offers };
  } catch (error) {
    setResponseStatus(event, 504);
    return { error: error instanceof Error ? error.message : "upstream failed" };
  } finally {
    clearTimeout(timer);
  }
});
