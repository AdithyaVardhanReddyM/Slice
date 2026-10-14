"use client";

import { useState, type ReactNode } from "react";
import { FileSpreadsheet, Globe, Heart, ListFilter, MapPin, UserRound, Users, UsersRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudienceProfile } from "@/lib/pages/types";

type Tile = { key: string; name: string; image?: string };

export const KIND_ICON: Record<string, LucideIcon> = {
  default: Globe,
  location: MapPin,
  demographic: Users,
  interests: Heart,
  custom: ListFilter,
  csv: FileSpreadsheet,
  lead: UserRound,
  people: UsersRound,
};

// Deep neutrals for tiles without a picture, so the mosaic still reads as one cover.
const TEXT_TILES = ["bg-neutral-800", "bg-stone-700", "bg-zinc-900", "bg-neutral-700", "bg-stone-800"];

/**
 * Up to `n` picks for the cover, taken round-robin across artists, places,
 * brands, films and books so one kind never fills it. Pictures first.
 */
export function coverTiles(profile: AudienceProfile | null, n = 5): Tile[] {
  if (!profile) return [];
  const lists: Tile[][] = [
    profile.culture.artists,
    profile.culture.places,
    profile.brands,
    profile.culture.films,
    profile.culture.books,
    profile.entities,
  ].map((l) => l.map((e) => ({ key: e.id, name: e.name, image: e.image })));
  const seen = new Set<string>();
  const ordered: Tile[] = [];
  for (let i = 0; ordered.length < 40 && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const t = l[i];
      if (!t || seen.has(t.name.toLowerCase()) || (t.image && seen.has(t.image))) continue;
      seen.add(t.name.toLowerCase());
      if (t.image) seen.add(t.image);
      ordered.push(t);
    }
  }
  return [...ordered.filter((t) => t.image), ...ordered.filter((t) => !t.image)].slice(0, n);
}

function CoverTile({ tile, index, className }: { tile: Tile; index: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("relative overflow-hidden", !tile.image || broken ? TEXT_TILES[index % TEXT_TILES.length] : "bg-neutral-800", className)} title={tile.name}>
      {tile.image && !broken ? (
        // Qloo images come from many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tile.image}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <span className="absolute inset-x-0 top-0 line-clamp-3 p-2 text-[11px] leading-tight font-medium text-white/70">{tile.name}</span>
      )}
    </div>
  );
}

/**
 * An audience's cover: a mosaic of what these people love, with the name over
 * a dark fade. With no profile yet it shows an empty dark cover.
 */
export function TasteCover({
  tiles,
  icon: Icon,
  kindLabel,
  title,
  subtitle,
  corner,
  className,
}: {
  tiles: Tile[];
  icon: LucideIcon;
  kindLabel: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  corner?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate aspect-[16/10] overflow-hidden bg-neutral-900", className)}>
      {tiles.length >= 3 && (
        <div className={cn("absolute inset-0 grid gap-px bg-neutral-950", tiles.length >= 5 ? "grid-cols-4 grid-rows-2" : "grid-cols-3 grid-rows-2")}>
          {tiles.map((t, i) => (
            <CoverTile key={t.key} tile={t} index={i} className={i === 0 ? "col-span-2 row-span-2" : undefined} />
          ))}
        </div>
      )}
      {tiles.length > 0 && tiles.length < 3 && (
        <div className="absolute inset-0 grid grid-cols-2 gap-px bg-neutral-950">
          {tiles.map((t, i) => (
            <CoverTile key={t.key} tile={t} index={i} />
          ))}
        </div>
      )}
      {tiles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="size-10 text-white/15" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/85 via-black/50 to-transparent" />
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        <Icon className="size-3.5" />
        {kindLabel}
      </div>
      {corner && <div className="absolute top-3 right-3">{corner}</div>}
      {(title || subtitle) && (
        <div className="absolute inset-x-0 bottom-0 p-4">
          {title && <div className="line-clamp-2 text-lg leading-snug font-semibold text-white">{title}</div>}
          {subtitle && <div className="mt-0.5 truncate text-sm text-white/75">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
