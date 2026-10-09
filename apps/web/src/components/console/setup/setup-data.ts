// Server-side builders for the setup flow. Imports the demo catalogs, so keep
// this out of client components and pass the results down as plain props.

import type { Product } from "@slice/demo-catalogs";
import { fmt } from "@/lib/format";
import { catalogs, productImage, styleLabel } from "@/lib/mock/catalog";
import {
  conciergeDefaults,
  defaultDomains,
  demoProfiles,
  installState,
  ostroCatalog,
  ostroProfile,
  type CatalogPreview,
  type MappingRow,
  type StoreProfileDraft,
} from "@/lib/mock/setup";
import type { StoreKey, Widget } from "@/lib/mock/types";

const share = (products: Product[], has: (p: Product) => boolean) =>
  products.filter(has).length / products.length;

/** What Slice would infer from descriptions: most of the gap, never all of it. */
const projected = (v: number) => Math.min(0.99, v + (1 - v) * 0.8);

function demoCatalog(widget: Widget, key: StoreKey): CatalogPreview {
  const { products } = catalogs[key];
  const first = products[0];
  const feed = widget.catalog.source === "feed";

  const columns = feed
    ? [
        "g:id",
        "g:title",
        "g:description",
        "g:price",
        "g:image_link",
        "g:product_type",
        "g:brand",
        "g:color",
        "g:material",
        "g:gender",
        "g:availability",
        "custom_label_0",
        "custom_label_1",
      ]
    : [
        "id",
        "slug",
        "name",
        "category",
        "subcategory",
        "price",
        "description",
        "details",
        "images",
        "attributes.style",
        "attributes.material",
        "attributes.colors",
        "attributes.room",
        "tags",
        "variants",
      ];

  const col = (json: string, xml: string) => (feed ? xml : json);
  const mapping: MappingRow[] = [
    { field: "id", column: col("id", "g:id"), sample: first.id, confidence: 1 },
    {
      field: "title",
      column: col("name", "g:title"),
      sample: first.name,
      confidence: feed ? 1 : 0.97,
    },
    {
      field: "description",
      column: col("description", "g:description"),
      sample: first.description,
      confidence: 1,
    },
    {
      field: "price",
      column: col("price", "g:price"),
      sample: feed ? `${first.price.toFixed(2)} USD` : String(first.price),
      confidence: 1,
    },
    {
      field: "image",
      column: col("images", "g:image_link"),
      sample: productImage(first) ?? "",
      confidence: feed ? 1 : 0.92,
    },
    {
      field: "category",
      column: col("category", "g:product_type"),
      sample: first.category,
      confidence: feed ? 0.95 : 1,
    },
    {
      field: "style",
      column: col("attributes.style", "custom_label_0"),
      sample: first.attributes.style.join(", "),
      confidence: feed ? 0.66 : 1,
    },
    {
      field: "material",
      column: col("attributes.material", "g:material"),
      sample: first.attributes.material.join(", "),
      confidence: 1,
    },
    {
      field: "colors",
      column: col("attributes.colors", "g:color"),
      sample: first.attributes.colors.join(", "),
      confidence: 1,
    },
    {
      field: "tags",
      column: col("tags", "custom_label_1"),
      sample: first.tags.join(", "),
      confidence: feed ? 0.72 : 1,
    },
    {
      field: "inventory",
      column: col("variants", "g:availability"),
      sample: feed ? "in_stock" : `${first.variants.length} variants`,
      confidence: feed ? 1 : 0.84,
    },
  ];

  const styleCov = share(products, (p) => p.attributes.style.length > 0);
  const materialCov = share(products, (p) => p.attributes.material.length > 0);
  const coverage = [
    {
      field: "description",
      value: share(products, (p) => p.description.length > 40),
    },
    { field: "category", value: share(products, (p) => !!p.category) },
    { field: "image", value: share(products, (p) => p.images.length > 0) },
    {
      field: "colors",
      value: share(products, (p) => p.attributes.colors.length > 0),
    },
    {
      field: "material",
      value: materialCov,
      projected: materialCov < 1 ? projected(materialCov) : undefined,
    },
    { field: "tags", value: share(products, (p) => p.tags.length > 0) },
    {
      field: "style",
      value: styleCov,
      projected: styleCov < 1 ? projected(styleCov) : undefined,
    },
  ];

  const picks = [
    0,
    Math.floor(products.length / 3),
    Math.floor((products.length * 2) / 3),
  ].map((i) => products[i]);

  return {
    source: feed ? "feed" : "upload",
    label: feed
      ? `https://${widget.domain}/feeds/google-merchant.xml`
      : widget.catalog.sourceLabel,
    rows: products.length,
    columns,
    mapping,
    unmapped: feed
      ? ["g:brand", "g:gender"]
      : ["slug", "subcategory", "details", "attributes.room"],
    coverage,
    syncedAgo: widget.catalog.lastSyncAt
      ? fmt.ago(widget.catalog.lastSyncAt)
      : undefined,
    samples: picks.map((p) => ({
      id: p.id,
      title: p.name,
      brand: p.brand,
      category: p.subcategory || p.category,
      price: p.price,
      image: productImage(p),
      style: p.attributes.style.map((s) => styleLabel(key, s)),
      material: p.attributes.material.slice(0, 2),
    })),
  };
}

function demoProfile(key: StoreKey): StoreProfileDraft {
  const { store } = catalogs[key];
  const categories = store.nav.map((n) => n.label);
  return {
    description: store.description,
    sellOptions: categories,
    sells: categories,
    pagesRead: [
      "/",
      "/about",
      "/shipping",
      "/collections/all",
      "+ 10 product pages",
    ],
    ...demoProfiles[key],
  };
}

export function setupDataFor(widget: Widget) {
  const key = widget.storeKey;
  return {
    profile: key ? demoProfile(key) : ostroProfile,
    catalog: key ? demoCatalog(widget, key) : ostroCatalog,
    concierge: conciergeDefaults[widget.id] ?? conciergeDefaults.ostro,
    domains: defaultDomains[widget.id] ?? ["music", "film", "travel"],
    install: installState[widget.id] ?? {
      domains: [
        { host: widget.domain, status: "pending" as const, primary: true },
      ],
    },
  };
}
