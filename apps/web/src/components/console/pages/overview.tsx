"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Globe,
  Loader2,
  Palette,
  PenLine,
  Plus,
  Rocket,
  Trophy,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { AUDIENCE_KIND_LABEL, briefOf, kitOf, profileOf, type Audience, type Brand, type Page } from "@/lib/pages/types";
import { hostOf } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { MetricOverview, useWindow, type Range } from "./analytics/page-analytics";
import { Delta, Sparkline, StatusPill, Thumb, audienceOf } from "./brand-analytics";
import { useBrand } from "./brand-context";
import { BrandGlyph } from "./brand-shell";
import { googleFontHref } from "./kit-editor";
import { audienceSubtitle, relativeTime } from "./shared";
import { KIND_ICON, TasteCover, coverTiles } from "./taste-cover";

type PageRow = Page & {
  variants?: { _id: Id<"pagesVariants">; status: string; screenshot?: string }[];
  audiences?: Audience[];
};

interface DayRow {
  day: string;
  views: number;
  sessions: number;
  visitors: number;
  clicks: number;
  ctaClicks: number;
  formSubmits: number;
  engagedMs: number;
}

interface Totals {
  views: number;
  visitors: number;
  ctaClicks: number;
  formSubmits: number;
  avgEngagedMs: number;
  ctaRate: number;
}

type Overview = Totals & { pageId: Id<"pages">; prev: Totals; trend: number[]; daily: DayRow[]; prevDaily: DayRow[] };

/** Per-day totals across every page, aligned by index (the query returns the same days for each page). */
function sumDaily(rows: DayRow[][]): DayRow[] {
  const out: DayRow[] = [];
  for (const days of rows) {
    days.forEach((d, i) => {
      const t = (out[i] ??= { day: d.day, views: 0, sessions: 0, visitors: 0, clicks: 0, ctaClicks: 0, formSubmits: 0, engagedMs: 0 });
      t.views += d.views;
      t.sessions += d.sessions;
      t.visitors += d.visitors;
      t.clicks += d.clicks;
      t.ctaClicks += d.ctaClicks;
      t.formSubmits += d.formSubmits;
      t.engagedMs += d.engagedMs;
    });
  }
  return out;
}

function SectionHeading({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* Hero ---------------------------------------------------------------------------------- */

function KitCell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex h-7 items-center">{children}</div>
    </div>
  );
}

/** The brand as the builder sees it: name, what it is, the kit every page inherits and the captured homepage. */
function BrandHero({ brand, pages, audiences }: { brand: Brand; pages: PageRow[] | undefined; audiences: Audience[] | undefined }) {
  const base = `/dashboard/pages/${brand.slug}`;
  const kit = kitOf(brand);
  const brief = briefOf(brand);
  const [shotBroken, setShotBroken] = useState(false);
  // Full-page capture first: drawn at full width, it is always tall enough to fill the frame.
  const shot = brand.site?.screenshot ?? brand.site?.fold ?? brand.screenshot;
  const heading = kit?.fonts.heading;
  const fonts = heading?.source === "google" ? googleFontHref([heading.family]) : null;
  const live = pages?.filter((p) => p.status === "published").length ?? 0;
  const button = kit
    ? {
        borderRadius: kit.buttonStyle === "pill" ? 999 : kit.buttonStyle === "square" ? 0 : 6,
        background: kit.colors.primary,
        color: kit.colors.primaryForeground,
        textTransform: kit.uppercaseLabels ? ("uppercase" as const) : undefined,
        fontFamily: heading ? `"${heading.family}", ${heading.fallback || "sans-serif"}` : undefined,
      }
    : undefined;

  return (
    <Panel className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="flex min-w-0 flex-col gap-6 p-6 lg:p-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <BrandGlyph brand={brand} />
            <a href={brand.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground">
              {hostOf(brand.url)} <ArrowUpRight className="size-3.5 shrink-0" />
            </a>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{brand.name}</h1>
          {brief?.summary && <p className="line-clamp-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{brief.summary}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {pages === undefined ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <>
                <span>
                  <span className="font-medium tabular-nums">{pages.length}</span> <span className="text-muted-foreground">page{pages.length === 1 ? "" : "s"}</span>
                </span>
                <span>
                  <span className="font-medium tabular-nums">{live}</span> <span className="text-muted-foreground">live</span>
                </span>
              </>
            )}
            {audiences !== undefined && (
              <span>
                <span className="font-medium tabular-nums">{audiences.length}</span> <span className="text-muted-foreground">audience{audiences.length === 1 ? "" : "s"}</span>
              </span>
            )}
          </div>
        </div>

        {kit && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 border-t pt-5">
            <KitCell label="Palette">
              <span className="flex -space-x-1.5">
                {(["primary", "foreground", "background", "accent", "muted", "surface"] as const).map((k) => (
                  <span key={k} title={`${k} ${kit.colors[k]}`} className="size-7 rounded-full ring-2 ring-card" style={{ background: kit.colors[k], boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
                ))}
              </span>
            </KitCell>
            <KitCell label="Type">
              <span className="flex items-baseline gap-2">
                <span className="text-2xl leading-none font-semibold" style={{ fontFamily: button?.fontFamily }}>
                  Aa
                </span>
                <span className="truncate text-sm">{heading?.family}</span>
              </span>
            </KitCell>
            <KitCell label="Call to action">
              <span className="truncate px-3 py-1 text-xs font-semibold" style={button}>
                {brief?.ctas[0] ?? "Get started"}
              </span>
            </KitCell>
            <Link href={`${base}/kit`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mb-0.5 ml-auto text-muted-foreground")}>
              <Palette data-icon="inline-start" /> Edit kit
            </Link>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={`${base}/new`} className={buttonVariants()}>
            <Plus data-icon="inline-start" /> New page
          </Link>
          <Link href={`${base}/audiences?new=1`} className={buttonVariants({ variant: "outline" })}>
            <UserPlus data-icon="inline-start" /> New audience
          </Link>
        </div>
      </div>

      {/* The homepage the builder captured, framed like a window resting on the brand's own colour. */}
      <div className="relative hidden min-h-72 overflow-hidden border-l lg:block" style={{ background: kit?.colors.accent ?? "var(--muted)" }}>
        {shot && !shotBroken ? (
          <div className="absolute inset-x-8 top-8 bottom-0 overflow-hidden rounded-t-xl bg-background shadow-2xl ring-1 shadow-black/15 ring-black/10">
            <div className="flex h-7 items-center gap-1.5 border-b bg-muted/60 px-3">
              <span className="size-2 rounded-full bg-foreground/15" />
              <span className="size-2 rounded-full bg-foreground/15" />
              <span className="size-2 rounded-full bg-foreground/15" />
              <span className="ml-2 truncate text-[11px] text-muted-foreground">{hostOf(brand.url)}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot} alt={`${brand.name} homepage`} className="block h-auto w-full" onError={() => setShotBroken(true)} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-semibold opacity-20" style={{ color: kit?.colors.foreground, fontFamily: button?.fontFamily }}>
              {brand.name.charAt(0)}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* Top pages ----------------------------------------------------------------------------- */

function RowMetric({ value, delta, className }: { value: ReactNode; delta?: ReactNode; className?: string }) {
  return (
    <div className={cn("w-20 shrink-0 text-right", className)}>
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="h-4">{delta}</div>
    </div>
  );
}

function AudienceFace({ audience }: { audience?: Audience }) {
  const [broken, setBroken] = useState(false);
  if (!audience)
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted">
        <Globe className="size-3" />
      </span>
    );
  const image = coverTiles(profileOf(audience), 1)[0]?.image;
  const Icon = KIND_ICON[audience.kind] ?? Users;
  return (
    <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-neutral-800 text-white">
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className="size-2.5" />
      )}
    </span>
  );
}

function TopPages({ pages, byPage, range, base }: { pages: PageRow[] | undefined; byPage: Map<string, Overview> | undefined; range: Range; base: string }) {
  const rows = useMemo(
    () => [...(pages ?? [])].sort((a, b) => (byPage?.get(b._id)?.visitors ?? -1) - (byPage?.get(a._id)?.visitors ?? -1)).slice(0, 5),
    [pages, byPage],
  );
  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader
        title="Top pages"
        hint={`Ranked by visitors over the last ${range} days`}
        actions={
          <Link href={`${base}/pages`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            All pages <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {pages === undefined ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="relative mb-5 aspect-[522/336] w-56 overflow-hidden rounded-lg shadow-lg ring-1 ring-foreground/10">
            <Image src="/illustrations/page-card.svg" alt="" fill sizes="224px" className="object-cover" />
          </div>
          <p className="text-sm font-medium">No pages yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Describe a page and who it is for; the builder writes it for that audience.</p>
          <Link href={`${base}/new`} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
            <Plus data-icon="inline-start" /> New page
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="flex-1">Page</span>
            <span className="hidden w-24 md:block">Trend</span>
            <span className="w-20 text-right">Visitors</span>
            <span className="w-20 text-right">CTA rate</span>
            <span className="hidden w-20 text-right sm:block">Leads</span>
          </div>
          {/* Rows share the column's height so the panel lines up with the rail beside it. */}
          <ul className="grid flex-1 auto-rows-fr grid-cols-1 divide-y">
            {rows.map((p) => {
              const o = byPage?.get(p._id);
              return (
                <li key={p._id}>
                  <Link href={`${base}/${p.slug}`} className="group flex h-full items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40">
                    <Thumb page={p} className="h-16 w-[6.25rem] transition-shadow group-hover:shadow-md" />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-sm font-medium group-hover:underline group-hover:underline-offset-4">{p.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusPill status={p.status} />
                        <AudienceFace audience={p.audiences?.[0]} />
                        <span className="truncate">For {audienceOf(p)}</span>
                      </span>
                    </span>
                    {o ? (
                      <>
                        <span className="hidden w-24 md:block">
                          <Sparkline values={o.trend} />
                        </span>
                        <RowMetric value={fmt.int(o.visitors)} delta={<Delta now={o.visitors} before={o.prev.visitors} />} />
                        <RowMetric value={o.views ? fmt.pct(o.ctaRate) : "—"} delta={o.views > 0 && <Delta now={o.ctaRate} before={o.prev.ctaRate} />} />
                        <RowMetric className="hidden sm:block" value={fmt.int(o.formSubmits)} delta={<Delta now={o.formSubmits} before={o.prev.formSubmits} />} />
                      </>
                    ) : (
                      <Skeleton className="h-8 w-60" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {pages.length > rows.length && (
            <Link href={`${base}/pages`} className="mt-auto border-t px-4 py-2.5 text-center text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground">
              {pages.length - rows.length} more page{pages.length - rows.length === 1 ? "" : "s"}
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

/* Next steps ---------------------------------------------------------------------------- */

type Step = { key: string; icon: LucideIcon; tone?: "warn" | "good"; title: string; body: string; href: string };

function nextSteps(brand: Brand, pages: PageRow[], audiences: Audience[], byPage: Map<string, Overview> | undefined, range: Range): Step[] {
  const base = `/dashboard/pages/${brand.slug}`;
  const steps: Step[] = [];
  if (brand.status === "review")
    steps.push({ key: "review", icon: Palette, title: "Finish the brand review", body: "Check the kit and brief the builder will use for every page.", href: `${base}/kit` });

  const failed = pages.filter((p) => p.variants?.some((v) => v.status === "failed"));
  if (failed.length)
    steps.push({
      key: "failed",
      icon: TriangleAlert,
      tone: "warn",
      title: failed.length === 1 ? `${failed[0].title} failed to build` : `${failed.length} pages failed to build`,
      body: "Open the editor and ask the builder to try again.",
      href: `${base}/${failed[0].slug}`,
    });

  const building = pages.filter((p) => p.variants?.some((v) => v.status === "building"));
  if (building.length)
    steps.push({
      key: "building",
      icon: Loader2,
      title: building.length === 1 ? `${building[0].title} is building` : `${building.length} pages are building`,
      body: "The builder is writing and reviewing it now.",
      href: `${base}/${building[0].slug}`,
    });

  const drafts = pages.filter((p) => p.status !== "published");
  if (pages.length === 0)
    steps.push({ key: "first", icon: PenLine, title: "Build the first page", body: "Say what it is for and who it should speak to.", href: `${base}/new` });
  else if (drafts.length) {
    // Point at the draft that does best on test traffic: the most convincing one to publish.
    const best = [...drafts].sort((a, b) => (byPage?.get(b._id)?.ctaRate ?? 0) - (byPage?.get(a._id)?.ctaRate ?? 0))[0];
    steps.push({
      key: "publish",
      icon: Rocket,
      title: drafts.length === pages.length ? "Publish a page" : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} to publish`,
      body:
        drafts.length === pages.length
          ? `Every page is a draft, so traffic is test traffic. ${best.title} is the strongest candidate.`
          : `${best.title} is the strongest of them on test traffic.`,
      href: `${base}/${best.slug}`,
    });
  }

  const covered = new Set(pages.flatMap((p) => p.audienceIds));
  const uncovered = audiences.filter((a) => a.status === "ready" && !covered.has(a._id));
  if (uncovered.length) {
    const names = uncovered.slice(0, 3).map((a) => a.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    steps.push({
      key: "uncovered",
      icon: Users,
      title: uncovered.length === 1 ? `Write a page for ${uncovered[0].name}` : `${uncovered.length} audiences have no page`,
      body: `${list}${uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : ""} ${uncovered.length === 1 ? "is" : "are"} ready to write for.`,
      href: `${base}/new`,
    });
  }

  // The page that converts best, against the brand-wide rate. Needs enough views to mean something.
  if (byPage && pages.length > 1) {
    const rows = pages.map((p) => ({ p, o: byPage.get(p._id) })).filter((r) => r.o && r.o.views >= 50);
    const views = rows.reduce((s, r) => s + r.o!.views, 0);
    const clicks = rows.reduce((s, r) => s + r.o!.ctaClicks, 0);
    const top = rows.sort((a, b) => b.o!.ctaRate - a.o!.ctaRate)[0];
    const avg = views ? clicks / views : 0;
    if (top && avg > 0 && top.o!.ctaRate > avg * 1.15)
      steps.push({
        key: "leader",
        icon: Trophy,
        tone: "good",
        title: `${audienceOf(top.p)} converts best`,
        body: `${top.p.title} turns ${fmt.pct(top.o!.ctaRate)} of views into CTA clicks, against ${fmt.pct(avg)} across all pages in ${range} days.`,
        href: `${base}/analytics?page=${encodeURIComponent(top.p.slug)}`,
      });
  }

  const compiling = audiences.filter((a) => a.status !== "ready" && a.status !== "failed");
  if (compiling.length)
    steps.push({
      key: "compiling",
      icon: Loader2,
      title: `${compiling.length} audience${compiling.length === 1 ? " is" : "s are"} being profiled`,
      body: "Qloo is reading their taste. Pages for them can start once they are ready.",
      href: `${base}/audiences`,
    });
  return steps;
}

function NextSteps({ steps }: { steps: Step[] | undefined }) {
  return (
    <Panel>
      <PanelHeader title="Next steps" hint="What would move this brand forward" />
      {steps === undefined ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : steps.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">All caught up. Every audience has a live page.</p>
      ) : (
        <ul className="divide-y">
          {steps.map((s) => (
            <li key={s.key}>
              <Link href={s.href} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    s.tone === "warn" ? "bg-amber-50 text-amber-700" : s.tone === "good" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-foreground",
                  )}
                >
                  <s.icon className={cn("size-4", s.icon === Loader2 && "animate-spin")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{s.body}</span>
                </span>
                <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* Activity ------------------------------------------------------------------------------ */

type Activity = { key: string; icon: LucideIcon; text: ReactNode; at: number; href: string };

function RecentActivity({ pages, audiences, base }: { pages: PageRow[] | undefined; audiences: Audience[] | undefined; base: string }) {
  const items = useMemo(() => {
    if (!pages || !audiences) return undefined;
    const out: Activity[] = [];
    for (const p of pages) {
      if (p.publishedAt)
        out.push({ key: `pub-${p._id}`, icon: Globe, at: p.publishedAt, href: `${base}/${p.slug}`, text: <><span className="font-medium">{p.title}</span> went live</> });
      out.push({ key: `edit-${p._id}`, icon: PenLine, at: p.updatedAt, href: `${base}/${p.slug}`, text: <><span className="font-medium">{p.title}</span> was edited</> });
    }
    for (const a of audiences)
      out.push({
        key: `aud-${a._id}`,
        icon: KIND_ICON[a.kind] ?? Users,
        at: a.updatedAt,
        href: `${base}/audiences?open=${a._id}`,
        text: a.status === "ready" ? <>Audience <span className="font-medium">{a.name}</span> profiled</> : <>Audience <span className="font-medium">{a.name}</span> updated</>,
      });
    return out.sort((a, b) => b.at - a.at).slice(0, 6);
  }, [pages, audiences, base]);

  return (
    <Panel>
      <PanelHeader title="Recent activity" />
      {items === undefined ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="relative px-4 py-3">
          <span className="absolute top-5 bottom-5 left-[1.6rem] w-px bg-border" aria-hidden />
          {items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="relative flex items-center gap-3 rounded-md py-1.5 text-sm hover:text-foreground">
                <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                  <it.icon className="size-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground [&_.font-medium]:text-foreground">{it.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{relativeTime(it.at)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* Audiences ----------------------------------------------------------------------------- */

function AudienceTiles({ audiences, pages, byPage, base }: { audiences: Audience[] | undefined; pages: PageRow[] | undefined; byPage: Map<string, Overview> | undefined; base: string }) {
  const reach = useMemo(() => {
    const m = new Map<string, { pages: number; visitors: number; views: number; ctaClicks: number }>();
    for (const p of pages ?? [])
      for (const id of p.audienceIds) {
        const r = m.get(id) ?? { pages: 0, visitors: 0, views: 0, ctaClicks: 0 };
        const o = byPage?.get(p._id);
        r.pages += 1;
        r.visitors += o?.visitors ?? 0;
        r.views += o?.views ?? 0;
        r.ctaClicks += o?.ctaClicks ?? 0;
        m.set(id, r);
      }
    return m;
  }, [pages, byPage]);
  const shown = useMemo(
    () => [...(audiences ?? [])].sort((a, b) => (reach.get(b._id)?.visitors ?? -1) - (reach.get(a._id)?.visitors ?? -1)).slice(0, 7),
    [audiences, reach],
  );

  if (audiences === undefined)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {shown.map((a) => {
        const r = reach.get(a._id);
        return (
          <Link
            key={a._id}
            href={`${base}/audiences?open=${a._id}`}
            className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow outline-none hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <TasteCover
              tiles={coverTiles(profileOf(a))}
              icon={KIND_ICON[a.kind] ?? Users}
              kindLabel={AUDIENCE_KIND_LABEL[a.kind] ?? a.kind}
              title={a.name}
              subtitle={audienceSubtitle(a)}
              className="aspect-[16/9]"
            />
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              {r ? (
                <>
                  <span className="truncate">
                    <span className="font-medium tabular-nums">{fmt.int(r.visitors)}</span> <span className="text-muted-foreground">visitors</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.pages} page{r.pages === 1 ? "" : "s"}
                    {r.views > 0 && ` · ${fmt.pct(r.ctaClicks / r.views)} CTA`}
                  </span>
                </>
              ) : a.status === "ready" ? (
                <span className="text-muted-foreground">No page yet</span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Profiling
                </span>
              )}
            </div>
          </Link>
        );
      })}
      <Link
        href={`${base}/audiences?new=1`}
        className="group/new flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-muted transition-colors group-hover/new:bg-background group-hover/new:shadow-sm">
          <UserPlus className="size-5" />
        </span>
        <span className="text-sm font-medium">New audience</span>
        <span className="max-w-52 text-center text-xs">A city, an age group, fans of a brand or your own customers</span>
      </Link>
    </div>
  );
}

/* Screen -------------------------------------------------------------------------------- */

export function BrandOverview() {
  const brand = useBrand();
  const base = `/dashboard/pages/${brand.slug}`;
  const [range, setRange] = useState<Range>(30);
  const w = useWindow(range);
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as PageRow[] | undefined;
  const audiences = useQuery(api.pagesAudiences.list, { brandId: brand._id }) as Audience[] | undefined;
  const overview = useQuery(api.pagesEvents.brandOverview, { brandId: brand._id, days: range }) as Overview[] | undefined;

  const byPage = useMemo(() => (overview ? new Map(overview.map((o) => [o.pageId as string, o])) : undefined), [overview]);
  const daily = useMemo(() => (overview ? { daily: sumDaily(overview.map((o) => o.daily ?? [])) } : undefined), [overview]);
  const prevDaily = useMemo(() => (overview ? { daily: sumDaily(overview.map((o) => o.prevDaily ?? [])) } : undefined), [overview]);
  const steps = pages && audiences ? nextSteps(brand, pages, audiences, byPage, range) : undefined;
  const allDrafts = !!pages?.length && pages.every((p) => p.status !== "published");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-6 py-6">
      <BrandHero brand={brand} pages={pages} audiences={audiences} />

      <section>
        <SectionHeading
          title="Performance"
          description={`Every page combined, last ${range} days${allDrafts ? ". All pages are drafts, so this is test traffic" : ""}.`}
          actions={
            <>
              <Segmented
                value={String(range) as "7" | "14" | "30"}
                onChange={(v) => setRange(Number(v) as Range)}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "14", label: "14 days" },
                  { value: "30", label: "30 days" },
                ]}
              />
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${base}/analytics`} />}>
                <BarChart3 data-icon="inline-start" /> Analytics
              </Button>
            </>
          }
        />
        <MetricOverview stats={daily} prev={prevDaily} range={range} window={w} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <TopPages pages={pages} byPage={byPage} range={range} base={base} />
        <div className="space-y-6">
          <NextSteps steps={steps} />
          <RecentActivity pages={pages} audiences={audiences} base={base} />
        </div>
      </div>

      <section>
        <SectionHeading
          title="Audiences"
          description="Who the pages are written for, with the traffic their pages drew."
          actions={
            <Link href={`${base}/audiences`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All audiences <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <AudienceTiles audiences={audiences} pages={pages} byPage={byPage} base={base} />
      </section>
    </div>
  );
}
