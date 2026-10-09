import type { Catalog, Product, Store } from "../types.ts";
import store from "./store.json" with { type: "json" };
import tops from "./tops.json" with { type: "json" };
import bottoms from "./bottoms.json" with { type: "json" };
import outerwear from "./outerwear.json" with { type: "json" };
import dresses from "./dresses.json" with { type: "json" };
import footwear from "./footwear.json" with { type: "json" };
import bags from "./bags.json" with { type: "json" };
import accessories from "./accessories.json" with { type: "json" };
import grooming from "./grooming.json" with { type: "json" };
import lifestyle from "./lifestyle.json" with { type: "json" };

export const fold: Catalog = {
  store: store as Store,
  products: [
    ...tops,
    ...bottoms,
    ...outerwear,
    ...dresses,
    ...footwear,
    ...bags,
    ...accessories,
    ...grooming,
    ...lifestyle,
  ] as Product[],
};
