"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { InsightPlace } from "@/lib/mock/taste-insights";
import { Tile, TileHeader } from "@/components/console/home/ui";
import type { TasteMapGeometry } from "./map-geometry";

/** Matches map-geometry's city keys: "Brooklyn, NY", or "London" with no region. */
const keyOf = (p: InsightPlace) => [p.city, p.region].filter(Boolean).join(", ");

/** Orange 100 → 400 → 700, for t from 0 to 1. */
const STOPS = [
  [255, 237, 213],
  [251, 146, 60],
  [194, 65, 12],
];
function ramp(t: number) {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [r, g, b] = STOPS[i].map((c, k) =>
    Math.round(c + (STOPS[i + 1][k] - c) * f),
  );
  return `rgb(${r} ${g} ${b})`;
}

/** Heatmap cells: one orange, light to dark, for a share from 0 to 1. */
const cell = (v: number) =>
  `color-mix(in oklab, #ea580c ${Math.round(14 + v * 86)}%, #fff7ed)`;

/**
 * Where the shoppers are, and which tastes lead in each city: a density
 * heatmap on a US map next to a city × taste table. Picking a taste redraws
 * the heat for that group; hovering a city lights it up on both.
 */
export function TasteMap({
  geo,
  places,
  groups,
  delay,
  className,
}: {
  geo: TasteMapGeometry;
  places: InsightPlace[];
  groups: { label: string }[];
  delay?: number;
  className?: string;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const ids = useId();
  const clip = `${ids}-land`;
  const blur = `${ids}-blur`;

  const byKey = new Map(places.map((p) => [keyOf(p), p]));
  const value = (p: InsightPlace | undefined) =>
    !p ? 0 : group ? (p.byGroup[group] ?? 0) : p.shoppers;
  const spots = geo.cities
    .map((c) => ({ ...c, place: byKey.get(c.key), v: value(byKey.get(c.key)) }))
    .filter((s) => s.v > 0);

  // Name the biggest cities, skipping any too close to one already named.
  const named: typeof spots = [];
  for (const s of [...spots].sort((a, b) => b.v - a.v)) {
    if (named.length === 4) break;
    if (named.every((n) => Math.hypot(n.x - s.x, n.y - s.y) > 70))
      named.push(s);
  }
  const active = spots.find((s) => s.key === hover);
  const at = (x: number, y: number) => ({
    left: `${(x / geo.width) * 100}%`,
    top: `${(y / geo.height) * 100}%`,
  });
  const rows = places.slice(0, 8);

  return (
    <Tile delay={delay} className={className}>
      <TileHeader
        title="Where your shoppers are"
        hint="Pick a taste to see where it's strongest"
      />
      <div
        role="radiogroup"
        aria-label="Taste"
        className="flex flex-wrap gap-1.5 px-6 pt-4"
      >
        {[null, ...groups.map((g) => g.label)].map((label) => {
          const on = label === group;
          return (
            <button
              key={label ?? "all"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setGroup(label)}
              className={cn(
                "h-7 rounded-full px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                on
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900",
              )}
            >
              {label ?? "All shoppers"}
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <figure className="min-w-0">
          <div className="relative">
            <svg
              viewBox={`0 0 ${geo.width} ${geo.height}`}
              className="block h-auto w-full"
              role="img"
              aria-label={`Heatmap of ${group ?? "all"} shoppers across ${geo.scope === "us" ? "the US" : "the world"}`}
            >
              <defs>
                <clipPath id={clip}>
                  <path d={geo.land} />
                </clipPath>
                <filter
                  id={blur}
                  x="-5%"
                  y="-5%"
                  width="110%"
                  height="110%"
                >
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>

              <path d={geo.land} fill="#f2f1ee" />
              <g clipPath={`url(#${clip})`}>
                <g filter={`url(#${blur})`}>
                  {geo.layers.map((layer) => (
                    <g
                      key={layer.key}
                      className="transition-opacity duration-500"
                      style={{
                        opacity: layer.key === (group ?? "all") ? 1 : 0,
                      }}
                    >
                      {layer.bands.map((d, i) => {
                        const t = i / Math.max(1, layer.bands.length - 1);
                        return (
                          <path
                            key={i}
                            d={d}
                            fill={ramp(t)}
                            fillOpacity={0.3 + t * 0.7}
                          />
                        );
                      })}
                    </g>
                  ))}
                </g>
              </g>
              <path
                d={geo.borders}
                fill="none"
                stroke="#fff"
                strokeWidth={1}
                strokeLinejoin="round"
              />
              <path
                d={geo.land}
                fill="none"
                stroke="#d6d3d1"
                strokeWidth={0.75}
                strokeLinejoin="round"
              />

              {spots.map((s) => {
                const lit = s.key === hover;
                return (
                  <g
                    key={s.key}
                    onMouseEnter={() => setHover(s.key)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer"
                  >
                    <circle cx={s.x} cy={s.y} r={14} fill="transparent" />
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={lit ? 6 : 3.5}
                      fill="#1c1917"
                      stroke="#fff"
                      strokeWidth={lit ? 2.5 : 1.5}
                      className="transition-[r,stroke-width] duration-200"
                    />
                  </g>
                );
              })}
            </svg>

            {named
              .filter((s) => s.key !== hover)
              .map((s) => (
                <span
                  key={s.key}
                  className="pointer-events-none absolute translate-x-2 -translate-y-1/2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-neutral-900 shadow-sm ring-1 ring-black/5"
                  style={at(s.x, s.y)}
                >
                  {s.city}
                </span>
              ))}

            {active?.place && (
              <div
                className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl bg-white p-3 text-xs shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.06]"
                style={at(active.x, active.y)}
              >
                <p className="text-sm font-medium text-neutral-950">
                  {active.key}
                </p>
                <p className="text-muted-foreground">
                  <span className="num">{active.place.shoppers}</span>{" "}
                  shoppers
                </p>
                <ul className="mt-2 space-y-1">
                  {Object.entries(active.place.byGroup)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([label, n]) => (
                      <li
                        key={label}
                        className="flex justify-between gap-3 text-neutral-700"
                      >
                        <span className="truncate">{label}</span>
                        <span className="num shrink-0 font-medium text-neutral-950">
                          {fmt.pct(n / active.place!.shoppers, 0)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
          <figcaption className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Fewer</span>
            <span
              className="h-2 w-28 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})`,
              }}
            />
            <span>More {group ? `${group} shoppers` : "shoppers"}</span>
          </figcaption>
        </figure>

        <div className="min-w-0">
          <div
            role="table"
            aria-label="Share of each city's shoppers in each taste group"
            className="grid gap-px"
            style={{
              gridTemplateColumns: `minmax(0,7.5rem) repeat(${groups.length}, minmax(0,1fr))`,
            }}
          >
            <span role="columnheader" />
            {groups.map((g) => (
              <button
                key={g.label}
                type="button"
                role="columnheader"
                onClick={() => setGroup(g.label === group ? null : g.label)}
                className={cn(
                  "flex items-end justify-center px-0.5 pb-2 text-center text-[11px] leading-tight transition-colors",
                  g.label === group
                    ? "font-semibold text-neutral-950"
                    : "text-muted-foreground hover:text-neutral-900",
                )}
              >
                {g.label}
              </button>
            ))}
            {rows.map((p) => {
              const key = keyOf(p);
              const lit = hover === key;
              return (
                <div
                  key={key}
                  role="row"
                  className="contents"
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span
                    role="rowheader"
                    className={cn(
                      "flex min-w-0 flex-col justify-center rounded-l-md pr-2 transition-colors",
                      lit && "bg-neutral-50",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-neutral-950">
                      {p.city}
                    </span>
                    <span className="num text-[11px] text-muted-foreground">
                      {p.shoppers} shoppers
                    </span>
                  </span>
                  {groups.map((g) => {
                    const share = (p.byGroup[g.label] ?? 0) / p.shoppers;
                    return (
                      <span
                        key={g.label}
                        role="cell"
                        title={`${key}: ${fmt.pct(share, 0)} ${g.label}`}
                        className={cn(
                          "num flex h-10 items-center justify-center rounded-md text-[11px] font-medium transition-opacity",
                          share >= 0.6 ? "text-white" : "text-neutral-800",
                          group && g.label !== group && "opacity-35",
                          lit && "ring-2 ring-neutral-900/25 ring-inset",
                        )}
                        style={{ background: share ? cell(share) : "#fafaf9" }}
                      >
                        {share ? fmt.pct(share, 0) : ""}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Share of each city&apos;s shoppers</span>
            <span
              className="h-2 w-24 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${cell(0)}, ${cell(1)})`,
              }}
            />
            <span className="num">0 to 100%</span>
          </div>
        </div>
      </div>
    </Tile>
  );
}
