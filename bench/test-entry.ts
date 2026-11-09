/** What the Node test suite imports: the pure logic, bundled so it runs without aliases. */
export { assess } from "@/lib/scan/plausibility";
export { assignTitles } from "@/lib/scan/match";
export { boxesFromFractions } from "@/lib/scan/detect";
export { decodeEntities } from "@/lib/text";
export { extractIsbn, cleanSpineText } from "@/lib/scan/resolve";
export { sameBook, supersedes, titleOverlap } from "@/lib/scan/dedupe";
export { toIsbn13, isbn13Valid } from "@/lib/geo";
export { quotesFor, offerFrom, UNIT_COST_USD } from "@/lib/market/quote";
export { recordObservation, adjustedRate, ratesFor, totalObservations, PRIOR_STRENGTH } from "@/lib/market/calibrate";
export { matchBuyer, normaliseOffers, offersByDesk, quoteEndpoint, liveQuotesEnabled } from "@/lib/market/live";
export { packBins, binCash } from "@/lib/market/pack";
export { makeQ, qShapeOk, greedy, policyTable } from "@/lib/agents/qlearn";
export { pretrainedAgent, runEpisode, mulberry32, makeEnv } from "@/lib/agents/sim";
export { buyers } from "@/data/buyers";
