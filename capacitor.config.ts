import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the APK.
 *
 * The app is a WebView app: camera, WASM OCR, ONNX detection, IndexedDB and the catalogue
 * all already run in one, so the shell adds permissions and packaging rather than a rewrite.
 *
 * webDir points at the prerendered build, so run `npm run build:native` before `npx cap sync`
 * — that build emits static HTML, where the Vercel build serves the same page from a
 * Nitro function and leaves no index.html behind.
 */
const config: CapacitorConfig = {
  appId: "app.okmonee.spineroute",
  appName: "Spine Route",
  webDir: ".vercel/output/static",
  android: {
    // A bundled origin, so it must be https to be a secure context: getUserMedia and the
    // WASM engines both require one.
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
