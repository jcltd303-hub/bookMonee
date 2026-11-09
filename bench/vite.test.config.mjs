import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Bundle the pure logic for `node --test`, so the suite needs no path aliases. */
export default defineConfig({
  resolve: { alias: { "@": here("../src") } },
  build: {
    ssr: true,
    minify: false,
    emptyOutDir: true,
    outDir: here("../.bench"),
    rollupOptions: {
      input: here("./test-entry.ts"),
      external: ["tesseract.js"],
      output: { entryFileNames: "logic.mjs", format: "es" },
    },
  },
});
