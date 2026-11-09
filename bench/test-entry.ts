/** What the Node test suite imports: the pure logic, bundled so it runs without aliases. */
export { assess } from "@/lib/scan/plausibility";
export { extractIsbn, cleanSpineText } from "@/lib/scan/resolve";
export { sameBook } from "@/lib/scan/dedupe";
export { toIsbn13, isbn13Valid } from "@/lib/geo";
export { quotesFor, offerFrom, UNIT_COST_USD } from "@/lib/market/quote";
export { packBins, binCash } from "@/lib/market/pack";
export { makeQ, qShapeOk, greedy, policyTable } from "@/lib/agents/qlearn";
export { pretrainedAgent, runEpisode, mulberry32, makeEnv } from "@/lib/agents/sim";
export { buyers } from "@/data/buyers";
