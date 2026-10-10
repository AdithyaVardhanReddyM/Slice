// The "Slice catalog" CSV: one row per product, the columns below. Shopify and
// WooCommerce stores get their catalog pulled into this shape automatically;
// custom stores fill the template by hand (apps/web serves it at
// /slice-catalog-template.csv) and upload it in the console.
//
// List columns use " | " as the separator. Variants are "Label:in_stock" pairs
// ("S:yes | M:yes | L:no") with an optional price delta ("King:yes:+200").

import type { ColorFamily, PriceTier, Product, Variant } from "./types.ts";

export const SLICE_CSV_COLUMNS = [
  "id",
  "name",
  "brand",
  "department",
  "category",
  "subcategory",
  "price",
  "compare_at_price",
  "description",
  "details",
  "style",
  "material",
  "color_family",
  "colors",
  "use_case",
  "room",
  "occasion",
  "fit",
  "season",
  "price_tier",
  "tags",
  "variants",
  "images",
  "url",
] as const;

export type SliceCsvColumn = (typeof SLICE_CSV_COLUMNS)[number];

/** What each column means; rendered as the template's second (example) row and in the docs. */
export const SLICE_CSV_GUIDE: Record<SliceCsvColumn, string> = {
  id: "Your SKU or product id. Must be unique and stable.",
  name: "Product name as shown on the product page.",
  brand: "Optional. Leave blank for house-brand stores.",
  department: "Optional. women | men | unisex | kids.",
  category: "Top-level category: Living, Outerwear, Skincare.",
  subcategory: "Sofas & armchairs, Jackets, Serums.",
  price: "Number, in the store currency.",
  compare_at_price: "Optional. The struck-through price when on sale.",
  description:
    "2–3 sentences of real merchant copy: material, color, mood, what it's for. This is what taste is matched against.",
  details: "Spec bullets, separated by |: dimensions, materials, care.",
  style:
    "1–2 style words from your store's vocabulary (scandi-minimal, streetwear, heritage-workwear).",
  material: "Separated by |: oak, linen, heavyweight cotton.",
  color_family:
    "Separated by |: neutral | warm | cool | earth | bold | pastel | black | white.",
  colors: "Specific colors, separated by |: terracotta, sage.",
  use_case: "Separated by |: small apartment, commute, rainy days.",
  room: "Home stores, separated by |: living room, balcony.",
  occasion: "Fashion stores, separated by |: everyday, office, festival.",
  fit: "Fashion stores: relaxed | regular | slim | oversized.",
  season: "Fashion stores, separated by |: all-season, summer.",
  price_tier: "budget | mid | premium, relative to your own range.",
  tags: "Free-form tags, separated by |.",
  variants: "Label:in_stock pairs separated by |, e.g. S:yes | M:yes | L:no.",
  images: "Absolute image URLs, separated by |. The first is the card image.",
  url: "Absolute product page URL on your site.",
};

export const SLICE_CSV_EXAMPLE: Record<SliceCsvColumn, string> = {
  id: "SKU-0042",
  name: "Ansel Sofa",
  brand: "",
  department: "",
  category: "Living",
  subcategory: "Sofas & armchairs",
  price: "1495",
  compare_at_price: "",
  description:
    "A low-slung three-seater with a solid walnut frame, tapered legs and a gently bowed back. Olive wool-blend upholstery over feather-wrapped cushions. One quiet, confident piece to anchor a living room.",
  details: "W 84 in x D 36 in x H 31 in | Kiln-dried hardwood frame | Feather-wrapped cushions",
  style: "mid-century",
  material: "walnut | wool blend",
  color_family: "earth",
  colors: "olive | mustard",
  use_case: "everyday lounging | hosting",
  room: "living room",
  occasion: "",
  fit: "",
  season: "",
  price_tier: "premium",
  tags: "three-seater | statement piece",
  variants: "Olive:yes | Mustard:yes | Oatmeal:no",
  images: "https://example.com/images/ansel-olive.jpg",
  url: "https://example.com/products/ansel-sofa",
};

const LIST_SEP = " | ";

const splitList = (value: string): string[] =>
  value
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

const joinList = (values: readonly string[] | undefined): string =>
  (values ?? []).join(LIST_SEP);

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180-ish parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function productToSliceRow(
  p: Product,
  opts: { url: (p: Product) => string; image: (src: string) => string },
): Record<SliceCsvColumn, string> {
  const a = p.attributes;
  return {
    id: p.id,
    name: p.name,
    brand: p.brand ?? "",
    department: p.department ?? "",
    category: p.category,
    subcategory: p.subcategory,
    price: String(p.price),
    compare_at_price: p.compareAtPrice === undefined ? "" : String(p.compareAtPrice),
    description: p.description,
    details: joinList(p.details),
    style: joinList(a.style),
    material: joinList(a.material),
    color_family: joinList(a.colorFamily),
    colors: joinList(a.colors),
    use_case: joinList(a.useCase),
    room: joinList(a.room),
    occasion: joinList(a.occasion),
    fit: a.fit ?? "",
    season: joinList(a.season),
    price_tier: a.priceTier,
    tags: joinList(p.tags),
    variants: p.variants
      .map(
        (v) =>
          `${v.label}:${v.inStock ? "yes" : "no"}${
            v.priceDelta ? `:${v.priceDelta > 0 ? "+" : ""}${v.priceDelta}` : ""
          }`,
      )
      .join(LIST_SEP),
    images: p.images.map(opts.image).join(LIST_SEP),
    url: opts.url(p),
  };
}

export function toSliceCsv(rows: Record<SliceCsvColumn, string>[]): string {
  const lines = [SLICE_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(SLICE_CSV_COLUMNS.map((c) => csvEscape(row[c] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

/** The downloadable template: header, a guide row, and one example row. */
export function sliceCsvTemplate(): string {
  return toSliceCsv([SLICE_CSV_GUIDE, SLICE_CSV_EXAMPLE]);
}

export interface SliceCsvProduct extends Product {
  url: string;
}

export interface ParsedSliceCsv {
  products: SliceCsvProduct[];
  /** Row-level problems; the row is skipped. */
  errors: { row: number; message: string }[];
  /** Non-fatal notes: unknown columns, guide row skipped, ... */
  warnings: string[];
}

const COLOR_FAMILIES: ColorFamily[] = [
  "neutral",
  "warm",
  "cool",
  "earth",
  "bold",
  "pastel",
  "black",
  "white",
];
const PRICE_TIERS: PriceTier[] = ["budget", "mid", "premium"];
const FITS = ["relaxed", "regular", "slim", "oversized"] as const;
const DEPARTMENTS = ["women", "men", "unisex", "kids"] as const;

export function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parses a Slice CSV into products. Lenient: fills what it can, reports the rest. */
export function parseSliceCsv(text: string): ParsedSliceCsv {
  const rows = parseCsv(text);
  const errors: ParsedSliceCsv["errors"] = [];
  const warnings: string[] = [];
  if (rows.length === 0) return { products: [], errors: [{ row: 0, message: "Empty file" }], warnings };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (name: SliceCsvColumn) => header.indexOf(name);
  for (const required of ["id", "name", "category", "price", "description"] as const) {
    if (col(required) === -1) {
      return { products: [], errors: [{ row: 1, message: `Missing required column "${required}"` }], warnings };
    }
  }
  for (const h of header) {
    if (!(SLICE_CSV_COLUMNS as readonly string[]).includes(h)) warnings.push(`Ignored unknown column "${h}"`);
  }

  const products: SliceCsvProduct[] = [];
  const seen = new Set<string>();
  const get = (r: string[], name: SliceCsvColumn) => {
    const i = col(name);
    return i === -1 ? "" : (r[i] ?? "").trim();
  };

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 1;
    const id = get(r, "id");
    const price = Number(get(r, "price"));
    if (!id || get(r, "name") === "") {
      errors.push({ row: rowNo, message: "id and name are required" });
      continue;
    }
    if (id === SLICE_CSV_GUIDE.id || get(r, "price").startsWith("Number")) {
      warnings.push(`Row ${rowNo} looks like the template guide row; skipped`);
      continue;
    }
    if (!Number.isFinite(price)) {
      errors.push({ row: rowNo, message: `price "${get(r, "price")}" is not a number` });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ row: rowNo, message: `Duplicate id "${id}"` });
      continue;
    }
    seen.add(id);

    const compare = get(r, "compare_at_price");
    const fit = get(r, "fit") as (typeof FITS)[number] | "";
    const department = get(r, "department") as (typeof DEPARTMENTS)[number] | "";
    const colorFamily = splitList(get(r, "color_family")).filter((c): c is ColorFamily =>
      COLOR_FAMILIES.includes(c as ColorFamily),
    );
    const tierRaw = get(r, "price_tier") as PriceTier | "";
    const variants: Variant[] = splitList(get(r, "variants")).map((v, idx) => {
      const [label, stock, delta] = v.split(":").map((s) => s.trim());
      const variant: Variant = {
        id: `${id}-${slugifyName(label || String(idx + 1)) || idx + 1}`,
        label: label || `Option ${idx + 1}`,
        inStock: !/^(no|false|0|out)/i.test(stock ?? "yes"),
      };
      if (delta && Number.isFinite(Number(delta))) variant.priceDelta = Number(delta);
      return variant;
    });

    const product: SliceCsvProduct = {
      id,
      slug: slugifyName(get(r, "name")) || slugifyName(id),
      name: get(r, "name"),
      category: get(r, "category") || "Uncategorized",
      subcategory: get(r, "subcategory") || get(r, "category") || "General",
      price,
      description: get(r, "description"),
      details: splitList(get(r, "details")),
      attributes: {
        style: splitList(get(r, "style")).map(slugifyName),
        material: splitList(get(r, "material")),
        colorFamily,
        colors: splitList(get(r, "colors")),
        useCase: splitList(get(r, "use_case")),
        priceTier: PRICE_TIERS.includes(tierRaw as PriceTier) ? (tierRaw as PriceTier) : "mid",
      },
      tags: splitList(get(r, "tags")),
      variants: variants.length ? variants : [{ id: `${id}-default`, label: "Default", inStock: true }],
      imageQuery: "",
      images: splitList(get(r, "images")),
      url: get(r, "url"),
    };
    if (get(r, "brand")) product.brand = get(r, "brand");
    if (DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number])) {
      product.department = department as (typeof DEPARTMENTS)[number];
    }
    if (compare && Number.isFinite(Number(compare))) product.compareAtPrice = Number(compare);
    const room = splitList(get(r, "room"));
    if (room.length) product.attributes.room = room;
    const occasion = splitList(get(r, "occasion"));
    if (occasion.length) product.attributes.occasion = occasion;
    if (FITS.includes(fit as (typeof FITS)[number])) product.attributes.fit = fit as (typeof FITS)[number];
    const season = splitList(get(r, "season"));
    if (season.length) product.attributes.season = season;

    products.push(product);
  }
  return { products, errors, warnings };
}
