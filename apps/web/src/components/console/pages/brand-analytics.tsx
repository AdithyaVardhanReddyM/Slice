"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowDownRight, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronsUpDown, ExternalLink, Globe, PenLine, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { kitOf, type Audience, type Page, type Variant } from "@/lib/pages/types";
import { previewUrl, publicPageUrl } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { EmptyState, PageHeader, PageSkeleton, Panel, Skeleton } from "@/components/console/primitives";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageAnalytics, type Range } from "./analytics/page-analytics";
import { useBrand } from "./brand-context";
import { LiveThumb } from "./pages-list";

type PageRow = Page & {
  variants?: { _id: Id<"pagesVariants">; status: string; screenshot?: string }[];
  audiences?: Pick<Audience, "_id" | "name">[];
};

interface Totals {
  views: number;
  visitors: number;
  ctaClicks: number;
  formSubmits: number;
  avgEngagedMs: number;
  ctaRate: number;
}
type Overview = Totals & { pageId: Id<"pages">; prev: Totals; trend: number[] };

const audienceOf = (p: PageRow) => (p.audiences?.length ? p.audiences.map((a) => a.name).join(" + ") : "Everyone");

/* Atoms ----------------------------------------------------------------------------- */

function Thumb({ page, className }: { page: PageRow; className?: string }) {
  const brand = useBrand();
  const kit = kitOf(brand);
  const [broken, setBroken] = useState(false);
  const variant = page.variants?.[0];
  const shot = variant?.screenshot;
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10", className)}>
      {shot && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot} alt="" className="size-full object-cover object-top" onError={() => setBroken(true)} />
      ) : variant?.status === "ready" ? (
        <LiveThumb src={previewUrl(brand.slug, page.slug, variant._id)} />
      ) : (
        <span className="flex size-full items-center justify-center text-[10px] font-semibold" style={{ background: kit?.colors.background, color: kit?.colors.foreground }}>
          {page.title.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const live = status === "published";
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium", live ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
      {live ? <Globe className="size-3" /> : <PenLine className="size-3" />}
      {live ? "Live" : "Draft"}
    </span>
  );
}

/** Relative change against the prior period, coloured by direction. */
function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-xs text-muted-foreground">{now ? "New" : "—"}</span>;
  const change = now / before - 1;
  if (Math.abs(change) < 0.005) return <span className="text-xs text-muted-foreground">0%</span>;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", change > 0 ? "text-emerald-700" : "text-red-700")}>
      <Icon className="size-3" />
      {Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%
    </span>
  );
}

/** Visitors per day as a tiny area, scaled to its own peak. */
function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 28;
  const max = Math.max(1, ...values);
  if (!values.some(Boolean)) return <span className="block h-7 w-24 border-b border-dashed border-border" />;
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--chart-1)" fillOpacity={0.1} />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* All pages ---------------------------------------------------------------------------- */

type SortKey = "title" | "visitors" | "ctaRate" | "formSubmits" | "avgEngagedMs";

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  const Icon = sort.desc ? ArrowDown : ArrowUp;
  return (
    <TableHead className={className} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {label}
        {active && <Icon className="size-3" />}
      </button>
    </TableHead>
  );
}

function SummaryTile({ label, value, delta }: { label: string; value: ReactNode; delta: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">{delta}</span>
    </div>
  );
}

function sumTotals(rows: Totals[]) {
  const t = { views: 0, visitors: 0, ctaClicks: 0, formSubmits: 0 };
  for (const r of rows) {
    t.views += r.views;
    t.visitors += r.visitors;
    t.ctaClicks += r.ctaClicks;
    t.formSubmits += r.formSubmits;
  }
  return { ...t, ctaRate: t.views ? t.ctaClicks / t.views : 0 };
}

function AllPages({ pages, overview, range, onOpen }: { pages: PageRow[]; overview: Overview[] | undefined; range: Range; onOpen: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "visitors", desc: true });
  const byPage = useMemo(() => new Map((overview ?? []).map((o) => [o.pageId, o])), [overview]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = pages.filter(
      (p) => (status === "all" || (status === "published" ? p.status === "published" : p.status !== "published")) && (!q || `${p.title} ${audienceOf(p)}`.toLowerCase().includes(q)),
    );
    const value = (p: PageRow) => (sort.key === "title" ? 0 : (byPage.get(p._id)?.[sort.key] ?? -1));
    return list.sort((a, b) => {
      const d = sort.key === "title" ? a.title.localeCompare(b.title) : value(a) - value(b);
      return sort.desc ? -d : d;
    });
  }, [pages, byPage, query, status, sort]);

  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "title" }));
  const cur = sumTotals(overview ?? []);
  const prev = sumTotals((overview ?? []).map((o) => o.prev));
  const vs = <span>vs prior {range} days</span>;

  return (
    <div className="space-y-6">
      <Panel>
        <div className="grid grid-cols-2 lg:grid-cols-4 lg:[&>*+*]:border-l">
          {overview ? (
            <>
              <SummaryTile label="Visitors, all pages" value={fmt.int(cur.visitors)} delta={<><Delta now={cur.visitors} before={prev.visitors} /> {vs}</>} />
              <SummaryTile label="Page views" value={fmt.int(cur.views)} delta={<><Delta now={cur.views} before={prev.views} /> {vs}</>} />
              <SummaryTile label="CTA rate" value={fmt.pct(cur.ctaRate)} delta={<><Delta now={cur.ctaRate} before={prev.ctaRate} /> {vs}</>} />
              <SummaryTile label="Leads" value={fmt.int(cur.formSubmits)} delta={<><Delta now={cur.formSubmits} before={prev.formSubmits} /> {vs}</>} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 px-5 py-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Pages</h2>
            <p className="text-xs text-muted-foreground">
              {pages.length} page{pages.length === 1 ? "" : "s"}, last {range} days. Select one for its full report.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages"
                aria-label="Search pages"
                className="h-8 w-52 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "published", label: "Live" },
                { value: "draft", label: "Drafts" },
              ]}
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHead label="Page" k="title" sort={sort} onSort={onSort} className="pl-4" />
              <SortHead label="Visitors" k="visitors" sort={sort} onSort={onSort} className="text-right" />
              <TableHead className="w-32">Trend</TableHead>
              <SortHead label="CTA rate" k="ctaRate" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Leads" k="formSubmits" sort={sort} onSort={onSort} className="text-right" />
              <SortHead label="Time on page" k="avgEngagedMs" sort={sort} onSort={onSort} className="pr-4 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const o = byPage.get(p._id);
              return (
                <TableRow
                  key={p._id}
                  tabIndex={0}
                  onClick={() => onOpen(p.slug)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(p.slug)}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <TableCell className="py-2.5 pl-4">
                    <span className="flex items-center gap-3">
                      <Thumb page={p} className="h-11 w-16" />
                      <span className="min-w-0 space-y-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{p.title}</span>
                          <StatusPill status={p.status} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">For {audienceOf(p)}</span>
                      </span>
                    </span>
                  </TableCell>
                  {o ? (
                    <>
                      <TableCell className="text-right">
                        <span className="block font-medium tabular-nums">{fmt.int(o.visitors)}</span>
                        <Delta now={o.visitors} before={o.prev.visitors} />
                      </TableCell>
                      <TableCell>
                        <Sparkline values={o.trend} />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="block tabular-nums">{o.views ? fmt.pct(o.ctaRate) : "—"}</span>
                        {o.views > 0 && <Delta now={o.ctaRate} before={o.prev.ctaRate} />}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="block tabular-nums">{fmt.int(o.formSubmits)}</span>
                        <Delta now={o.formSubmits} before={o.prev.formSubmits} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <span className="block tabular-nums">{o.views ? fmt.duration(Math.round(o.avgEngagedMs / 1000)) : "—"}</span>
                        {o.views > 0 && <Delta now={o.avgEngagedMs} before={o.prev.avgEngagedMs} />}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8" />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">No pages match.</p>}
      </Panel>
    </div>
  );
}

/* Page switcher ------------------------------------------------------------------------------ */

function PageSwitcher({ pages, current, overview, onSelect }: { pages: PageRow[]; current: PageRow; overview: Overview[] | undefined; onSelect: (slug: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const visitors = useMemo(() => new Map((overview ?? []).map((o) => [o.pageId, o.visitors])), [overview]);
  // Busiest first, so the pages people care about are at the top.
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages
      .filter((p) => !q || `${p.title} ${audienceOf(p)}`.toLowerCase().includes(q))
      .sort((a, b) => (visitors.get(b._id) ?? 0) - (visitors.get(a._id) ?? 0));
  }, [pages, query, visitors]);
  const pick = (slug: string) => {
    setOpen(false);
    setQuery("");
    onSelect(slug);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setCursor(0);
      }}
    >
      <PopoverTrigger
        render={<button type="button" className="group flex min-w-0 items-center gap-3 rounded-xl py-1.5 pr-3 pl-1.5 text-left transition-colors hover:bg-muted/60 data-[popup-open]:bg-muted/60" />}
      >
        <Thumb page={current} className="h-12 w-[4.5rem]" />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold tracking-tight">{current.title}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
          </span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <StatusPill status={current.status} />
            <span className="truncate">For {audienceOf(current)}</span>
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] gap-0 p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(list.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter" && list[cursor]) pick(list[cursor].slug);
            }}
            placeholder="Find a page"
            aria-label="Find a page"
            className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="scrollbar-thin max-h-80 overflow-y-auto p-1.5" role="listbox">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No pages match.</li>}
          {list.map((p, i) => (
            <li key={p._id} role="option" aria-selected={p._id === current._id}>
              <button
                type="button"
                onClick={() => pick(p.slug)}
                onMouseMove={() => setCursor(i)}
                className={cn("flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left", i === cursor && "bg-muted")}
              >
                <Thumb page={p} className="h-9 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    For {audienceOf(p)}
                    {p.status !== "published" && " · Draft"}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{visitors.has(p._id) ? `${fmt.compact(visitors.get(p._id) ?? 0)} visitors` : ""}</span>
                <Check className={cn("size-4 shrink-0 text-primary", p._id !== current._id && "invisible")} />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* Page report ---------------------------------------------------------------------------------- */

function PageReport({
  page,
  pages,
  overview,
  range,
  onSelect,
  onBack,
}: {
  page: PageRow;
  pages: PageRow[];
  overview: Overview[] | undefined;
  range: Range;
  onSelect: (slug: string) => void;
  onBack: () => void;
}) {
  const brand = useBrand();
  const bundle = useQuery(api.pages.get, { id: page._id }) as { page: Page; variants: Variant[] } | null | undefined;
  const variant = bundle ? (bundle.variants.find((v) => v._id === bundle.page.defaultVariantId) ?? bundle.variants[0] ?? null) : null;
  const live = page.status === "published";
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" /> All pages
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageSwitcher pages={pages} current={page} overview={overview} onSelect={onSelect} />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/dashboard/pages/${brand.slug}/${page.slug}`} />}>
            <PenLine data-icon="inline-start" /> Edit page
          </Button>
          {variant && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={live ? publicPageUrl(brand.slug, page.slug) : previewUrl(brand.slug, page.slug, variant._id)} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink data-icon="inline-start" /> Open page
            </Button>
          )}
        </div>
      </div>
      {!live && <p className="text-sm text-muted-foreground">This page is a draft, so it only collects test traffic until it is published.</p>}
      {bundle === undefined ? <Skeleton className="h-96 rounded-xl" /> : bundle ? <PageAnalytics page={bundle.page} variant={variant} range={range} /> : null}
    </div>
  );
}

/* Screen ------------------------------------------------------------------------------------------ */

/** Brand-level analytics: every page compared, then one page's full report (?page=slug). */
export function BrandAnalytics() {
  const brand = useBrand();
  const router = useRouter();
  const params = useSearchParams();
  const [range, setRange] = useState<Range>(30);
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as PageRow[] | undefined;
  const overview = useQuery(api.pagesEvents.brandOverview, { brandId: brand._id, days: range }) as Overview[] | undefined;
  const slug = params.get("page");
  const page = slug ? (pages?.find((p) => p.slug === slug) ?? null) : null;
  const base = `/dashboard/pages/${brand.slug}/analytics`;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <PageHeader
        title="Analytics"
        description={page ? "One page in depth: who came, what they did and where they clicked." : "How each page performs with the people it was built for."}
        actions={
          <Segmented
            value={String(range) as "7" | "14" | "30"}
            onChange={(v) => setRange(Number(v) as Range)}
            options={[
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />
      {pages === undefined ? (
        <PageSkeleton />
      ) : pages.length === 0 ? (
        <EmptyState title="No pages to measure" body="Create and publish a page; its traffic shows up here within seconds." />
      ) : page ? (
        <PageReport
          key={page._id}
          page={page}
          pages={pages}
          overview={overview}
          range={range}
          onSelect={(s) => router.replace(`${base}?page=${encodeURIComponent(s)}`, { scroll: false })}
          onBack={() => router.push(base)}
        />
      ) : (
        <AllPages pages={pages} overview={overview} range={range} onOpen={(s) => router.push(`${base}?page=${encodeURIComponent(s)}`)} />
      )}
    </div>
  );
}
