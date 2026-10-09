import { createCatalogApi, slugify } from "@slice/demo-catalogs";
import { marlow as marlowCatalog } from "@slice/demo-catalogs/marlow";

export const marlow = createCatalogApi(marlowCatalog);

export { slugify };

export const categoryHref = (category: string) =>
  `/marlow/c/${slugify(category)}`;

export const subcategoryHref = (category: string, subcategory: string) =>
  `/marlow/c/${slugify(category)}?sub=${encodeURIComponent(subcategory)}`;

export const productHref = (slug: string) => `/marlow/p/${slug}`;

export const styleHref = (style: string) => `/marlow/style/${style}`;
