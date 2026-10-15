"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useConvexAuth, useMutation, useQueries, useQuery, type RequestForQueries } from "convex/react";
import { ArrowRight, Mail, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { audienceNameOf, campaignAt, rates, statsOf, sumStats, type CampaignRow, type EmailItemRow } from "@/lib/email/types";
import { Skeleton } from "@/components/console/primitives";
import { EmailFan } from "@/components/console/email/brand-list";
import { EmailBrandGlyph, countsOf, type BrandRow } from "@/components/console/email/brand-shell";
import { CampaignCard } from "@/components/console/email/overview";
import { SectionHeader, Tile, TileHeader } from "./ui";

const noop = () => () => {};
const HOUR = 3_600_000;
/** Brands whose campaigns the tile reads; the rest are a click away. */
const MAX_BRANDS = 4;

/** Campaigns and items for the first few brands, keyed by brand id. */
function useBrandData(brands: BrandRow[] | undefined) {
  const shown = (brands ?? []).slice(0, MAX_BRANDS);
  // useQueries resubscribes whenever the request object changes identity; the brands query result keeps its identity until it changes.
  const requests = useMemo(() => {
    const out: RequestForQueries = {};
    for (const b of (brands ?? []).slice(0, MAX_BRANDS)) {
      out[`c:${b._id}`] = { query: api.emailCampaigns.list, args: { brandId: b._id } };
      out[`i:${b._id}`] = { query: api.emailItems.list, args: { brandId: b._id } };
    }
    return out;
  }, [brands]);
  const results = useQueries(requests);
  const loaded = shown.every((b) => Array.isArray(results[`c:${b._id}`]));
  const campaigns = shown.flatMap((b) => {
    const rows = results[`c:${b._id}`];
    return Array.isArray(rows) ? (rows as CampaignRow[]).map((c) => ({ campaign: c, brand: b })) : [];
  });
  const items = (id: string) => {
    const rows = results[`i:${id}`];
    return Array.isArray(rows) ? (rows as EmailItemRow[]) : undefined;
  };
  return { campaigns, items, loaded };
}

/** Email on the console home: the latest campaigns as their readers see them, and how they did. */
export function EmailSection({ days, className }: { days: number; className?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const brands = useQuery(api.emailBrands.list, isAuthenticated ? {} : "skip") as BrandRow[] | undefined;
  // Every account gets its own copy of the demo brand; the home may be the first screen it opens.
  const provision = useMutation(api.emailDemo.provision);
  useEffect(() => {
    if (!isAuthenticated) return;
    provision({}).catch((err) => console.error("Could not add the demo email brand", err));
  }, [isAuthenticated, provision]);

  const { campaigns, items, loaded } = useBrandData(brands);
  // The clock to the hour: steady between renders, and the server renders without one.
  const hour = useSyncExternalStore(
    noop,
    () => Math.floor(Date.now() / HOUR),
    () => 0,
  );
  const latest = useMemo(() => [...campaigns].sort((a, b) => campaignAt(b.campaign) - campaignAt(a.campaign)).slice(0, 3), [campaigns]);
  const sentAll = campaigns.filter(({ campaign: c }) => c.status === "sent" || c.status === "sending");
  const since = hour ? (hour + 1) * HOUR - days * 86_400_000 : 0;
  const sentInRange = sentAll.filter(({ campaign: c }) => (c.sentAt ?? 0) >= since);
  // A quiet stretch shows everything sent so far rather than a row of zeros.
  const counted = sentInRange.length ? sentInRange : sentAll;
  const total = sumStats(counted.map(({ campaign }) => statsOf(campaign)));
  const r = rates(total);

  const meta = brands
    ? `${brands.length} ${brands.length === 1 ? "brand" : "brands"} · ${sentAll.length} ${sentAll.length === 1 ? "campaign" : "campaigns"} sent${r.open !== null ? ` · ${fmt.pct(r.open, 0)} opened` : ""}`
    : undefined;

  return (
    <section className={cn("space-y-5", className)}>
      <SectionHeader icon={Mail} title="Email" meta={meta} href="/dashboard/email" linkLabel="Open Email" />
      {brands === undefined || (brands.length > 0 && !loaded) ? (
        <div className="grid gap-5 lg:grid-cols-12">
          <Skeleton className="h-[30rem] rounded-3xl lg:col-span-8" />
          <Skeleton className="h-[30rem] rounded-3xl lg:col-span-4" />
        </div>
      ) : brands.length === 0 ? (
        <Tile delay={60} className="grid items-center gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:p-10">
          <div>
            <h3 className="text-2xl leading-tight font-medium tracking-[-0.02em] text-neutral-950">Send emails that follow each reader&apos;s taste</h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Slice reads your brand from its website, groups your contacts by taste, and writes each campaign for the people it goes to.
            </p>
            <Link
              href="/dashboard/email/new"
              className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <Plus className="size-4" /> Set up a brand
            </Link>
          </div>
          <EmailFan className="aspect-[16/10] rounded-2xl ring-1 ring-black/[0.05]" />
        </Tile>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <Tile delay={60} className="flex flex-col lg:col-span-8">
            <TileHeader title="Latest campaigns" hint="Each one as its readers see it" />
            {latest.length ? (
              <div className="grid flex-1 gap-5 p-6 pt-5 sm:grid-cols-3">
                {latest.map(({ campaign, brand }) => {
                  const audience = audienceNameOf(campaign);
                  return (
                    <CampaignCard
                      key={campaign._id}
                      campaign={campaign}
                      brand={brand}
                      items={items(brand._id)}
                      href={`/dashboard/email/${brand.slug}/campaigns/${campaign._id}`}
                      meta={`${brand.name}${audience ? ` · To ${audience}` : ""}`}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="m-6 mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 p-10 text-center">
                <p className="text-sm font-medium">No campaigns yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Describe one, or start from a template drawn in your brand&apos;s kit.</p>
                <Link
                  href={`/dashboard/email/${brands[0].slug}/campaigns/new`}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  <Plus className="size-4" /> New campaign
                </Link>
              </div>
            )}
          </Tile>

          <Tile delay={120} className="flex flex-col lg:col-span-4">
            <TileHeader title="How they did" hint={sentInRange.length ? `Campaigns sent in the last ${days} days` : "Every campaign sent so far"} />
            <dl className="grid grid-cols-3 gap-3 px-6 pt-5">
              {(
                [
                  ["Delivered", r.base ? fmt.compact(r.base) : "—"],
                  ["Opened", r.open === null ? "—" : fmt.pct(r.open, 0)],
                  ["Clicked", r.click === null ? "—" : fmt.pct(r.click, 0)],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[13px] text-muted-foreground">{label}</dt>
                  <dd className="num mt-1 text-[28px] leading-none font-medium tracking-[-0.03em] text-neutral-950">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-5 flex-1 divide-y divide-black/[0.05] border-t border-black/[0.05] px-6 py-1">
              {brands.slice(0, 4).map((b) => {
                const counts = countsOf(b);
                return (
                  <li key={b._id}>
                    <Link href={b.status === "ready" ? `/dashboard/email/${b.slug}` : `/dashboard/email/new?brand=${b._id}`} className="group flex items-center gap-3 py-3">
                      <EmailBrandGlyph brand={b} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-neutral-950 group-hover:underline">{b.name}</span>
                          {b.demo && <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[11px] font-medium text-neutral-600">Demo</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {fmt.int(counts.campaigns ?? 0)} campaigns · {fmt.int(counts.contacts ?? 0)} contacts
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Tile>
        </div>
      )}
    </section>
  );
}
