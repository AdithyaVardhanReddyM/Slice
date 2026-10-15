// Covers site helpers: routes, lookups and photos. The data itself is in
// ./restaurants.ts (shared with the Email service's demo data); the booking
// maths is in ./booking.ts.

import { COVERS_APP, COVERS_AREAS, COVERS_COLLECTIONS, COVERS_EDITORS, COVERS_RESTAURANTS, coversPhoto, type CoversAreaId, type CoversCollectionId, type CoversEditorId, type CoversRestaurant } from "./restaurants";
import { queryString, type BookingQuery } from "./booking";

export * from "./restaurants";

export interface Filters {
  area?: CoversAreaId;
  collection?: CoversCollectionId;
  price?: number;
}

export const href = {
  home: "/covers",
  restaurants: "/covers/restaurants",
  restaurant: (slug: string, q: BookingQuery = {}) => `/covers/restaurants/${slug}${queryString({ ...q })}`,
  search: (q: Filters & BookingQuery = {}) => `/covers/restaurants${queryString({ ...q })}`,
  collections: "/covers/collections",
  collection: (id: CoversCollectionId) => `/covers/collections/${id}`,
  areas: "/covers/areas",
  area: (id: CoversAreaId) => `/covers/areas/${id}`,
  editors: "/covers#editors",
  how: "/covers#how",
  app: "/covers#app",
};

export const restaurantBySlug = (slug: string) => COVERS_RESTAURANTS.find((r) => r.slug === slug);
export const areaById = (id: string) => COVERS_AREAS.find((a) => a.id === id);
export const collectionById = (id: string) => COVERS_COLLECTIONS.find((c) => c.id === id);
export const editor = (id: CoversEditorId) => COVERS_EDITORS.find((e) => e.id === id)!;
export const inArea = (id: CoversAreaId) => COVERS_RESTAURANTS.filter((r) => r.area === id);
export const inCollection = (id: CoversCollectionId) => COVERS_RESTAURANTS.filter((r) => r.collections.includes(id));
export const newOnCovers = () => COVERS_RESTAURANTS.filter((r) => r.isNew);

type Noted = CoversRestaurant & { note: NonNullable<CoversRestaurant["note"]> };
export const editorsNotes = () => COVERS_RESTAURANTS.filter((r): r is Noted => !!r.note);

export function filterRestaurants({ area, collection, price }: Filters) {
  return COVERS_RESTAURANTS.filter((r) => (!area || r.area === area) && (!collection || r.collections.includes(collection)) && (!price || r.price === price));
}

/** Shared collections count most, then the same part of town, then shared tags. */
export function moreLike(r: CoversRestaurant, take = 4) {
  const score = (o: CoversRestaurant) =>
    o.collections.filter((c) => r.collections.includes(c)).length * 3 + (o.area === r.area ? 2 : 0) + o.tags.filter((t) => r.tags.includes(t)).length * 0.5;
  return COVERS_RESTAURANTS.filter((o) => o.slug !== r.slug && score(o) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, take);
}

/** A restaurant's photo at a width (Qloo's CDN, or a wsrv.nl crop for the few with a press badge). */
export const photo = (r: Pick<CoversRestaurant, "photo">, width = 800) => coversPhoto(r, width);

/** The restaurant whose photo stands for each collection and area. */
const collectionCovers: Record<CoversCollectionId, string> = {
  "small-plates": "brawn",
  "grand-rooms": "brasserie-zedel",
  "tasting-menus": "the-clove-club",
  spice: "gymkhana",
  mezze: "sabor",
  pasta: "the-river-cafe",
  british: "rules",
  counter: "kiln",
};

const areaCovers: Record<CoversAreaId, string> = {
  east: "dishoom-shoreditch",
  clerkenwell: "sessions-arts-club",
  soho: "the-palomar",
  mayfair: "the-wolseley",
  "covent-garden": "toklas",
  marylebone: "kol",
  west: "core-by-clare-smyth",
  south: "rambutan",
};

export const collectionCover = (id: CoversCollectionId) => restaurantBySlug(collectionCovers[id]) ?? inCollection(id)[0];
export const areaCover = (id: CoversAreaId) => restaurantBySlug(areaCovers[id]) ?? inArea(id)[0];

/** Google Maps at the restaurant's pin. */
export const mapsUrl = (r: Pick<CoversRestaurant, "lat" | "lon">) => `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`;

/** "First floor, 4 Redchurch Street" and "E1 6JL" from the one-line address. */
export function splitAddress(address: string) {
  const m = address.match(/^(.*), London ([A-Z0-9]+ [A-Z0-9]+)$/);
  return m ? { street: m[1], postalCode: m[2] } : { street: address, postalCode: "" };
}

/** "1 restaurant", "12 restaurants" */
export const countLabel = (n: number) => `${n} ${n === 1 ? "restaurant" : "restaurants"}`;

export const officeAddress = `${COVERS_APP.street}, ${COVERS_APP.city} ${COVERS_APP.postalCode}`;

/** "RD" for Rosa Delgado, for the editor avatars. */
export const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2);
