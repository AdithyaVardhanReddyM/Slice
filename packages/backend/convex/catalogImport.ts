import { v } from "convex/values";
import { parseSliceCsv } from "@slice/demo-catalogs/slice-csv";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

// Imports a Slice-format CSV (packages/demo-catalogs/src/slice-csv.ts) as a
// store's catalog. The store's style vocabulary and navigation are derived
// from the rows, so a merchant only has to fill the CSV.

export const importCsv = action({
  args: {
    key: v.string(),
    name: v.string(),
    siteUrl: v.string(),
    vertical: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    currency: v.optional(v.string()),
    csv: v.string(),
  },
  returns: v.object({
    products: v.number(),
    errors: v.array(v.object({ row: v.number(), message: v.string() })),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { products, errors, warnings } = parseSliceCsv(args.csv);
    if (products.length === 0) return { products: 0, errors, warnings };

    const styleIds = new Map<string, number>();
    const nav = new Map<string, Set<string>>();
    const brands = new Set<string>();
    const departments = new Set<string>();
    const rooms = new Set<string>();
    for (const p of products) {
      for (const s of p.attributes.style) styleIds.set(s, (styleIds.get(s) ?? 0) + 1);
      if (!nav.has(p.category)) nav.set(p.category, new Set());
      nav.get(p.category)!.add(p.subcategory);
      if (p.brand) brands.add(p.brand);
      if (p.department) departments.add(p.department);
      for (const r of p.attributes.room ?? []) rooms.add(r);
    }
    const label = (id: string) => id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

    await ctx.runMutation(api.catalog.importCatalog, {
      store: {
        key: args.key,
        name: args.name,
        tagline: args.tagline ?? "",
        description: args.description ?? "",
        currency: args.currency ?? "USD",
        vertical: args.vertical ?? "retail",
        siteUrl: args.siteUrl,
        styles: [...styleIds.keys()].map((id) => ({
          id,
          label: label(id),
          description: `Products the merchant tagged "${label(id)}".`,
        })),
        rooms: rooms.size ? [...rooms] : undefined,
        brands: brands.size
          ? [...brands].map((name) => ({
              name,
              slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              origin: "",
              description: "",
            }))
          : undefined,
        departments: departments.size ? [...departments] : undefined,
        nav: [...nav.entries()].map(([category, subs]) => ({
          label: category,
          category,
          subcategories: [...subs],
        })),
        source: "csv",
      },
      products: products.map(({ imageQuery: _q, ...p }) => p),
    });
    return { products: products.length, errors, warnings };
  },
});
