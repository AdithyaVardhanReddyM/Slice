import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import tickets from "./tickets.json" with { type: "json" };
import scenes from "./scenes.json" with { type: "json" };

// Tickets are the only things for sale. Scenes are the site's editorial
// photos in the Product shape so `fetch-images` can pull them; the site hides
// the category. The lineup itself lives in the stores app (acts aren't products).
export const tagide: Catalog = {
  store: store as Store,
  products: [...tickets, ...scenes] as Product[],
};
