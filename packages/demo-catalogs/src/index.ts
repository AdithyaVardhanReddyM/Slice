export type {
  Catalog,
  ColorFamily,
  PriceTier,
  Product,
  ProductAttributes,
  Store,
  StoreNavGroup,
  Variant,
} from "./types.ts";

import type { Catalog, Product } from "./types.ts";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Read helpers over a catalog. Pure and synchronous: catalogs are static JSON. */
export function createCatalogApi(catalog: Catalog) {
  const { store, products } = catalog;
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const categorySlugs = new Map(
    store.nav.map((g) => [slugify(g.category), g.category]),
  );

  function categoryFromSlug(slug: string): string | undefined {
    return categorySlugs.get(slug);
  }

  function inCategory(category: string, subcategory?: string): Product[] {
    return products.filter(
      (p) =>
        p.category === category &&
        (subcategory === undefined || p.subcategory === subcategory),
    );
  }

  function withStyle(style: string): Product[] {
    return products.filter((p) => p.attributes.style.includes(style));
  }

  function search(query: string): Product[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return products
      .map((p) => {
        const haystack = [
          p.name,
          p.subcategory,
          p.category,
          p.description,
          ...p.tags,
          ...p.attributes.style,
          ...p.attributes.material,
          ...p.attributes.colors,
          ...(p.attributes.room ?? []),
        ]
          .join(" ")
          .toLowerCase();
        const score = terms.reduce((acc, t) => {
          if (p.name.toLowerCase().includes(t)) return acc + 3;
          return haystack.includes(t) ? acc + 1 : acc;
        }, 0);
        return { p, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.p);
  }

  /** Same style, different subcategory: what the merchant would show as "goes with". */
  function goesWith(product: Product, take = 4): Product[] {
    const styles = new Set(product.attributes.style);
    return products
      .filter(
        (p) =>
          p.id !== product.id &&
          p.subcategory !== product.subcategory &&
          p.attributes.style.some((s) => styles.has(s)),
      )
      .sort(
        (a, b) =>
          overlap(b, product) - overlap(a, product) ||
          (b.rating ?? 0) - (a.rating ?? 0),
      )
      .slice(0, take);
  }

  function moreLike(product: Product, take = 4): Product[] {
    return products
      .filter((p) => p.id !== product.id && p.subcategory === product.subcategory)
      .sort((a, b) => overlap(b, product) - overlap(a, product))
      .slice(0, take);
  }

  return {
    store,
    products,
    get: (slug: string) => bySlug.get(slug),
    categoryFromSlug,
    inCategory,
    withStyle,
    search,
    goesWith,
    moreLike,
    bestsellers: () => products.filter((p) => p.bestseller),
    newArrivals: () => products.filter((p) => p.new),
    onSale: () => products.filter((p) => p.compareAtPrice !== undefined),
  };
}

function overlap(a: Product, b: Product): number {
  const same = (x: string[], y: string[]) => x.filter((v) => y.includes(v)).length;
  return (
    same(a.attributes.style, b.attributes.style) * 3 +
    same(a.attributes.colorFamily, b.attributes.colorFamily) * 2 +
    same(a.attributes.material, b.attributes.material) +
    same(a.attributes.room ?? [], b.attributes.room ?? [])
  );
}

export type CatalogApi = ReturnType<typeof createCatalogApi>;
