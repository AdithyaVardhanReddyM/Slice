import type { MatchedTag, Readiness, RecStats } from "./model";

/** The slice of a product the catalog screen renders. Plain and serializable. */
export interface CatalogRow {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  href: string;
  description: string;
  styles: { id: string; label: string }[];
  attrs: {
    material: string[];
    colors: string[];
    colorFamily: string[];
    useCase: string[];
    context: string[];
    contextField: "room" | "occasion";
    fit: string | null;
    season: string[];
    priceTier: string;
  };
  variants: { label: string; inStock: boolean }[];
  inStock: number;
  readiness: Readiness;
  gaps: string[];
  stats: RecStats;
  /** `field:value` keys Slice inferred from the description. */
  enriched: string[];
  tags: MatchedTag[];
  /** Lowercased haystack for client search. */
  haystack: string;
}

export interface StyleCoverage {
  id: string;
  label: string;
  description: string;
  count: number;
  share: number;
}
