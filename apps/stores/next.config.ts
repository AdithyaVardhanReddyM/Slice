import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Product photos are fetched from Pexels by scripts/fetch-images.ts and
    // committed under public/, so no remote patterns are needed yet.
  },
};

export default nextConfig;
