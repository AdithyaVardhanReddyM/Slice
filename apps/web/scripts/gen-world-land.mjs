import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import { geoEquirectangular, geoPath } from "d3-geo";
const topo = JSON.parse(readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const land = feature(topo, topo.objects.land);
// Drop Antarctica: polygons whose every point is below 60°S.
const polys = land.features[0].geometry.coordinates.filter(
  (poly) => !poly[0].every(([, lat]) => lat < -60),
);
const geom = { type: "MultiPolygon", coordinates: polys };
const W = 1000, TOP = 84, BOTTOM = -58;
const k = W / (2 * Math.PI);
const H = +(k * ((TOP - BOTTOM) * Math.PI) / 180).toFixed(1);
const proj = geoEquirectangular().scale(k).translate([W / 2, k * (TOP * Math.PI) / 180]).precision(0.2);
const d = geoPath(proj)(geom).replace(/(\d+\.\d)\d+/g, "$1");
const out = `// Generated from world-atlas land-110m (Natural Earth, public domain), Antarctica removed.
// Equirectangular, ${W}x${H}, latitudes ${TOP}..${BOTTOM}. Regenerate with the script in docs/ if needed.
export const WORLD_W = ${W};
export const WORLD_H = ${H};
/** Projects a lat/lon onto the map's viewBox. */
export function projectLatLon(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * WORLD_W, ((${TOP} - lat) / ${TOP - BOTTOM}) * WORLD_H];
}
export const WORLD_LAND_PATH =
  "${d}";
`;
writeFileSync("world-land.ts", out);
console.log("H", H, "path bytes", d.length);
