"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LayoutTemplate, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import {
  AUDIENCE_KIND_LABEL,
  type AudienceProfile,
  type Brand,
} from "@/lib/pages/types";
import { Skeleton } from "@/components/console/primitives";
import { BrandGlyph } from "@/components/console/pages/brand-shell";
import {
  KIND_ICON,
  TasteCover,
  coverTiles,
} from "@/components/console/pages/taste-cover";
import { RemoteImage, SectionHeader, Tile, TileHeader } from "./ui";

type Summary = NonNullable<FunctionReturnType<typeof api.pagesHome.summary>>;
type BrandRow = Summary["brands"][number];
type PageRow = Summary["pages"][number];

/* Brands ------------------------------------------------------------------------------------ */

/** Up to three homepage captures fanned out over a wash of the brands' own colours. */
function CaptureFan({ brands }: { brands: BrandRow[] }) {
  const shown = brands.filter((b) => b.shot).slice(0, 3);
  const colors = brands
    .map((b) => b.kit?.colors.primary)
    .filter(Boolean) as string[];
  const [a = "#fdba74", b = a] = colors;
  const layouts =
    shown.length === 1
      ? ["left-[12%] top-[14%] w-[76%] rotate-0"]
      : shown.length === 2
        ? [
            "left-[6%] top-[20%] w-[60%] -rotate-[5deg]",
            "right-[6%] top-[12%] w-[60%] rotate-[4deg]",
          ]
        : [
            "left-[3%] top-[24%] w-[52%] -rotate-[7deg]",
            "left-[24%] top-[10%] w-[52%] z-10",
            "right-[3%] top-[24%] w-[52%] rotate-[7deg]",
          ];
  return (
    <div
      className="relative h-52 overflow-hidden border-y border-black/[0.04]"
      style={{
        background: `radial-gradient(80% 90% at 0% 0%, color-mix(in oklab, ${a} 30%, white), transparent 70%), radial-gradient(80% 90% at 100% 100%, color-mix(in oklab, ${b} 30%, white), transparent 70%), #f7f6f3`,
      }}
    >
      {shown.map((brand, i) => (
        <Link
          key={brand._id}
          href={`/dashboard/pages/${brand.slug}`}
          aria-label={brand.name}
          className={cn(
            "absolute aspect-[16/10] overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition-transform duration-500 hover:z-20 hover:-translate-y-1.5 hover:rotate-0",
            layouts[i],
          )}
        >
          <RemoteImage
            src={brand.shot}
            alt={`${brand.name} homepage`}
            className="size-full object-cover object-top"
          />
        </Link>
      ))}
      {shown.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LayoutTemplate className="size-10 text-black/15" />
        </div>
      )}
    </div>
  );
}

function BrandsCard({
  data,
  days,
  delay,
  className,
}: {
  data: Summary;
  days: number;
  delay?: number;
  className?: string;
}) {
  return (
    <Tile delay={delay} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Brands"
        hint="Each with its own kit, audiences and pages"
        className="pb-5"
      />
      <CaptureFan brands={data.brands} />
      <ul className="flex-1 divide-y divide-black/[0.05] px-6 py-1">
        {data.brands.slice(0, 4).map((b) => (
          <li key={b._id}>
            <Link
              href={`/dashboard/pages/${b.slug}`}
              className="group flex items-center gap-3 py-3"
            >
              {/* BrandGlyph reads only the kit's icon, logo and colours, and the URL. */}
              <BrandGlyph brand={b as unknown as Brand} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-neutral-950 group-hover:underline">
                    {b.name}
                  </span>
                  {b.demo && (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[11px] font-medium text-neutral-600">
                      Demo
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {b.live} live of {b.pages} pages · {b.audiences} audiences
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="num block text-sm font-semibold text-neutral-950">
                  {fmt.compact(b.visitors)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  visitors, {days}d
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

/* Latest pages ------------------------------------------------------------------------------ */

function PageCard({ page, brand }: { page: PageRow; brand?: BrandRow }) {
  const live = page.status === "published";
  const AudienceIcon =
    KIND_ICON[page.audience?.kind ?? "default"] ?? KIND_ICON.default;
  const colors = brand?.kit?.colors;
  return (
    <Link
      href={`/dashboard/pages/${page.brandSlug}/${page.slug}`}
      className="group flex min-w-0 flex-col"
    >
      <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/[0.06]">
        <RemoteImage
          src={page.screenshot}
          alt={page.title}
          // A full-page capture: hovering pans from the hero down to the footer.
          className="size-full object-cover object-top transition-[object-position] duration-[4s] ease-in-out group-hover:object-bottom"
          fallback={
            <span
              className="flex size-full items-end p-4 text-lg leading-tight font-semibold"
              style={{
                background: colors?.background ?? "#f5f5f4",
                color: colors?.foreground ?? "#171717",
              }}
            >
              {page.title}
            </span>
          }
        />
        <span
          className={cn(
            "absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur",
            live
              ? "bg-emerald-50/95 text-emerald-700"
              : "bg-white/90 text-neutral-600",
          )}
        >
          {live ? "Live" : page.building ? "Building" : "Draft"}
        </span>
      </span>
      <span className="mt-3 flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-white ring-2 ring-white">
          <RemoteImage
            src={page.audience?.image}
            className="size-full object-cover"
            fallback={<AudienceIcon className="size-3.5" />}
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-neutral-950">
            {page.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {page.audience ? `For ${page.audience.name}` : "For everyone"} ·{" "}
            {page.brandName}
          </span>
        </span>
      </span>
    </Link>
  );
}

function LatestPages({
  data,
  delay,
  className,
}: {
  data: Summary;
  delay?: number;
  className?: string;
}) {
  const pages = data.pages.slice(0, 3);
  return (
    <Tile delay={delay} className={cn("flex flex-col", className)}>
      <TileHeader
        title="Latest pages"
        hint="One page per audience, written and checked by the builder"
      />
      {pages.length ? (
        <div className="grid flex-1 gap-5 p-6 pt-5 sm:grid-cols-3">
          {pages.map((p) => (
            <PageCard
              key={p._id}
              page={p}
              brand={data.brands.find((b) => b.slug === p.brandSlug)}
            />
          ))}
        </div>
      ) : (
        <div className="m-6 mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 p-10 text-center">
          <p className="text-sm font-medium">No pages yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add a brand and the builder writes a page for each audience you
            define.
          </p>
          <Link
            href="/dashboard/pages/new"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
          >
            <Plus className="size-4" /> Add a brand
          </Link>
        </div>
      )}
    </Tile>
  );
}

/* Audiences --------------------------------------------------------------------------------- */

function AudienceStrip({
  data,
  delay,
  className,
}: {
  data: Summary;
  delay?: number;
  className?: string;
}) {
  const audiences = data.audiences.slice(0, 4);
  if (!audiences.length) return null;
  return (
    <Tile delay={delay} className={className}>
      <TileHeader
        title="Audiences"
        hint="Who your pages speak to: taste profiles from Qloo, across your brands"
      />
      <div className="grid gap-4 p-6 pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {audiences.map((a) => (
          <Link
            key={a._id}
            href={`/dashboard/pages/${a.brandSlug}/audiences?open=${a._id}`}
            className="group block overflow-hidden rounded-2xl"
          >
            <TasteCover
              tiles={coverTiles(a.profile as unknown as AudienceProfile)}
              icon={KIND_ICON[a.kind] ?? KIND_ICON.default}
              kindLabel={AUDIENCE_KIND_LABEL[a.kind] ?? a.kind}
              title={a.name}
              subtitle={a.brandName}
              className="rounded-2xl"
            />
          </Link>
        ))}
      </div>
    </Tile>
  );
}

/* Section ----------------------------------------------------------------------------------- */

export function PagesSection({
  days,
  className,
}: {
  days: number;
  className?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(
    api.pagesHome.summary,
    isAuthenticated ? { days } : "skip",
  );
  // Every account gets its own copy of the demo brands; the home may be the first screen it opens.
  const provision = useMutation(api.pagesDemo.provision);
  useEffect(() => {
    if (!isAuthenticated) return;
    provision({}).catch((err) =>
      console.error("Could not add the demo brands", err),
    );
  }, [isAuthenticated, provision]);

  const meta = data
    ? `${data.brands.length} ${data.brands.length === 1 ? "brand" : "brands"} · ${data.liveCount} live ${data.liveCount === 1 ? "page" : "pages"} · ${fmt.int(data.total.visitors)} visitors`
    : undefined;

  return (
    <section className={cn("space-y-5", className)}>
      <SectionHeader
        icon={LayoutTemplate}
        title="Pages"
        meta={meta}
        href="/dashboard/pages"
        linkLabel="Open Pages"
      />
      {!data ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-[30rem] rounded-3xl lg:col-span-4" />
          <Skeleton className="h-[30rem] rounded-3xl lg:col-span-8" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <BrandsCard
            data={data}
            days={days}
            delay={60}
            className="lg:col-span-4"
          />
          <LatestPages data={data} delay={120} className="lg:col-span-8" />
          <AudienceStrip data={data} delay={180} className="lg:col-span-12" />
        </div>
      )}
    </section>
  );
}
