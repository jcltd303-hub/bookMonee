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
stops routing people to Aurora or Golden by default. Every one of the 77 pins is
assigned to a section. Choosing a section reframes the map to its bounds, the
legend matches the markers, and tapping a pin opens its address, access notes,
charter number, a walking-directions link and the source OSM node. The walker scores each
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

| Fixtures | Result | Noise accepted | Time |
| --- | --- | --- | --- |
| 5 synthetic spines | 5/5 exact | 0/3 | ~1.3 s |
| 6 real spine photographs | 7/11 labelled (5 exact, 2 partial) | 0/3 | ~2.7 s |
| 3 real shelf rows, whole rows with segmentation | 13/17 titles, 24–31 spines a row | — | ~2.7 s a spine |

With `--no-gate` the reads are identical but one noise image is accepted — the gate costs
nothing in accuracy and blocks a false accept.

The spine fixtures are cut from 3264×2448 and 3840×2161 originals at about 1400 px tall, so
a spine is 56–335 px wide with 20–40 px type. The shelf rows are cut from photographs of a
real book case, between the shelf boards, with the expected titles labelled by reading them
— they score the whole path, segmentation included.

What the shelf rows changed, each measured:

| Change | Result |
| --- | --- |
| Gate: only alphabetic single letters count as noise | `DAVID JASON: 3 4` stopped being rejected |
| Gate: four-letter floor instead of six | recovered `CAINE`, `DUNE`, `POTTER`-length titles |
| Ranking leads with known words, not plausibility score | stopped a garbage read winning the rotation contest |
| 3× upscale instead of 2× | 10/17 → 13/17 titles |
| Minimum edge spacing 0.016 instead of 0.02 | same titles, 24–31 spines a row instead of 21–22 |

Together: 10/17 → 13/17 titles, noise still 0/3. Three titles are still never read at all
(`TEACH YOURSELF`, `LAROUSSE`, `POTTER`); the dump shows them inside boxes spanning several
spines, which is a resolution problem the correction tap covers rather than a gate problem.

Three attempts failed and were reverted: scoring edge consistency down a column (10/17 — it
fires on text strokes too), halving the edge spacing to 0.011 (36 boxes a row but spines cut
in half, so `CAINE` reads as `CAI` + `NE`, 10/17), and adding the halves of wide boxes as
extra candidates (13/17, unchanged, at nearly double the runtime — and the box holding
`LAROUSSE` was 119px against a split threshold of ~144, so it was never split anyway).
Over-segmentation costs more titles than merging does, and the three unread titles are not
reachable by adjusting the segmenter.

Getting the real-photo numbers off zero took a grid search over preprocessing, scale,
page-segmentation mode and crop insets. What helped:

| Change | Why |
| --- | --- |
| Greyscale + contrast stretch instead of Otsu binarisation | beat binarisation at every scale: a hard threshold destroys the anti-aliased edges small type lives on, and Tesseract thresholds adaptively itself |
| 2x upscale, clamped so the long side stays under 2400 px | 2x beat 1x and 3x at every setting; the clamp is because leptonica's allocations fail on 2800 px strips |
| Page segmentation mode 6 (uniform block) | the default reads a 25:1 spine strip as a page layout and fragments it |

What did **not** help, measured and reverted: insetting the crop to drop neighbouring
spines (3 titles at inset 0, 2 at 6%, 1 at 12%); detecting text lines and OCRing each
one separately (1 title against 3); scaling by the tallest ink run instead of a flat
multiplier (4 of 6 rejected, and slower); and raising the source resolution on its own.

### Reading speed

Results stream into the shelf as each spine finishes, so the first book appears in about
a second instead of after the whole shelf. Reading runs on a pool of engines, but the
pool is sized from `navigator.hardwareConcurrency` rather than fixed: measured on a
two-core machine, two workers is *worse* than one — 19.4 s against 18.4 s for the same
fixtures, with each read taking twice as long, because the engines contend for the same
cores. Four cores or more gets two engines; anything less gets one.

`npm run bench -- --workers 2` reproduces that comparison on any machine.

Tuning Tesseract is now exhausted, measured rather than assumed: a capitals-only
character whitelist changes nothing (1 title either way), adaptive (Sauvola) thresholding
changes nothing, and single-line mode (PSM 7) reads *zero* titles. The stock English
model is the ceiling.

So the app stops pretending the engine is enough and puts the reader in the loop:

- Every spine card shows what the camera read in an editable field with a **Find book**
  button. Correcting a misread costs one tap and a second lookup — far cheaper than
  anything that could be done to the image.
- A barcode scan **upgrades** the OCR guess it confirms instead of sitting beside it as
  a second book (`supersedes` in `src/lib/scan/dedupe.ts`, tested). Confirmed ISBNs
  always beat guesses; a guess never displaces a confirmed one.
- Reads under 55% confidence are labelled as needing a check.

Still not good enough on its own. Two spines in six read, and both are partial. The dumps show
crops that are plain to a human while the engine returns `ARnvEN FARR COMMUNITY FARM`,
so what is left is not tuning: it needs a recogniser that handles stylised type better
than Tesseract's stock English model, or a scene-text model trained on spines. The
fixtures and `--dump` are here to measure whatever replaces it.

## Environment

The map's tiles are the one thing that comes from someone else's server, so they are
configuration, not a constant. With nothing set, the build uses CARTO's dark basemap,
which needs no key.

Set these in the Vercel project (Settings → Environment Variables), or in a local
`.env` — see `.env.example`:

| Variable | Purpose |
| --- | --- |
| `VITE_MAP_TILES_URL` | full tile template, e.g. `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` |
| `VITE_MAP_ATTRIBUTION` | the credit line that must go with those tiles |
| `VITE_MAP_MAX_ZOOM` | defaults to 19 |
| `VITE_MAPTILER_KEY` | convenience: builds a MapTiler streets URL when no template is set |

`src/lib/map-config.ts` resolves these once; `MapView` never hardcodes a provider.

## Live quotes and the desk model

The app can ask for real buyback offers while you scan, and it keeps what it learns.

The desks themselves publish no APIs and block automated collection, which is why the
shipped model exists at all. So live quotes come through **one configured source** — an
aggregator you have an account with, BookScouter being the realistic one — reached via a
server route so the key stays server-side:

| Variable | Where | Purpose |
| --- | --- | --- |
| `QUOTE_API_URL` | server | upstream that accepts `?isbn=` and returns `{ "offers": [...] }` |
| `QUOTE_API_KEY` | server | sent upstream as a bearer token, never to the browser |
| `VITE_QUOTE_API_URL` | browser | override for a public, CORS-open endpoint |

`server/routes/api/quotes.get.ts` proxies it and answers 501 when nothing is
configured, so an unconfigured deployment keeps working on modelled quotes. Offers are
matched to desks by name (`BooksRun`, `World of Books`, `Top Dollar 4 Books`…), deduped
to the best per desk, and cached per ISBN for six hours.

**The model retains what it sees.** Each live offer is compared with what the model
predicted for that book — condition and lane fit divided out — and folded into that
desk's rate. The blend is weighted twelve observations toward the prior, so one quote
moves a desk by under a tenth and a persistent bias takes a dozen to show. Rates are
clamped to 0.3–3× the prior so no run of odd books can reprice a desk, and the Train tab
shows prior, current rate and observation count per desk with a reset button.

## Shelf matching

Each spine is resolved on its own while it streams, but a shelf is a *set* of books, and
independent retrieval cannot see that two reads are competing for one title. Following
Llabrés et al., *Image-text matching for large-scale book collections* (2024), which
shows many-to-many matching beating per-book retrieval, `src/lib/scan/match.ts` runs a
greedy maximum-weight assignment over the shelf once every read is in: each read keeps
the best title no one else is better placed to claim. Duplicate copies are allowed when
two reads are near-identical, since a little free library can hold two of the same book
— a deliberate departure from the paper, whose catalogue is a library inventory.

## Tests

`npm run test:logic` bundles the pure logic and runs it under `node --test`: ISBN
check digits, spine-text extraction, the plausibility gate, book identity, quote
floors, the packer's never-stage-a-loss rule, determinism, and that the trading agent
actually learns. No framework, no aliases, about a second.

`npm test` is the platform's older suite and is red for reasons unrelated to this app
(its glob does not expand, and eight workspace tests fail in this environment). Treat
`test:logic` as the one that gates the money logic.

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
