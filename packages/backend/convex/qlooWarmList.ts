import type { QlooParams } from "@slice/qloo";

// Requests to pre-cache before a demo so judging makes (almost) no live Qloo
// calls. These only hit if the agent's tools send exactly the same path and
// params, so keep this list in sync with them. This is our own input (persona
// seeds from docs/demo-stores.md and Fold's brands), not Qloo data.
//
//   npx convex run qloo:warm

export type QlooRequest = { path: string; params: QlooParams };

const search = (type: string, names: string[]): QlooRequest[] =>
  names.map((query) => ({
    path: "/search",
    params: { query, types: `urn:entity:${type}` },
  }));

export const WARM_LIST: QlooRequest[] = [
  ...search("artist", [
    "Fleetwood Mac",
    "Bon Iver",
    "Beyoncé",
    "Kendrick Lamar",
    "Phoebe Bridgers",
    "Taylor Swift",
  ]),
  ...search("tv_show", [
    "Bridgerton",
    "Euphoria",
    "The Bear",
    "Normal People",
    "Gilmore Girls",
  ]),
  ...search("person", ["Wes Anderson"]),
  ...search("brand", [
    "Nike",
    "Adidas",
    "New Balance",
    "Levi's",
    "Carhartt WIP",
    "Patagonia",
    "Dr. Martens",
    "Birkenstock",
    "Norse Projects",
    "Veja",
    "Arket",
    "Snow Peak",
    "Salomon",
    "Studio Nicholson",
    "Pangaia",
    "Kapital",
  ]),
];
