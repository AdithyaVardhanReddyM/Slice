"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import type { Brand } from "@/lib/pages/types";
import { brandDomain, faviconOf, hostOf } from "@/lib/pages/urls";
import { PageHeader, Skeleton } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";
import { BrowserFrame } from "./browser-frame";
import { StatusBadge } from "./shared";

/** The card artwork: the brand's domain in the address bar, its logo on the hero block. */
function BrandPreview({ brand }: { brand: Brand }) {
  const kit = brand.kit;
  const logo = kit?.logo?.src ?? faviconOf(brand.url);
  const [broken, setBroken] = useState(false);
  return (
    <BrowserFrame
      className="border-b"
      hoverZoom
      domain={brandDomain(brand.slug)}
      heroBackground={kit ? (kit.logo?.onDark ? kit.colors.foreground : kit.colors.background) : undefined}
      hero={
        logo && !broken ? (
          // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={kit?.logo?.alt ?? brand.name}
            className="max-h-[48%] max-w-[82%] object-contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <span
            className="truncate px-[4%] text-[3.6cqw] font-semibold tracking-tight"
            style={{ color: kit?.colors.foreground, fontFamily: kit?.fonts.heading.family }}
          >
            {kit?.wordmark ?? brand.name}
          </span>
        )
      }
    />
  );
}

function BrandCard({ brand }: { brand: Brand }) {
  const pages = useQuery(api.pages.list, { brandId: brand._id });
  const overview = useQuery(api.pagesEvents.brandOverview, { brandId: brand._id, days: 7 });
  const views = (overview ?? []).reduce((s: number, p: { views: number }) => s + (p.views ?? 0), 0);
  const published = (pages ?? []).filter((p: { status: string }) => p.status === "published").length;
  // A brand whose kit exists is usable even while "review": the hub shows the badge.
  const href = brand.kit ? `/dashboard/pages/${brand.slug}` : `/dashboard/pages/new?brand=${brand._id}`;
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
    >
      <BrandPreview brand={brand} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{brand.name}</h3>
            <p className="truncate text-sm text-muted-foreground">{hostOf(brand.url)}</p>
          </div>
          <StatusBadge status={brand.status} />
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t pt-4">
          {(
            [
              ["Pages", pages === undefined ? null : fmt.int(pages.length)],
              ["Published", pages === undefined ? null : fmt.int(published)],
              ["Views, 7d", overview === undefined ? null : fmt.compact(views)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{label}</dt>
              <dd className="num mt-0.5 text-sm font-semibold">{value ?? <Skeleton className="h-4 w-8" />}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {brand.status === "ready"
              ? `${brand.brief?.items?.length ?? 0} items in the brief`
              : brand.status === "failed"
                ? "Intake failed; open to retry"
                : "Finish the intake review"}
          </span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function NoBrands() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <div className="relative mb-8 aspect-[522/336] w-full max-w-md overflow-hidden rounded-xl shadow-xl ring-1 ring-foreground/10">
        <Image src="/illustrations/page-card.svg" alt="" fill priority sizes="448px" className="object-cover" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No brands yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Paste a brand&apos;s website. Slice reads its colours, type, voice and products, asks Qloo what the brand means to
        people, and then builds a landing page for each audience: a city, a demographic, a cluster of your own customers, or
        a few combined. Every page is published on the brand&apos;s own subdomain and measured.
      </p>
      <ol className="mt-6 grid w-full gap-3 text-left sm:grid-cols-3">
        {[
          ["1. Read the site", "Kit and brief extracted from the public website."],
          ["2. Define audiences", "Location, demographics, interests or a customer CSV, each turned into a taste profile."],
          ["3. Build and publish", "The agent writes each page for its audience; share the link with them."],
        ].map(([t, b]) => (
          <li key={t} className="rounded-lg border p-3">
            <div className="text-sm font-medium">{t}</div>
            <p className="mt-1 text-xs text-muted-foreground">{b}</p>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/pages/new" className={buttonVariants({ className: "mt-6" })}>
        <Plus data-icon="inline-start" /> Add your first brand
      </Link>
    </div>
  );
}

export function BrandList() {
  const brands = useQuery(api.pagesBrands.list, {});
  return (
    <>
      <PageHeader
        title="Pages"
        description="Each brand is one client: its kit, audiences, pages and analytics live together under its own subdomain."
        actions={
          <Link href="/dashboard/pages/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" /> New brand
          </Link>
        }
      />
      {brands === undefined ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[26rem] rounded-xl" />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <NoBrands />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {brands.map((b: Brand) => (
            <BrandCard key={b._id} brand={b} />
          ))}
        </div>
      )}
    </>
  );
}
