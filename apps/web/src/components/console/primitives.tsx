import type { ComponentProps, ReactNode } from "react";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "@/lib/utils";
import { productImage } from "@/lib/mock/images";
import type { Outcome, SpanKind } from "@/lib/mock/types";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export { Skeleton };

/* Layout ------------------------------------------------------------------ */

/** Card surface without built-in padding, for panels that manage their own rows. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 border-b px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate text-sm font-medium">{title}</h2>
        {hint && (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  /** Kept for call-site compatibility; not rendered. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* Data atoms -------------------------------------------------------------- */

const badgeTones = {
  neutral: "",
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  ink: "bg-foreground text-background",
  marker: "bg-orange-50 text-orange-700",
  outline: "",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <UiBadge
      variant={tone === "outline" ? "outline" : "secondary"}
      className={cn(badgeTones[tone], className)}
      {...props}
    >
      {children}
    </UiBadge>
  );
}

/** Static status dot. */
export function Dot({ className }: { className?: string; live?: boolean }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full bg-current",
        className,
      )}
    />
  );
}

const outcomeMeta: Record<
  Outcome,
  { label: string; tone: keyof typeof badgeTones }
> = {
  purchased: { label: "Purchased", tone: "ok" },
  added_to_cart: { label: "Added to cart", tone: "ok" },
  clicked: { label: "Opened a pick", tone: "neutral" },
  browsing: { label: "Browsing", tone: "outline" },
  no_match: { label: "No match", tone: "warn" },
  abandoned: { label: "Abandoned", tone: "outline" },
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const m = outcomeMeta[outcome];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export const spanMeta: Record<
  SpanKind,
  { label: string; color: string; bg: string }
> = {
  qloo: { label: "Qloo", color: "var(--color-span-qloo)", bg: "#fff4ed" },
  llm: { label: "LLM", color: "var(--color-span-llm)", bg: "#eef1fb" },
  catalog: {
    label: "Catalog",
    color: "var(--color-span-catalog)",
    bg: "#ecf7f3",
  },
  slice: { label: "Slice", color: "var(--color-span-slice)", bg: "#fbf5e6" },
};

export function SpanChip({
  kind,
  className,
}: {
  kind: SpanKind;
  className?: string;
}) {
  const m = spanMeta[kind];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-foreground/80",
        className,
      )}
      style={{ background: m.bg }}
    >
      <span className="size-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function CacheBadge({ cache }: { cache: "hit" | "miss" | "stale" }) {
  return (
    <Badge
      tone={cache === "hit" ? "ok" : cache === "stale" ? "warn" : "outline"}
    >
      {cache === "hit" ? "Cached" : cache === "miss" ? "Live" : "Stale"}
    </Badge>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground select-none">
      {children}
    </kbd>
  );
}

/** Horizontal meter. Value 0–1. */
export function Meter({
  value,
  className,
  tone = "ink",
}: {
  value: number;
  className?: string;
  tone?: "ink" | "orange" | "ok" | "warn";
}) {
  const fill = {
    ink: "bg-foreground/80",
    orange: "bg-primary",
    ok: "bg-emerald-600",
    warn: "bg-amber-500",
  }[tone];
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", fill)}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function ProductThumb({
  product,
  size = 40,
  className,
}: {
  product: Product;
  size?: number;
  className?: string;
}) {
  const src = productImage(product);
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-md bg-muted",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src && (
        // Merchant-hosted images; next/image would need every merchant CDN allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      )}
    </span>
  );
}

export function Stat({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-semibold tracking-tight">
          {value}
        </span>
        {delta !== undefined && (
          <span
            className={cn(
              "num text-xs font-medium",
              delta >= 0 ? "text-emerald-600" : "text-red-600",
            )}
          >
            {delta >= 0 ? "+" : "−"}
            {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/** Label/value rows for inspectors. */
export function KeyValue({
  rows,
  className,
}: {
  rows: [ReactNode, ReactNode][];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-2.5 text-sm",
        className,
      )}
    >
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* Loading ------------------------------------------------------------------ */

/** Generic page fallback while route params resolve. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-[1.8fr_1fr] gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
