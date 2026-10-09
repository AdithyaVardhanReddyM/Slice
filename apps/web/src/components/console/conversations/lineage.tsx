"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type {
  Recommendation,
  SpanKind,
  TasteProfile,
  TurnTrace,
} from "@/lib/mock/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { spanMeta } from "../primitives";
import type { ProductLite } from "./data";
import { Waterfall } from "./waterfall";

type Col = "signal" | "entity" | "tag" | "match" | "pick";

interface GNode {
  id: string;
  col: Col;
  label: string;
  sub?: string;
  value?: number;
  active: boolean;
  kind?: "ask" | "intent";
}

interface GEdge {
  from: string;
  to: string;
  weight: number;
  kind: SpanKind;
  active: boolean;
}

const COLUMNS: { col: Col; title: string; sub: string }[] = [
  { col: "signal", title: "Shopper input", sub: "Answers and the request" },
  { col: "entity", title: "Qloo entities", sub: "Matched by name" },
  { col: "tag", title: "Taste tags", sub: "From Qloo insights" },
  { col: "match", title: "Catalog match", sub: "Your style attributes" },
  { col: "pick", title: "Recommendation", sub: "Shown to the shopper" },
];

const TYPE_LABEL: Record<string, string> = {
  artist: "Artist",
  movie: "Film",
  tv_show: "TV show",
  book: "Book",
  person: "Person",
  place: "Destination",
  brand: "Brand",
  podcast: "Podcast",
};

function buildGraph(
  profile: TasteProfile,
  rec: Recommendation,
  product: ProductLite,
  trace: TurnTrace,
  ask: string,
) {
  const matched = new Set(rec.matched.styles);
  const activeStyles = profile.styles.filter((s) => matched.has(s.style));
  const activeTags = new Set(activeStyles.flatMap((s) => s.from));
  const activeEntities = new Set(
    profile.tags.filter((t) => activeTags.has(t.id)).flatMap((t) => t.from),
  );

  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  profile.answers.forEach((a, i) => {
    const ent = profile.entities.find((e) => e.name === a.choice);
    const id = `sig:${i}`;
    nodes.push({
      id,
      col: "signal",
      label: a.choice,
      sub: `${a.domain} question`,
      active: !!ent && activeEntities.has(ent.id),
    });
    if (ent) {
      edges.push({
        from: id,
        to: `ent:${ent.id}`,
        weight: 1,
        kind: "qloo",
        active: activeEntities.has(ent.id),
      });
    }
  });
  profile.entities
    .filter((e) => e.source === "chat")
    .forEach((e) => {
      const id = `sig:chat:${e.id}`;
      nodes.push({
        id,
        col: "signal",
        label: e.name,
        sub: "Mentioned in chat",
        active: activeEntities.has(e.id),
      });
      edges.push({
        from: id,
        to: `ent:${e.id}`,
        weight: 1,
        kind: "qloo",
        active: activeEntities.has(e.id),
      });
    });
  nodes.push({
    id: "ask",
    col: "signal",
    label: ask,
    sub: "Request",
    active: true,
    kind: "ask",
  });

  for (const e of profile.entities) {
    nodes.push({
      id: `ent:${e.id}`,
      col: "entity",
      label: e.name,
      sub: TYPE_LABEL[e.type],
      active: activeEntities.has(e.id),
    });
  }
  for (const t of profile.tags) {
    nodes.push({
      id: `tag:${t.id}`,
      col: "tag",
      label: t.name,
      value: t.weight,
      active: activeTags.has(t.id),
    });
    for (const from of t.from) {
      edges.push({
        from: `ent:${from}`,
        to: `tag:${t.id}`,
        weight: t.weight,
        kind: "qloo",
        active: activeTags.has(t.id) && activeEntities.has(from),
      });
    }
  }
  for (const s of profile.styles) {
    const active = matched.has(s.style);
    nodes.push({
      id: `sty:${s.style}`,
      col: "match",
      label: s.label,
      value: s.score,
      active,
    });
    for (const from of s.from) {
      edges.push({
        from: `tag:${from}`,
        to: `sty:${s.style}`,
        weight: s.score,
        kind: "slice",
        active: active && activeTags.has(from),
      });
    }
    edges.push({
      from: `sty:${s.style}`,
      to: "pick",
      weight: s.score,
      kind: "catalog",
      active,
    });
  }
  const intentBits = [
    trace.intent.category.join(" or "),
    trace.intent.budget ? `up to $${trace.intent.budget}` : null,
    trace.intent.room,
  ].filter(Boolean);
  nodes.push({
    id: "intent",
    col: "match",
    label: intentBits.join(", "),
    sub: "Understood request",
    active: true,
    kind: "intent",
  });
  edges.push({
    from: "ask",
    to: "intent",
    weight: 1,
    kind: "llm",
    active: true,
  });
  edges.push({
    from: "intent",
    to: "pick",
    weight: rec.breakdown.intent,
    kind: "llm",
    active: true,
  });

  nodes.push({ id: "pick", col: "pick", label: product.name, active: true });
  return { nodes, edges };
}

function neighbours(id: string, edges: GEdge[]): Set<string> {
  const seen = new Set([id]);
  const walk = (cur: string, dir: "up" | "down") => {
    for (const e of edges) {
      const next =
        dir === "up"
          ? e.to === cur
            ? e.from
            : null
          : e.from === cur
            ? e.to
            : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        walk(next, dir);
      }
    }
  };
  walk(id, "up");
  walk(id, "down");
  return seen;
}

export function LineageGraph({
  profile,
  rec,
  product,
  trace,
  ask,
}: {
  profile: TasteProfile;
  rec: Recommendation;
  product: ProductLite;
  trace: TurnTrace;
  ask: string;
}) {
  const { nodes, edges } = useMemo(
    () => buildGraph(profile, rec, product, trace, ask),
    [profile, rec, product, trace, ask],
  );
  const wrap = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<(GEdge & { d: string })[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const lit = useMemo(
    () => (hover ? neighbours(hover, edges) : null),
    [hover, edges],
  );

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const rect = (id: string) =>
        el
          .querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)
          ?.getBoundingClientRect();
      setSize({ w: box.width, h: box.height });
      setPaths(
        edges.flatMap((e) => {
          const a = rect(e.from);
          const b = rect(e.to);
          if (!a || !b) return [];
          const x1 = a.right - box.left;
          const y1 = a.top + a.height / 2 - box.top;
          const x2 = b.left - box.left;
          const y2 = b.top + b.height / 2 - box.top;
          const dx = Math.max(24, (x2 - x1) * 0.5);
          return [
            {
              ...e,
              d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
            },
          ];
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [edges]);

  const dim = (id: string) => (lit ? !lit.has(id) : false);
  const ordered = [...paths].sort(
    (a, b) => Number(a.active) - Number(b.active),
  );

  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/30">
      <div
        ref={wrap}
        className="relative grid min-w-[940px] grid-cols-[1.15fr_1fr_0.95fr_1.05fr_1.1fr] gap-x-10 p-5"
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          aria-hidden
        >
          {ordered.map((p, i) => {
            const on = lit ? lit.has(p.from) && lit.has(p.to) : p.active;
            return (
              <path
                key={i}
                d={p.d}
                fill="none"
                stroke={on ? spanMeta[p.kind].color : "var(--border)"}
                strokeWidth={on ? 1.25 + p.weight * 1.25 : 1}
                strokeOpacity={on ? 0.85 : 1}
                strokeLinecap="round"
                className="transition-[stroke,stroke-width] duration-200"
              />
            );
          })}
        </svg>

        {COLUMNS.map(({ col, title, sub }) => (
          <div key={col} className="relative flex flex-col">
            <div className="mb-4">
              <div className="text-sm font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </div>
            <div
              className={cn(
                "flex flex-1 flex-col gap-2",
                col === "pick" ? "justify-center" : "justify-start",
              )}
            >
              {nodes
                .filter((n) => n.col === col)
                .map((n) =>
                  n.col === "pick" ? (
                    <PickNode
                      key={n.id}
                      product={product}
                      rec={rec}
                      onHover={setHover}
                      dimmed={dim(n.id)}
                    />
                  ) : (
                    <Node
                      key={n.id}
                      node={n}
                      onHover={setHover}
                      dimmed={dim(n.id)}
                    />
                  ),
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({
  node,
  onHover,
  dimmed,
}: {
  node: GNode;
  onHover: (id: string | null) => void;
  dimmed: boolean;
}) {
  const special = node.kind === "ask" || node.kind === "intent";
  return (
    <div
      data-node={node.id}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "relative z-10 rounded-lg border bg-background px-3 py-2 shadow-xs transition-opacity duration-200",
        !node.active && "opacity-50 shadow-none",
        special && "mt-auto",
        dimmed && "opacity-30",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-sm font-medium",
            special ? "line-clamp-3" : "truncate",
            node.col === "tag" && "capitalize",
          )}
        >
          {node.label}
        </span>
        {node.value !== undefined && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {Math.round(node.value * 100)}%
          </span>
        )}
      </div>
      {node.sub && (
        <div className="truncate text-xs text-muted-foreground">{node.sub}</div>
      )}
    </div>
  );
}

function PickNode({
  product,
  rec,
  onHover,
  dimmed,
}: {
  product: ProductLite;
  rec: Recommendation;
  onHover: (id: string | null) => void;
  dimmed: boolean;
}) {
  return (
    <div
      data-node="pick"
      onMouseEnter={() => onHover("pick")}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "relative z-10 overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-foreground/10 transition-opacity",
        dimmed && "opacity-40",
      )}
    >
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          alt=""
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full bg-muted" />
      )}
      <div className="space-y-1 p-3">
        <div className="text-sm font-medium">{product.name}</div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            {fmt.money(product.price)}
          </span>
          <span className="font-medium tabular-nums">
            {Math.round(rec.score * 100)}% match
          </span>
        </div>
      </div>
    </div>
  );
}

/* Dialog ------------------------------------------------------------------ */

const WEIGHTS = {
  taste: { label: "Taste fit", weight: 0.5 },
  intent: { label: "Request fit", weight: 0.38 },
  constraints: { label: "Budget and stock", weight: 0.12 },
} as const;

export function WhyDialog({
  open,
  onOpenChange,
  rec,
  product,
  trace,
  profile,
  ask,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rec: Recommendation | null;
  product: ProductLite | null;
  trace: TurnTrace | null;
  profile: TasteProfile;
  ask: string;
  products: Record<string, ProductLite>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        {rec && product && trace && (
          <>
            <DialogHeader className="border-b p-6 pb-4">
              <DialogTitle className="text-lg">
                Why we recommended {product.name}
              </DialogTitle>
              <DialogDescription>
                Pick {rec.rank} of{" "}
                {trace.retrieval.candidates.filter((c) => c.kept).length} ·{" "}
                {product.subcategory} · {fmt.money(product.price)}
              </DialogDescription>
            </DialogHeader>

            <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">
                    Overall match
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">
                    {Math.round(rec.score * 100)}%
                  </div>
                </div>
                {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => (
                  <div key={k} className="rounded-xl border p-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">
                        {WEIGHTS[k].label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(WEIGHTS[k].weight * 100)}% of score
                      </span>
                    </div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">
                      {Math.round(rec.breakdown[k] * 100)}%
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${rec.breakdown[k] * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">
                    How the recommendation was made
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Highlighted items led to this product. Faded items are part
                    of the shopper&apos;s profile but didn&apos;t influence it.
                    Hover any item to follow its path.
                  </p>
                </div>
                <LineageGraph
                  profile={profile}
                  rec={rec}
                  product={product}
                  trace={trace}
                  ask={ask}
                />
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Reasoning</h3>
                    <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed">
                      {rec.rationale}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Shown to the shopper: “{rec.reason}”
                    </p>
                  </div>
                  <div className="space-y-3 rounded-lg border p-4">
                    <h4 className="text-sm font-medium">
                      Attributes that matched
                    </h4>
                    <AttrRow
                      label="Style"
                      all={product.styles}
                      hits={product.styles.filter((_, i) =>
                        rec.matched.styles.includes(product.styleIds[i]),
                      )}
                    />
                    <AttrRow
                      label="Material"
                      all={product.materials}
                      hits={rec.matched.materials}
                    />
                    <AttrRow
                      label="Color"
                      all={product.colors}
                      hits={rec.matched.colors}
                    />
                  </div>
                </section>
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-medium">
                      Steps behind this reply
                    </h3>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {trace.spans.length} steps · {fmt.ms(trace.totalMs)}
                    </span>
                  </div>
                  <div className="rounded-lg border p-4">
                    <Waterfall
                      spans={trace.spans}
                      totalMs={trace.totalMs}
                      compact
                    />
                  </div>
                </section>
              </div>

              <Candidates
                trace={trace}
                products={products}
                currentId={product.id}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttrRow({
  label,
  all,
  hits,
}: {
  label: string;
  all: string[];
  hits: string[];
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-start gap-3 text-sm">
      <span className="pt-0.5 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((v) => {
          const hit = hits.includes(v);
          return (
            <Badge
              key={v}
              variant={hit ? "secondary" : "outline"}
              className={cn(
                "capitalize",
                hit ? "bg-orange-50 text-orange-700" : "text-muted-foreground",
              )}
            >
              {hit && <Check />}
              {v}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

function Candidates({
  trace,
  products,
  currentId,
}: {
  trace: TurnTrace;
  products: Record<string, ProductLite>;
  currentId: string;
}) {
  const sorted = [...trace.retrieval.candidates].sort(
    (a, b) => b.score - a.score,
  );
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Products considered</h3>
        <p className="text-sm text-muted-foreground">
          {trace.retrieval.catalogSize} in catalog, {trace.retrieval.filtered}{" "}
          after filters, {sorted.length} sent to the ranker.
        </p>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const p = products[c.productId];
              return (
                <TableRow
                  key={c.productId}
                  className={cn(c.productId === currentId && "bg-muted/60")}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt=""
                          className="size-8 rounded-md object-cover"
                        />
                      ) : (
                        <span className="size-8 rounded-md bg-muted" />
                      )}
                      <span className="font-medium">
                        {p?.name ?? c.productId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.kept ? (
                      <Badge>Shown</Badge>
                    ) : (
                      <span className="text-muted-foreground first-letter:uppercase">
                        {c.note}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(c.score * 100)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
