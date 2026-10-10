import { v } from "convex/values";
import { fold } from "@slice/demo-catalogs/fold";
import { marlow } from "@slice/demo-catalogs/marlow";
import type { Catalog } from "@slice/demo-catalogs";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Loads the demo catalogs into Convex, the way a merchant's import would.
//
//   npx convex run seedDemo:seed '{"storesUrl":"http://localhost:3002"}'

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
