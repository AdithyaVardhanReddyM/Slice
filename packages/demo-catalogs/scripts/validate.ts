// Checks every catalog against the schema and the authoring rules
// (unique ids/slugs, category tree, style/room/brand vocab, style coverage).
// Usage: pnpm --filter @slice/demo-catalogs validate [store]

import { fold } from "../src/fold/index.ts";
import { marlow } from "../src/marlow/index.ts";
import type { Catalog, Product } from "../src/types.ts";

interface Rules {
  /** Categories in which every style must appear. */
  fullCoverage: string[];
  /** Fold: which brands are household names, niche, or made up for the demo. */
  brandGroups?: Record<"known" | "niche" | "fictional", string[]>;
}

const rules: Record<string, Rules> = {
  marlow: { fullCoverage: ["Living", "Kitchen & dining", "Lighting", "Decor"] },
  fold: {
    fullCoverage: ["Tops", "Bottoms", "Outerwear", "Footwear", "Accessories"],
    brandGroups: {
      known: ["Nike", "Adidas", "New Balance", "Levi's", "Carhartt WIP", "Patagonia", "Dr. Martens", "Birkenstock"],
      niche: ["Norse Projects", "Veja", "Arket", "Snow Peak", "Salomon", "Studio Nicholson", "Pangaia", "Kapital"],
      fictional: ["Malha Lisboa", "SEOM", "Burnside Canvas", "Hedda Vang", "Asche", "Cranmore", "Sóller", "Ferrant"],
    },
  },
};

const FITS = new Set(["relaxed", "regular", "slim", "oversized"]);

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
  const rule = rules[name];
  const brands = new Set((store.brands ?? []).map((b) => b.name));
  const departments = new Set(store.departments ?? []);
  const brandCount = new Map<string, number>();
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

    if (brands.size > 0) {
      if (!p.brand || !brands.has(p.brand)) err(p, `unknown brand ${p.brand}`);
      else brandCount.set(p.brand, (brandCount.get(p.brand) ?? 0) + 1);
    } else if (p.brand) err(p, "house-brand store must not set brand");
    if (departments.size > 0) {
      if (!p.department || !departments.has(p.department)) err(p, `bad department ${p.department}`);
      if (!p.attributes?.occasion?.length) err(p, "needs occasion");
      if (!p.attributes?.season?.length) err(p, "needs season");
      if (p.attributes?.fit !== undefined && !FITS.has(p.attributes.fit)) err(p, `bad fit ${p.attributes.fit}`);
    }

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
  for (const c of rule?.fullCoverage ?? []) {
    const have = styleByCategory.get(c) ?? new Set();
    const missing = [...styles].filter((s) => !have.has(s));
    if (missing.length) errors.push(`${c} is missing styles: ${missing.join(", ")}`);
  }
  for (const b of brands) if (!brandCount.has(b)) errors.push(`brand ${b} has no products`);

  console.log(`\n${name}: ${products.length} products`);
  for (const g of store.nav) {
    const n = products.filter((p) => p.category === g.category).length;
    const covered = styleByCategory.get(g.category)?.size ?? 0;
    console.log(`  ${g.category.padEnd(18)} ${String(n).padStart(3)} products, ${covered}/${styles.size} styles`);
  }
  console.log("  styles:", [...styleCount.entries()].map(([k, v]) => `${k}=${v}`).join(" "));
  if (brandCount.size > 0) {
    console.log("  brands:", [...brandCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
  }
  if (rule?.brandGroups && products.length > 0) {
    // Recommendations must not be able to lean on brand, so the made-up labels
    // need real weight in the catalog.
    const share = (g: string[]) => products.filter((p) => g.includes(p.brand ?? "")).length / products.length;
    const groups = Object.entries(rule.brandGroups).map(([k, g]) => `${k}=${Math.round(share(g) * 100)}%`);
    console.log("  brand groups:", groups.join(" "));
    if (share(rule.brandGroups.fictional) < 0.3) errors.push("fictional labels are under 30% of the catalog");
  }
  return errors;
}

const catalogs: Record<string, Catalog> = { marlow, fold };
const only = process.argv[2];
const errors = Object.entries(catalogs)
  .filter(([name]) => !only || name === only)
  .flatMap(([name, catalog]) => validate(name, catalog).map((e) => `${name} ${e}`));
if (errors.length) {
  console.error(`\n${errors.length} problems:`);
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("\nok");
