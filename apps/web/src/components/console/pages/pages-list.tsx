"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Check,
  ExternalLink,
  Eye,
  Globe,
  LayoutGrid,
  Link2,
  List,
  ListFilter,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { GOALS, kitOf, profileOf, type Audience, type Brand, type Page } from "@/lib/pages/types";
import { previewUrl, publicPageUrl } from "@/lib/pages/urls";
import { Skeleton } from "@/components/console/primitives";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/console/setup/atoms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBrand } from "./brand-context";
import { relativeTime } from "./shared";
import { KIND_ICON, coverTiles } from "./taste-cover";

type VariantRow = {
  _id: Id<"pagesVariants">;
  name: string;
  status: string;
  audienceId?: Id<"pagesAudiences">;
  version: number;
  screenshot?: string;
  updatedAt: number;
};
type PageRow = Page & { variantCount?: number; readyCount?: number; variants?: VariantRow[]; audiences?: Audience[] };
type Stats = { pageId: Id<"pages">; views: number; visitors: number; ctaRate: number; formSubmits: number; avgEngagedMs: number };

type View = "grid" | "list";
type StatusFilter = "all" | "published" | "draft";
type Sort = "updated" | "visitors" | "name";

const STATS_DAYS = 30;
const VIEW_KEY = "slice:pages:view";

/* Helpers --------------------------------------------------------------------- */

/** Default version first, then audiences in the order the page lists them. */
function orderedVariants(page: PageRow): VariantRow[] {
  const vs = page.variants ?? [];
  const rank = (v: VariantRow) =>
    v._id === page.defaultVariantId || !v.audienceId ? -1 : page.audienceIds.findIndex((a) => a === v.audienceId);
  return [...vs].sort((a, b) => rank(a) - rank(b));
}

const versionName = (v: VariantRow, audiences: Audience[]) =>
  v.audienceId ? (audiences.find((a) => a._id === v.audienceId)?.name ?? v.name) : "Everyone";

const goalLabel = (goal: string) => GOALS.find((g) => g.value === goal)?.label ?? goal;

function engaged(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* Thumbnail ------------------------------------------------------------------- */

/** The page itself at 1440px, scaled into its box: used until the builder has screenshotted it. */
export function LiveThumb({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 0, height: 0 });
  const [loaded, setLoaded] = useState(false);
  const { scale } = size;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ scale: e.contentRect.width / 1440, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
        <iframe
          src={src}
          title=""
          aria-hidden
          tabIndex={-1}
          loading="lazy"
          scrolling="no"
          onLoad={() => setLoaded(true)}
          className={cn("pointer-events-none origin-top-left border-0 transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
          style={{ width: 1440, height: size.height / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

/** What a page looks like: its screenshot (scrolls on hover), a live render, or the brand's colours while unbuilt. */
function PageThumb({
  brand,
  page,
  variant,
  building,
  className,
  compact,
}: {
  brand: Brand;
  page: PageRow;
  variant?: VariantRow;
  building: boolean;
  className?: string;
  compact?: boolean;
}) {
  const kit = kitOf(brand);
  const [broken, setBroken] = useState(false);
  let body: ReactNode;
  if (variant?.screenshot && !broken) {
    body = (
      // Convex storage URLs; next/image would need the deployment allow-listed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={variant.screenshot}
        src={variant.screenshot}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn(
          "absolute inset-0 size-full object-cover object-top",
          !compact && "transition-[object-position] duration-[6s] ease-in-out group-hover/card:object-bottom",
        )}
      />
    );
  } else if (variant?.status === "ready") {
    body = <LiveThumb key={variant._id} src={previewUrl(brand.slug, page.slug, variant._id)} />;
  } else {
    body = (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
        style={{ background: kit?.colors.background, color: kit?.colors.foreground }}
      >
        {building ? (
          <>
            <Spinner className={compact ? "size-3.5" : "size-5"} />
            {!compact && <span className="text-sm opacity-70">Writing this version</span>}
          </>
        ) : compact ? (
          <PenLine className="size-3.5 opacity-50" />
        ) : (
          <>
            <span className="line-clamp-2 max-w-[80%] text-xl font-semibold tracking-tight" style={{ fontFamily: kit?.fonts.heading.family }}>
              {page.title}
            </span>
            <span className="text-sm opacity-60">{variant?.status === "failed" ? "The last build failed" : "Not built yet"}</span>
          </>
        )}
      </div>
    );
  }
  return <div className={cn("relative overflow-hidden bg-muted", className)}>{body}</div>;
}

function StatusPill({ status }: { status: string }) {
  const live = status === "published";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium shadow-sm ring-1 backdrop-blur-md",
        live ? "bg-emerald-600/90 text-white ring-emerald-700/20" : "bg-background/85 text-foreground ring-foreground/10",
      )}
    >
      {live ? <Globe className="size-3" /> : <PenLine className="size-3" />}
      {live ? "Live" : "Draft"}
    </span>
  );
}

/* Versions -------------------------------------------------------------------- */

/** A version's face: the audience's top Qloo pick, its kind icon, or the globe for everyone. */
function VersionFace({ variant, audience, className }: { variant: VariantRow; audience?: Audience; className?: string }) {
  const [broken, setBroken] = useState(false);
  const base = cn("flex size-full items-center justify-center overflow-hidden", className);
  if (!variant.audienceId) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Globe className="size-3.5" />
      </span>
    );
  }
  const image = coverTiles(profileOf(audience), 1)[0]?.image;
  const Icon = (audience && KIND_ICON[audience.kind]) || Users;
  return (
    <span className={cn(base, "bg-neutral-800 text-white/80")}>
      {image && !broken ? (
        // Qloo images come from many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className="size-3" />
      )}
    </span>
  );
}

/** One button per version; hovering one shows that version in the card's thumbnail. */
function VersionPicker({
  variants,
  audiences,
  activeId,
  onActive,
}: {
  variants: VariantRow[];
  audiences: Audience[];
  activeId?: string;
  onActive: (id: Id<"pagesVariants">) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {variants.map((v) => {
        const active = v._id === activeId;
        return (
          <Tooltip key={v._id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Show the ${versionName(v, audiences)} version`}
                  aria-pressed={active}
                  onMouseEnter={() => onActive(v._id)}
                  onFocus={() => onActive(v._id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActive(v._id);
                  }}
                  className={cn(
                    "size-7 shrink-0 overflow-hidden rounded-md ring-offset-2 ring-offset-card transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100",
                    v.status !== "ready" && "grayscale",
                  )}
                />
              }
            >
              <VersionFace variant={v} audience={audiences.find((a) => a._id === v.audienceId)} />
            </TooltipTrigger>
            <TooltipContent>
              {versionName(v, audiences)}
              {v.status === "building" ? " (building)" : v.status === "failed" ? " (failed)" : v.status !== "ready" ? " (not built)" : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Overlapping faces for the table. */
function VersionStack({ variants, audiences }: { variants: VariantRow[]; audiences: Audience[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex -space-x-1.5">
        {variants.slice(0, 4).map((v) => (
          <span key={v._id} className="size-6 overflow-hidden rounded-md ring-2 ring-background">
            <VersionFace variant={v} audience={audiences.find((a) => a._id === v.audienceId)} />
          </span>
        ))}
      </span>
      {variants.length > 4 && <span className="text-xs text-muted-foreground">+{variants.length - 4}</span>}
    </div>
  );
}

/* Actions --------------------------------------------------------------------- */

function PageMenu({ page, brand, editHref, variant, className }: { page: PageRow; brand: Brand; editHref: string; variant?: VariantRow; className?: string }) {
  const router = useRouter();
  const remove = useMutation(api.pages.remove);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const live = page.status === "published";
  const url = publicPageUrl(brand.slug, page.slug);
  return (
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${page.title}`} className="text-muted-foreground data-popup-open:bg-muted" />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => router.push(editHref)}>
            <PenLine /> Open in editor
          </DropdownMenuItem>
          {live ? (
            <DropdownMenuItem onClick={() => window.open(url, "_blank", "noopener")}>
              <ExternalLink /> View live page
            </DropdownMenuItem>
          ) : (
            variant?.status === "ready" && (
              <DropdownMenuItem onClick={() => window.open(previewUrl(brand.slug, page.slug, variant._id), "_blank", "noopener")}>
                <Eye /> Preview
              </DropdownMenuItem>
            )
          )}
          {live && (
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check /> : <Link2 />} {copied ? "Copied" : "Copy link"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`/dashboard/pages/${brand.slug}/analytics?page=${page.slug}`)}>
            <BarChart3 /> Analytics
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${page.title}?`}
        description={`Every version, the builder chat and the page's analytics go with it${live ? ", and the live link stops working" : ""}. This cannot be undone.`}
        actionLabel="Delete page"
        onConfirm={() => void remove({ id: page._id })}
      />
    </div>
  );
}

/* Grid ------------------------------------------------------------------------ */

function StatCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <div className="num truncate text-sm font-semibold">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function PageCard({ page, brand, stats, base }: { page: PageRow; brand: Brand; stats?: Stats | null; base: string }) {
  const router = useRouter();
  const variants = useMemo(() => orderedVariants(page), [page]);
  const audiences = page.audiences ?? [];
  const [activeId, setActiveId] = useState<string | undefined>();
  const active = variants.find((v) => v._id === activeId) ?? variants[0];
  const building = variants.some((v) => v.status === "building");
  const href = `${base}/${page.slug}`;
  const ready = page.readyCount ?? variants.filter((v) => v.status === "ready").length;
  const hasData = !!stats && stats.views > 0;
  const dash = <span className="text-muted-foreground">–</span>;

  return (
    <div
      role="link"
      tabIndex={-1}
      onClick={() => router.push(href)}
      className="group/card flex cursor-pointer flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-foreground/5"
    >
      <div className="relative">
        <PageThumb
          brand={brand}
          page={page}
          variant={active}
          building={active?.status === "building"}
          className="aspect-[16/10] border-b"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
          <StatusPill status={page.status} />
          {building && (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-background/85 px-2 text-xs font-medium shadow-sm ring-1 ring-foreground/10 backdrop-blur-md">
              <Spinner className="size-3" /> Building
            </span>
          )}
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 justify-center pb-3 opacity-0 transition-all duration-200 group-hover/card:translate-y-0 group-hover/card:opacity-100">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-medium text-background shadow-lg">
            <PenLine className="size-3" /> Open in editor
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate font-medium outline-none hover:underline focus-visible:underline">
              {page.title}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {goalLabel(page.brief.goal)}, edited {relativeTime(page.updatedAt)}
            </p>
          </div>
          <PageMenu page={page} brand={brand} editHref={href} variant={active} className="-mt-1 -mr-2" />
        </div>

        {active && (
          <div className="flex min-w-0 items-center gap-2.5">
            {variants.length > 1 ? (
              <VersionPicker variants={variants} audiences={audiences} activeId={active._id} onActive={setActiveId} />
            ) : (
              <span className="size-7 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/10">
                <VersionFace variant={active} audience={audiences.find((a) => a._id === active.audienceId)} />
              </span>
            )}
            <div className="min-w-0 text-sm leading-tight">
              <div className="truncate">
                <span className="text-muted-foreground">For </span>
                <span className="font-medium">{versionName(active, audiences)}</span>
              </div>
              {variants.length > 1 && (
                <div className="truncate text-xs text-muted-foreground">
                  {ready < variants.length ? `${ready} of ${variants.length} versions built` : `${variants.length} versions`}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto grid grid-cols-4 divide-x border-t pt-3.5">
          <StatCell label="Visitors" value={stats === undefined ? <Skeleton className="h-5 w-8" /> : hasData ? fmt.compact(stats!.visitors) : dash} />
          <StatCell label="CTA rate" value={stats === undefined ? <Skeleton className="h-5 w-8" /> : hasData ? fmt.pct(stats!.ctaRate, 1) : dash} />
          <StatCell label="Leads" value={stats === undefined ? <Skeleton className="h-5 w-8" /> : hasData ? fmt.int(stats!.formSubmits) : dash} />
          <StatCell label="Avg. time" value={stats === undefined ? <Skeleton className="h-5 w-8" /> : hasData ? engaged(stats!.avgEngagedMs) : dash} />
        </div>
      </div>
    </div>
  );
}

/* List ------------------------------------------------------------------------ */

function PagesTable({ pages, brand, stats, base }: { pages: PageRow[]; brand: Brand; stats?: Map<string, Stats>; base: string }) {
  const router = useRouter();
  const metric = (p: PageRow, f: (s: Stats) => string) => {
    if (!stats) return <Skeleton className="ml-auto h-4 w-8" />;
    const s = stats.get(p._id);
    return s && s.views > 0 ? f(s) : <span className="text-muted-foreground">–</span>;
  };
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Page</TableHead>
            <TableHead>For</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Visitors</TableHead>
            <TableHead className="text-right">CTA rate</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead>Edited</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((p) => {
            const variants = orderedVariants(p);
            const href = `${base}/${p.slug}`;
            return (
              <TableRow key={p._id} className="group/card cursor-pointer" onClick={() => router.push(href)}>
                <TableCell className="py-2.5 pl-4">
                  <div className="flex items-center gap-3">
                    <PageThumb
                      brand={brand}
                      page={p}
                      variant={variants[0]}
                      building={variants[0]?.status === "building"}
                      compact
                      className="aspect-[16/10] w-20 shrink-0 rounded-md ring-1 ring-foreground/10"
                    />
                    <div className="min-w-0">
                      <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                        {p.title}
                      </Link>
                      <div className="flex gap-x-3 text-xs text-muted-foreground">
                        <span className="shrink-0">{goalLabel(p.brief.goal)}</span>
                        <span className="truncate">/{p.slug}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-56 items-center gap-2">
                    <VersionStack variants={variants} audiences={p.audiences ?? []} />
                    {variants.length === 1 && <span className="truncate text-sm">{versionName(variants[0], p.audiences ?? [])}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center gap-1.5 text-sm", p.status === "published" ? "text-emerald-700" : "text-muted-foreground")}>
                    {p.status === "published" ? <Globe className="size-3.5" /> : <PenLine className="size-3.5" />}
                    {p.status === "published" ? "Live" : "Draft"}
                  </span>
                </TableCell>
                <TableCell className="num text-right">{metric(p, (s) => fmt.compact(s.visitors))}</TableCell>
                <TableCell className="num text-right">{metric(p, (s) => fmt.pct(s.ctaRate, 1))}</TableCell>
                <TableCell className="num text-right">{metric(p, (s) => fmt.int(s.formSubmits))}</TableCell>
                <TableCell className="text-muted-foreground">{relativeTime(p.updatedAt)}</TableCell>
                <TableCell className="pr-3">
                  <PageMenu page={p} brand={brand} editHref={href} variant={variants[0]} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* Empty ----------------------------------------------------------------------- */

function NoPages({ onNew, disabled }: { onNew: () => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-14 text-center">
      <div className="relative mb-8 aspect-[522/336] w-full max-w-sm overflow-hidden rounded-xl shadow-xl ring-1 ring-foreground/10">
        <Image src="/illustrations/page-card.svg" alt="" fill priority sizes="384px" className="object-cover" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No pages yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Describe the page in a sentence or two and say who it is for. The builder sets it up, writes it for that audience and
        reviews it against the brand&apos;s own site.
      </p>
      <Button className="mt-6" onClick={onNew} disabled={disabled}>
        <Plus data-icon="inline-start" /> New page
      </Button>
    </div>
  );
}

/* Screen ---------------------------------------------------------------------- */

const STATUS_LABEL: Record<StatusFilter, string> = { all: "All pages", published: "Live", draft: "Drafts" };
const SORT_LABEL: Record<Sort, string> = { updated: "Last edited", visitors: "Most visitors", name: "Name" };

export function PagesScreen() {
  const brand = useBrand();
  const router = useRouter();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as PageRow[] | undefined;
  const overview = useQuery(api.pagesEvents.brandOverview, { brandId: brand._id, days: STATS_DAYS }) as Stats[] | undefined;
  const base = `/dashboard/pages/${brand.slug}`;
  const canCreate = brand.status === "ready" || brand.status === "review";
  const newPage = () => router.push(`${base}/new`);

  const [view, setView] = useState<View>("grid");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {}
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const stats = useMemo(() => (overview ? new Map(overview.map((s) => [s.pageId as string, s])) : undefined), [overview]);
  const shown = useMemo(() => {
    if (!pages) return [];
    const needle = q.trim().toLowerCase();
    const out = pages.filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (!needle || p.title.toLowerCase().includes(needle) || p.slug.includes(needle) || p.brief.prompt.toLowerCase().includes(needle)),
    );
    if (sort === "name") out.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "visitors") out.sort((a, b) => (stats?.get(b._id)?.visitors ?? 0) - (stats?.get(a._id)?.visitors ?? 0));
    else out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }, [pages, q, status, sort, stats]);

  const live = pages?.filter((p) => p.status === "published").length ?? 0;
  const filtered = status !== "all" || sort !== "updated";

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Pages {pages && pages.length > 0 && <span className="font-normal text-muted-foreground">{pages.length}</span>}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {pages && pages.length > 0
              ? `${live} live, ${pages.length - live} in draft. Each page is written for its audience; figures cover the last ${STATS_DAYS} days.`
              : "Each page is written for one audience, a few combined, or everyone, and published on the brand's subdomain."}
          </p>
        </div>
        <Button onClick={newPage} disabled={!canCreate}>
          <Plus data-icon="inline-start" /> New page
        </Button>
      </div>

      {pages === undefined ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[22rem] rounded-xl" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <NoPages onNew={newPage} disabled={!canCreate} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Layout">
              {(
                [
                  ["grid", LayoutGrid, "Grid"],
                  ["list", List, "List"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={label}
                  onClick={() => pickView(v)}
                  className={cn(
                    "flex h-7 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className={cn(filtered && "border-foreground/30")} />}>
                <ListFilter data-icon="inline-start" />
                {status === "all" ? "Filter" : STATUS_LABEL[status]}
                {sort !== "updated" && <span className="ml-1 text-muted-foreground">{SORT_LABEL[sort]}</span>}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
                      <DropdownMenuRadioItem key={k} value={k}>
                        {STATUS_LABEL[k]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as Sort)}>
                    {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
                      <DropdownMenuRadioItem key={k} value={k}>
                        {SORT_LABEL[k]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative ml-auto w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" className="h-8 pl-8" aria-label="Search pages" />
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
              <div className="text-sm font-medium">No pages match</div>
              <p className="text-sm text-muted-foreground">Try another search or clear the filter.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                }}
              >
                Clear
              </Button>
            </div>
          ) : view === "grid" ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <PageCard key={p._id} page={p} brand={brand} base={base} stats={stats ? (stats.get(p._id) ?? null) : undefined} />
              ))}
              {canCreate && status !== "published" && !q && (
                <button
                  type="button"
                  onClick={newPage}
                  className="group/new flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted transition-colors group-hover/new:bg-background group-hover/new:shadow-sm">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-sm font-medium">New page</span>
                </button>
              )}
            </div>
          ) : (
            <PagesTable pages={shown} brand={brand} base={base} stats={stats} />
          )}
        </>
      )}
    </div>
  );
}
