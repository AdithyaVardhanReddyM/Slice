import type { Catalog, Product } from "@slice/demo-catalogs";
import { fold } from "@slice/demo-catalogs/fold";
import { marlow } from "@slice/demo-catalogs/marlow";
import type { StoreKey } from "./types";

export const catalogs: Record<StoreKey, Catalog> = { marlow, fold };

const index = new Map<string, Product>(
  [...marlow.products, ...fold.products].map((p) => [p.id, p]),
);

export function product(id: string): Product {
  const p = index.get(id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return p;
}

export function styleLabel(store: StoreKey, style: string): string {
  return (
    catalogs[store].store.styles.find((s) => s.id === style)?.label ?? style
  );
}

export { productImage } from "./images";
