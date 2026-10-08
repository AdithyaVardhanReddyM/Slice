import { defineConfig } from "vite";

// Builds a single self-executing file (dist/slice.js) that merchants load with
// <script src=".../slice.js" data-slice-key="..." async></script>.
// `vite dev` serves index.html, a stand-in storefront for local testing.
export default defineConfig({
  server: { port: 5173 },
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Slice",
      formats: ["iife"],
      fileName: () => "slice.js",
    },
  },
});
