// The catalog shape a merchant hands to Slice. Both demo stores use it, and
// the widget's merchant import will accept the same shape later.

export type PriceTier = "budget" | "mid" | "premium";

export type ColorFamily =
  | "neutral"
  | "warm"
  | "cool"
  | "earth"
  | "bold"
  | "pastel"
  | "black"
  | "white";

export interface Variant {
  id: string;
  /** Shown in the picker: "Oak", "Queen", "M". */
  label: string;
  inStock: boolean;
  /** Added to the base price when selected (e.g. a King bed costs more). */
  priceDelta?: number;
}

export interface ProductAttributes {
  /** 1–2 values from the store's style axis (see store.json). */
  style: string[];
  material: string[];
  colorFamily: ColorFamily[];
  /** Specific color names as the merchant would list them: "terracotta", "sage". */
  colors: string[];
  /** "small apartment", "hosting", "commute", "rainy days". */
  useCase: string[];
  /** Home stores: "living room", "balcony". */
  room?: string[];
  /** Fashion stores: "everyday", "office", "festival", "hiking". */
  occasion?: string[];
  /** Fashion stores. */
  fit?: "relaxed" | "regular" | "slim" | "oversized";
  /** Fashion stores. */
  season?: string[];
  priceTier: PriceTier;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** Omitted for house-brand stores. */
  brand?: string;
  /** Fashion stores. */
  department?: "women" | "men" | "unisex" | "kids";
  category: string;
  subcategory: string;
  /** USD. */
  price: number;
  /** When present the product is on sale and this is the struck-through price. */
  compareAtPrice?: number;
  /** Merchant copy, 2–3 sentences. This is what the agent matches taste against. */
  description: string;
  /** Spec bullets shown on the product page: dimensions, materials, care. */
  details: string[];
  attributes: ProductAttributes;
  /** Free-form merchant tags. */
  tags: string[];
  variants: Variant[];
  /** Stock-photo search query used to fetch a representative image. */
  imageQuery: string;
  /** Paths or URLs. Empty until images are fetched; the store renders a placeholder. */
  images: string[];
  rating?: number;
  reviewCount?: number;
  bestseller?: boolean;
  new?: boolean;
}

export interface StoreNavGroup {
  label: string;
  category: string;
  subcategories: string[];
}

/** Multi-brand stores: the labels the store carries, shown on brand pages. */
export interface StoreBrand {
  name: string;
  slug: string;
  /** City / country the label is based in: "Lisbon, Portugal". */
  origin: string;
  /** Merchant copy for the brand page, 2–3 sentences. */
  description: string;
}

export interface Store {
  id: string;
  name: string;
  tagline: string;
  description: string;
  currency: "USD";
  /** The store's style axis; every product's `attributes.style` draws from it. */
  styles: { id: string; label: string; description: string }[];
  /** Home stores. */
  rooms?: string[];
  /** Multi-brand stores; every product's `brand` is one of these names. */
  brands?: StoreBrand[];
  /** Fashion stores: which `department` values the store sells. */
  departments?: Product["department"][];
  nav: StoreNavGroup[];
}

export interface Catalog {
  store: Store;
  products: Product[];
}
