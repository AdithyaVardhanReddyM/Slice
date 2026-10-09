import { createCatalogApi, slugify, type Product } from "@slice/demo-catalogs";
import { fold as foldCatalog } from "@slice/demo-catalogs/fold";

export const fold = createCatalogApi(foldCatalog);

export type Dept = "women" | "men";

/** Women's and men's views both include unisex pieces, like any real shop. */
export const inDept = (p: Product, dept?: string | null) =>
  !dept || dept === "all" || p.department === dept || p.department === "unisex";

export const parseDept = (value: string | string[] | undefined | null): Dept | undefined => {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "women" || v === "men" ? v : undefined;
};

export const href = {
  home: "/fold",
  shop: (dept?: Dept) => (dept ? `/fold/shop?dept=${dept}` : "/fold/shop"),
  category: (category: string) => `/fold/c/${slugify(category)}`,
  subcategory: (category: string, subcategory: string) =>
    `/fold/c/${slugify(category)}?sub=${encodeURIComponent(subcategory)}`,
  product: (slug: string) => `/fold/p/${slug}`,
  edit: (style: string) => `/fold/edit/${style}`,
  edits: "/fold/edit",
  brand: (slug: string) => `/fold/brand/${slug}`,
  brandOf: (name: string) =>
    `/fold/brand/${fold.store.brands?.find((b) => b.name === name)?.slug ?? slugify(name)}`,
  brands: "/fold/brands",
  search: (q: string) => `/fold/search?q=${encodeURIComponent(q)}`,
  cart: "/fold/cart",
};

export const styleLabel = (id: string) =>
  fold.store.styles.find((s) => s.id === id)?.label ?? id;

export const navLabel = (category: string) =>
  fold.store.nav.find((g) => g.category === category)?.label ?? category;

export { slugify };
