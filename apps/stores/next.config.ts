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
  // The bookshop was Folio & Fern at /folio; links made before the rename still land.
  async redirects() {
    return [{ source: "/folio/:path*", destination: "/stackhouse/:path*", permanent: false }];
  },
};

export default nextConfig;
