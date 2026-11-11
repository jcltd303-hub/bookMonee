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

Two ways in, pick one — using both means every push deploys twice.

**Vercel's own Git integration** (simplest). Connect the repo in the Vercel dashboard.
`vercel.json` carries what the build needs: `npm ci --omit=dev` for install (all build
tooling is in `dependencies`, so production-only install is enough), `npm run build` for
the build, and cache headers for the hashed assets, the OCR engine and the detector model.
`package.json` pins Node `>=22.12.0`, which `@tanstack/react-start` requires.

**A manual workflow** (`.github/workflows/deploy-vercel.yml`). Deliberately
`workflow_dispatch` only, so it cannot fire alongside the integration above. Run it from
the Actions tab to deploy a commit from CI, choosing `production` or `preview`. It needs
three repository secrets:

| Secret | Where it comes from |
| --- | --- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `npx vercel link` in the repo, then `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | same file |

Until they exist the job fails immediately with a message naming what is missing. It builds
with `vercel build` rather than calling Vite directly, so CI and Vercel cannot drift apart,
then deploys the prebuilt output and smoke-checks the live URL for the app shell.

Either way the build ends in `.vercel/output` via Nitro's `vercel` preset, and
`prebuild` copies the ~10 MB OCR engine into `public/tesseract/` — which is why that
directory is gitignored and rebuilt on every deploy.

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

Spine detection needs no environment at all: install the model at build time with
`npm run fetch:model` (see above), or ship without one and the segmenter is used.

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

## Spine detection

Two ways to find the books, in order:

1. **A local model**, when one is installed. `src/lib/scan/detect.ts` runs a YOLO-family
   detector exported to ONNX through ONNX Runtime Web (MIT) — on the device, no API key,
   no cloud call, no per-request cost. The file is `public/models/spines.onnx`, which is
   gitignored; install one with `npm run fetch:model -- ./best.onnx` or
   `SPINE_MODEL_URL=… npm run fetch:model`. Either export works:

   ```
   yolo export model=best.pt     format=onnx imgsz=640            # axis-aligned detector
   yolo export model=best-obb.pt format=onnx imgsz=1024           # oriented boxes
   VITE_SPINE_MODEL_TASK=obb                                      # …when you used the second
   ```

   Oriented boxes are supported because the public book-spine work that handles tilted
   books is oriented-box (ASC-YOLOv8, AGPL-3.0, reports 99.4 mAP50 on a spine dataset but
   ships no checkpoints), and tilt is exactly where the segmenter fails. The angle is
   resolved into axis-aligned bounds for the crop.

   **Where the export runs.** Not on Vercel, and not in this repo — YOLO needs Python, and
   only to produce the file. Train wherever you have a GPU (Colab or Kaggle free tiers, or
   a local card); export on any machine, CPU is fine and it takes seconds:

   ```
   pip install ultralytics
   yolo export model=best.pt format=onnx imgsz=640
   ```

   Then get the `.onnx` into the build one of two ways: set `SPINE_MODEL_URL` in the Vercel
   project and `prebuild` downloads it (the usual choice, keeps the repo small), or drop the
   file at `public/models/spines.onnx` and remove that line from `.gitignore`. A missing or
   stale `SPINE_MODEL_URL` never fails a deploy — the build says so and the segmenter stays
   in use. At runtime the browser runs the ONNX through ONNX Runtime Web; nothing calls
   YOLO, and nothing leaves the device.
2. **The local segmenter** (`src/lib/scan/spines.ts`) otherwise: column gradients, peaks,
   a tall-and-narrow prior. No model, no network, and the reason three spines in the
   benchmark are never read — it merges books that touch.

The model is optional by design: a `HEAD` request checks for it first, so the ~1.5 MB of
WASM is never downloaded by a deployment that has no model, and the runtime is imported
lazily. Any failure — missing file, bad tensor, unsupported op — falls back to the
segmenter. The scanner shows which detector produced the boxes.

Licences worth knowing before shipping weights: the open-shelves dataset is
**CC BY-NC-SA 4.0** (non-commercial, share-alike), Ultralytics' ONNX exporter is
**AGPL-3.0**, and ASC-YOLOv8 is AGPL-3.0. No public repo ships ready-made spine
checkpoints — `capjamesg/open-shelves` has the dataset only, `susnazariy/YOLO-OCR-BookSpineDetectionRecognition`
is MIT but calls Roboflow's API. So a model means training or exporting one, and the weights
you choose carry their own terms.

## The trading agent

Three actions — skip, stage the best desk, ship a ready bin — over seven state features,
trained on the device against a simulated market. Two rules keep it honest:

- **Ship is only legal when a bin has cleared its prepaid label.** Without that, the agent
  finds that a no-op ship is free and, because shipping always follows good books, it
  inherits their credit. At 84,000 simulated shelves the policy had collapsed to "ship the
  ready bin" in every state, including with empty bins. Masking the action fixed it, and
  `legalActions` is now the single place that decides.
- **Stage is only legal for a book that clears its own 99¢ cost.** Same reasoning as shipping:
  a copy that cannot pay for itself is a guaranteed loss. Without it the agent learned
  "close the gap" as a general policy and staged worthless books — on the bad-book probe
  Q(stage) 48 against Q(skip) 18. With it, that row is Skip by construction rather than by a
  thin margin a different seed could flip.
- **Weights carry a version.** Changing the action semantics bumps `Q_VERSION`, so a browser
  holding a collapsed agent discards it and retrains rather than keeping it forever.

The policy is now stable from 400 to 84,000 simulated shelves: stage a good book, ship only
a cleared bin, skip a bad one. A test trains 20,000 shelves and asserts exactly that.

## Shelf matching

Each spine is resolved on its own while it streams, but a shelf is a *set* of books, and
independent retrieval cannot see that two reads are competing for one title. Following
Llabrés et al., *Image-text matching for large-scale book collections* (2024), which
shows many-to-many matching beating per-book retrieval, `src/lib/scan/match.ts` runs a
greedy maximum-weight assignment over the shelf once every read is in: each read keeps
the best title no one else is better placed to claim. Duplicate copies are allowed when
two reads are near-identical, since a little free library can hold two of the same book
— a deliberate departure from the paper, whose catalogue is a library inventory.

## Running on a phone (Termux) and shipping an APK

**Termux can run the web side; it cannot run YOLO.** Ultralytics needs PyTorch, and PyTorch
has no wheels for Termux's Android/bionic toolchain — `pip install ultralytics` will fail
regardless of how you set it up. Train and export on Colab, Kaggle or a laptop, and treat the
phone as a client and a test bench.

What does work in Termux:

```bash
pkg update && pkg install nodejs-lts git gh
git clone https://github.com/jcltd303-hub/bookMonee && cd bookMonee
npm ci
npm run bench                    # the OCR benchmark, on the device
npm run fetch:model              # download weights, if SPINE_MODEL_URL is set
npm run build && npm run preview # then open localhost:8081
```

If `npm ci` or the build is killed for memory, cap the heap: `NODE_OPTIONS=--max-old-space-size=1024`.

### An APK

Everything the app needs already runs in a WebView — camera, WASM OCR, ONNX detection,
IndexedDB, service worker — so the cheapest route is a native shell rather than a rewrite:

1. **Trusted Web Activity** — the PWA you have, wrapped for Play. Least work, needs Chrome,
   no native code at all.
2. **Capacitor** — scaffolded in this repo, `android/` and `capacitor.config.ts`. Self-contained
   and offline-first.

The Capacitor path, from a clean clone:

```bash
npm ci
npm run build:native      # prerenders "/" to static HTML and installs the OCR assets
npx cap sync android      # copies the build into android/app/src/main/assets/public
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

`build:native` exists because the Vercel build serves the page from a Nitro function and
leaves no `index.html`; a WebView needs one. It sets `NATIVE_BUILD=1`, which turns on
TanStack Start's prerender for `/`.

Two Android specifics already handled: `CAMERA` is declared in the manifest, without which
the WebView refuses `getUserMedia` no matter what the user taps, and `androidScheme: "https"`
keeps the bundled origin a secure context, which the camera and the WASM engines require.

Two things to change when you bundle rather than host:

- **The quote proxy stops existing.** `/api/quotes` is a Vercel function; inside an APK there
  is no server. Set `VITE_QUOTE_API_URL=https://okmonee.vercel.app/api/quotes` in the native
  build so live quotes still reach the deployed proxy, or leave it unset and the app quietly
  keeps using modelled quotes.
- **Nothing else needs the network.** The OCR engine, the detector model and the catalogue
  are all bundled assets, so a shelf reads with no signal.

## The native app

Build it from `native/` — `cd native && ./gradlew assembleDebug`. Needs **JDK 21** (the module
targets `jvmTarget 21`; on Java 24+ Gradle fails with a bare version string as the error) and
the Android SDK platform 35 (Android Studio installs it; `native/IMPORT.md` has the
command-line equivalent). That is a different project from the Capacitor shell in `android/`, which is built
from the repo root with `npm run build:native && npx cap sync android`.

`native/` holds a Kotlin / Jetpack Compose rewrite of the same app, imported from a separate
repository — see `native/IMPORT.md` for its provenance and why it is an import rather than a
merge. The Capacitor scaffold at `android/` is a different thing: a WebView shell around the
web app in this repo. Two routes to an APK; `native/` is the one that is genuinely native.

## Tests

`npm run test:logic` bundles the pure logic and runs it under `node --test`: ISBN
check digits, spine-text extraction, the plausibility gate, book identity, quote
floors, the packer's never-stage-a-loss rule, determinism, and that the trading agent
actually learns. No framework, no aliases, about a second.

`npm test` runs it. The platform's older suite is still there as `npm run test:platform`,
and is red for reasons unrelated to this app (its glob does not expand, and eight workspace
tests fail in this environment) — which is why it is no longer the front door.

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
