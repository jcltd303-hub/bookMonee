#!/usr/bin/env node
/**
 * Copy the OCR engine's runtime files into public/tesseract/.
 *
 * Tesseract.js normally pulls its worker, WASM core and language model from a CDN
 * on first use. This app is meant to work in a park with no signal, so the files
 * ship with the site instead: the first read is served same-origin, and the service
 * worker keeps them for later ones.
 *
 * Only two core variants are copied (SIMD and plain); the app validates WebAssembly
 * SIMD support and asks for the one the device can actually run.
 *
 * Missing packages are a warning, not an error: the app falls back to the CDN, and a
 * build should never break over an optional asset.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "tesseract");

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];

mkdirSync(out, { recursive: true });

let copied = 0;
let bytes = 0;
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[ocr-assets] missing ${from} — skipping ${to} (OCR will fall back to the CDN)`);
    continue;
  }
  copyFileSync(src, join(out, to));
  copied += 1;
  bytes += statSync(src).size;
}

const mb = (bytes / 1_048_576).toFixed(1);
console.log(`[ocr-assets] ${copied}/${files.length} files, ${mb} MB → public/tesseract/`);
