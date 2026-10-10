// Exports a demo catalog as a Shopify product-import CSV so the same products
// can be loaded into a Shopify dev store and tested there.
//
//   pnpm --filter @slice/demo-catalogs export-shopify fold
//   pnpm --filter @slice/demo-catalogs export-shopify marlow
//
// Writes exports/<store>-shopify.csv. Import it from Shopify admin → Products
// → Import. Images point at the Pexels CDN (via <store>/credits.json) because
// Shopify needs public URLs; the local copies under apps/stores/public are the
// same photos.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fold } from "../src/fold/index.ts";
import { marlow } from "../src/marlow/index.ts";
import type { Catalog, Product, Variant } from "../src/types.ts";

const catalogs: Record<string, Catalog> = { fold, marlow };
const [, , storeId = "fold"] = process.argv;
const catalog = catalogs[storeId];
if (!catalog) {
  console.error(`Unknown store "${storeId}". Known: ${Object.keys(catalogs).join(", ")}`);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const credits = JSON.parse(
  await readFile(path.join(root, "src", storeId, "credits.json"), "utf8"),
) as Record<string, { pexelsId: number }>;

// Shopify Standard Product Taxonomy paths (dist/en/categories.txt in
// github.com/Shopify/product-taxonomy). Keyed by subcategory, falling back to
// category. Unknown subcategories leave the column blank; Shopify then infers.
const taxonomy: Record<string, string> = {
  // Fold
  "T-shirts": "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts",
  Shirts: "Apparel & Accessories > Clothing > Clothing Tops > Shirts",
  Knitwear: "Apparel & Accessories > Clothing > Clothing Tops > Sweaters",
  "Sweatshirts & hoodies": "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts",
  Jeans: "Apparel & Accessories > Clothing > Pants > Jeans",
  Trousers: "Apparel & Accessories > Clothing > Pants > Trousers",
  Shorts: "Apparel & Accessories > Clothing > Shorts",
  Skirts: "Apparel & Accessories > Clothing > Skirts",
  Jackets: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  Coats: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  "Shells & fleece": "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets",
  Dresses: "Apparel & Accessories > Clothing > Dresses",
  Jumpsuits: "Apparel & Accessories > Clothing > One-Pieces",
  Sneakers: "Apparel & Accessories > Shoes > Sneakers",
  Boots: "Apparel & Accessories > Shoes > Boots",
  Sandals: "Apparel & Accessories > Shoes > Sandals",
  "Dress shoes": "Apparel & Accessories > Shoes",
  Totes: "Luggage & Bags > Shopping Totes",
  Backpacks: "Luggage & Bags > Backpacks",
  Crossbody: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
  Hats: "Apparel & Accessories > Clothing Accessories > Hats",
  Eyewear: "Apparel & Accessories > Clothing Accessories > Sunglasses",
  Jewelry: "Apparel & Accessories > Jewelry",
  Belts: "Apparel & Accessories > Clothing Accessories > Belts",
  "Socks & scarves": "Apparel & Accessories > Clothing Accessories",
  Fragrance: "Health & Beauty > Personal Care > Cosmetics > Perfumes & Colognes",
  Skincare: "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  Hair: "Health & Beauty > Personal Care > Hair Care",
  "Bottles & flasks": "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Water Bottles",
  Notebooks: "Office Supplies > General Office Supplies > Paper Products > Notebooks & Notepads",
  "Small home goods": "Home & Garden",
};

const columns = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Variant Image",
  "Variant Weight Unit",
  "Variant Tax Code",
  "Cost per item",
  "Status",
] as const;
type Column = (typeof columns)[number];
type Row = Partial<Record<Column, string | number | boolean>>;

const sizeLike =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|S\/M|M\/L|L\/XL|One size|W\d+|EU \d+|US \d+(\.\d)?|UK \d+|\d+(\.\d+)? ?(in|ml|g|oz|cm|mm)|\d+)$/i;
const styleLike = /grid|plain|ruled|trim|stripe|pack|set/i;

/** Shopify needs one option axis per product; infer it from the variant labels. */
function optionName(variants: Variant[]): string {
  const labels = variants.map((v) => v.label);
  if (labels.length === 1 && /^one size$/i.test(labels[0])) return "Title";
  if (labels.every((l) => sizeLike.test(l))) return "Size";
  if (labels.some((l) => styleLike.test(l))) return "Style";
  return "Color";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function body(p: Product): string {
  const details = p.details.map((d) => `<li>${escapeHtml(d)}</li>`).join("");
  return `<p>${escapeHtml(p.description)}</p>${details ? `<ul>${details}</ul>` : ""}`;
}

/**
 * Tags carry the structured attributes Shopify has no column for, as
 * `key:value` pairs, so the Shopify adapter can rebuild the Slice product
 * shape from the catalog alone.
 */
function tags(p: Product): string {
  const a = p.attributes;
  const out = [
    ...p.tags,
    `category:${p.category}`,
    `subcategory:${p.subcategory}`,
    ...(p.department ? [`department:${p.department}`] : []),
    ...a.style.map((s) => `style:${s}`),
    ...a.material.map((m) => `material:${m}`),
    ...a.colorFamily.map((c) => `colorfamily:${c}`),
    ...a.colors.map((c) => `color:${c}`),
    ...a.useCase.map((u) => `usecase:${u}`),
    ...(a.occasion ?? []).map((o) => `occasion:${o}`),
    ...(a.room ?? []).map((r) => `room:${r}`),
    ...(a.fit ? [`fit:${a.fit}`] : []),
    ...(a.season ?? []).map((s) => `season:${s}`),
    `tier:${a.priceTier}`,
    ...(p.bestseller ? ["bestseller"] : []),
    ...(p.new ? ["new"] : []),
  ];
  // Shopify splits tags on commas, so a comma inside a value would break it.
  return [...new Set(out.map((t) => t.replace(/,/g, " ")))].join(", ");
}

function imageUrl(p: Product): string | undefined {
  const id = credits[p.id]?.pexelsId;
  return id
    ? `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`
    : undefined;
}

function rows(p: Product): Row[] {
  const name = optionName(p.variants);
  const image = imageUrl(p);
  return p.variants.map((v, i) => {
    const price = p.price + (v.priceDelta ?? 0);
    const row: Row = {
      Handle: p.slug,
      "Option1 Name": i === 0 ? name : "",
      "Option1 Value": name === "Title" ? "Default Title" : v.label,
      "Variant SKU": v.id,
      "Variant Grams": 0,
      "Variant Inventory Tracker": "shopify",
      "Variant Inventory Qty": v.inStock ? 25 : 0,
      "Variant Inventory Policy": "deny",
      "Variant Fulfillment Service": "manual",
      "Variant Price": price.toFixed(2),
      "Variant Compare At Price": p.compareAtPrice
        ? (p.compareAtPrice + (v.priceDelta ?? 0)).toFixed(2)
        : "",
      "Variant Requires Shipping": true,
      "Variant Taxable": true,
      "Variant Weight Unit": "kg",
    };
    if (i === 0) {
      Object.assign(row, {
        Title: p.name,
        "Body (HTML)": body(p),
        Vendor: p.brand ?? catalog.store.name,
        "Product Category": taxonomy[p.subcategory] ?? taxonomy[p.category] ?? "",
        Type: p.subcategory,
        Tags: tags(p),
        Published: true,
        "Image Src": image ?? "",
        "Image Position": image ? 1 : "",
        "Image Alt Text": image ? `${p.brand ? `${p.brand} ` : ""}${p.name}` : "",
        "Gift Card": false,
        "SEO Title": `${p.brand ? `${p.brand} ` : ""}${p.name} | ${catalog.store.name}`,
        "SEO Description": p.description.slice(0, 320),
        Status: "active",
      } satisfies Row);
    }
    return row;
  });
}

function csvCell(v: string | number | boolean | undefined): string {
  if (v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const lines = [columns.join(",")];
for (const p of catalog.products) {
  for (const r of rows(p)) lines.push(columns.map((c) => csvCell(r[c])).join(","));
}

const outDir = path.join(root, "exports");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${storeId}-shopify.csv`);
await writeFile(outPath, lines.join("\n") + "\n");
console.log(
  `${path.relative(process.cwd(), outPath)}: ${catalog.products.length} products, ${lines.length - 1} variant rows`,
);
