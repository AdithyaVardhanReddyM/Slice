"use client";

import { useQuery } from "convex/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  AtSign,
  ChartNoAxesColumn,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Lock,
  Mail,
  Megaphone,
  Monitor,
  MousePointerClick,
  QrCode,
  Search,
  Send,
  Smartphone,
  Tablet,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/pages/csv";
import { docOf, type EventRow, type FormRow, type Page, type Variant } from "@/lib/pages/types";
import { brandDomain, previewUrl } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "../brand-context";
import { relativeTime } from "../shared";
import { gridColor, heatLegend } from "./colors";
import { type HeatMode, useHeatLayer } from "./heat-layer";

/* Shapes from pagesEvents.stats / heatmap ----------------------------------------- */

interface Totals {
  views: number;
  sessions: number;
  visitors: number;
  ctaClicks: number;
  formSubmits: number;
  engagedMs: number;
}

interface DayRow extends Totals {
  day: string;
  clicks: number;
}

interface Stats {
  daily: DayRow[];
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  /** [24][7]: views per UTC hour and weekday (0 = Sunday). */
  hourly: number[][];
}

interface Heatmap {
  points: { sectionId: string; x: number; y: number; label?: string }[];
  sections: Record<string, { seen: number; clicks: number }>;
}

export type Range = 7 | 14 | 30;

const DAY = 864e5;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const EMPTY: Totals = { views: 0, sessions: 0, visitors: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 };

function sum(rows: Totals[]): Totals {
  const t = { ...EMPTY };
  for (const r of rows) {
    t.views += r.views;
    t.sessions += r.sessions;
    t.visitors += r.visitors;
    t.ctaClicks += r.ctaClicks;
    t.formSubmits += r.formSubmits;
    t.engagedMs += r.engagedMs;
  }
  return t;
}

/** The range's UTC days ending today, and the same number of days before them. */
export function useWindow(range: Range) {
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    const days = Array.from({ length: range }, (_, i) => dayKey(now - (range - 1 - i) * DAY));
    const prevDays = Array.from({ length: range }, (_, i) => dayKey(now - (2 * range - 1 - i) * DAY));
    return { days, prevDays, from: days[0], to: days[range - 1], prevFrom: prevDays[0], prevTo: prevDays[range - 1] };
  }, [now, range]);
}

/* Metrics -------------------------------------------------------------------------- */

type MetricKey = "visitors" | "views" | "ctaRate" | "leads" | "engaged";

const METRICS: { key: MetricKey; label: string; value: (t: Totals) => number; format: (n: number) => string; axis: (n: number) => string }[] = [
  { key: "visitors", label: "Visitors", value: (t) => t.visitors, format: fmt.int, axis: fmt.compact },
  { key: "views", label: "Page views", value: (t) => t.views, format: fmt.int, axis: fmt.compact },
  {
    key: "ctaRate",
    label: "CTA rate",
    value: (t) => (t.views ? t.ctaClicks / t.views : 0),
    format: (n) => fmt.pct(n),
    axis: (n) => fmt.pct(n, 0),
  },
  { key: "leads", label: "Leads", value: (t) => t.formSubmits, format: fmt.int, axis: fmt.compact },
  {
    key: "engaged",
    label: "Time on page",
    value: (t) => (t.sessions ? t.engagedMs / t.sessions : 0),
    format: (n) => fmt.duration(Math.round(n / 1000)),
    axis: (n) => fmt.duration(Math.round(n / 1000)),
  },
];

function Change({ now, before, range }: { now: number; before: number; range: Range }) {
  if (!before) return <span className="text-xs text-muted-foreground">No earlier data</span>;
  const change = now / before - 1;
  const flat = Math.abs(change) < 0.005;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", flat ? "" : change > 0 ? "text-emerald-700" : "text-red-700")}>
        {!flat && <Icon className="size-3.5" />}
        {flat ? "No change" : `${Math.abs(change * 100).toFixed(change > -0.1 && change < 0.1 ? 1 : 0)}%`}
      </span>
      <span className="truncate">vs prior {range} days</span>
    </span>
  );
}

/** KPI tiles that act as tabs for one daily chart, with the prior period dashed. Also used by the brand overview. */
export function MetricOverview({
  stats,
  prev,
  range,
  window: w,
  emptyAction,
}: {
  stats: { daily: DayRow[] } | undefined;
  prev: { daily: DayRow[] } | undefined;
  range: Range;
  window: ReturnType<typeof useWindow>;
  /** Shown under the note when neither period has a single view. */
  emptyAction?: ReactNode;
}) {
  const [metricKey, setMetricKey] = useState<MetricKey>("visitors");
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const totals = useMemo(() => sum(stats?.daily ?? []), [stats]);
  const prevTotals = useMemo(() => sum(prev?.daily ?? []), [prev]);

  const data = useMemo(() => {
    const byDay = new Map((stats?.daily ?? []).map((d) => [d.day, d]));
    const prevByDay = new Map((prev?.daily ?? []).map((d) => [d.day, d]));
    return w.days.map((day, i) => ({
      day,
      prevDay: w.prevDays[i],
      current: metric.value(byDay.get(day) ?? EMPTY),
      previous: metric.value(prevByDay.get(w.prevDays[i]) ?? EMPTY),
    }));
  }, [stats, prev, w, metric]);

  // No views in either period: say so over a dimmed chart instead of drawing a flat line at 0 as if it were data.
  const empty = !!stats && !!prev && totals.views === 0 && prevTotals.views === 0;

  const config = {
    current: { label: "This period", color: "var(--chart-1)" },
    previous: { label: `Prior ${range} days`, color: "var(--muted-foreground)" },
  } satisfies ChartConfig;

  return (
    <Panel>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 border-b sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m, i) => {
          const active = m.key === metricKey;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMetricKey(m.key)}
              className={cn(
                "relative flex min-w-0 flex-col gap-2 px-6 py-5 text-left transition-colors hover:bg-neutral-50",
                i > 0 && "lg:border-l lg:border-black/[0.05]",
                active && "bg-linear-to-b from-orange-50 to-orange-50/0 hover:bg-transparent",
              )}
            >
              <span className={cn("text-[13px]", active ? "font-medium text-neutral-950" : "text-muted-foreground")}>{m.label}</span>
              {stats ? (
                <span className={cn("num text-[30px] leading-none font-medium tracking-[-0.03em]", active ? "text-neutral-950" : "text-neutral-950/70")}>
                  {m.format(m.value(totals))}
                </span>
              ) : (
                <Skeleton className="h-8 w-20" />
              )}
              {stats && prev ? <Change now={m.value(totals)} before={m.value(prevTotals)} range={range} /> : <Skeleton className="h-4 w-28" />}
              {active && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-t-full bg-orange-600" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 className="text-sm font-medium">{metric.label} per day</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" /> Last {range} days
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-muted-foreground/60" /> Prior {range} days
          </span>
        </div>
      </div>
      <div className="relative px-2 pt-2 pb-3">
        {empty && (
          // Centred on the plot (above the date labels), on a soft white wash so the faded grid doesn't run through the text.
          <div className="absolute inset-x-0 top-0 bottom-9 z-10 flex items-center justify-center bg-[radial-gradient(42%_60%_at_50%_50%,var(--card)_45%,transparent_100%)]">
            <div className="flex max-w-sm flex-col items-center px-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
                <ChartNoAxesColumn className="size-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-neutral-950">No visits in the last {range} days</p>
              <p className="mt-1 text-sm text-muted-foreground">Visits show up here once a page is shared with the people it was written for.</p>
              {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
            </div>
          </div>
        )}
        {stats ? (
          <ChartContainer config={config} className={cn("aspect-auto h-[240px] w-full", empty && "opacity-30")}>
            <AreaChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
              <defs>
                <linearGradient id="analytics-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-current)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-current)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} tickFormatter={(v: string) => fmt.date(v)} />
              <YAxis tickLine={false} axisLine={false} width={44} tickMargin={6} allowDecimals={metricKey === "ctaRate"} tickFormatter={metric.axis} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <div className="grid min-w-44 gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-[2px] bg-[var(--chart-1)]" />
                          {fmt.dateLong(row.day)}
                        </span>
                        <span className="font-medium tabular-nums">{metric.format(row.current)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-2 rounded-[2px] bg-muted-foreground/50" />
                          {fmt.dateLong(row.prevDay)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{metric.format(row.previous)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Line dataKey="previous" type="monotone" stroke="var(--color-previous)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              <Area
                dataKey="current"
                type="monotone"
                stroke="var(--color-current)"
                strokeWidth={2}
                fill="url(#analytics-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <Skeleton className="mx-3 h-[240px]" />
        )}
      </div>
    </Panel>
  );
}

/* Click map ------------------------------------------------------------------------ */

/** The page at desktop width, scaled to fit its box; scrolls like the real page. */
function ScaledFrame({ src, frameRef, onLoad }: { src: string; frameRef: React.RefObject<HTMLIFrameElement | null>; onLoad: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 0, height: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Measure now too: ResizeObserver only reports on a rendered frame, which a background tab never gets.
    const r = el.getBoundingClientRect();
    if (r.width) setSize({ scale: r.width / 1280, height: r.height });
    const ro = new ResizeObserver(([e]) => setSize({ scale: e.contentRect.width / 1280, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {size.scale > 0 && (
        <iframe
          ref={frameRef}
          src={src}
          title="Page preview"
          onLoad={onLoad}
          className="origin-top-left border-0"
          style={{ width: 1280, height: size.height / size.scale, transform: `scale(${size.scale})` }}
        />
      )}
    </div>
  );
}

const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function ClickMap({ page, variant, sessions, from, to, range }: { page: Page; variant: Variant; sessions: number | undefined; from: string; to: string; range: Range }) {
  const brand = useBrand();
  const heatmap = useQuery(api.pagesEvents.heatmap, { variantId: variant._id, from, to }) as Heatmap | undefined;
  const [mode, setMode] = useState<HeatMode>("clicks");
  const [list, setList] = useState<"sections" | "elements">("sections");
  const [hover, setHover] = useState<string | null>(null);
  const [inView, setInView] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const detach = useRef<(() => void) | null>(null);

  // Sections in page order, named the way the builder named them.
  const sections = useMemo(() => {
    const doc = docOf(variant) as { sections?: { id: string; label?: string; type?: string }[] } | null;
    const secs = heatmap?.sections ?? {};
    const totalClicks = Object.values(secs).reduce((s, x) => s + x.clicks, 0);
    return (doc?.sections ?? []).map((s, i) => {
      const row = secs[s.id] ?? { seen: 0, clicks: 0 };
      return {
        id: s.id,
        n: i + 1,
        label: s.label || titleCase(s.type ?? s.id),
        reach: sessions ? Math.min(1, row.seen / sessions) : 0,
        clicks: row.clicks,
        share: totalClicks ? row.clicks / totalClicks : 0,
      };
    });
  }, [variant, heatmap, sessions]);

  const elements = useMemo(() => {
    const names = new Map(sections.map((s) => [s.id, s.label]));
    const counts = new Map<string, { label: string; section: string; clicks: number }>();
    for (const p of heatmap?.points ?? []) {
      if (!p.label) continue;
      const key = `${p.sectionId}|${p.label}`;
      const cur = counts.get(key) ?? { label: p.label, section: names.get(p.sectionId) ?? titleCase(p.sectionId), clicks: 0 };
      cur.clicks += 1;
      counts.set(key, cur);
    }
    return [...counts.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 12);
  }, [heatmap, sections]);

  const points = useMemo(() => heatmap?.points ?? [], [heatmap]);
  const reach = useMemo(() => sections.map((s) => ({ id: s.id, reach: s.reach })), [sections]);
  const onSelect = useCallback((id: string) => {
    setList("sections");
    setInView(id);
  }, []);
  const layer = useHeatLayer({ frame, mode, points, reach, focus: hover, onSelect, onInView: setInView });
  useEffect(() => () => detach.current?.(), []);

  const maxElement = Math.max(1, ...elements.map((e) => e.clicks));
  const clicks = heatmap?.points.length ?? 0;

  return (
    <Panel>
      <PanelHeader
        title="Where people click"
        hint={heatmap ? `${fmt.int(clicks)} clicks in the last ${range} days, shown on the page as built` : "Loading clicks…"}
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "clicks", label: "Clicks" },
              { value: "reach", label: "Scroll reach" },
            ]}
          />
        }
      />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3 p-4">
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="flex h-9 items-center gap-2 border-b bg-muted/40 px-3">
              <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3 shrink-0" />
                <span className="truncate">
                  {brandDomain(brand.slug)}/{page.slug}
                </span>
              </span>
            </div>
            <div className="relative h-[600px]">
              <ScaledFrame
                src={previewUrl(brand.slug, page.slug, variant._id)}
                frameRef={frame}
                onLoad={() => {
                  detach.current?.();
                  detach.current = layer.attach();
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {mode === "clicks" ? (
              <span className="flex items-center gap-2">
                Fewer
                <span className="h-2 w-28 rounded-full" style={{ background: heatLegend }} />
                More clicks
              </span>
            ) : (
              <span>Darker sections were seen by fewer visitors.</span>
            )}
            <span>Scroll the page, or pick a section on the right.</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-col border-t xl:border-t-0 xl:border-l">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <Segmented
              value={list}
              onChange={setList}
              options={[
                { value: "sections", label: "Sections" },
                { value: "elements", label: "Top elements" },
              ]}
            />
          </div>
          <div className="scrollbar-thin max-h-[656px] flex-1 overflow-y-auto">
            {!heatmap ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : list === "sections" ? (
              <ol className="divide-y">
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setInView(s.id);
                        layer.scrollTo(s.id);
                      }}
                      onMouseEnter={() => setHover(s.id)}
                      onMouseLeave={() => setHover(null)}
                      className={cn("grid w-full grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50", inView === s.id && "bg-muted/60")}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">{s.n}</span>
                      <span className="truncate text-sm font-medium">{s.label}</span>
                      <span className="text-sm font-medium tabular-nums">{fmt.pct(s.reach, 0)}</span>
                      <span />
                      <span className="col-span-2 flex flex-col gap-1.5">
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${s.reach * 100}%` }} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Reached by {fmt.pct(s.reach, 0)}, {fmt.int(s.clicks)} clicks{s.share >= 0.005 ? ` (${fmt.pct(s.share, 0)})` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : elements.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No clicks on named elements yet.</p>
            ) : (
              <ol className="divide-y">
                {elements.map((e, i) => (
                  <li key={`${e.section}-${e.label}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="truncate text-sm font-medium">{e.label.replace(/^\w+:/, "")}</span>
                    <span className="text-sm font-medium tabular-nums">{fmt.int(e.clicks)}</span>
                    <span />
                    <span className="col-span-2 flex flex-col gap-1">
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(e.clicks / maxElement) * 100}%` }} />
                      </span>
                      <span className="text-xs text-muted-foreground">in {e.section}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* Breakdowns ----------------------------------------------------------------------- */

interface Entry {
  key: string;
  label: string;
  icon?: ReactNode;
}

const SOURCE: Record<string, { label: string; icon: LucideIcon }> = {
  direct: { label: "Direct", icon: Link2 },
  search: { label: "Search", icon: Search },
  social: { label: "Social", icon: AtSign },
  ads: { label: "Paid ads", icon: Megaphone },
  email: { label: "Email", icon: Mail },
  referral: { label: "Referral", icon: Globe },
  qr: { label: "QR code", icon: QrCode },
};

const DEVICE: Record<string, { label: string; icon: LucideIcon }> = {
  mobile: { label: "Mobile", icon: Smartphone },
  desktop: { label: "Desktop", icon: Monitor },
  tablet: { label: "Tablet", icon: Tablet },
};

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function countryEntry(code: string): Entry {
  const upper = code.toUpperCase();
  let label = upper === "UNKNOWN" ? "Unknown" : upper;
  try {
    label = regionNames?.of(upper) ?? label;
  } catch {
    /* not a region code */
  }
  return { key: code, label, icon: <span className="text-base leading-none">{flag(upper)}</span> };
}

const iconEntry = (map: Record<string, { label: string; icon: LucideIcon }>) => (key: string): Entry => {
  const m = map[key];
  const Icon = m?.icon ?? Globe;
  return { key, label: m?.label ?? (key === "unknown" ? "Unknown" : titleCase(key)), icon: <Icon className="size-4 text-muted-foreground" /> };
};

function BreakdownList({ data, entry }: { data: Record<string, number> | undefined; entry: (key: string) => Entry }) {
  const rows = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  if (!total) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No visits in this range.</p>;
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((s, [, n]) => s + n, 0);
  const shown: [Entry, number][] = top.map(([k, n]) => [entry(k), n]);
  if (rest) shown.push([{ key: "_other", label: "Other", icon: <span className="size-4" /> }, rest]);
  const max = Math.max(...shown.map(([, n]) => n));
  return (
    <ul className="space-y-1 p-3">
      {shown.map(([e, n]) => (
        <li key={e.key} className="relative flex h-9 items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-sm">
          <span className="absolute inset-y-0 left-0 rounded-md bg-primary/10" style={{ width: `${(n / max) * 100}%` }} />
          <span className="relative flex size-4 shrink-0 items-center justify-center">{e.icon}</span>
          <span className="relative min-w-0 flex-1 truncate">{e.label}</span>
          <span className="relative tabular-nums">{fmt.int(n)}</span>
          <span className="relative w-10 text-right text-xs tabular-nums text-muted-foreground">{fmt.pct(n / total, 0)}</span>
        </li>
      ))}
    </ul>
  );
}

function BreakdownPanel<T extends string>({
  title,
  tabs,
  stats,
}: {
  title: string;
  tabs: { value: T; label: string; data: (s: Stats) => Record<string, number>; entry: (key: string) => Entry }[];
  stats: Stats | undefined;
}) {
  const [tab, setTab] = useState<T>(tabs[0].value);
  const current = tabs.find((t) => t.value === tab) ?? tabs[0];
  return (
    <Panel className="flex flex-col">
      <PanelHeader title={title} hint="Share of page views" actions={tabs.length > 1 ? <Segmented value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.value, label: t.label }))} /> : undefined} />
      {stats ? (
        <BreakdownList data={current.data(stats)} entry={current.entry} />
      ) : (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      )}
    </Panel>
  );
}

/* When people visit ------------------------------------------------------------------ */

// Rows Monday first; values index JS getUTCDay (0 = Sunday).
const WEEK: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

function WeekGrid({ hourly }: { hourly: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const value = (d: number, h: number) => hourly[h]?.[d] ?? 0;
  const all = WEEK.flatMap(([d]) => Array.from({ length: 24 }, (_, h) => ({ d, h, v: value(d, h) })));
  const max = Math.max(1, ...all.map((c) => c.v));
  const total = all.reduce((s, c) => s + c.v, 0);
  const peak = all.reduce((a, b) => (b.v > a.v ? b : a), all[0]);
  const dayName = (d: number) => WEEK.find(([x]) => x === d)?.[1] ?? "";
  const caption = hover
    ? `${dayName(hover.d)} ${hourLabel(hover.h)}–${hourLabel((hover.h + 1) % 24)} UTC, ${fmt.int(value(hover.d, hover.h))} views`
    : total
      ? `Busiest: ${dayName(peak.d)}s around ${hourLabel(peak.h)} UTC`
      : "No visits in this range.";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-1" onMouseLeave={() => setHover(null)}>
        {WEEK.map(([d, label]) => (
          <div key={d} className="contents">
            <span className="flex items-center text-xs text-muted-foreground">{label}</span>
            <div className="grid grid-cols-24 gap-[3px]">
              {Array.from({ length: 24 }, (_, h) => {
                const v = value(d, h);
                return (
                  <span
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    className={cn("h-7 rounded-[3px] bg-muted transition-shadow", hover?.d === d && hover.h === h && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-background")}
                    style={v ? { background: gridColor(v / max) } : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <span />
        <div className="grid grid-cols-24 gap-[3px] pt-1 text-[11px] text-muted-foreground">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className={cn("col-span-1 whitespace-nowrap", h % 6 !== 0 && "invisible")}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className={cn(hover && "text-foreground")}>{caption}</span>
        <span className="flex items-center gap-1.5">
          Fewer
          {[0.1, 0.3, 0.5, 0.7, 0.95].map((t) => (
            <span key={t} className="size-3 rounded-[3px]" style={{ background: gridColor(t) }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/* Live activity --------------------------------------------------------------------- */

const ACTIVITY: Record<string, { verb: string; icon: LucideIcon; tone?: string }> = {
  pageview: { verb: "Opened the page", icon: Eye },
  click: { verb: "Clicked", icon: MousePointerClick },
  cta_click: { verb: "Clicked the CTA", icon: Target, tone: "bg-primary/10 text-primary" },
  form_submit: { verb: "Sent the form", icon: Send, tone: "bg-emerald-50 text-emerald-700" },
  outbound: { verb: "Left via a link", icon: ExternalLink },
};

function LiveActivity({ page, sectionName }: { page: Page; sectionName: (id: string) => string }) {
  const recent = useQuery(api.pagesEvents.recent, { pageId: page._id, take: 150 }) as EventRow[] | undefined;
  // A CTA press also sends a plain click; show it once.
  const rows = useMemo(() => {
    const out: EventRow[] = [];
    for (const e of recent ?? []) {
      if (!ACTIVITY[e.type]) continue;
      if (e.type === "click" && out.some((o) => o.type === "cta_click" && o.sessionId === e.sessionId && Math.abs(o.at - e.at) < 5)) continue;
      out.push(e);
    }
    return out.slice(0, 30);
  }, [recent]);
  return (
    <Panel className="flex flex-col">
      <PanelHeader title="Recent activity" hint="Latest visits and actions, live" />
      <div className="scrollbar-thin h-[19.5rem] overflow-y-auto">
        {recent === undefined ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nothing yet. Visits appear here within seconds.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((e) => {
              const a = ACTIVITY[e.type];
              const place = e.city ?? (e.country ? countryEntry(e.country).label : null);
              const DeviceIcon = DEVICE[e.device]?.icon ?? Monitor;
              return (
                <li key={e._id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground", a.tone)}>
                    <a.icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {a.verb}
                      {e.label && e.type !== "pageview" && e.type !== "form_submit" && <span className="font-medium"> “{e.label.replace(/^\w+:/, "").slice(0, 40)}”</span>}
                      {e.sectionId && e.type !== "pageview" && <span className="text-muted-foreground"> in {sectionName(e.sectionId)}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <DeviceIcon className="size-3 shrink-0" />
                      {[place, SOURCE[e.source]?.label ?? e.source].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{relativeTime(e.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* Leads ------------------------------------------------------------------------------- */

// Who the lead is comes first.
const FIELD_ORDER = ["name", "first_name", "full_name", "email", "phone", "company", "city"];
const fieldRank = (k: string) => {
  const i = FIELD_ORDER.indexOf(k.toLowerCase());
  return i < 0 ? FIELD_ORDER.length : i;
};

function Leads({ page, sectionName, hasSection }: { page: Page; sectionName: (id: string) => string; hasSection: (id: string) => boolean }) {
  const forms = useQuery(api.pagesEvents.forms, { pageId: page._id, take: 200 }) as FormRow[] | undefined;
  // Fields anyone filled in, best first; the section column only when it names one of the page's sections.
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const f of forms ?? []) for (const [k, v] of Object.entries(f.fields)) if (v?.trim()) set.add(k);
    return [...set].sort((a, b) => fieldRank(a) - fieldRank(b)).slice(0, 5);
  }, [forms]);
  const showSection = (forms ?? []).some((f) => hasSection(f.sectionId));
  const exportCsv = () => {
    if (!forms) return;
    const cols = ["submitted_at", "section", ...columns];
    const rows = forms.map((f) => ({ submitted_at: new Date(f.at).toISOString(), section: sectionName(f.sectionId), ...f.fields }));
    downloadText(`${page.slug}-leads.csv`, toCsv(cols, rows));
  };
  return (
    <Panel>
      <PanelHeader
        title="Leads"
        hint={forms ? (forms.length ? `${fmt.int(forms.length)} form submissions, newest first` : "Form submissions from this page") : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!forms?.length}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        }
      />
      {forms === undefined ? (
        <Skeleton className="m-4 h-24" />
      ) : forms.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No one has sent the form yet.</p>
      ) : (
        <div className="scrollbar-thin max-h-[26rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="pl-4">
                    {titleCase(c)}
                  </TableHead>
                ))}
                {showSection && <TableHead>Section</TableHead>}
                <TableHead className="pr-4 text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.slice(0, 100).map((f) => (
                <TableRow key={f._id}>
                  {columns.map((c, i) => (
                    <TableCell key={c} className={cn("max-w-56 truncate pl-4", i === 0 && "font-medium")}>
                      {f.fields[c] || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                  {showSection && <TableCell className="text-muted-foreground">{sectionName(f.sectionId)}</TableCell>}
                  <TableCell className="pr-4 text-right whitespace-nowrap text-muted-foreground">{relativeTime(f.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

/* Screen ------------------------------------------------------------------------------- */

export function PageAnalytics({ page, variant, range }: { page: Page; variant: Variant | null; range: Range }) {
  const w = useWindow(range);
  const stats = useQuery(api.pagesEvents.stats, { pageId: page._id, from: w.from, to: w.to }) as Stats | undefined;
  const prev = useQuery(api.pagesEvents.stats, { pageId: page._id, from: w.prevFrom, to: w.prevTo }) as Stats | undefined;
  const sessions = stats ? sum(stats.daily).sessions : undefined;

  const { sectionName, hasSection } = useMemo(() => {
    const doc = docOf(variant) as { sections?: { id: string; label?: string; type?: string }[] } | null;
    const names = new Map((doc?.sections ?? []).map((s) => [s.id, s.label || titleCase(s.type ?? s.id)]));
    return { sectionName: (id: string) => names.get(id) ?? titleCase(id), hasSection: (id: string) => names.has(id) };
  }, [variant]);

  return (
    <div className="space-y-6">
      <MetricOverview stats={stats} prev={prev} range={range} window={w} />

      {variant?.doc ? (
        <ClickMap key={variant._id} page={page} variant={variant} sessions={sessions} from={w.from} to={w.to} range={range} />
      ) : (
        <Panel>
          <PanelHeader title="Where people click" />
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">The click map appears once the page is built.</p>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownPanel
          title="Sources"
          stats={stats}
          tabs={[{ value: "source", label: "Channel", data: (s) => s.bySource, entry: iconEntry(SOURCE) }]}
        />
        <BreakdownPanel title="Locations" stats={stats} tabs={[{ value: "country", label: "Country", data: (s) => s.byCountry, entry: countryEntry }]} />
        <BreakdownPanel
          title="Devices"
          stats={stats}
          tabs={[
            { value: "device", label: "Device", data: (s) => s.byDevice, entry: iconEntry(DEVICE) },
            { value: "browser", label: "Browser", data: (s) => s.byBrowser, entry: (k) => ({ key: k, label: k === "unknown" ? "Unknown" : k }) },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="When people visit" hint={`Page views by weekday and hour, last ${range} days`} />
          <div className="p-4">{stats ? <WeekGrid hourly={stats.hourly ?? []} /> : <Skeleton className="h-[220px]" />}</div>
        </Panel>
        <LiveActivity page={page} sectionName={sectionName} />
      </div>

      <Leads page={page} sectionName={sectionName} hasSection={hasSection} />
    </div>
  );
}
