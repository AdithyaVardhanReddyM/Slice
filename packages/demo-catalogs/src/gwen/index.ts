import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import perks from "./perks.json" with { type: "json" };
import scenes from "./scenes.json" with { type: "json" };

// Gwen sells one card. Its perks are the items a landing page can lead with;
// scenes are the site's editorial photos in the Product shape so
// `fetch-images` can pull them, and the site hides that category.
export const gwen: Catalog = {
  store: store as Store,
  products: [...perks, ...scenes] as Product[],
};
