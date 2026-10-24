import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

// Builds a single self-executing file into the web app's public folder, so the
// app serves /slice.js beside the concierge it opens. Merchants load it with
// <script src="https://<app>/slice.js" data-slice-key="..." async></script>.
// `vite dev` serves index.html, a stand-in storefront for local testing.
export default defineConfig({
  server: { port: 5173 },
  define: { __SLICE_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: "../web/public",
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      name: "Slice",
      formats: ["iife"],
      fileName: () => "slice.js",
    },
  },
});
