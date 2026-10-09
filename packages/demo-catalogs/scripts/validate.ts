// Checks every catalog against the schema and the authoring rules
// (unique ids/slugs, category tree, style and room vocab, style coverage).
// Usage: pnpm --filter @slice/demo-catalogs validate

import { marlow } from "../src/marlow/index.ts";
import type { Catalog, Product } from "../src/types.ts";

const COLOR_FAMILIES = new Set([
  "neutral",
  "warm",
  "cool",
  "earth",
  "bold",
  "pastel",
  "black",
  "white",
]);
const PRICE_TIERS = new Set(["budget", "mid", "premium"]);

function validate(name: string, catalog: Catalog): string[] {
  const errors: string[] = [];
  const { store, products } = catalog;
  const styles = new Set(store.styles.map((s) => s.id));
  const rooms = new Set(store.rooms ?? []);
  const subcats = new Map(store.nav.map((g) => [g.category, new Set(g.subcategories)]));
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const styleCount = new Map<string, number>();
  const styleByCategory = new Map<string, Set<string>>();

  const err = (p: Product, msg: string) => errors.push(`${p.id ?? "?"}: ${msg}`);

  for (const p of products) {
    if (ids.has(p.id)) err(p, "duplicate id");
    ids.add(p.id);
    if (slugs.has(p.slug)) err(p, `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
    if (!/^[a-z0-9-]+$/.test(p.slug)) err(p, `bad slug ${p.slug}`);

    const subs = subcats.get(p.category);
    if (!subs) err(p, `unknown category ${p.category}`);
    else if (!subs.has(p.subcategory)) err(p, `unknown subcategory ${p.subcategory}`);

    if (typeof p.price !== "number" || p.price <= 0) err(p, "bad price");
    if (p.compareAtPrice !== undefined && p.compareAtPrice <= p.price)
      err(p, "compareAtPrice must exceed price");
    if (!p.description || p.description.length < 80) err(p, "description too short");
    if (!Array.isArray(p.details) || p.details.length < 2) err(p, "needs details");
    if (!p.imageQuery) err(p, "missing imageQuery");
    if (!Array.isArray(p.images)) err(p, "images must be an array");
    if (!Array.isArray(p.tags) || p.tags.length === 0) err(p, "needs tags");
    if (!Array.isArray(p.variants) || p.variants.length === 0) err(p, "needs variants");
    else {
      const vids = new Set<string>();
      for (const v of p.variants) {
        if (vids.has(v.id)) err(p, `duplicate variant id ${v.id}`);
        vids.add(v.id);
        if (typeof v.inStock !== "boolean") err(p, `variant ${v.id} missing inStock`);
      }
    }
    if (p.rating !== undefined && (p.rating < 0 || p.rating > 5)) err(p, "bad rating");

    const a = p.attributes;
    if (!a) {
      err(p, "missing attributes");
      continue;
    }
    if (a.style.length < 1 || a.style.length > 2) err(p, "style must have 1–2 values");
    for (const s of a.style) {
      if (!styles.has(s)) err(p, `unknown style ${s}`);
      styleCount.set(s, (styleCount.get(s) ?? 0) + 1);
      if (!styleByCategory.has(p.category)) styleByCategory.set(p.category, new Set());
      styleByCategory.get(p.category)!.add(s);
    }
    for (const c of a.colorFamily) if (!COLOR_FAMILIES.has(c)) err(p, `unknown colorFamily ${c}`);
    if (!PRICE_TIERS.has(a.priceTier)) err(p, `unknown priceTier ${a.priceTier}`);
    if (rooms.size > 0) for (const r of a.room ?? []) if (!rooms.has(r)) err(p, `unknown room ${r}`);
    if (!a.material?.length) err(p, "needs material");
    if (!a.colors?.length) err(p, "needs colors");
    if (!a.useCase?.length) err(p, "needs useCase");
  }

  for (const s of styles) if (!styleCount.has(s)) errors.push(`style ${s} never used`);

  console.log(`\n${name}: ${products.length} products`);
  for (const g of store.nav) {
    const n = products.filter((p) => p.category === g.category).length;
    const covered = styleByCategory.get(g.category)?.size ?? 0;
    console.log(`  ${g.category.padEnd(18)} ${String(n).padStart(3)} products, ${covered}/${styles.size} styles`);
  }
  console.log("  styles:", [...styleCount.entries()].map(([k, v]) => `${k}=${v}`).join(" "));
  return errors;
}

const errors = validate("marlow", marlow);
if (errors.length) {
  console.error(`\n${errors.length} problems:`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("\nok");
