"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import {
  AGE_LABEL,
  TAG_GROUPS,
  tagGroup,
  type AudienceBrief,
  type AudienceProfile,
  type ProfileBrand,
  type ProfileTag,
} from "@/lib/pages/types";
import { Badge } from "@/components/ui/badge";
import { Hint, SectionLabel, Thumb } from "./shared";

/* Tags ----------------------------------------------------------------------- */

export function groupTags(tags: ProfileTag[]) {
  const m = new Map<string, ProfileTag[]>();
  for (const t of tags) {
    const key = tagGroup(t.type);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(t);
  }
  for (const list of m.values()) list.sort((a, b) => b.affinity - a.affinity);
  const order = TAG_GROUPS.map(([k]) => k);
  return [...m.entries()].sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export const groupLabel = (key: string) =>
  TAG_GROUPS.find(([k]) => k === key)?.[1] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function TagChips({ tags, max = 8, className }: { tags: ProfileTag[]; max?: number; className?: string }) {
  const sorted = useMemo(() => [...tags].sort((a, b) => b.affinity - a.affinity).slice(0, max), [tags, max]);
  if (sorted.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {sorted.map((t) => (
        <Badge key={t.id} variant="secondary" className="font-normal" title={`${groupLabel(tagGroup(t.type))} · affinity ${Math.round(t.affinity * 100)}`}>
          {t.name.charAt(0).toUpperCase() + t.name.slice(1)}
        </Badge>
      ))}
    </div>
  );
}

export function TagsByGroup({ tags, perGroup = 8 }: { tags: ProfileTag[]; perGroup?: number }) {
  const groups = useMemo(() => groupTags(tags), [tags]);
  if (groups.length === 0) return <Hint>No taste tags yet.</Hint>;
  return (
    <div className="space-y-3">
      {groups.map(([key, list]) => (
        <div key={key} className="grid gap-1.5 sm:grid-cols-[9rem_1fr]">
          <span className="pt-0.5 text-xs text-muted-foreground">{groupLabel(key)}</span>
          <div className="flex flex-wrap gap-1.5">
            {list.slice(0, perGroup).map((t) => (
              <Badge key={t.id} variant="secondary" className="font-normal" title={`affinity ${Math.round(t.affinity * 100)}`}>
                {t.name}
              </Badge>
            ))}
            {list.length > perGroup && (
              <span className="self-center text-xs text-muted-foreground">+{list.length - perGroup}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tag groups as a ruled table: group on the left, its tags on the right. */
export function TagTable({ tags, perGroup = 8 }: { tags: ProfileTag[]; perGroup?: number }) {
  const groups = useMemo(() => groupTags(tags), [tags]);
  if (groups.length === 0) return <Hint className="p-4">No taste tags yet.</Hint>;
  return (
    <dl className="divide-y">
      {groups.map(([key, list]) => (
        <div key={key} className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="pt-0.5 text-sm text-muted-foreground">
            {groupLabel(key)}
            <span className="ml-1.5 text-xs tabular-nums opacity-70">{list.length}</span>
          </dt>
          <dd className="flex flex-wrap gap-1.5">
            {list.slice(0, perGroup).map((t) => (
              <Badge key={t.id} variant="secondary" className="font-normal" title={`affinity ${Math.round(t.affinity * 100)}`}>
                {t.name.charAt(0).toUpperCase() + t.name.slice(1)}
              </Badge>
            ))}
            {list.length > perGroup && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                +{list.length - perGroup} more
              </Badge>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* Brands ------------------------------------------------------------------------ */

export function BrandsList({ brands, max = 8 }: { brands: ProfileBrand[]; max?: number }) {
  const sorted = useMemo(() => [...brands].sort((a, b) => b.affinity - a.affinity).slice(0, max), [brands, max]);
  if (sorted.length === 0) return <Hint className="p-4">No brand affinities yet.</Hint>;
  return (
    <ul className="divide-y">
      {sorted.map((b, i) => {
        const words = [...b.personalStyle, ...b.lifestyle, ...b.emotionalTone].slice(0, 3);
        const score = Math.round(b.affinity * 100);
        return (
          <li key={b.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <Thumb src={b.image} className="size-10 bg-white ring-1 ring-foreground/10" rounded="rounded-lg [&_img]:object-contain [&_img]:p-1" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{b.name}</div>
              {words.length > 0 && <div className="truncate text-xs text-muted-foreground">{words.join(" · ")}</div>}
            </div>
            <div className="flex w-20 shrink-0 items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
              </span>
              <span className="w-6 text-right text-xs font-medium tabular-nums">{score}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* Demographics ----------------------------------------------------------------- */

/** Qloo skew bars (-1..1): bars grow right for over-indexed buckets and left for under-indexed. */
export function DemographicsBars({
  demographics,
  compact,
}: {
  demographics?: AudienceProfile["demographics"];
  compact?: boolean;
}) {
  if (!demographics) return compact ? null : <Hint>No demographic read.</Hint>;
  const ages = Object.entries(demographics.age ?? {}).sort(
    (a, b) => Object.keys(AGE_LABEL).indexOf(a[0]) - Object.keys(AGE_LABEL).indexOf(b[0]),
  );
  const genders = Object.entries(demographics.gender ?? {});
  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className={cn("grid items-center gap-3", compact ? "grid-cols-[4.5rem_1fr]" : "grid-cols-[5.5rem_minmax(0,1fr)_3.5rem]")}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="relative block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <span
          className={cn("absolute inset-y-0 rounded-full", value >= 0 ? "bg-primary" : "bg-foreground/40")}
          style={
            value >= 0
              ? { left: "50%", width: `${Math.min(50, Math.abs(value) * 50)}%` }
              : { right: "50%", width: `${Math.min(50, Math.abs(value) * 50)}%` }
          }
        />
      </span>
      {!compact && (
        <span className={cn("num text-right text-xs tabular-nums", value > 0.05 ? "font-medium text-foreground" : "text-muted-foreground")}>{fmt.delta(value)}</span>
      )}
    </div>
  );
  return (
    <div className={cn("space-y-1.5", !compact && "space-y-2.5")}>
      {!compact && <div className="text-xs font-medium text-muted-foreground">Age</div>}
      {ages.map(([k, v]) => (
        <Row key={k} label={AGE_LABEL[k] ?? k} value={v} />
      ))}
      {!compact && genders.length > 0 && <div className="pt-2 text-xs font-medium text-muted-foreground">Gender</div>}
      {(compact ? [] : genders).map(([k, v]) => (
        <Row key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={v} />
      ))}
    </div>
  );
}

/* Culture + geo ------------------------------------------------------------------ */

const CULTURE_LABEL: Record<keyof AudienceProfile["culture"], string> = {
  artists: "Artists",
  films: "Films",
  places: "Places",
  books: "Books",
};

export function CultureLists({ culture, max = 6 }: { culture?: AudienceProfile["culture"]; max?: number }) {
  if (!culture) return <Hint>No cultural references yet.</Hint>;
  const keys = (Object.keys(CULTURE_LABEL) as (keyof AudienceProfile["culture"])[]).filter(
    (k) => (culture[k] ?? []).length > 0,
  );
  if (keys.length === 0) return <Hint>No cultural references yet.</Hint>;
  return (
    <div className="space-y-6">
      {keys.map((k) => {
        const poster = k === "films" || k === "books";
        return (
          <section key={k} className="space-y-3">
            <h3 className="text-sm font-medium">
              {CULTURE_LABEL[k]}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{Math.min(max, culture[k].length)}</span>
            </h3>
            <ul className={cn("grid gap-3", poster ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-3 sm:grid-cols-4")}>
              {culture[k].slice(0, max).map((e, i) => (
                <li key={`${e.id}-${i}`} className="min-w-0">
                  <Thumb src={e.image} alt={e.name} className={cn("w-full ring-1 ring-foreground/10", poster ? "aspect-[2/3]" : "aspect-square")} rounded="rounded-lg" />
                  <div className="mt-1.5 truncate text-xs font-medium" title={e.name}>
                    {e.name}
                  </div>
                  {e.subtitle && <div className="truncate text-xs text-muted-foreground">{e.subtitle}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function GeoList({ geo }: { geo?: AudienceProfile["geo"] }) {
  if (!geo || geo.length === 0) return <Hint className="p-4">No location data.</Hint>;
  const top = Math.max(...geo.map((g) => g.count));
  return (
    <ul className="divide-y">
      {geo.map((g) => (
        <li key={g.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <span className="w-32 truncate font-medium">{g.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (g.count / top) * 100)}%` }} />
            </span>
          </div>
          <span className="num text-xs text-muted-foreground">
            {fmt.int(g.count)}
            {g.lat !== undefined && g.lon !== undefined ? ` · ${g.lat.toFixed(2)}, ${g.lon.toFixed(2)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* Brief -------------------------------------------------------------------------- */

export function AudienceBriefView({ brief }: { brief: AudienceBrief | null }) {
  if (!brief) return <Hint>The agent has not written a brief for this audience yet.</Hint>;
  const rows: [string, ReactNode][] = [
    ["Speak to them", brief.speakTo],
    ["Lead with", brief.leadWith],
    ["Imagery", brief.imagery],
  ];
  return (
    <div className="space-y-6 text-sm">
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="leading-relaxed">{value}</dd>
            </div>
          ))}
          {brief.avoid?.length > 0 && (
            <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-muted-foreground">Avoid</dt>
              <dd className="flex flex-wrap gap-1.5">
                {brief.avoid.map((a) => (
                  <Badge key={a} variant="outline" className="font-normal">
                    {a}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>
      {brief.hooks?.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Cultural hooks</SectionLabel>
          <ol className="grid gap-3 sm:grid-cols-2">
            {brief.hooks.map((h, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="leading-relaxed">{h.text}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{h.evidence}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
