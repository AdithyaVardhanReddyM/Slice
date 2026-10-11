"use client";

import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/pages/csv";
import type { Audience, EventRow, FormRow, Page, Variant } from "@/lib/pages/types";
import { Segmented } from "@/components/console/form";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrand } from "../brand-context";
import { PreviewFrame, VariantTabs } from "../builder/preview";
import { Hint, relativeTime } from "../shared";
import { heatColor, variantColor } from "./colors";

/* Shapes from pagesEvents.stats / heatmap ----------------------------------------- */

interface VariantStat {
  variantId: string;
  name: string;
  audienceId?: string;
  views: number;
  sessions: number;
  visitors: number;
  ctaRate: number;
  clickRate: number;
  avgEngagedMs: number;
  avgScroll: number;
  formRate: number;
  formSubmits: number;
}

interface SeriesPoint {
  day: string;
  hour: number;
  variantId: string;
  views: number;
  sessions: number;
  ctaClicks: number;
}

interface Stats {
  variants: VariantStat[];
  series: SeriesPoint[];
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
  byCountry: Record<string, number>;
  bySource: Record<string, number>;
  byResolvedBy: Record<string, number>;
  hourly: number[][];
}

interface Heatmap {
  points: { sectionId: string; x: number; y: number }[];
  sections: Record<string, { seen: number; clicks: number }>;
}

type Range = 7 | 14 | 30;
// Index = JS getUTCDay (0 = Sunday), matching pagesEvents.stats.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/* Variant comparison ------------------------------------------------------------- */

function Lift({ value, base }: { value: number; base: number }) {
  if (!base) return <span className="text-muted-foreground">—</span>;
  const lift = value / base - 1;
  return <span className={cn("num", lift > 0.005 ? "text-emerald-700" : lift < -0.005 ? "text-red-700" : "text-muted-foreground")}>{fmt.delta(lift)}</span>;
}

function ComparisonTable({ stats, variants }: { stats: Stats; variants: Variant[] }) {
  const rows = variants.map((v) => stats.variants.find((s) => s.variantId === v._id) ?? null);
  const base = rows[0];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead className="text-right">Views</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">CTA rate</TableHead>
          <TableHead className="text-right">Lift vs default</TableHead>
          <TableHead className="text-right">Engaged</TableHead>
          <TableHead className="text-right">Scroll</TableHead>
          <TableHead className="text-right">Form rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {variants.map((v, i) => {
          const s = rows[i];
          return (
            <TableRow key={v._id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: variantColor(i) }} />
                  <span className="font-medium">{v.name}</span>
                  {i === 0 && <span className="text-xs text-muted-foreground">default</span>}
                </span>
              </TableCell>
              <TableCell className="num text-right">{s ? fmt.int(s.views) : "0"}</TableCell>
              <TableCell className="num text-right">{s ? fmt.int(s.sessions) : "0"}</TableCell>
              <TableCell className="num text-right">{s ? fmt.pct(s.ctaRate) : "—"}</TableCell>
              <TableCell className="text-right">{i === 0 || !s ? <span className="text-muted-foreground">—</span> : <Lift value={s.ctaRate} base={base?.ctaRate ?? 0} />}</TableCell>
              <TableCell className="num text-right">{s ? fmt.duration(Math.round(s.avgEngagedMs / 1000)) : "—"}</TableCell>
              <TableCell className="num text-right">{s ? fmt.pct(s.avgScroll, 0) : "—"}</TableCell>
              <TableCell className="num text-right">{s ? fmt.pct(s.formRate) : "—"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* Time series -------------------------------------------------------------------- */

function SeriesChart({ stats, variants, range, to, metric }: { stats: Stats; variants: Variant[]; range: Range; to: number; metric: "views" | "sessions" | "ctaClicks" }) {
  const data = useMemo(() => {
    const days: string[] = [];
    for (let i = range - 1; i >= 0; i--) days.push(dayKey(new Date(to - i * 864e5)));
    const byDay = new Map(days.map((d) => [d, { day: d } as Record<string, string | number>]));
    for (const p of stats.series) {
      const row = byDay.get(p.day);
      if (!row) continue;
      row[p.variantId] = ((row[p.variantId] as number) ?? 0) + (p[metric] ?? 0);
    }
    return days.map((d) => {
      const row = byDay.get(d)!;
      for (const v of variants) row[v._id] = (row[v._id] as number) ?? 0;
      return row;
    });
  }, [stats.series, variants, range, to, metric]);
  const config = Object.fromEntries(variants.map((v, i) => [v._id, { label: v.name, color: variantColor(i) }])) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(v: string) => fmt.date(v)} />
        <YAxis tickLine={false} axisLine={false} width={32} tickMargin={4} allowDecimals={false} />
        <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => fmt.dateLong(String(v))} />} />
        {variants.map((v) => (
          <Line key={v._id} dataKey={v._id} type="monotone" stroke={`var(--color-${v._id})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} isAnimationActive={false} />
        ))}
        {variants.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      </LineChart>
    </ChartContainer>
  );
}

/* Hourly grid --------------------------------------------------------------------- */

function HourlyGrid({ hourly }: { hourly: number[][] }) {
  // Accept either [7][24] (day-major) or [24][7] (hour-major).
  const grid: number[][] = hourly.length === 24 && hourly[0]?.length === 7 ? DAYS.map((_, d) => hourly.map((h) => h[d] ?? 0)) : hourly;
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[2.25rem_1fr] gap-1">
        <span />
        <div className="grid grid-cols-24 text-[10px] text-muted-foreground">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className={cn("text-center", h % 3 !== 0 && "invisible")}>
              {h}
            </span>
          ))}
        </div>
      </div>
      {grid.map((row, d) => (
        <div key={d} className="grid grid-cols-[2.25rem_1fr] items-center gap-1">
          <span className="text-xs text-muted-foreground">{DAYS[d] ?? d}</span>
          <div className="grid grid-cols-24 gap-[2px]">
            {Array.from({ length: 24 }, (_, h) => {
              const v = row?.[h] ?? 0;
              return <span key={h} className="aspect-square rounded-[3px] bg-muted" style={v ? { background: heatColor(v / max) } : undefined} title={`${DAYS[d]} ${h}:00 · ${fmt.int(v)} views`} />;
            })}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-muted-foreground">
        <span>fewer</span>
        {[0.1, 0.35, 0.6, 0.85, 1].map((t) => (
          <span key={t} className="size-2.5 rounded-[2px]" style={{ background: heatColor(t) }} />
        ))}
        <span>more views (UTC)</span>
      </div>
    </div>
  );
}

/* Breakdowns ----------------------------------------------------------------------- */

const RESOLVED_LABEL: Record<string, string> = {
  param: "Link parameter",
  lead: "Personal link",
  utm: "UTM rule",
  geo: "Location",
  cookie: "Returning",
  quiz: "Quiz",
  default: "Default",
  preview: "Preview",
};

function Breakdown({ title, data, labels }: { title: string; data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {entries.length === 0 ? (
        <Hint>No data in range.</Hint>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([k, n]) => (
            <li key={k} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-xs">
              <span className="truncate capitalize">{labels?.[k] ?? k}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(2, (n / total) * 100)}%` }} />
              </span>
              <span className="num text-right text-muted-foreground">{fmt.pct(n / total, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Click heat map --------------------------------------------------------------------- */

interface SectionBox {
  id: string;
  top: number;
  height: number;
}

function HeatOverlay({ heatmap, sections, frameHeight, scrollTop }: { heatmap: Heatmap | undefined; sections: SectionBox[] | null; frameHeight: number; scrollTop: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const rect = el.parentElement?.getBoundingClientRect();
    if (!rect) return;
    el.width = rect.width;
    el.height = rect.height;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    if (!heatmap) return;
    const ids = [...new Set(heatmap.points.map((p) => p.sectionId))];
    const boxes: Record<string, SectionBox> =
      sections && sections.length
        ? Object.fromEntries(sections.map((s) => [s.id, s]))
        : Object.fromEntries(ids.map((id, i) => [id, { id, top: (i * frameHeight) / Math.max(1, ids.length), height: frameHeight / Math.max(1, ids.length) }]));
    for (const p of heatmap.points) {
      const b = boxes[p.sectionId];
      if (!b) continue;
      const x = p.x * el.width;
      const y = b.top + p.y * b.height - (sections ? scrollTop : 0);
      if (y < -20 || y > el.height + 20) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
      g.addColorStop(0, "rgba(234, 88, 12, 0.35)");
      g.addColorStop(1, "rgba(234, 88, 12, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [heatmap, sections, frameHeight, scrollTop]);
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}

function ClickHeatmap({ page, variants, from, to }: { page: Page; variants: Variant[]; from: number; to: number }) {
  const brand = useBrand();
  const [variantId, setVariantId] = useState<string | null>(variants[0]?._id ?? null);
  const variant = variants.find((v) => v._id === variantId) ?? variants[0] ?? null;
  const heatmap = useQuery(api.pagesEvents.heatmap, variant ? { variantId: variant._id, from, to } : "skip") as Heatmap | undefined;
  const [sections, setSections] = useState<SectionBox[] | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; sections?: SectionBox[]; scrollTop?: number } | null;
      if (!d || typeof d !== "object") return;
      if (d.type === "pg:sections" && Array.isArray(d.sections)) {
        setSections(d.sections);
        if (typeof d.scrollTop === "number") setScrollTop(d.scrollTop);
      } else if (d.type === "pg:scroll" && typeof d.scrollTop === "number") setScrollTop(d.scrollTop);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const funnel = useMemo(() => {
    const secs = heatmap?.sections ?? {};
    const order = sections?.map((s) => s.id) ?? Object.keys(secs);
    return order.filter((id) => secs[id]).map((id) => ({ id, ...secs[id] }));
  }, [heatmap, sections]);
  const maxSeen = Math.max(1, ...funnel.map((f) => f.seen));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-3">
        <VariantTabs variants={variants} activeId={variant?._id ?? null} onSelect={(id) => { setVariantId(id); setSections(null); }} />
        <div ref={wrap} className="h-[36rem]">
          <PreviewFrame
            brandSlug={brand.slug}
            pageSlug={page.slug}
            variant={variant}
            device="desktop"
            reloadKey={0}
            className="h-full"
            overlay={<HeatOverlay heatmap={heatmap} sections={sections} frameHeight={height} scrollTop={scrollTop} />}
            onLoad={() => setSections(null)}
          />
        </div>
        <Hint>
          {heatmap ? `${fmt.int(heatmap.points.length)} clicks in range.` : "Loading clicks…"}{" "}
          {sections ? "Positioned on the live section layout." : "Section positions arrive from the page; until then clicks are placed in equal bands."}
        </Hint>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Section funnel</h3>
        <Hint>Visitors who saw each section, and how many clicked in it.</Hint>
        {funnel.length === 0 ? (
          <Hint>No section views yet.</Hint>
        ) : (
          <ol className="space-y-2">
            {funnel.map((f) => (
              <li key={f.id} className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{f.id}</span>
                  <span className="num text-muted-foreground">
                    {fmt.int(f.seen)} seen · {fmt.int(f.clicks)} clicked
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-3)]" style={{ width: `${(f.seen / maxSeen) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-1)]" style={{ width: `${(f.clicks / maxSeen) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* Forms + live feed ---------------------------------------------------------------- */

function FormsTable({ page, variants }: { page: Page; variants: Variant[] }) {
  const forms = useQuery(api.pagesEvents.forms, { pageId: page._id, take: 200 }) as FormRow[] | undefined;
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const f of forms ?? []) Object.keys(f.fields).forEach((k) => set.add(k));
    return [...set].slice(0, 6);
  }, [forms]);
  const name = (id: string) => variants.find((v) => v._id === id)?.name ?? "—";
  const exportCsv = () => {
    if (!forms) return;
    const cols = ["submitted_at", "version", "section", ...columns];
    const rows = forms.map((f) => ({ submitted_at: new Date(f.at).toISOString(), version: name(f.variantId), section: f.sectionId, ...f.fields }));
    downloadText(`${page.slug}-forms.csv`, toCsv(cols, rows));
  };
  return (
    <Panel>
      <PanelHeader
        title="Form submissions"
        hint={forms ? `${fmt.int(forms.length)} most recent` : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!forms?.length}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        }
      />
      {forms === undefined ? (
        <Skeleton className="m-4 h-24" />
      ) : forms.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Version</TableHead>
                {columns.map((c) => (
                  <TableHead key={c} className="capitalize">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.slice(0, 50).map((f) => (
                <TableRow key={f._id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{relativeTime(f.at)}</TableCell>
                  <TableCell>{name(f.variantId)}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} className="max-w-48 truncate">
                      {f.fields[c] ?? ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

const EVENT_LABEL: Record<string, string> = {
  pageview: "Viewed",
  heartbeat: "Active",
  scroll: "Scrolled",
  section_seen: "Saw section",
  click: "Clicked",
  cta_click: "Clicked CTA",
  form_submit: "Submitted form",
  quiz_answer: "Answered quiz",
  outbound: "Left via link",
};

function LiveFeed({ page, variants }: { page: Page; variants: Variant[] }) {
  const recent = useQuery(api.pagesEvents.recent, { pageId: page._id, take: 40 }) as EventRow[] | undefined;
  const name = (id: string) => variants.find((v) => v._id === id)?.name ?? "—";
  return (
    <Panel className="flex max-h-[32rem] flex-col">
      <PanelHeader title="Live feed" hint="Latest events from published pages" />
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {recent === undefined ? (
          <Skeleton className="m-4 h-24" />
        ) : recent.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nothing yet. Events appear here within seconds of a visit.</p>
        ) : (
          <ul className="divide-y">
            {recent.filter((e) => e.type !== "heartbeat").map((e) => (
              <li key={e._id} className="flex items-start gap-3 px-4 py-2 text-xs">
                <span className="num w-14 shrink-0 text-muted-foreground">{relativeTime(e.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                  {e.label && <span className="text-muted-foreground"> “{e.label.slice(0, 40)}”</span>}
                  {e.sectionId && e.type !== "pageview" && <span className="text-muted-foreground"> in {e.sectionId}</span>}
                  {e.type === "scroll" && e.value !== undefined && <span className="text-muted-foreground"> to {fmt.pct(e.value, 0)}</span>}
                  <span className="block truncate text-muted-foreground">
                    {name(e.variantId)} · {RESOLVED_LABEL[e.resolvedBy] ?? e.resolvedBy} · {e.device} · {e.browser}
                    {e.city ? ` · ${e.city}` : e.country ? ` · ${e.country}` : ""} · {e.source}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* Screen ------------------------------------------------------------------------ */

export function PageAnalytics({ page, variants }: { page: Page; variants: Variant[]; audiences?: Audience[] }) {
  const [range, setRange] = useState<Range>(7);
  const [metric, setMetric] = useState<"views" | "sessions" | "ctaClicks">("views");
  const [to] = useState(() => Date.now());
  const from = to - range * 864e5;
  const stats = useQuery(api.pagesEvents.stats, { pageId: page._id, from, to }) as Stats | undefined;
  const total = (stats?.variants ?? []).reduce((s, v) => s + v.views, 0);

  return (
    <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            {stats ? `${fmt.int(total)} views across ${variants.length} version${variants.length === 1 ? "" : "s"} in the last ${range} days.` : "Loading…"}
            {page.status !== "published" && " This page is not published, so only preview traffic can appear."}
          </p>
        </div>
        <Segmented
          value={String(range) as "7" | "14" | "30"}
          onChange={(v) => setRange(Number(v) as Range)}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "14", label: "Last 14 days" },
            { value: "30", label: "Last 30 days" },
          ]}
        />
      </div>

      <Panel>
        <PanelHeader title="Versions compared" hint="Lift is the CTA rate against the default version." />
        {stats ? <ComparisonTable stats={stats} variants={variants} /> : <Skeleton className="m-4 h-32" />}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Over time"
            hint="Per day, one line per version"
            actions={
              <Segmented
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "views", label: "Views" },
                  { value: "sessions", label: "Sessions" },
                  { value: "ctaClicks", label: "CTA clicks" },
                ]}
              />
            }
          />
          <div className="p-4">{stats ? <SeriesChart stats={stats} variants={variants} range={range} to={to} metric={metric} /> : <Skeleton className="h-[260px]" />}</div>
        </Panel>
        <Panel>
          <PanelHeader title="When people visit" hint="Views by weekday and hour" />
          <div className="p-4">{stats ? <HourlyGrid hourly={stats.hourly ?? []} /> : <Skeleton className="h-[220px]" />}</div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Who and how" hint="Share of views in range" />
        <div className="grid gap-6 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats ? (
            <>
              <Breakdown title="Device" data={stats.byDevice} />
              <Breakdown title="Browser" data={stats.byBrowser} />
              <Breakdown title="Country" data={stats.byCountry} />
              <Breakdown title="Source" data={stats.bySource} />
              <Breakdown title="Version chosen by" data={stats.byResolvedBy} labels={RESOLVED_LABEL} />
            </>
          ) : (
            [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Where people click" hint="Clicks placed on the version's sections" />
        <div className="p-4">
          <ClickHeatmap page={page} variants={variants} from={from} to={to} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FormsTable page={page} variants={variants} />
        <LiveFeed page={page} variants={variants} />
      </div>
    </div>
  );
}
