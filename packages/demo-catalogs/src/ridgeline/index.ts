import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import coffee from "./coffee.json" with { type: "json" };
import plans from "./plans.json" with { type: "json" };
import gifts from "./gifts.json" with { type: "json" };
import scenes from "./scenes.json" with { type: "json" };

// Scenes are editorial photos (heroes, café interiors, journal covers) that
// ride along in the Product shape so `fetch-images` can pull them. The site
// hides the category from navigation.
export const ridgeline: Catalog = {
  store: store as Store,
  products: [...coffee, ...plans, ...gifts, ...scenes] as Product[],
};
