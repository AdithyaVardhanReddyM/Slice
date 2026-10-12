"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { AlertCircle, Fingerprint, Image as ImageIcon, Lock, Palette, PenLine, Quote, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/pages/stream";
import { docOf, insightsOf, isHtmlDoc, type Audience, type InsightRef, type Page, type PageInsights as Insights, type SectionInsight, type Variant } from "@/lib/pages/types";
import { brandDomain, previewUrl } from "@/lib/pages/urls";
import { PageSkeleton } from "@/components/console/primitives";
import { Spinner } from "@/components/console/setup/atoms";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBrand } from "../brand-context";
import { relativeTime } from "../shared";
import { KIND_ICON, TasteCover } from "../taste-cover";
import { EditorTopbar, useAppSurface } from "../builder/editor-shell";
import { AudienceStrip, DeviceToggle, type Device } from "../builder/preview";
import { useSectionOverlay, type OverlaySection } from "./section-overlay";

interface PageBundle {
  page: Page;
  variants: Variant[];
  audiences: Audience[];
}

/** What the panel shows for a section: the agent's insight, else the builder's own note. */
type Row = SectionInsight & { n: number };

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;

/**
 * /dashboard/pages/[brand]/[page]/insights: the page on the left with a box
 * around each section, and on the right why it is built and worded that way
 * for its audience, from Qloo's taste data. Clicking a box or a card moves the
 * other; scrolling the page follows along in the panel.
 */
export function PageInsights() {
  useAppSurface();
  const brand = useBrand();
  const { page: pageSlug } = useParams<{ page: string }>();
  const list = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const listed = list?.find((p) => p.slug === pageSlug);
  const bundle = useQuery(api.pages.get, listed ? { id: listed._id } : "skip") as PageBundle | null | undefined;
  const brandAudiences = useQuery(api.pagesAudiences.list, {
    brandId: brand._id,
  }) as Audience[] | undefined;
  const page = bundle?.page ?? null;
  const version = page && bundle ? (bundle.variants.find((v) => v._id === page.defaultVariantId) ?? bundle.variants[0] ?? null) : null;
  const audiences = useMemo(
    () => (page?.audienceIds ?? []).map((id) => brandAudiences?.find((a) => a._id === id) ?? bundle?.audiences.find((a) => a._id === id)).filter((a): a is Audience => !!a),
    [page, brandAudiences, bundle],
  );
  const doc = docOf(version);
  const html = !!doc && isHtmlDoc(doc);
  const insights = insightsOf(version);
  const stale = !!insights && !!version && insights.version !== version.version;

  // The builder writes the insights as the last step of a build; pages built before that get them reconstructed here.
  const [run, setRun] = useState<{
    status: "running" | "error";
    error?: string;
    for: string;
  } | null>(null);
  const explain = useCallback(async () => {
    if (!version) return;
    const key = `${version._id}:${version.version}`;
    setRun({ status: "running", for: key });
    try {
      const res = await postJson<{ ok: boolean; error?: string }>("/api/pages/insights", { variant_id: version._id });
      if (!res.ok) throw new Error(res.error ?? "Could not write the insights");
      setRun(null);
    } catch (err) {
      setRun({
        status: "error",
        for: key,
        error: String((err as Error).message ?? err).replace(/^Error: /, ""),
      });
    }
  }, [version]);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    // The builder explains its own work as it finishes; this reconstructs it only for pages that have none.
    if (!version || !html || insights) return;
    const key = `${version._id}:${version.version}`;
    if (asked.current === key) return;
    asked.current = key;
    void explain();
  }, [version, html, insights, stale, explain]);

  const rows: Row[] = useMemo(() => {
    if (!doc || !isHtmlDoc(doc)) return [];
    const by = new Map((insights?.sections ?? []).map((s) => [s.id, s]));
    return doc.sections.map((s, i) => {
      const hit = by.get(s.id);
      return hit
        ? { ...hit, n: i + 1 }
        : {
            id: s.id,
            n: i + 1,
            title: s.label || s.id,
            role: "",
            why: s.evidence ?? "",
            wording: [],
            taste: [],
            brand: [],
          };
    });
  }, [doc, insights]);

  const [device, setDevice] = useState<Device>("desktop");
  const [active, setActive] = useState<string | null>(null);
  const [hotQuote, setHotQuote] = useState<string | null>(null);
  const current = active ?? rows[0]?.id ?? null;
  const frame = useRef<HTMLIFrameElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());

  const overlaySections: OverlaySection[] = useMemo(() => rows.map((r) => ({ id: r.id, n: r.n, title: r.title })), [rows]);
  const quotes = useMemo(() => rows.find((r) => r.id === current)?.wording.map((w) => w.quote) ?? [], [rows, current]);

  /** Keep the panel on the card for the section in view. */
  const revealCard = useCallback((id: string) => {
    const el = cards.current.get(id);
    const box = panel.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  }, []);

  const overlay = useSectionOverlay({
    frame,
    sections: overlaySections,
    active: current,
    quotes,
    hotQuote,
    onSelect: (id) => {
      setActive(id);
      revealCard(id);
    },
    onScrollActive: (id) => {
      setActive(id);
      revealCard(id);
    },
  });

  const pick = (id: string) => {
    setActive(id);
    overlay.scrollTo(id);
  };

  // The iframe renders at desktop (or phone) width and is scaled to fit the pane.
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page?._id]);
  const width = device === "mobile" ? MOBILE_WIDTH : DESKTOP_WIDTH;
  const scale = stageSize.w ? Math.min(1, stageSize.w / width) : 1;

  const detach = useRef<() => void>(() => {});
  useEffect(() => () => detach.current(), []);

  if (list === undefined || (listed && bundle === undefined)) return <PageSkeleton />;
  if (!listed || !page || !bundle) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-lg font-semibold">No page called “{pageSlug}”</h1>
        <Link href={`/dashboard/pages/${brand.slug}/pages`} className={buttonVariants({ variant: "outline" })}>
          All pages
        </Link>
      </div>
    );
  }

  const editorHref = `/dashboard/pages/${brand.slug}/${page.slug}`;
  const running = run?.status === "running" && run.for === `${version?._id}:${version?.version}`;

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-background">
      <EditorTopbar
        brand={brand}
        title={
          <Link href={editorHref} className="hover:underline">
            {page.title}
          </Link>
        }
        badge={<span className="text-sm text-muted-foreground">/ Insights</span>}
        actions={
          <>
            <DeviceToggle value={device} onChange={setDevice} />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={editorHref} />}>
              <PenLine data-icon="inline-start" /> Edit page
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] lg:grid-rows-1">
        <section className="flex min-h-0 min-w-0 flex-col bg-muted/40 p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
            <div className="flex h-10 shrink-0 items-center justify-center border-b px-2">
              <span className="flex h-6 max-w-md min-w-0 items-center gap-1.5 rounded-md bg-muted px-3 text-xs text-muted-foreground">
                <Lock className="size-3 shrink-0" />
                <span className="truncate">
                  {brandDomain(brand.slug)}/{page.slug}
                </span>
              </span>
            </div>
            <div ref={stage} className={cn("relative min-h-0 flex-1 overflow-hidden", device === "mobile" && "bg-muted/50")}>
              {!version?.doc ? (
                <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">This page is not built yet.</div>
              ) : stageSize.w > 0 ? (
                <div
                  className={cn("absolute top-0 origin-top-left", device === "mobile" && "top-4 overflow-hidden rounded-[1.75rem] shadow-sm ring-1 ring-foreground/10")}
                  style={{
                    width,
                    height: (stageSize.h - (device === "mobile" ? 32 : 0)) / scale,
                    transform: `scale(${scale})`,
                    left: device === "mobile" ? Math.max(0, (stageSize.w - width * scale) / 2) : 0,
                  }}
                >
                  <iframe
                    ref={frame}
                    key={`${version._id}-${version.version}-${device}`}
                    src={previewUrl(brand.slug, page.slug, version._id)}
                    title={`${page.title} preview`}
                    className="size-full border-0 bg-background"
                    onLoad={() => {
                      detach.current();
                      detach.current = overlay.attach();
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside ref={panel} className="scrollbar-thin relative min-h-0 overflow-y-auto overscroll-contain border-t lg:border-t-0 lg:border-l">
          {!version?.doc ? (
            <EmptyPanel title="Nothing to explain yet" body="Build the page in the editor; the reasoning behind it appears here." href={editorHref} />
          ) : !html ? (
            <EmptyPanel
              title="Rebuild to see insights"
              body="This page was made by the earlier section builder. Rebuild it in the editor to get a section by section explanation."
              href={editorHref}
            />
          ) : !insights ? (
            run?.status === "error" ? (
              <ErrorPanel message={run.error} onRetry={explain} />
            ) : (
              <LoadingPanel audiences={audiences} />
            )
          ) : (
            <div className="space-y-8 p-5 pb-16">
              <Overview
                insights={insights}
                audiences={audiences}
                stale={stale}
                running={running}
                error={run?.status === "error" ? run.error : undefined}
                onRefresh={() => void explain()}
              />
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">Section by section</h2>
                  <span className="text-xs text-muted-foreground">Click a box on the page or a card here</span>
                </div>
                <ol className="space-y-3">
                  {rows.map((r) => (
                    <SectionCard
                      key={r.id}
                      row={r}
                      active={r.id === current}
                      onPick={() => pick(r.id)}
                      onQuote={setHotQuote}
                      cardRef={(el) => {
                        if (el) cards.current.set(r.id, el);
                        else cards.current.delete(r.id);
                      }}
                    />
                  ))}
                </ol>
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* Panel parts ---------------------------------------------------------------- */

function Overview({
  insights,
  audiences,
  stale,
  running,
  error,
  onRefresh,
}: {
  insights: Insights;
  audiences: Audience[];
  stale: boolean;
  running: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  // The cover is made of what these people love, from the references the explanation cites.
  // A page for everyone has few audience pictures: the brand's own homepage photos stand in.
  const brand = useBrand();
  const tiles = useMemo(() => {
    const seen = new Set<string>();
    const all = [...insights.traits.flatMap((t) => t.refs), ...insights.sections.flatMap((s) => s.taste)];
    const taste = all.filter((r) => r.image && !seen.has(r.name) && seen.add(r.name)).map((r) => ({ key: r.name, name: r.name, image: r.image }));
    const site = (brand.site?.images ?? []).map((p) => ({ key: p.src, name: p.alt ?? "", image: p.src }));
    return (taste.length >= 3 ? taste : [...taste, ...site]).slice(0, 5);
  }, [insights, brand.site]);
  const label = audiences.length ? audiences.map((a) => a.name).join(" + ") : "Everyone";
  const icon = audiences.length === 1 ? (KIND_ICON[audiences[0].kind] ?? KIND_ICON.default) : KIND_ICON.default;

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{running
              ? "Updating…"
              : stale
                ? "The page changed since this was written"
                : `${insights.source === "builder" ? "Written by the builder" : "Written after the build"} ${relativeTime(insights.at)}`}</span>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Write again" onClick={onRefresh} disabled={running} />}>
              {running ? <Spinner className="size-3.5" /> : <RotateCcw />}
            </TooltipTrigger>
            <TooltipContent>Read the page again</TooltipContent>
          </Tooltip>
        </div>
        <h1 className="text-xl leading-snug font-semibold tracking-tight text-balance">{insights.headline}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{insights.summary}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <TasteCover
          tiles={tiles}
          icon={icon}
          kindLabel={audiences.length > 1 ? "Combined audience" : audiences.length ? "Audience" : "Everyone"}
          title={label}
          subtitle={audiences.length ? "What Qloo knows they love" : "Read from the brand's own taste"}
          className="aspect-[16/7]"
        />
        <div className="space-y-4 p-4">
          <p className="text-sm leading-6">{insights.portrait}</p>
          <ul className="space-y-3.5">
            {insights.traits.map((t) => (
              <li key={t.label} className="flex gap-3">
                <RefStack refs={t.refs} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                  <p className="text-[13px] leading-5 text-muted-foreground">{t.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function SectionCard({
  row,
  active,
  onPick,
  onQuote,
  cardRef,
}: {
  row: Row;
  active: boolean;
  onPick: () => void;
  onQuote: (q: string | null) => void;
  cardRef: (el: HTMLLIElement | null) => void;
}) {
  return (
    <li
      ref={cardRef}
      className={cn(
        "group rounded-xl border bg-card transition-[border-color,box-shadow] duration-200",
        active ? "border-primary/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_10%,transparent)]" : "hover:border-foreground/20",
      )}
    >
      <button type="button" onClick={onPick} className="flex w-full items-start gap-3 p-4 pb-0 text-left">
        <span
          className={cn(
            "num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground",
          )}
        >
          {row.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{row.title}</span>
          {row.role && <span className="block text-[13px] leading-5 text-muted-foreground">{row.role}</span>}
        </span>
        {!active && row.taste.length > 0 && (
          <span className="flex shrink-0 -space-x-2 pt-0.5" aria-hidden>
            {row.taste.slice(0, 3).map((t) => (
              <RefAvatar key={t.name} r={t} className="size-6 rounded-full" />
            ))}
          </span>
        )}
      </button>
      {/* Only the section in focus opens up; the rest stay a one-line summary. */}
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", active ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 p-4 pl-13">
            {row.why && <p className="text-sm leading-6">{row.why}</p>}

            {row.wording.length > 0 && (
              <Block icon={Quote} label="The wording">
                <ul className="space-y-2.5">
                  {row.wording.map((w) => (
                    <li
                      key={w.quote}
                      onMouseEnter={() => {
                        if (!active) onPick();
                        onQuote(w.quote);
                      }}
                      onMouseLeave={() => onQuote(null)}
                      className="cursor-default border-l-2 border-primary/30 pl-3 transition-colors hover:border-primary"
                    >
                      <p className="text-sm font-medium">“{w.quote}”</p>
                      <p className="text-[13px] leading-5 text-muted-foreground">{w.why}</p>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {row.taste.length > 0 && (
              <Block icon={Fingerprint} label="Taste behind it">
                <ul className="space-y-2">
                  {row.taste.map((t) => (
                    <li key={t.name} className="flex items-start gap-2.5">
                      <RefAvatar r={t} className="size-8" />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-sm font-medium">{t.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{t.kind}</span>
                        </div>
                        {t.why && <p className="text-[13px] leading-5 text-muted-foreground">{t.why}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {row.brand.length > 0 && (
              <Block icon={Palette} label="From the brand's site">
                <ul className="space-y-1">
                  {row.brand.map((b) => (
                    <li key={b} className="text-[13px] leading-5 text-muted-foreground">
                      {b}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {row.imagery && (
              <Block icon={ImageIcon} label="The pictures">
                <p className="text-[13px] leading-5 text-muted-foreground">{row.imagery}</p>
              </Block>
            )}
          </div>
        </div>
      </div>
      {!active && <div className="h-4" />}
    </li>
  );
}

function Block({ icon: Icon, label, children }: { icon: typeof Quote; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

function RefAvatar({ r, className }: { r: InsightRef; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-800 text-[10px] font-semibold text-white/80 ring-2 ring-card", className)}>
      {r.image && !broken ? (
        // Qloo images come from many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        r.name.slice(0, 2)
      )}
    </span>
  );
}

function RefStack({ refs }: { refs: InsightRef[] }) {
  if (refs.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-3 pt-0.5">
      {refs.slice(0, 3).map((r) => (
        <Tooltip key={r.name}>
          <TooltipTrigger render={<span />}>
            <RefAvatar r={r} className="size-9 rounded-lg" />
          </TooltipTrigger>
          <TooltipContent>
            {r.name} · {r.kind}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

function LoadingPanel({ audiences }: { audiences: Audience[] }) {
  const steps = ["Reading the page section by section", "Matching each choice to Qloo's taste data", "Writing it up in plain words"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 8000);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="space-y-6 p-5">
      <AudienceStrip audiences={audiences} working />
      <div className="space-y-2">
        <p className="pg-shimmer text-sm font-medium">{steps[i]}</p>
        <p className="text-sm text-muted-foreground">Explaining why the page is built and worded the way it is. This takes about half a minute.</p>
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((k) => (
          <div key={k} className="space-y-2.5 rounded-xl border p-4">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertCircle className="size-4 text-destructive" /> Could not explain this page
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function EmptyPanel({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <div className="flex flex-col items-start gap-2 p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href={href} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-1")}>
        <PenLine data-icon="inline-start" /> Open the editor
      </Link>
    </div>
  );
}
