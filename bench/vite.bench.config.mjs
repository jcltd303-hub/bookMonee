import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Bundle the scan pipeline for Node so the benchmark exercises production code. */
export default defineConfig({
  resolve: { alias: { "@": here("../src") } },
  build: {
    ssr: true,
    minify: false,
    emptyOutDir: true,
    outDir: here("../.bench"),
    rollupOptions: {
      input: here("./entry.ts"),
      external: ["tesseract.js"],
      output: { entryFileNames: "pipeline.mjs", format: "es" },
    },
  },
});
