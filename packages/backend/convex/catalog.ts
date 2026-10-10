import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { tasteByProduct } from "./catalogTaste";
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
 * hits "minimalist" but "art" doesn't hit "artisan". A multi-word term needs
 * the phrase or most of its words, so "waxed cotton canvas" doesn't match
 * every cotton tee.
 */
function termHits(term: string, text: string): boolean {
  const words = tokens(term);
  if (words.length === 0) return false;
  if (words.length > 1 && text.includes(term.toLowerCase())) return true;
  const hit = (w: string) => {
    if (w.length < 4) return false;
    const stem = w.length >= 6 ? w.slice(0, Math.max(5, w.length - 2)) : w;
    return new RegExp(`\\b${stem}`).test(text);
  };
  const hits = words.filter(hit).length;
  return words.length === 1 ? hits === 1 : hits >= Math.ceil(words.length / 2) && hits >= 2;
}

/**
 * Profile tag weight: Qloo affinity scaled by how much the tag type says about
 * what someone buys. For clothes, how a person dresses (personal style) says
 * the most; for a home, the mood of a room (emotional tone, lifestyle) says as
 * much as its look, so those types count more for home stores.
 */
const TAG_TYPE_WEIGHT: Record<string, Record<string, number>> = {
  default: {
    "urn:tag:personal_style:qloo": 1,
    "urn:tag:aesthetic_property:qloo": 0.9,
    "urn:tag:lifestyle:qloo": 0.8,
    "urn:tag:emotional_tone:qloo": 0.5,
    "urn:tag:customer_identity:qloo": 0.5,
    "urn:tag:core_values:qloo": 0.4,
    // Cultural types from the media side; "Art Deco" or "Whimsical" on a film is a style word too.
    "urn:tag:style:qloo": 0.7,
    "urn:tag:audience:qloo": 0.3,
  },
  home: {
    "urn:tag:aesthetic_property:qloo": 1,
    "urn:tag:emotional_tone:qloo": 0.9,
    "urn:tag:lifestyle:qloo": 0.9,
    "urn:tag:personal_style:qloo": 0.8,
    "urn:tag:customer_identity:qloo": 0.5,
    "urn:tag:core_values:qloo": 0.5,
    "urn:tag:style:qloo": 0.8,
    "urn:tag:audience:qloo": 0.3,
  },
};

/**
 * Qloo files the same word under several types: "Art Deco" is
 * urn:tag:style:qloo:art_deco on a film and urn:tag:personal_style:qloo:art_deco
 * on a brand. The word is the signal, so tags are matched on their slug, lightly
 * stemmed ("nostalgic" and "nostalgia" meet at "nostalg").
 */
export function tagKey(id: string): string {
  const slug = id.split(":").pop()?.toLowerCase() ?? id;
  return slug.length >= 6 ? slug.slice(0, Math.max(5, slug.length - 2)) : slug;
}

export const tagTypeWeights = (vertical: string | undefined): Record<string, number> =>
  /home|living|furnit|decor|interior/i.test(vertical ?? "") ? TAG_TYPE_WEIGHT.home : TAG_TYPE_WEIGHT.default;

/** How much one browsing event says about taste; the agent sums these per product. */
const sessionWeightValidator = v.array(v.object({ productId: v.string(), weight: v.number() }));

/**
 * Taste-ranked candidates. The whole point of Slice: products are ranked by
 * how well they fit the shopper's taste within what they asked for. Never by
 * rating, sales or newness.
 *
 * Taste has layers, strongest first:
 *  - Qloo tag overlap: the shopper's Qloo tags against each product's own
 *    Qloo tags (productTaste, see catalogTaste.ts), matched by id.
 *  - style weights: the agent's brief (or the deterministic hints) in the
 *    store's style vocabulary.
 *  - palette and materials from the brief; brand affinities for brands the
 *    store carries; Qloo terms found in the copy for untagged products.
 *  - the session: products this shopper viewed, opened or carted, which lend
 *    their styles and tags at reduced weight.
 */
const tasteValidator = v.object({
  styles: v.array(v.object({ id: v.string(), weight: v.number() })),
  terms: v.array(v.object({ term: v.string(), weight: v.number() })),
  brands: v.array(v.object({ name: v.string(), weight: v.number() })),
  /** The profile's Qloo tags: id, type and affinity. */
  tags: v.optional(v.array(v.object({ id: v.string(), type: v.string(), affinity: v.number() }))),
  palette: v.optional(v.array(v.string())),
  materials: v.optional(v.array(v.string())),
  avoid: v.optional(v.array(v.string())),
  /** What this shopper did on the site this session, already weighted. */
  session: v.optional(sessionWeightValidator),
});
type Taste = typeof tasteValidator.type;

const intentValidator = v.object({
  category: v.optional(v.string()),
  subcategory: v.optional(v.string()),
  department: v.optional(v.string()),
  room: v.optional(v.string()),
  keywords: v.optional(v.array(v.string())),
  priceMax: v.optional(v.number()),
  priceMin: v.optional(v.number()),
  excludeIds: v.optional(v.array(v.string())),
  /** The product the shopper is looking at: never a candidate, and the
   *  taste seed when they have no profile yet. */
  anchorId: v.optional(v.string()),
});
type Intent = typeof intentValidator.type;

type TasteRows = Awaited<ReturnType<typeof tasteByProduct>>;

/**
 * Score every product in `pool` against the shopper's taste. Shared by
 * recommend (taste-ranked browse) and search (text matches, then taste), so a
 * product found either way carries the same fit, rank and evidence.
 */
function scorePool(
  all: ProductDoc[],
  tasteRows: TasteRows,
  given: Taste,
  intent: Intent,
  typeWeight: Record<string, number> = TAG_TYPE_WEIGHT.default,
) {
  const byId = new Map(all.map((p) => [p.id, p]));
    const anchor = intent.anchorId
      ? all.find((p) => p.id === intent.anchorId || p.slug === intent.anchorId)
      : undefined;
    const excludeIds = [...(intent.excludeIds ?? []), ...(anchor ? [anchor.id] : [])];
    const pool = all.filter((p) => passesFilters(p, { ...intent, excludeIds }));

    // --- the shopper's taste vector ------------------------------------------
    const hasProfile = given.styles.length + given.terms.length + given.brands.length + (given.tags?.length ?? 0) > 0;

    // Tags by word (tagKey), from the profile, with type weights.
    const tagWeight = new Map<string, number>();
    for (const t of given.tags ?? []) {
      const w = (typeWeight[t.type] ?? 0.3) * t.affinity;
      const k = tagKey(t.id);
      if (w > 0) tagWeight.set(k, Math.max(tagWeight.get(k) ?? 0, w));
    }
    const styleWeight = new Map(given.styles.map((s) => [s.id, s.weight]));

    // The session layer: what they looked at lends its styles and tags. The
    // page product is the anchor, not browsing evidence, so it is left out here.
    const session = (given.session ?? []).filter(
      (s) => s.weight > 0 && s.productId !== anchor?.id && s.productId !== anchor?.slug,
    );
    const sessionProducts = session
      .map((s) => ({ p: byId.get(s.productId), w: Math.min(1, s.weight) }))
      .filter((s): s is { p: ProductDoc; w: number } => !!s.p);
    if (sessionProducts.length) {
      const sessionStyle = new Map<string, number>();
      for (const { p, w } of sessionProducts) {
        for (const s of p.attributes.style) sessionStyle.set(s, Math.min(1, (sessionStyle.get(s) ?? 0) + w));
        for (const t of tasteRows.get(p.id)?.tags ?? []) {
          const add = w * t.weight * 0.5;
          const k = tagKey(t.id);
          tagWeight.set(k, Math.min(1, (tagWeight.get(k) ?? 0) + add));
        }
      }
      const lend = hasProfile || anchor ? 0.5 : 1;
      for (const [id, w] of sessionStyle) styleWeight.set(id, Math.min(1, (styleWeight.get(id) ?? 0) + w * lend));
    }

    // No profile: rank by likeness to the anchor (the session still lends on top).
    const seededFrom = !hasProfile && anchor ? anchor.name : undefined;
    if (seededFrom) {
      for (const id of anchor!.attributes.style) styleWeight.set(id, 1);
      for (const t of tasteRows.get(anchor!.id)?.tags ?? []) tagWeight.set(tagKey(t.id), t.weight);
    }
    const terms = seededFrom ? anchor!.tags.slice(0, 12).map((term) => ({ term, weight: 1 })) : given.terms.slice(0, 40);
    const palette = (seededFrom ? anchor!.attributes.colorFamily : (given.palette ?? [])).map((c) => c.toLowerCase());
    const materials = (seededFrom ? anchor!.attributes.material : (given.materials ?? [])).map((m) => m.toLowerCase());
    const avoid = (given.avoid ?? []).map((a) => a.toLowerCase());

    const maxStyle = Math.max(0, ...styleWeight.values());
    const termTotal = terms.reduce((a, t) => a + t.weight, 0);
    const brandWeight = new Map(given.brands.map((b) => [b.name.toLowerCase(), b.weight]));
    const keywords = (intent.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
    // A product matching the shopper's four strongest tags scores 1.0 on tags.
    const tagNorm = [...tagWeight.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) * 0.75;
    const unranked = maxStyle === 0 && tagWeight.size === 0 && termTotal === 0 && brandWeight.size === 0;

    // --- score every product in the pool -----------------------------------
    const scored = pool.map((p) => {
      const matchedStyles = p.attributes.style.filter((s) => styleWeight.has(s));
      const styleScore =
        maxStyle > 0 ? Math.min(1, Math.max(0, ...matchedStyles.map((s) => styleWeight.get(s)! / maxStyle))) : 0;

      const productTags = tasteRows.get(p.id)?.tags ?? [];
      const seenKeys = new Set<string>();
      const matchedTags = productTags
        .filter((t) => {
          const k = tagKey(t.id);
          if (!tagWeight.has(k) || seenKeys.has(k)) return false;
          seenKeys.add(k);
          return true;
        })
        .map((t) => ({ ...t, contribution: tagWeight.get(tagKey(t.id))! * t.weight }))
        .sort((a, b) => b.contribution - a.contribution);
      const tagScore = tagNorm > 0 ? Math.min(1, matchedTags.reduce((a, t) => a + t.contribution, 0) / tagNorm) : 0;

      const matchedTerms = terms.filter((t) => termHits(t.term, p.text));
      const termScore =
        termTotal > 0 ? Math.min(1, (matchedTerms.reduce((a, t) => a + t.weight, 0) / termTotal) * 3) : 0;
      // Tagged products are judged by their Qloo tags; the copy match only backs that up.
      const qlooScore = productTags.length ? Math.max(tagScore, termScore * 0.5) : termScore;

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
        styleScore * (hasDetails ? 0.45 : 0.55) +
        qlooScore * (hasDetails ? 0.35 : 0.45) +
        (hasDetails ? detailScore * 0.2 : 0);
      const score = Math.max(0, taste * 0.75 + brand * 0.1 + intentScore * 0.15 - avoidHits.length * 0.15);

      return {
        product: publicProduct(p),
        score: round(score),
        breakdown: {
          taste: round(taste),
          style: round(styleScore),
          terms: round(qlooScore),
          details: round(detailScore),
          brand: round(brand),
          intent: round(intentScore),
        },
        matched: {
          styles: matchedStyles,
          tags: matchedTags.slice(0, 4).map((t) => t.name),
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
    // Where each product sits in the whole pool, so a card can say "top 3% for you"
    // instead of an absolute number that always lands in the eighties.
    const position = new Map(scored.map((c, i) => [c.product.id, i + 1]));
  return {
    pool,
    scored,
    position,
    seededFrom,
    unranked,
    session: sessionProducts.length
      ? {
          products: sessionProducts.map((s) => s.p.name),
          styles: [...new Set(sessionProducts.flatMap((s) => s.p.attributes.style))].slice(0, 4),
        }
      : undefined,
  };
}

export const recommend = query({
  args: {
    storeKey: v.string(),
    taste: tasteValidator,
    intent: v.optional(intentValidator),
    take: v.optional(v.number()),
    /** Max products per subcategory in the result, so a browse doesn't return five sofas. */
    perSubcategory: v.optional(v.number()),
  },
  handler: async (ctx, { storeKey, taste, intent = {}, take = 12, perSubcategory }) => {
    const all = await allProducts(ctx, storeKey);
    const tasteRows = await tasteByProduct(ctx, storeKey);
    const storeDoc = await ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", storeKey))
      .unique();
    const { pool, scored, position, seededFrom, unranked, session } = scorePool(
      all,
      tasteRows,
      taste,
      intent,
      tagTypeWeights(storeDoc?.vertical),
    );

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
    const chosen = picked.length >= take ? picked : [...picked, ...overflow].slice(0, take);
    const candidates = chosen.map((c) => ({
      ...c,
      rank: { position: position.get(c.product.id)!, pool: pool.length },
    }));

    return {
      catalogSize: all.length,
      pool: pool.length,
      /** Set when the shopper has no profile and the ranking came from the anchor product. */
      seededFrom,
      /** True when nothing ranked the pool: no taste, no session, no anchor. */
      unranked,
      /** What the session layer contributed, for the trace. */
      session,
      /** How many candidates were judged by their own Qloo tags. */
      taggedProducts: tasteRows.size,
      candidates,
    };
  },
});

/**
 * Plain text search, for "do you have linen shirts?" questions. With a taste,
 * each match also carries its fit, rank and evidence from the same scorer as
 * recommend, so a product found by search is never an unranked pick.
 */
export const search = query({
  args: {
    storeKey: v.string(),
    query: v.string(),
    category: v.optional(v.string()),
    department: v.optional(v.string()),
    priceMax: v.optional(v.number()),
    take: v.optional(v.number()),
    taste: v.optional(tasteValidator),
  },
  handler: async (ctx, args) => {
    const terms = args.query.toLowerCase().split(/[^a-z0-9']+/).filter((t) => t.length > 1);
    const all = await allProducts(ctx, args.storeKey);
    const products = all.filter((p) => passesFilters(p, args));
    const matches = products
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

    let ranked: ReturnType<typeof scorePool> | null = null;
    if (args.taste) {
      const tasteRows = await tasteByProduct(ctx, args.storeKey);
      const storeDoc = await ctx.db
        .query("stores")
        .withIndex("by_key", (q) => q.eq("key", args.storeKey))
        .unique();
      ranked = scorePool(
        all,
        tasteRows,
        args.taste,
        { category: args.category, department: args.department, priceMax: args.priceMax },
        tagTypeWeights(storeDoc?.vertical),
      );
    }
    const byId = new Map((ranked?.scored ?? []).map((c) => [c.product.id, c]));
    return {
      total: products.length,
      matches: matches.length,
      products: matches.map((r) => ({ ...publicProduct(r.p), score: r.score })),
      /** The same shape recommend returns, for the matches, when a taste was given. */
      candidates: ranked
        ? matches.flatMap((r) => {
            const c = byId.get(r.p.id);
            return c ? [{ ...c, rank: { position: ranked!.position.get(r.p.id)!, pool: ranked!.pool.length } }] : [];
          })
        : [],
    };
  },
});

const round = (n: number) => Math.round(n * 1000) / 1000;
