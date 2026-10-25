import { CITY_COORDS } from "@/lib/mock/geo";

// Where shoppers' cities are, for the taste map. The taste questionnaire asks
// for one of these cities (taste.ts CITIES); the sample's US cities come too.

const QUESTIONNAIRE: Record<string, [lat: number, lon: number]> = {
  "New York City": [40.71, -74.01],
  "Los Angeles": [34.05, -118.24],
  London: [51.51, -0.13],
  Paris: [48.86, 2.35],
  Berlin: [52.52, 13.4],
  Tokyo: [35.68, 139.69],
  Toronto: [43.65, -79.38],
  Sydney: [-33.87, 151.21],
};

const byName = new Map<string, [number, number]>();
for (const [key, at] of Object.entries(CITY_COORDS)) {
  byName.set(key.toLowerCase(), at);
  byName.set(key.split(",")[0].toLowerCase(), at);
}
for (const [name, at] of Object.entries(QUESTIONNAIRE))
  byName.set(name.toLowerCase(), at);

/** A city's [lat, lon], from "Brooklyn, NY" or just "Brooklyn"; null when unknown. */
export function cityCoords(city: string): [number, number] | null {
  const key = city.trim().toLowerCase();
  return byName.get(key) ?? byName.get(key.split(",")[0].trim()) ?? null;
}
