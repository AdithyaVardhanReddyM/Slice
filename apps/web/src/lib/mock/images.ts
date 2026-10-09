import type { Product } from "@slice/demo-catalogs";

// Kept apart from catalog.ts so client components can resolve image URLs
// without pulling the catalog JSON into the browser bundle.

// Product photos are served by the demo stores app, the way a real merchant's
// catalog points at its own CDN.
const STORES_URL =
  process.env.NEXT_PUBLIC_STORES_URL ?? "http://localhost:3002";

export function productImage(p: Pick<Product, "images">): string | null {
  const src = p.images[0];
  if (!src) return null;
  return src.startsWith("http") ? src : `${STORES_URL}${src}`;
}
