/**
 * What the Node benchmark imports from the app.
 *
 * Bundled by bench/vite.bench.config.mjs so the benchmark runs the same crop,
 * rotate, binarise, gate and segment code the browser runs. Nothing here is a copy.
 */
export { prepareCrop, readSpineWith, type Recognizer, type SpineRead } from "@/lib/scan/ocr";
export { segmentFrame, spineBoxes, toGrey } from "@/lib/scan/spines";
export { assess } from "@/lib/scan/plausibility";
export { catalogVocabulary } from "@/lib/agents/rag";
