#!/usr/bin/env node
/**
 * OCR benchmark.
 *
 * The scan path is the one part of this app that cannot be verified by reading the
 * code: it depends on how real spines look. This runs the production pipeline —
 * crop, rotate, binarise, gate — over a folder of labelled spine images, in Node,
 * with the same Tesseract model the app ships. No browser, no phone, one second per
 * run, so a change to the gate or the upscaling is measurable instead of a guess.
 *
 *   npm run bench                       # bench/spines, from the manifest
 *   npm run bench -- --dir /path/to/pics --verbose
 *   npm run bench -- --segment          # also report spine segmentation on each file
 *
 * Input: PNG files, each one spine as it appears on a shelf (vertical text, tall
 * frame). `manifest.json` in the folder pairs file names with the text you expect:
 *
 *   [{ "file": "s1.png", "expect": "ORGANIC CHEMISTRY" }]
 *
 * Use `"expect": ""` for an image that should be *rejected* — noise, a blank spine,
 * a shelf gap. Those are as important as the hits: the gate is what stops garbage
 * from being priced as a book.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWorker } from "tesseract.js";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import {
  prepareCrop,
  readSpineWith,
  segmentFrame,
  catalogVocabulary,
} from "../.bench/pipeline.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const dir = resolve(flag("dir", "bench/spines"));
const shelfDir = resolve(flag("shelves", "bench/shelves"));
const shelfManifestPath = join(shelfDir, "manifest.json");
const verbose = has("verbose");
const wantSegment = has("segment");
/** --no-gate reproduces the old confidence-only behaviour, to show what the gate catches. */
const gateOn = !has("no-gate");
/** --dump writes every prepared crop, so a bad read can be looked at rather than guessed at. */
const wantDump = has("dump");
if (wantDump) mkdirSync(".bench/dump", { recursive: true });

const manifestPath = join(dir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}. See the header of scripts/ocr-bench.mjs.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const shelfManifest = existsSync(shelfManifestPath) ? JSON.parse(readFileSync(shelfManifestPath, "utf8")) : [];

/** PNG or JPEG, into the RGBA buffer the pipeline takes. */
function decode(path) {
  const bytes = readFileSync(path);
  if (path.toLowerCase().endsWith(".png")) {
    const png = PNG.sync.read(bytes);
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
  }
  const jpg = jpeg.decode(bytes, { useTArray: true });
  return { data: new Uint8ClampedArray(jpg.data), width: jpg.width, height: jpg.height };
}

/** How many engines to run at once — the app runs two. */
const workers = Math.max(1, Math.min(4, Number(flag("workers", "1")) || 1));
const engines = [];
for (let i = 0; i < workers; i += 1) {
  engines.push(
    await createWorker("eng", 1, {
      langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int",
      gzip: true,
      cacheMethod: "none",
    }),
  );
}

/** The production pipeline takes an RGBA buffer; the engine takes an encoded image. */
const makeRecognize = (engine) => async (image) => {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  const { data } = await engine.recognize(PNG.sync.write(png));
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
};

const normalise = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Recall over the expected title, not overlap over the union.
 *
 * A correct read with an author line and a shelf sticker attached is a success —
 * "AMERICAN DECORATION THOMAS JAYNE n i n" did read the title. Penalising the extra
 * tokens measures noise, not accuracy, and hides real wins.
 */
const similarity = (got, expect) => {
  const want = new Set(normalise(expect).split(" ").filter(Boolean));
  const have = new Set(normalise(got).split(" ").filter(Boolean));
  if (!want.size) return 0;
  let shared = 0;
  for (const token of want) if (have.has(token)) shared += 1;
  return shared / want.size;
};

const rows = [];
let totalMs = 0;
const startedAll = Date.now();
let cursor = 0;

const runQueue = async (engine) => {
  const recognize = makeRecognize(engine);
  while (cursor < manifest.length) {
    const entry = manifest[cursor];
    cursor += 1;
    await runOne(entry, recognize);
  }
};

async function runOne(entry, recognize) {
  const file = join(dir, entry.file);
  if (!existsSync(file)) {
    rows.push({ file: entry.file, verdict: "missing", detail: "file not found" });
    return;
  }
  const png = decode(file);
  const source = {
    data: png.data,
    width: png.width,
    height: png.height,
  };
  const box = { x: 0, y: 0, w: png.width, h: png.height };

  if (wantDump) {
    for (const rotation of [90, 270, 0]) {
      const crop = prepareCrop(source, box, rotation);
      if (!crop) continue;
      const pngOut = new PNG({ width: crop.width, height: crop.height });
      pngOut.data = Buffer.from(crop.data);
      writeFileSync(`.bench/dump/${entry.file.replace(/\.png$/, "")}-rot${rotation}.png`, PNG.sync.write(pngOut));
    }
  }

  const started = Date.now();
  const read = await readSpineWith(source, box, recognize, catalogVocabulary, { gate: gateOn });
  const ms = Date.now() - started;
  totalMs += ms;

  const expect = normalise(entry.expect ?? "");
  let verdict;
  let score = 0;
  if (!read) {
    verdict = expect ? "rejected" : "ok(rejected)";
  } else {
    score = similarity(read.text, expect);
    if (!expect) verdict = "false accept";
    else if (normalise(read.text) === expect) verdict = "exact";
    else if (score >= 0.6) verdict = "partial";
    else verdict = "wrong";
  }
  rows.push({
    file: entry.file,
    expect: entry.expect ?? "",
    got: read?.text ?? "",
    rotation: read?.rotation,
    confidence: read?.confidence,
    plausibility: read?.plausibility.score,
    verdict,
    score,
    ms,
  });

  if (wantSegment) {
    const boxes = segmentFrame(png.data, png.width, png.height, { limit: 8 });
    console.log(`  segment ${entry.file}: ${boxes.length} spine box(es) in ${png.width}x${png.height}`);
  }
}

await Promise.all(engines.map((engine) => runQueue(engine)));

// --- shelf fixtures: a whole shelf row, so segmentation is scored too ---------
let shelfExpected = 0;
let shelfFound = 0;
const shelfLines = [];
let shelfCursor = 0;

const runShelf = async (engine) => {
  const recognize = makeRecognize(engine);
  while (shelfCursor < shelfManifest.length) {
    const entry = shelfManifest[shelfCursor];
    shelfCursor += 1;
    const file = join(shelfDir, entry.file);
    if (!existsSync(file)) continue;
    const image = decode(file);
    const boxes = segmentFrame(image.data, image.width, image.height, { limit: 40 });
    const texts = [];
    for (const box of boxes) {
      try {
        const read = await readSpineWith(image, box, recognize, catalogVocabulary, { gate: gateOn });
        if (read) texts.push(read.text);
      } catch {
        /* keep going */
      }
    }
    let found = 0;
    const misses = [];
    for (const want of entry.expect) {
      const best = texts.reduce((score, text) => Math.max(score, similarity(text, want)), 0);
      if (best >= 0.6) found += 1;
      else misses.push(`${want} (${best.toFixed(2)})`);
    }
    shelfExpected += entry.expect.length;
    shelfFound += found;
    shelfLines.push(
      `  ${entry.file.padEnd(28)} ${found}/${entry.expect.length} titles · ${boxes.length} spines segmented · ${texts.length} readable`,
    );
    if (misses.length) shelfLines.push(`      missed: ${misses.join(", ")}`);
  }
};

await Promise.all(engines.map((engine) => runShelf(engine)));
const wallMs = Date.now() - startedAll;
await Promise.all(engines.map((engine) => engine.terminate()));

const width = Math.max(...rows.map((row) => (row.file ?? "").length), 4);
console.log("\nfile".padEnd(width + 2) + "verdict".padEnd(14) + "rot".padEnd(5) + "conf".padEnd(6) + "plaus".padEnd(7) + "read");
console.log("-".repeat(width + 60));
for (const row of rows) {
  console.log(
    String(row.file).padEnd(width + 2) +
      String(row.verdict).padEnd(14) +
      String(row.rotation ?? "-").padEnd(5) +
      String(row.confidence ?? "-").padEnd(6) +
      String(row.plausibility ?? "-").padEnd(7) +
      (verbose ? JSON.stringify(row.got) : String(row.got ?? "").slice(0, 46)),
  );
  if (verbose && row.expect) console.log(`  expected: ${JSON.stringify(row.expect)}`);
}

const positives = rows.filter((row) => normalise(row.expect ?? ""));
const negatives = rows.filter((row) => !normalise(row.expect ?? ""));
const exact = positives.filter((row) => row.verdict === "exact").length;
const partial = positives.filter((row) => row.verdict === "partial").length;
const rejected = positives.filter((row) => row.verdict === "rejected").length;
const falseAccepts = negatives.filter((row) => row.verdict === "false accept").length;

console.log("-".repeat(width + 60));
console.log(
  `${gateOn ? "gate on" : "gate OFF"} · read ${exact + partial}/${positives.length} labelled spines` +
    ` (exact ${exact}, partial ${partial}, rejected ${rejected})` +
    ` · ${falseAccepts}/${negatives.length} noise images accepted` +
    ` · ${Math.round(totalMs / Math.max(1, rows.length))} ms per spine` +
    ` · ${workers} worker${workers === 1 ? "" : "s"}, ${wallMs} ms wall`,
);
if (shelfLines.length) {
  console.log("\nshelf rows (segmentation + OCR end to end)");
  for (const line of shelfLines) console.log(line);
  console.log(`  ${shelfFound}/${shelfExpected} expected titles found across ${shelfManifest.length} shelf rows`);
}
if (rejected) console.log("  rejected a labelled spine: lower the gate in src/lib/scan/plausibility.ts, or the read is genuinely bad");
if (falseAccepts) console.log("  accepted noise: raise the gate threshold");
