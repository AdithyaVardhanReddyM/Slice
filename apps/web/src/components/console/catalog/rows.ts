import type { Catalog } from "@slice/demo-catalogs";
import { productImage } from "@/lib/mock/catalog";
import type { StoreKey } from "@/lib/mock/types";
import {
  attributeGaps,
  enrichedAttributes,
  matchedTags,
  readiness,
  recStats,
} from "./model";
import type { CatalogRow, StyleCoverage } from "./types";

// Server-side builders. Keep imports of this file out of client components so
// the catalog JSON never reaches the browser bundle.

const STORES_URL =
  process.env.NEXT_PUBLIC_STORES_URL ?? "http://localhost:3002";

/**
 * @param recsTarget Product recommendations in the last 7 days across the
 * store, so per-product mock counts add up to the overview metrics.
 */
export function catalogRows(
  catalog: Catalog,
  store: StoreKey,
  recsTarget?: number,
): CatalogRow[] {
  const label = new Map(catalog.store.styles.map((s) => [s.id, s.label]));
  const rawTotal = catalog.products.reduce(
    (sum, p) => sum + recStats(p, readiness(p).score).recommended,
    0,
  );
  const scale = recsTarget && rawTotal ? recsTarget / rawTotal : 1;
  return catalog.products.map((p) => {
    const a = p.attributes;
    const r = readiness(p);
    return {
      id: p.id,
      name: p.name,
      brand: p.brand ?? null,
      category: p.category,
      subcategory: p.subcategory,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? null,
      image: productImage(p),
      href: `${STORES_URL}/${store}/p/${p.slug}`,
      description: p.description,
      styles: a.style.map((id) => ({ id, label: label.get(id) ?? id })),
      attrs: {
        material: a.material,
        colors: a.colors,
        colorFamily: a.colorFamily,
        useCase: a.useCase,
        context: a.room ?? a.occasion ?? [],
        contextField: a.room ? "room" : "occasion",
        fit: a.fit ?? null,
        season: a.season ?? [],
        priceTier: a.priceTier,
      },
      variants: p.variants.map((v) => ({ label: v.label, inStock: v.inStock })),
      inStock: p.variants.filter((v) => v.inStock).length,
      readiness: r,
      gaps: attributeGaps(p),
      stats: recStats(p, r.score, scale),
      enriched: enrichedAttributes(p),
      tags: matchedTags(p),
      haystack: [
        p.name,
        p.brand,
        p.id,
        p.subcategory,
        ...p.tags,
        ...a.material,
        ...a.colors,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
}

/**
 * Catalog share per style axis value. A product tagged with two styles counts
 * half toward each, so shares sum to 100% and compare 1:1 with shopper demand.
 */
export function styleCoverage(catalog: Catalog): StyleCoverage[] {
  const n = catalog.products.length || 1;
  return catalog.store.styles
    .map((s) => {
      let count = 0;
      let weighted = 0;
      for (const p of catalog.products) {
        if (p.attributes.style.includes(s.id)) {
          count += 1;
          weighted += 1 / p.attributes.style.length;
        }
      }
      return {
        id: s.id,
        label: s.label,
        description: s.description,
        count,
        share: weighted / n,
      };
    })
    .sort((a, b) => b.share - a.share);
}
