"use client";

/* eslint-disable @next/next/no-img-element -- logos and Qloo images come from arbitrary hosts */
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import { Badge, SpanChip } from "@/components/console/primitives";
import type { SpanKind } from "@/lib/mock/types";
import { safeSrc } from "@/lib/pages/theme";
import { cn } from "@/lib/utils";

// Read-only views shared by the new-page flow and the editor.

type Span = Doc<"brands">["trace"][number];
type EntityRef = NonNullable<Doc<"brands">["taste"]>["entities"][number];
type TasteTag = NonNullable<Doc<"brands">["taste"]>["tags"][number];

const KIND_LABEL: Record<string, string> = {
  artist: "Music",
  movie: "Film",
  tv_show: "TV",
  brand: "Brand",
  destination: "Place",
  podcast: "Podcast",
  book: "Book",
  place: "Place",
};
export const entityKind = (type: string) => KIND_LABEL[type.split(":").pop() ?? ""] ?? "Entity";
export const tagKind = (type: string) => (type.split(":")[2] ?? "tag").replace(/_/g, " ");

export function BrandLogo({
  kit,
  className,
}: {
  kit: { name: string; logo?: string; icon?: string; colors: { primary: string } };
  className?: string;
}) {
  const src = safeSrc(kit.logo) ?? safeSrc(kit.icon);
  return src ? (
    <img src={src} alt={`${kit.name} logo`} className={cn("h-8 w-auto max-w-[140px] object-contain", className)} />
  ) : (
    <span
      className={cn("flex size-8 items-center justify-center rounded-md text-sm font-semibold text-white", className)}
      style={{ background: kit.colors.primary }}
    >
      {kit.name.slice(0, 1)}
    </span>
  );
}

export function Swatch({ color, label }: { color: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-5 rounded-md ring-1 ring-foreground/10" style={{ background: color }} />
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <span className="font-mono text-muted-foreground">{color}</span>
    </span>
  );
}

export function EntityChips({ entities, max = 12 }: { entities: EntityRef[]; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {entities.slice(0, max).map((e) => {
        const img = safeSrc(e.image);
        return (
          <span
            key={e.id}
            className="inline-flex items-center gap-2 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs"
            title={e.subtitle}
          >
            <span className="size-6 overflow-hidden rounded-full bg-muted">
              {img ? <img src={img} alt="" className="size-full object-cover" /> : null}
            </span>
            <span className="font-medium">{e.name}</span>
            <span className="text-muted-foreground">{entityKind(e.type)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function TagCloud({ tags, max = 18 }: { tags: TasteTag[]; max?: number }) {
  const top = tags.slice(0, max);
  const peak = Math.max(0.001, ...top.map((t) => t.affinity));
  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map((t) => (
        <span
          key={t.id}
          title={`${tagKind(t.type)} · affinity ${t.affinity.toFixed(2)}`}
          className="rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-900"
          style={{ opacity: 0.55 + 0.45 * (t.affinity / peak) }}
        >
          {t.name}
        </span>
      ))}
    </div>
  );
}

export function AgeSkew({ demographics }: { demographics: unknown }) {
  const age = (demographics as { age?: Record<string, number> } | undefined)?.age;
  if (!age) return null;
  const rows = Object.entries(age).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="space-y-1">
      {rows.map(([band, v]) => (
        <div key={band} className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs">
          <span className="text-muted-foreground">{band.replace(/_/g, " ")}</span>
          <span className="relative h-2 rounded bg-muted">
            <span
              className={cn("absolute top-0 h-2 rounded", v >= 0 ? "left-1/2 bg-orange-500" : "right-1/2 bg-muted-foreground/40")}
              style={{ width: `${Math.min(50, Math.abs(v) * 50)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export function TraceList({ spans }: { spans: Span[] }) {
  if (!spans.length) return <p className="text-xs text-muted-foreground">No steps recorded yet.</p>;
  return (
    <ol className="space-y-2">
      {spans.map((s, i) => (
        <li key={i} className="grid grid-cols-[72px_1fr_auto] items-start gap-2 text-xs">
          <SpanChip kind={(["qloo", "llm", "catalog", "slice"].includes(s.kind) ? s.kind : "slice") as SpanKind} />
          <span className="min-w-0">
            <span className="block font-medium">{s.name}</span>
            <span className="block truncate text-muted-foreground" title={s.result}>
              {s.result}
            </span>
          </span>
          <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
            {s.cache ? <Badge tone={s.cache === "hit" ? "ok" : "outline"}>{s.cache}</Badge> : null}
            {s.ms}ms
          </span>
        </li>
      ))}
    </ol>
  );
}
