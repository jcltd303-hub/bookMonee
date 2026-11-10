#!/usr/bin/env node
/**
 * Put a spine-detection model where the app expects one.
 *
 * Detection is optional and entirely local: the app loads /models/spines.onnx with
 * ONNX Runtime Web and falls back to its own segmenter when the file is absent. Nothing
 * here phones home at runtime — this script just copies or downloads the weights once,
 * at build time, so the file is served as a static asset.
 *
 *   node scripts/fetch-model.mjs ./best.onnx            # copy a local export
 *   SPINE_MODEL_URL=https://… node scripts/fetch-model.mjs
 *
 * Any YOLO-family detector works if it was exported for inference:
 *
 *   yolo export model=best.pt format=onnx imgsz=640
 *
 * A model trained on the open-shelves dataset is the obvious starting point, but note
 * that dataset is CC BY-NC-SA 4.0 — non-commercial and share-alike — so weights derived
 * from it carry those terms. Ultralytics' exporter is AGPL-3.0. Check both before
 * shipping anything commercial.
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "models", "spines.onnx");
mkdirSync(dirname(out), { recursive: true });

const source = process.argv[2] ?? process.env.SPINE_MODEL_URL;

if (!source) {
  // Runs during `prebuild`, so this is the normal path for a deployment with no model:
  // the app falls back to its own segmenter and nothing fails.
  console.log("[model] no model configured — the app will use its own segmenter.");
  console.log("[model] set SPINE_MODEL_URL (Vercel → Environment Variables) or pass a path.");
  process.exit(0);
}

if (!/^https?:/i.test(source) && !existsSync(source)) {
  // A stale SPINE_MODEL_URL must not fail an otherwise good deploy.
  console.warn(`[model] ${source} is not a URL and not a file — skipping, segmenter stays in use.`);
  process.exit(0);
}

if (existsSync(source)) {
  copyFileSync(source, out);
  console.log(`[model] copied ${source} → public/models/spines.onnx (${Math.round(statSync(out).size / 1024)} KB)`);
} else {
  const response = await fetch(source);
  if (!response.ok || !response.body) {
    console.error(`[model] download failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  await pipeline(response.body, createWriteStream(out));
  console.log(`[model] downloaded → public/models/spines.onnx (${Math.round(statSync(out).size / 1024)} KB)`);
}
