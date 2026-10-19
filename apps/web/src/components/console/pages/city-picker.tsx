"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";

/** A geocoded city. Open-Meteo's geocoder (GeoNames data, no key, CORS open). */
export type City = { name: string; region?: string; country: string; countryCode: string; lat: number; lon: number; population?: number };

type GeoResult = {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  population?: number;
  feature_code?: string;
};

export async function searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: GeoResult[] };
  return (body.results ?? [])
    .filter((r) => (r.feature_code ?? "PPL").startsWith("PPL"))
    .slice(0, 6)
    .map((r) => ({
      name: r.name,
      region: r.admin1 && r.admin1 !== r.name ? r.admin1 : undefined,
      country: r.country ?? "",
      countryCode: r.country_code ?? "",
      lat: r.latitude,
      lon: r.longitude,
      population: r.population,
    }));
}

/** 12400232 → "12.4M", 14530 → "14.5k". */
function people(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}

/**
 * City input with suggestions as you type. Typing alone is allowed (Qloo takes
 * the name); picking a suggestion also fixes the spelling, country and pin.
 */
export function CityAutocomplete({
  value,
  onChange,
  onSelect,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect: (city: City) => void;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [results, setResults] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchCities(value, ctrl.signal);
        setResults(found);
        setActive(0);
        setOpen(found.length > 0);
      } catch {
        /* aborted or offline: plain text still works */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function pick(c: City) {
    typed.current = false;
    setOpen(false);
    onSelect(c);
  }

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder="Search a city"
        className="pl-8"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => results.length > 0 && typed.current && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (results[active]) pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {loading && <Spinner className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />}
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10">
          {results.map((c, i) => (
            <li key={`${c.name}-${c.lat}-${c.lon}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
                className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", i === active && "bg-muted")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                  {c.countryCode}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[c.region, c.country].filter(Boolean).join(", ")}</span>
                </span>
                {c.population ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{people(c.population)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Map ----------------------------------------------------------------------------- */

const TILE = 256;

/** Web Mercator: lon/lat to world pixels at a zoom level. */
function project(lat: number, lon: number, z: number) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

/**
 * A static map from OpenStreetMap's standard tiles, toned down to light grey so
 * the pin carries the colour: the city with a pin, or the world when no city is
 * picked yet. No map library needed. (CARTO's tiles watermark browser requests
 * without an API key.)
 */
export function CityMap({ city, className }: { city: City | null; className?: string }) {
  const z = city ? 10 : 1;
  const center = city ? project(city.lat, city.lon, z) : project(25, 10, z);
  const cx = Math.floor(center.x / TILE);
  const cy = Math.floor(center.y / TILE);
  const max = 2 ** z;
  const tiles: { x: number; y: number; key: string }[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ty = cy + dy;
      if (ty < 0 || ty >= max) continue;
      const tx = (((cx + dx) % max) + max) % max;
      tiles.push({ x: (cx + dx) * TILE, y: ty * TILE, key: `${z}/${tx}/${ty}@${dx}` });
    }
  }
  return (
    <div className={cn("relative aspect-[16/7] overflow-hidden rounded-xl bg-[#eef0f2] ring-1 ring-foreground/10", className)}>
      <div className="absolute top-1/2 left-1/2" style={{ transform: `translate(${-center.x}px, ${-center.y}px)` }}>
        {tiles.map((t) => {
          const [zz, tx, rest] = t.key.split("/");
          const ty = rest.split("@")[0];
          return (
            // Map tiles from a public tile server; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={`https://tile.openstreetmap.org/${zz}/${tx}/${ty}.png`}
              alt=""
              draggable={false}
              className="absolute max-w-none grayscale-[85%] contrast-[0.92] brightness-[1.04] select-none"
              style={{ left: t.x, top: t.y, width: TILE, height: TILE }}
            />
          );
        })}
      </div>
      {city ? (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <div className="flex flex-col items-center">
            <span className="mb-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md">
              {city.name}
              <span className="text-background/60">, {city.country}</span>
            </span>
            <span className="size-4 rounded-full border-[3px] border-white bg-primary shadow-md" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">Pick a city to see it on the map</span>
        </div>
      )}
      <span className="absolute right-1.5 bottom-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">© OpenStreetMap contributors</span>
    </div>
  );
}
