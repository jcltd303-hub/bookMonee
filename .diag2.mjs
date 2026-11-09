import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { createWorker } from "tesseract.js";
import { readSpineWith, segmentFrame, catalogVocabulary, assess } from "./.bench/pipeline.mjs";

const rows = [
  { file: "shelf-dictionaries-1.jpg", expect: ["TEACH YOURSELF","LAROUSSE","THE STORY OF FRENCH","STREET FRENCH","RUSSIAN VERBS","LEARNING RUSSIAN","CZECH"] },
  { file: "shelf-bookstore-1.jpg", expect: ["BREAKING THE CODE","REDBIRDS","TONY HANCOCK","THE GOLDEN STRING","JO BRAND"] },
  { file: "shelf-bookstore-2.jpg", expect: ["THE HOFFA WARS","SEABISCUIT","DAVID JASON","CAINE","POTTER"] },
];
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const recall = (got, want) => {
  const w = new Set(norm(want).split(" ").filter(Boolean));
  const g = new Set(norm(got).split(" ").filter(Boolean));
  let hit = 0; for (const t of w) if (g.has(t)) hit++;
  return w.size ? hit / w.size : 0;
};
const toPng = (img) => { const p = new PNG({ width: img.width, height: img.height }); p.data = Buffer.from(img.data); return PNG.sync.write(p); };

const worker = await createWorker("eng", 1, { langPath: "node_modules/@tesseract.js-data/eng/4.0.0_best_int", gzip: true, cacheMethod: "none" });
await worker.setParameters({ tessedit_pageseg_mode: "6" });
const recognize = async (image) => {
  const { data } = await worker.recognize(toPng(image));
  return { text: data.text ?? "", confidence: data.confidence ?? 0 };
};

for (const row of rows) {
  const bytes = readFileSync(`bench/shelves/${row.file}`);
  const img = jpeg.decode(bytes, { useTArray: true });
  const image = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const boxes = segmentFrame(image.data, image.width, image.height, { limit: 40 });
  const gated = [];
  const ungated = [];
  for (const box of boxes) {
    const withGate = await readSpineWith(image, box, recognize, catalogVocabulary);
    if (withGate) gated.push(withGate.text);
    const noGate = await readSpineWith(image, box, recognize, catalogVocabulary, { gate: false });
    if (noGate) ungated.push(noGate.text);
  }
  console.log(`\n${row.file}: ${boxes.length} boxes, ${gated.length} gated reads, ${ungated.length} ungated reads`);
  for (const want of row.expect) {
    const bestGated = gated.reduce((s, t) => Math.max(s, recall(t, want)), 0);
    const bestRaw = ungated.reduce((s, t) => Math.max(s, recall(t, want)), 0);
    const closest = ungated.map((t) => [recall(t, want), t]).sort((a, b) => b[0] - a[0])[0];
    console.log(`  ${want.padEnd(20)} gated ${bestGated.toFixed(2)}  ungated ${bestRaw.toFixed(2)}  closest=${JSON.stringify((closest?.[1] ?? "").slice(0, 44))} plaus=${assess(closest?.[1] ?? "", catalogVocabulary).score}`);
  }
}
await worker.terminate();
