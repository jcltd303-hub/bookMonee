# Spine Route

A walking-and-trading app for Denver's Little Free Libraries. Walk a loop of
book boxes, scan what is on the shelf, and let an on-device desk model sort the
take into prepaid-label shipments from real book buyback desks.

Built as a TanStack Start app on Vercel. Everything that costs money to run —
scanning, quoting, bin packing, the trading agent — runs in the browser.

## What it does

**Route.** The map carries 71 book boxes and 6 mutual-aid pins across Denver,
plus a region filter built from the city directory brief: central, northwest,
southeast, northeast, southwest, and a separate metro bucket so the planner
stops routing people to Aurora or Golden by default. The walker scores each
candidate stop by expected cash minus a quarter per mile, corrected by a small
residual net that learns from the payouts you actually log.

**Scan.** A spine barcode is decoded on device with ZXing. A Laplacian-variance
frame gate scores each frame and drops decodes that land on motion blur instead
of trusting them, which is the single biggest source of wrong ISBNs on a pan.
Lookup goes bundled catalog → local cache → Open Library direct from the
browser, so a catalogued book resolves with no network at all.

**Desk.** Every buyer quotes the copy, then the packer sorts the shelf into
bins under each desk's prepaid-label threshold. Cost is a flat $0.99 a copy, so
the trade is pure spread: a book has to beat 99¢ plus packaging, and a $2
paperback is only worth taking when it closes a label gap. Shipments that
cannot clear a label are held, never staged.

**Train.** A Q-learning agent over three actions — skip, stage, ship — trained
on device against a synthetic market of the same desks and thresholds. The
packer picks which desk; the agent decides whether a copy is worth the 99¢.
Shipping a real bin on the Desk tab becomes a real training step.

## What is modelled and what is real

Real: barcode decoding, the blur gate, the region data, the map pins, the
ISBN catalog, the quote arithmetic, the bin packing, the learning loop.

Modelled: the per-desk pay rates. Live buyback quote pages block automated
collection, so `src/data/buyers.ts` carries a pay rate, lane fit, threshold, and
packaging cost per desk, calibrated against published minimums and category
priors. The UI labels every quote `modelled`, and the app links out to
BookScouter so a real quote is always one tap away. Never ship a box on a
modelled quote alone.

The demand priors in `src/data/books.json` are category priors for the same
reason.

## Running it

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # Vite + Nitro, Vercel preset, output in .vercel/output
```

`npm run typecheck` and `npm test` cover the pure logic; `src/lib/market` and
`src/lib/agents` have no DOM or network dependencies, which is what makes them
testable and what makes them portable to a worker later.

## Deploying

Vercel is configured on the Vercel side, not in this repo: build command
`npm run build`, output from the Nitro `vercel` preset in `.vercel/output`,
Node 22 or newer (`@tanstack/react-start` requires `>=22.12.0`, pinned in
`package.json`). No CI workflow ships the app.

`public/tesseract/` is generated at build time by `scripts/copy-ocr-assets.mjs`
(the OCR engine's worker, WASM core and English model, about 11 MB) and is not
committed.

## Layout

```
src/lib/market/    quote model and threshold bin packer
src/lib/agents/    walker/shelf priors, Q-learning agent, market simulator
src/lib/scan/      frame-quality gate
src/lib/catalog/   on-device-first ISBN lookup
src/data/          Denver pins, regions, buyers, deals, provenance
src/components/    route, scan, desk, replace, train tabs
public/sw.js       offline shell
```

## Data and provenance

Book box pins come from an OpenStreetMap extract (ODbL), cross-checked against
the Little Free Library registry, the Little Free Pantry map, the Denver
Community Fridges network, and neighborhood trail registries. None of these is
a census: private stewards build, move, and retire front-lawn boxes constantly.
Coordinates for the anchors named in the city brief are corner-level, not
surveyed.
