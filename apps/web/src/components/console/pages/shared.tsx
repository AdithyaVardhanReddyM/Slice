"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Audience, Span } from "@/lib/pages/types";
import { Badge, spanMeta } from "@/components/console/primitives";
import { Progress } from "@/components/ui/progress";
import type { SpanKind } from "@/lib/mock/types";

/* Status --------------------------------------------------------------------- */

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "outline" | "neutral" }> = {
  extracting: { label: "Reading site", tone: "warn" },
  review: { label: "Needs review", tone: "warn" },
  ready: { label: "Ready", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  compiling: { label: "Compiling", tone: "warn" },
  uploading: { label: "Uploading", tone: "warn" },
  resolving: { label: "Resolving", tone: "warn" },
  clustering: { label: "Clustering", tone: "warn" },
  building: { label: "Building", tone: "warn" },
  draft: { label: "Draft", tone: "outline" },
  published: { label: "Published", tone: "ok" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS[status] ?? { label: status, tone: "outline" as const };
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

/** Small coloured dot for variant tabs and lists. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const color =
    status === "ready" || status === "published"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-amber-500";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", color, className)} aria-hidden />;
}

/* Progress ------------------------------------------------------------------- */

export function ProgressLine({
  progress,
  status,
  error,
  className,
}: {
  progress?: { value: number; label: string } | null;
  status: string;
  error?: string | null;
  className?: string;
}) {
  if (error) return <p className={cn("text-sm text-destructive", className)}>{error}</p>;
  if (!progress) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">{progress.label}</span>
        <span className="num shrink-0 text-xs text-muted-foreground">
          {status === "ready" ? "Done" : `${Math.round(progress.value * 100)}%`}
        </span>
      </div>
      <Progress value={Math.round((status === "ready" ? 1 : progress.value) * 100)} />
    </div>
  );
}

/* Trace ---------------------------------------------------------------------- */

const PARAM_LABELS: Record<string, string> = {
  "filter.type": "asking for",
  "signal.interests.entities": "signals",
  "signal.location.query": "weighted for",
  "filter.location.query": "in",
  "filter.tag.types": "tag types",
  "filter.results.entities": "restricted to",
  "signal.demographics.age": "age",
  "signal.demographics.gender": "gender",
  query: "query",
  types: "type",
  take: "take",
  url: "url",
  model: "model",
};

const tidy = (v: string) =>
  v.replace(/urn:entity:/g, "").replace(/urn:tag:/g, "").replace(/:qloo/g, "").replace(/,/g, ", ");

const kindColor = (kind: string) => spanMeta[kind as SpanKind]?.color ?? "var(--muted-foreground)";
const kindLabel = (kind: string) => spanMeta[kind as SpanKind]?.label ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** Vertical timeline of agent/backend spans, in the console's visual language. */
export function TraceList({ spans, className, compact }: { spans: Span[]; className?: string; compact?: boolean }) {
  if (spans.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No steps recorded yet.</p>;
  }
  const counts = spans.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const total = spans.reduce((s, x) => s + (x.ms || 0), 0);
  return (
    <div className={cn("text-sm", className)}>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: kindColor(k) }} />
              {n} {kindLabel(k)}
            </span>
          ))}
          <span className="num">{total >= 1000 ? `${(total / 1000).toFixed(1)}s` : `${total}ms`} total</span>
        </div>
      )}
      <ol className="relative ml-1 border-l pl-4">
        {spans.map((s, i) => (
          <SpanRow key={i} span={s} />
        ))}
      </ol>
    </div>
  );
}

function SpanRow({ span }: { span: Span }) {
  const [open, setOpen] = useState(false);
  const hasParams = !!span.params && Object.keys(span.params).length > 0;
  return (
    <li className="relative pb-3 last:pb-0">
      <span
        className="absolute top-[6px] -left-[21px] size-2.5 rounded-full border-2 border-background"
        style={{ background: kindColor(span.kind) }}
      />
      <button
        type="button"
        className={cn("w-full text-left", hasParams ? "cursor-pointer" : "cursor-default")}
        onClick={() => hasParams && setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="font-medium">{span.name}</span>
            <span className="mt-0.5 block text-muted-foreground">{span.result}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
            {span.cache === "hit" && <Badge tone="ok">Cached</Badge>}
            <span className="num">{span.ms < 1000 ? `${span.ms}ms` : `${(span.ms / 1000).toFixed(1)}s`}</span>
            {hasParams && <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />}
          </span>
        </div>
      </button>
      {open && hasParams && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/60 p-3 text-xs">
          {span.path && (
            <>
              <dt className="text-muted-foreground">endpoint</dt>
              <dd className="break-all">{span.path}</dd>
            </>
          )}
          {Object.entries(span.params!).map(([key, val]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{PARAM_LABELS[key] ?? key}</dt>
              <dd className="break-words">{tidy(String(val))}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/* Small atoms ------------------------------------------------------------------ */

/** Image that shows a muted block when the URL is missing or fails. */
export function Thumb({
  src,
  alt = "",
  className,
  rounded = "rounded-md",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  rounded?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-muted", rounded, className)}>
      {src && !broken && (
        // Merchant and Qloo images live on arbitrary hosts; next/image would need every one allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      )}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-medium", className)}>{children}</h3>;
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}

/** Inline list of avatars + names, for culture refs and similar brands. */
export function EntityStrip({
  items,
  max = 6,
  size = "size-7",
}: {
  items: { id?: string; name: string; image?: string; subtitle?: string }[];
  max?: number;
  size?: string;
}) {
  const shown = items.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((e, i) => (
        <li
          key={e.id ?? `${e.name}-${i}`}
          className="flex items-center gap-1.5 rounded-full bg-muted/70 py-0.5 pr-2.5 pl-0.5 text-xs"
          title={e.subtitle}
        >
          <Thumb src={e.image} className={size} rounded="rounded-full" />
          <span className="max-w-32 truncate">{e.name}</span>
        </li>
      ))}
      {items.length > max && <li className="self-center text-xs text-muted-foreground">+{items.length - max}</li>}
    </ul>
  );
}

export function audienceSizeLabel(a: Audience) {
  if (a.kind === "lead") return "1 person";
  if (a.kind === "csv") return `${fmt.int(a.size)} customers`;
  if (a.kind === "default") return "Everyone";
  return `≈ ${fmt.compact(a.size)} people, estimated`;
}

export function relativeTime(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
