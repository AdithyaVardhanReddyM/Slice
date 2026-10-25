import { contourDensity, type ContourMultiPolygon } from "d3-contour";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "us-atlas/states-albers-10m.json";
import {
  WORLD_H,
  WORLD_LAND_PATH,
  WORLD_W,
  projectLatLon,
} from "@/components/concierge/world-land";
import type { InsightPlace } from "@/lib/mock/taste-insights";

// Server-side geometry for the taste map: US states from us-atlas (already
// projected to Albers USA in a 975×610 frame) and, per taste, a kernel density
// of where those shoppers are, as nested contour bands. When any shopper is
// outside the US the map is the world instead (Natural Earth land, the same
// outline the taste questions use). The browser only gets path strings.

const MAP_W = 975;
const MAP_H = 610;
/** Heat levels per taste. */
const BANDS = 10;

/** d3-contour 4's `density.contours()`, which its published types don't have yet. */
type DensityGrid = ((threshold: number) => ContourMultiPolygon) & {
  max: number;
};
type Point = { x: number; y: number; w: number };

const projection = geoAlbersUsa()
  .scale(1300)
  .translate([MAP_W / 2, MAP_H / 2]);
const path = geoPath().digits(1);
/** Heat contours are soft-edged anyway; whole pixels keep them small. */
const contour = geoPath().digits(0);

const us = atlas as unknown as Topology<{
  states: GeometryCollection;
  nation: GeometryCollection;
}>;
const LAND = path(feature(us, us.objects.nation)) ?? "";
const BORDERS = path(mesh(us, us.objects.states, (a, b) => a !== b)) ?? "";

export interface MapCity {
  key: string;
  city: string;
  x: number;
  y: number;
}

export interface HeatLayer {
  /** "all", or a taste group's label. */
  key: string;
  /** Density contours, sparsest first; each band sits inside the one before. */
  bands: string[];
}

export interface TasteMapGeometry {
  scope: "us" | "world";
  width: number;
  height: number;
  land: string;
  borders: string;
  cities: MapCity[];
  layers: HeatLayer[];
}

export const placeKey = (p: Pick<InsightPlace, "city" | "region">) =>
  [p.city, p.region].filter(Boolean).join(", ");

export function tasteMapGeometry(
  places: InsightPlace[],
  groups: string[],
): TasteMapGeometry {
  const inUs = places.map((p) => projection([p.lon, p.lat]));
  const world = inUs.some((xy) => !xy);
  const width = world ? WORLD_W : MAP_W;
  const height = world ? WORLD_H : MAP_H;
  const located = places.map((p, i) => {
    const [x, y] = world ? projectLatLon(p.lat, p.lon) : inUs[i]!;
    return { p, x, y };
  });
  const layer = (key: string, weight: (p: InsightPlace) => number) => {
    const points: Point[] = located
      .map((c) => ({ x: c.x, y: c.y, w: weight(c.p) }))
      .filter((c) => c.w > 0);
    const estimator = contourDensity<Point>()
      .x((d) => d.x)
      .y((d) => d.y)
      .weight((d) => d.w)
      .size([Math.ceil(width), Math.ceil(height)])
      .cellSize(4)
      .bandwidth(world ? 18 : 26) as unknown as { contours(data: Point[]): DensityGrid };
    const density = estimator.contours(points);
    // Levels bunch up at the low end so a city with a few shoppers still glows
    // next to one with many.
    const bands = Array.from({ length: BANDS }, (_, i) =>
      contour(density(density.max * ((i + 1) / (BANDS + 1)) ** 2)),
    ).filter((d): d is string => !!d);
    return { key, bands };
  };
  return {
    scope: world ? "world" : "us",
    width,
    height,
    land: world ? WORLD_LAND_PATH : LAND,
    borders: world ? "" : BORDERS,
    cities: located.map(({ p, x, y }) => ({
      key: placeKey(p),
      city: p.city,
      x,
      y,
    })),
    layers: [
      layer("all", (p) => p.shoppers),
      ...groups.map((g) => layer(g, (p) => p.byGroup[g] ?? 0)),
    ],
  };
}
