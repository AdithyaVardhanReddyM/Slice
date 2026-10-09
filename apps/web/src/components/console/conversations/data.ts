import { product, productImage, styleLabel } from "@/lib/mock/catalog";
import type { Conversation, Outcome, StoreKey } from "@/lib/mock/types";

// View models for the conversation screens. Built on the server so client
// components get plain props and the catalog JSON never ships to the browser.

export interface ProductLite {
  id: string;
  name: string;
  brand?: string;
  price: number;
  compareAtPrice?: number;
  image: string | null;
  category: string;
  subcategory: string;
  styleIds: string[];
  styles: string[];
  materials: string[];
  colors: string[];
}

export function productLite(id: string, store: StoreKey): ProductLite {
  const p = product(id);
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    image: productImage(p),
    category: p.category,
    subcategory: p.subcategory,
    styleIds: p.attributes.style,
    styles: p.attributes.style.map((s) => styleLabel(store, s)),
    materials: p.attributes.material,
    colors: p.attributes.colors,
  };
}

/** Every product a conversation references (recs + retrieval candidates). */
export function productsFor(c: Conversation): Record<string, ProductLite> {
  const ids = new Set<string>();
  for (const m of c.messages) m.recs?.forEach((r) => ids.add(r.productId));
  for (const t of c.traces)
    t.retrieval.candidates.forEach((x) => ids.add(x.productId));
  return Object.fromEntries(
    [...ids].map((id) => [id, productLite(id, c.storeKey)]),
  );
}

export interface ConversationSummary {
  id: string;
  startedAt: string;
  city: string;
  region: string;
  device: string;
  returning: boolean;
  opener: string;
  intent: string;
  outcome: Outcome;
  revenue: number;
  turns: number;
  entities: string[];
  thumbs: (string | null)[];
}

export function summarize(c: Conversation): ConversationSummary {
  const firstRecs = c.messages.find((m) => m.recs)?.recs ?? [];
  return {
    id: c.id,
    startedAt: c.startedAt,
    city: c.shopper.city,
    region: c.shopper.region,
    device: c.shopper.device,
    returning: c.shopper.returning,
    opener: c.messages.find((m) => m.role === "shopper")?.text ?? "",
    intent: c.intent,
    outcome: c.outcome,
    revenue: c.revenue,
    turns: c.messages.filter((m) => m.role === "shopper").length,
    entities: c.profile.entities.map((e) => e.name),
    thumbs: firstRecs.map((r) => productImage(product(r.productId))),
  };
}
