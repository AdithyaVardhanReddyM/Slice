import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { productFields, storeFields } from "./schema";

// The merchant's catalog as the agent sees it: a store record with its style
// vocabulary, and products in the Slice shape. Demo stores are seeded from
// @slice/demo-catalogs (seedDemo.ts); real merchants import a Slice CSV or
// sync from Shopify/WooCommerce (catalogImport.ts).

export type ProductDoc = Doc<"products">;

const productInput = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  brand: v.optional(v.string()),
  department: v.optional(v.string()),
  category: v.string(),
  subcategory: v.string(),
  price: v.number(),
  compareAtPrice: v.optional(v.number()),
  description: v.string(),
  details: v.array(v.string()),
  attributes: productFields.attributes,
  tags: v.array(v.string()),
  variants: productFields.variants,
  images: v.array(v.string()),
  url: v.string(),
  rating: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  bestseller: v.optional(v.boolean()),
  new: v.optional(v.boolean()),
});

const storeInput = v.object({
  key: v.string(),
  name: v.string(),
  tagline: v.string(),
  description: v.string(),
  currency: v.string(),
  vertical: v.string(),
  siteUrl: v.string(),
  styles: storeFields.styles,
  rooms: storeFields.rooms,
  brands: storeFields.brands,
  departments: storeFields.departments,
  nav: storeFields.nav,
  source: v.string(),
});

export const searchText = (p: {
  name: string;
  brand?: string;
  category: string;
  subcategory: string;
  description: string;
  details: string[];
  tags: string[];
  attributes: ProductDoc["attributes"];
}): string =>
  [
    p.name,
    p.brand ?? "",
    p.category,
    p.subcategory,
    p.description,
    ...p.details,
    ...p.tags,
    ...p.attributes.style.map((s) => s.replace(/-/g, " ")),
    ...p.attributes.material,
    ...p.attributes.colorFamily,
    ...p.attributes.colors,
    ...p.attributes.useCase,
    ...(p.attributes.room ?? []),
    ...(p.attributes.occasion ?? []),
    p.attributes.fit ?? "",
    ...(p.attributes.season ?? []),
    p.attributes.priceTier,
  ]
    .join(" \n ")
    .toLowerCase();

/** Replace a store's catalog wholesale. Used by the seeder and the CSV importer. */
export async function replaceCatalog(
  ctx: MutationCtx,
  store: typeof storeInput.type,
  products: (typeof productInput.type)[],
) {
  const existing = await ctx.db
    .query("stores")
    .withIndex("by_key", (q) => q.eq("key", store.key))
    .unique();
  const doc = { ...store, productCount: products.length, updatedAt: Date.now() };
  if (existing) await ctx.db.replace(existing._id, doc);
  else await ctx.db.insert("stores", doc);

  const old = await ctx.db
    .query("products")
    .withIndex("by_store", (q) => q.eq("storeKey", store.key))
    .collect();
  for (const p of old) await ctx.db.delete(p._id);
  for (const p of products) {
    await ctx.db.insert("products", { ...p, storeKey: store.key, text: searchText(p) });
  }
  return { products: products.length };
}

export const replace = internalMutation({
  args: { store: storeInput, products: v.array(productInput) },
  returns: v.object({ products: v.number() }),
  handler: (ctx, { store, products }) => replaceCatalog(ctx, store, products),
});

/** Same as `replace`, callable from the console (catalog import). */
export const importCatalog = mutation({
  args: { store: storeInput, products: v.array(productInput) },
  returns: v.object({ products: v.number() }),
  handler: (ctx, { store, products }) => replaceCatalog(ctx, store, products),
});

export const store = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});

export const stores = query({
  args: {},
  handler: async (ctx) => ctx.db.query("stores").collect(),
});

const PUBLIC_FIELDS = [
  "id",
  "slug",
  "name",
  "brand",
  "department",
  "category",
  "subcategory",
  "price",
  "compareAtPrice",
  "description",
  "details",
  "attributes",
  "tags",
  "variants",
  "images",
  "url",
] as const;

export type PublicProduct = Pick<ProductDoc, (typeof PUBLIC_FIELDS)[number]>;

/** Strips Convex internals and the popularity fields the agent must not rank by. */
export function publicProduct(p: ProductDoc): PublicProduct {
  const out = {} as Record<string, unknown>;
  for (const k of PUBLIC_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  return out as PublicProduct;
}

async function allProducts(ctx: QueryCtx, storeKey: string) {
  return ctx.db
    .query("products")
    .withIndex("by_store", (q) => q.eq("storeKey", storeKey))
    .collect();
}

export const get = query({
  args: { storeKey: v.string(), ids: v.array(v.string()) },
  handler: async (ctx, { storeKey, ids }) => {
    const out: PublicProduct[] = [];
    for (const id of ids) {
      const byId = await ctx.db
        .query("products")
        .withIndex("by_store_id", (q) => q.eq("storeKey", storeKey).eq("id", id))
        .unique();
      const p =
        byId ??
        (await ctx.db
          .query("products")
          .withIndex("by_store_slug", (q) => q.eq("storeKey", storeKey).eq("slug", id))
          .unique());
      if (p) out.push(publicProduct(p));
    }
    return out;
  },
});

/** Plain text search, for "do you have linen shirts?" questions. */
export const search = query({
  args: {
    storeKey: v.string(),
    query: v.string(),
    category: v.optional(v.string()),
    department: v.optional(v.string()),
    priceMax: v.optional(v.number()),
    take: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const terms = args.query.toLowerCase().split(/[^a-z0-9']+/).filter((t) => t.length > 1);
    const products = (await allProducts(ctx, args.storeKey)).filter((p) =>
      passesFilters(p, args),
    );
    const scored = products
      .map((p) => {
        const score = terms.reduce((acc, t) => {
          if (p.name.toLowerCase().includes(t)) return acc + 3;
          if (p.subcategory.toLowerCase().includes(t)) return acc + 2;
          return p.text.includes(t) ? acc + 1 : acc;
        }, 0);
        return { p, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.take ?? 8);
    return {
      total: products.length,
      matches: scored.length,
      products: scored.map((r) => ({ ...publicProduct(r.p), score: r.score })),
    };
  },
});

function passesFilters(
  p: ProductDoc,
  f: {
    category?: string;
    subcategory?: string;
    department?: string;
    room?: string;
    priceMax?: number;
    priceMin?: number;
    excludeIds?: string[];
  },
): boolean {
  const eq = (a: string | undefined, b: string | undefined) =>
    !b || (a ?? "").toLowerCase() === b.toLowerCase();
  if (!eq(p.category, f.category)) return false;
  if (!eq(p.subcategory, f.subcategory)) return false;
  if (f.department && p.department && p.department !== "unisex") {
    if (p.department !== f.department.toLowerCase()) return false;
  }
  if (f.room && !(p.attributes.room ?? []).some((r) => r.toLowerCase() === f.room!.toLowerCase())) {
    return false;
  }
  if (f.priceMax !== undefined && p.price > f.priceMax) return false;
  if (f.priceMin !== undefined && p.price < f.priceMin) return false;
  if (f.excludeIds?.includes(p.id)) return false;
  if (!p.variants.some((vv) => vv.inStock)) return false;
  return true;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

/**
 * Does a taste term ("workwear-inspired", "Nordic", "slow living") occur in a
 * product? Matches whole words and word prefixes of 5+ letters, so "minimal"
 * hits "minimalist" but "art" doesn't hit "artisan".
 */
function termHits(term: string, text: string): boolean {
  const words = tokens(term);
  if (words.length === 0) return false;
  if (words.length > 1 && text.includes(term.toLowerCase())) return true;
  return words.some((w) => {
    if (w.length < 4) return false;
    const stem = w.length >= 6 ? w.slice(0, Math.max(5, w.length - 2)) : w;
    return new RegExp(`\\b${stem}`).test(text);
  });
}

/**
 * Taste-ranked candidates. The whole point of Slice: products are ranked by
 * how well they fit the shopper's taste (Qloo-derived style weights, terms
 * and brand affinities) within what they asked for. Never by rating, sales
 * or newness.
 */
export const recommend = query({
  args: {
    storeKey: v.string(),
    taste: v.object({
      styles: v.array(v.object({ id: v.string(), weight: v.number() })),
      terms: v.array(v.object({ term: v.string(), weight: v.number() })),
      brands: v.array(v.object({ name: v.string(), weight: v.number() })),
      palette: v.optional(v.array(v.string())),
      materials: v.optional(v.array(v.string())),
      avoid: v.optional(v.array(v.string())),
    }),
    intent: v.optional(
      v.object({
        category: v.optional(v.string()),
        subcategory: v.optional(v.string()),
        department: v.optional(v.string()),
        room: v.optional(v.string()),
        keywords: v.optional(v.array(v.string())),
        priceMax: v.optional(v.number()),
        priceMin: v.optional(v.number()),
        excludeIds: v.optional(v.array(v.string())),
      }),
    ),
    take: v.optional(v.number()),
    /** Max products per subcategory in the result, so a browse doesn't return five sofas. */
    perSubcategory: v.optional(v.number()),
  },
  handler: async (ctx, { storeKey, taste, intent = {}, take = 12, perSubcategory }) => {
    const all = await allProducts(ctx, storeKey);
    const pool = all.filter((p) => passesFilters(p, intent));

    const styleWeight = new Map(taste.styles.map((s) => [s.id, s.weight]));
    const maxStyle = Math.max(0, ...taste.styles.map((s) => s.weight));
    const terms = taste.terms.slice(0, 40);
    const termTotal = terms.reduce((a, t) => a + t.weight, 0);
    const brandWeight = new Map(taste.brands.map((b) => [b.name.toLowerCase(), b.weight]));
    const keywords = (intent.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
    const palette = (taste.palette ?? []).map((c) => c.toLowerCase());
    const materials = (taste.materials ?? []).map((m) => m.toLowerCase());
    const avoid = (taste.avoid ?? []).map((a) => a.toLowerCase());

    const scored = pool.map((p) => {
      const matchedStyles = p.attributes.style.filter((s) => styleWeight.has(s));
      const styleScore =
        maxStyle > 0
          ? Math.min(1, Math.max(0, ...matchedStyles.map((s) => styleWeight.get(s)! / maxStyle)))
          : 0;

      const matchedTerms = terms.filter((t) => termHits(t.term, p.text));
      const termScore =
        termTotal > 0
          ? Math.min(1, (matchedTerms.reduce((a, t) => a + t.weight, 0) / termTotal) * 3)
          : 0;

      const colorText = [...p.attributes.colors, ...p.attributes.colorFamily].join(" ").toLowerCase();
      const paletteHits = palette.filter((c) => termHits(c, colorText));
      const materialHits = materials.filter((m) => termHits(m, p.attributes.material.join(" ").toLowerCase()));
      const detailScore =
        (palette.length ? Math.min(1, paletteHits.length / 2) : 0) * 0.5 +
        (materials.length ? Math.min(1, materialHits.length / 2) : 0) * 0.5;

      const brand = p.brand ? (brandWeight.get(p.brand.toLowerCase()) ?? 0) : 0;
      const avoidHits = avoid.filter((a) => termHits(a, p.text));

      const keywordHits = keywords.filter((k) => termHits(k, p.text));
      const intentScore = keywords.length ? keywordHits.length / keywords.length : 1;

      const hasDetails = palette.length + materials.length > 0;
      const taste =
        styleScore * (hasDetails ? 0.5 : 0.6) +
        termScore * (hasDetails ? 0.3 : 0.4) +
        (hasDetails ? detailScore * 0.2 : 0);
      const score =
        Math.max(0, taste * 0.75 + brand * 0.1 + intentScore * 0.15 - avoidHits.length * 0.15);

      return {
        product: publicProduct(p),
        score: round(score),
        breakdown: {
          taste: round(taste),
          style: round(styleScore),
          terms: round(termScore),
          details: round(detailScore),
          brand: round(brand),
          intent: round(intentScore),
        },
        matched: {
          styles: matchedStyles,
          terms: matchedTerms.map((t) => t.term),
          palette: paletteHits,
          materials: materialHits,
          brand: brand > 0 ? p.brand : undefined,
          keywords: keywordHits,
          avoided: avoidHits,
        },
      };
    });

    scored.sort((a, b) => b.score - a.score);

    // Spread across subcategories when browsing, so taste shows across the store.
    const cap = perSubcategory ?? (intent.subcategory ? Infinity : intent.category ? 3 : 2);
    const perSub = new Map<string, number>();
    const picked: typeof scored = [];
    const overflow: typeof scored = [];
    for (const c of scored) {
      const key = c.product.subcategory;
      const n = perSub.get(key) ?? 0;
      if (n < cap) {
        perSub.set(key, n + 1);
        picked.push(c);
      } else overflow.push(c);
      if (picked.length >= take) break;
    }
    const candidates = picked.length >= take ? picked : [...picked, ...overflow].slice(0, take);

    return {
      catalogSize: all.length,
      pool: pool.length,
      candidates,
    };
  },
});

const round = (n: number) => Math.round(n * 1000) / 1000;
