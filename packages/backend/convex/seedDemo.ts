import { v } from "convex/values";
import { fold } from "@slice/demo-catalogs/fold";
import { marlow } from "@slice/demo-catalogs/marlow";
import type { Catalog } from "@slice/demo-catalogs";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

// Loads the demo catalogs into Convex, the way a merchant's import would.
//
//   npx convex run seedDemo:seed '{"storesUrl":"http://localhost:3002"}'
//
// Moves the demo stores' links and images to where the storefronts are hosted,
// keeping everything else (taste tags, stored conversations):
//
//   npx convex run seedDemo:rehost '{"from":"http://localhost:3002","to":"https://slice-shops.vercel.app"}'

const catalogs: Record<string, { catalog: Catalog; vertical: string }> = {
  marlow: { catalog: marlow, vertical: "home & living" },
  fold: { catalog: fold, vertical: "fashion & lifestyle" },
};

export const seed = internalAction({
  args: {
    storesUrl: v.optional(v.string()),
    only: v.optional(v.string()),
  },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { storesUrl = "http://localhost:3002", only }) => {
    const out: Record<string, number> = {};
    for (const [key, { catalog, vertical }] of Object.entries(catalogs)) {
      if (only && only !== key) continue;
      const { store, products } = catalog;
      const abs = (src: string) => (src.startsWith("http") ? src : `${storesUrl}${src}`);
      const result = await ctx.runMutation(internal.catalog.replace, {
        store: {
          key,
          name: store.name,
          tagline: store.tagline,
          description: store.description,
          logo: store.logo ? abs(store.logo) : undefined,
          currency: store.currency,
          vertical,
          siteUrl: `${storesUrl}/${key}`,
          styles: store.styles,
          rooms: store.rooms,
          brands: store.brands,
          departments: store.departments?.flatMap((d) => (d ? [d as string] : [])),
          nav: store.nav,
          source: "demo",
        },
        products: products.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          brand: p.brand,
          department: p.department,
          category: p.category,
          subcategory: p.subcategory,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          description: p.description,
          details: p.details,
          attributes: p.attributes,
          tags: p.tags,
          variants: p.variants,
          images: p.images.map(abs),
          url: `${storesUrl}/${key}/p/${p.slug}`,
          rating: p.rating,
          reviewCount: p.reviewCount,
          bestseller: p.bestseller,
          new: p.new,
        })),
      });
      out[key] = result.products;
    }
    return out;
  },
});

const rewrite = (value: unknown, from: string, to: string): unknown => {
  if (typeof value === "string") return value.startsWith(from) ? to + value.slice(from.length) : value;
  if (Array.isArray(value)) return value.map((x) => rewrite(x, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, rewrite(x, from, to)]));
  }
  return value;
};

export const rehost = internalMutation({
  args: { from: v.string(), to: v.string() },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { from, to }) => {
    const out: Record<string, number> = { stores: 0, products: 0, conversations: 0 };
    for (const key of Object.keys(catalogs)) {
      const store = await ctx.db
        .query("stores")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (store) {
        const { _id, _creationTime, ...doc } = store;
        const next = rewrite(doc, from, to) as typeof doc;
        if (JSON.stringify(next) !== JSON.stringify(doc)) {
          await ctx.db.replace(_id, next);
          out.stores++;
        }
      }
      for (const table of ["products", "conversations"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_store", (q) => q.eq("storeKey", key))
          .collect();
        for (const row of rows) {
          const { _id, _creationTime, ...doc } = row;
          const next = rewrite(doc, from, to) as typeof doc;
          if (JSON.stringify(next) === JSON.stringify(doc)) continue;
          await ctx.db.replace(_id, next);
          out[table]++;
        }
      }
    }
    return out;
  },
});
