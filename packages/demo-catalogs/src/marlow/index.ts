import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import living from "./living.json" with { type: "json" };
import bedroom from "./bedroom.json" with { type: "json" };
import kitchen from "./kitchen.json" with { type: "json" };
import lighting from "./lighting.json" with { type: "json" };
import decor from "./decor.json" with { type: "json" };
import workspace from "./workspace.json" with { type: "json" };
import outdoor from "./outdoor.json" with { type: "json" };

export const marlow: Catalog = {
  store: store as Store,
  products: [
    ...living,
    ...bedroom,
    ...kitchen,
    ...lighting,
    ...decor,
    ...workspace,
    ...outdoor,
  ] as Product[],
};
