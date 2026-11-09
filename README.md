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

## Measuring the OCR

The scan path is the one part that cannot be checked by reading code — it depends on
how real spines look. `npm run bench` runs the production pipeline (crop, rotate,
binarise, plausibility gate) over labelled images in Node, with the same Tesseract
model the app ships. No browser, about a second for a shelf.

```
npm run bench                      # bench/spines, from manifest.json
npm run bench -- --no-gate         # same, with the plausibility gate disabled
npm run bench -- --dir ~/spines --verbose
npm run bench -- --segment         # also report spine segmentation per file
```

`bench/spines/manifest.json` pairs each file with the text you expect; `""` means the
image should be *rejected*. Replace the synthetic samples with photographs of a real
shelf — that is the point of the harness.

`--dump` writes every prepared crop to `.bench/dump/`, so a bad read can be looked at
instead of guessed at. That flag is how the real-photo problem below was diagnosed.

### Baselines

| Fixtures | Reads | Noise accepted | Time |
| --- | --- | --- | --- |
| 5 synthetic spines | 5/5 exact | 0/3 | ~260 ms |
| 6 real photographs | 0/6 | 0/3 | ~470 ms |

With `--no-gate` the synthetic set is unchanged but one noise image is accepted as a
book (`4 hN` at 49% confidence) — the failure the gate exists to stop, since Tesseract
confidence measures its own segmentation, not whether the output is language.

The real-photo number is the honest state of the scan path: **spines from actual
shelves do not read yet.** The `--dump` crops show why it is not a cropping problem —
they are legible to a human, `GARDEN PARK COMMUNITY FARM` plain as day — while the
engine returns `HARTER FARR CUMMUNITY FARM`. Three causes are known, in order of
suspicion: the crops are 25:1 strips with several partial lines of neighbouring text;
the type is 14–20px tall and the upscale is suppressed by non-text ink in the crop
(see the note in `prepareCrop`); and Tesseract's layout analysis is poor on strips
that shape. Building the bench is what turned that from a guess into a measurement;
fixing it is the next piece of work, and the fixtures are here to measure against.

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
