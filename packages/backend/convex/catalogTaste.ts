import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { cachedQlooGet } from "./qloo";

// The catalog in Qloo's vocabulary. A shopper's profile is a set of Qloo tags;
// matching those to merchant prose by substring (tasteHints.ts) loses most of
// the signal. Instead each product gets its own Qloo tags, once, from two
// sources: the brand's Qloo entity (pure Qloo) and the product copy read
// against Qloo's tag vocabulary (the agent's tagging job, apps/agent/slice_agent/tagging.py).
// The ranker (catalog:recommend) then scores tag overlap by id.

/** Tag types that both a taste profile and a product can carry. */
export const PRODUCT_TAG_TYPES = [
  "urn:tag:personal_style:qloo",
  "urn:tag:aesthetic_property:qloo",
  "urn:tag:lifestyle:qloo",
  "urn:tag:emotional_tone:qloo",
  "urn:tag:core_values:qloo",
  "urn:tag:customer_identity:qloo",
] as const;

/** Brand entities spell a few types differently from tag insights. */
const TYPE_ALIASES: Record<string, string> = {
  "urn:tag:core_value:qloo": "urn:tag:core_values:qloo",
  "urn:tag:customer_segment:qloo": "urn:tag:customer_identity:qloo",
};

export const normalizeTagType = (type: string): string => TYPE_ALIASES[type] ?? type;

export interface VocabTag {
  id: string;
  name: string;
  type: string;
}

type Json = Record<string, unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many pages of 50 to pull per type; the long tail is noise ("team-branded hoodies"). */
const VOCAB_PAGES: Record<string, number> = {
  "urn:tag:personal_style:qloo": 3,
  "urn:tag:aesthetic_property:qloo": 3,
  // Shoppers' profiles are rich in lifestyle and mood words ("Nostalgic",
  // "Weekend Hiking"), so products need the same words available to them.
  "urn:tag:lifestyle:qloo": 3,
  "urn:tag:emotional_tone:qloo": 2,
};

/** Qloo's brand-domain tag vocabulary, most popular first, through the cache. */
export const vocabulary = action({
  args: {},
  handler: async (ctx): Promise<VocabTag[]> => {
    const out: VocabTag[] = [];
    const seen = new Set<string>();
    for (const [type, pages] of Object.entries(VOCAB_PAGES)) {
      for (let page = 1; page <= pages; page++) {
        const { body, status } = await cachedQlooGet(ctx, "/v2/insights", {
          "filter.type": "urn:tag",
          "filter.tag.types": type,
          "filter.parents.types": "urn:entity:brand",
          take: 50,
          page,
        });
        const tags = ((JSON.parse(body) as { results?: { tags?: Json[] } }).results?.tags ?? []) as Json[];
        for (const t of tags) {
          const id = String(t.tag_id ?? t.id ?? "");
          const name = String(t.name ?? "").trim();
          if (!id || !name || seen.has(id) || /^(null|none)$/i.test(name)) continue;
          seen.add(id);
          out.push({ id, name, type });
        }
        if (status !== "hit") await sleep(150);
        if (tags.length < 50) break;
      }
    }
    return out;
  },
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The Qloo tags on each of the store's brands, keyed by brand name. Products
 * inherit these, so a Carhartt WIP jacket carries "Utility-Focused Design" and
 * "Earthy Color Palette" before anyone reads its description.
 */
export const brandTags = action({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }): Promise<Record<string, VocabTag[]>> => {
    const store = await ctx.runQuery(internal.catalogTaste.storeBrands, { storeKey });
    const out: Record<string, VocabTag[]> = {};
    const allowed = new Set<string>(PRODUCT_TAG_TYPES);
    for (const name of store) {
      let body = "";
      let status = "miss";
      try {
        ({ body, status } = await cachedQlooGet(ctx, "/search", { query: name, types: "urn:entity:brand", take: 1 }));
      } catch (err) {
        console.warn(`brandTags(${name}): ${String(err)}`);
        continue;
      }
      if (status !== "hit") await sleep(150);
      const first = ((JSON.parse(body) as { results?: Json[] }).results ?? [])[0];
      if (!first) continue;
      const a = norm(String(first.name));
      const b = norm(name);
      if (!(a === b || b.startsWith(a + " "))) continue; // "Kapital" → "Kapital Bank" is not a match
      const tags: VocabTag[] = [];
      for (const t of (first.tags as Json[] | undefined) ?? []) {
        const type = normalizeTagType(String(t.type ?? t.subtype ?? ""));
        const id = String(t.tag_id ?? t.id ?? "");
        const tagName = String(t.name ?? "").trim();
        if (!allowed.has(type) || !id || !tagName) continue;
        tags.push({ id, name: tagName, type });
      }
      if (tags.length) out[name] = tags;
    }
    return out;
  },
});

export const storeBrands = internalQuery({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const store = await ctx.db
      .query("stores")
      .withIndex("by_key", (q) => q.eq("key", storeKey))
      .unique();
    return (store?.brands ?? []).map((b) => b.name);
  },
});

/** The catalog as the tagging job reads it, with each product's current fingerprint. */
export const forTagging = query({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_store", (q) => q.eq("storeKey", storeKey))
      .collect();
    const existing = await tasteByProduct(ctx, storeKey);
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      description: p.description,
      details: p.details,
      tags: p.tags,
      attributes: p.attributes,
      fingerprint: fingerprint(p),
      taggedFingerprint: existing.get(p.id)?.fingerprint ?? null,
    }));
  },
});

/** Cheap content hash, so a product is only re-tagged when its copy changes. */
export function fingerprint(p: Pick<Doc<"products">, "name" | "brand" | "description" | "details" | "tags" | "attributes">): string {
  const s = JSON.stringify([p.name, p.brand, p.description, p.details, p.tags, p.attributes]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + s.length.toString(36);
}

export async function tasteByProduct(ctx: QueryCtx, storeKey: string) {
  const rows = await ctx.db
    .query("productTaste")
    .withIndex("by_store", (q) => q.eq("storeKey", storeKey))
    .collect();
  return new Map(rows.map((r) => [r.productId, r]));
}

const tagInput = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  weight: v.number(),
  source: v.string(),
});

export const saveTags = internalMutation({
  args: {
    storeKey: v.string(),
    items: v.array(v.object({ productId: v.string(), fingerprint: v.string(), tags: v.array(tagInput) })),
  },
  returns: v.number(),
  handler: async (ctx, { storeKey, items }) => {
    const now = Date.now();
    for (const item of items) {
      const existing = await ctx.db
        .query("productTaste")
        .withIndex("by_store_product", (q) => q.eq("storeKey", storeKey).eq("productId", item.productId))
        .unique();
      const doc = { storeKey, productId: item.productId, tags: item.tags, fingerprint: item.fingerprint, updatedAt: now };
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("productTaste", doc);
    }
    return items.length;
  },
});

/** Coverage, for the console and the tagging job's summary. */
export const status = query({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_store", (q) => q.eq("storeKey", storeKey))
      .collect();
    const taste = await tasteByProduct(ctx, storeKey);
    let current = 0;
    for (const p of products) if (taste.get(p.id)?.fingerprint === fingerprint(p)) current++;
    return { products: products.length, tagged: taste.size, current };
  },
});

export type { ActionCtx };
