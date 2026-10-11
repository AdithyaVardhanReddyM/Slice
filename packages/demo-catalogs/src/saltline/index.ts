import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import rooms from "./rooms.json" with { type: "json" };
import experiences from "./experiences.json" with { type: "json" };
import offers from "./offers.json" with { type: "json" };
import scenes from "./scenes.json" with { type: "json" };

// Scenes are editorial photos (city views, restaurants, journal covers) in the
// Product shape so `fetch-images` can pull them. The site hides the category.
export const saltline: Catalog = {
  store: store as Store,
  products: [...rooms, ...experiences, ...offers, ...scenes] as Product[],
};
