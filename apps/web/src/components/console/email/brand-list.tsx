"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { THEME_PRESETS } from "@slice/backend/convex/emailThemes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { brandTheme, renderTemplateFor, templateIdFor } from "@/lib/email/render-context";
import { campaignAt, docOf, rates, statsOf, sumStats, type CampaignRow, type EmailItemRow } from "@/lib/email/types";
import { Badge, PageHeader, Skeleton } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";
import { EmailBrandGlyph, countsOf, hostOf, type BrandRow } from "./brand-shell";
import { EmailFrame } from "./email-frame";
import { CampaignStatusChip, useCampaignHtml } from "./overview";

/**
 * A few emails fanned out over a wash: the brand list's and the home tile's
 * picture of what the service makes, before there is anything of the
 * merchant's own to show.
 */
export function EmailFan({ className }: { className?: string }) {
  const samples = useMemo(
    () =>
      [
        { template: templateIdFor("welcome"), theme: THEME_PRESETS[1] ?? THEME_PRESETS[0], name: "Your brand" },
        { template: templateIdFor("new arrivals") ?? templateIdFor("welcome"), theme: THEME_PRESETS[0], name: "Your brand" },
        { template: templateIdFor("event") ?? templateIdFor("welcome"), theme: THEME_PRESETS[2] ?? THEME_PRESETS[0], name: "Your brand" },
      ].map((s) => ({ html: renderTemplateFor({ name: s.name }, s.template, [], s.theme), backdrop: s.theme?.colors.backdrop })),
    [],
  );
  const layouts = ["left-[4%] top-[16%] w-[38%] -rotate-[6deg]", "left-[31%] top-[6%] w-[38%] z-10", "right-[4%] top-[16%] w-[38%] rotate-[6deg]"];
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: "radial-gradient(70% 80% at 0% 0%, #fde68a66, transparent 70%), radial-gradient(70% 80% at 100% 100%, #fdba7466, transparent 70%), #f7f6f3" }}
      aria-hidden
    >
      {samples.map((s, i) => (
        <div
          key={i}
          className={cn("absolute aspect-[4/5] overflow-hidden rounded-xl shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10", layouts[i])}
          style={{ background: s.backdrop }}
        >
          {s.html && <EmailFrame html={s.html} width={640} height={800} thumbnail title="" />}
        </div>
      ))}
    </div>
  );
}

/** The card artwork: the brand's latest campaign (else its welcome email) on a wash of its own colours. */
function BrandArt({ brand, latest, items }: { brand: BrandRow; latest: CampaignRow | undefined; items: EmailItemRow[] | undefined }) {
  const theme = useMemo(() => brandTheme(brand.kit), [brand.kit]);
  const campaignHtml = useCampaignHtml(brand, latest, items);
  const fallback = useMemo(() => (latest ? null : renderTemplateFor(brand, templateIdFor("welcome"), items ?? [])), [latest, brand, items]);
  const html = campaignHtml ?? fallback;
  const surface = latest ? (docOf(latest)?.theme?.colors?.surface ?? theme.colors.surface) : theme.colors.surface;
  return (
    <div
      className="relative h-56 overflow-hidden border-b border-black/[0.05]"
      style={{
        background: `radial-gradient(80% 90% at 0% 0%, color-mix(in oklab, ${theme.colors.primary} 26%, transparent), transparent 70%), ${theme.colors.accent}`,
      }}
    >
      <span className="absolute top-4 left-4 z-10">
        <EmailBrandGlyph brand={brand} size="lg" className="shadow-sm" />
      </span>
      <div
        className="absolute inset-x-[16%] top-8 bottom-0 overflow-hidden rounded-t-xl shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition-transform duration-500 group-hover:-translate-y-1.5"
        style={{ background: surface }}
      >
        {html ? <EmailFrame html={html} width={600} thumbnail title="" /> : <Skeleton className="size-full rounded-none" />}
      </div>
      {latest ? (
        <CampaignStatusChip status={latest.status} className="absolute right-4 bottom-4 z-10" />
      ) : (
        <span className="absolute right-4 bottom-4 z-10 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm">Welcome email, in its kit</span>
      )}
    </div>
  );
}

function BrandCard({ brand }: { brand: BrandRow }) {
  const campaigns = useQuery(api.emailCampaigns.list, { brandId: brand._id }) as CampaignRow[] | undefined;
  const items = useQuery(api.emailItems.list, { brandId: brand._id }) as EmailItemRow[] | undefined;
  const counts = countsOf(brand);
  const latest = useMemo(() => [...(campaigns ?? [])].sort((a, b) => campaignAt(b) - campaignAt(a))[0], [campaigns]);
  const sent = campaigns?.filter((c) => c.status === "sent" || c.status === "sending") ?? [];
  const r = rates(sumStats(sent.map(statsOf)));
  const reading = brand.status === "setup" && brand.setup?.status === "reading";
  // A brand still in setup opens where setup left off.
  const href = brand.status === "ready" ? `/dashboard/email/${brand.slug}` : `/dashboard/email/new?brand=${brand._id}`;
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] transition-shadow hover:shadow-lg"
    >
      <BrandArt brand={brand} latest={latest} items={items} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-neutral-950">{brand.name}</h3>
            <p className="truncate text-sm text-muted-foreground">{hostOf(brand.url) || "Set up by hand"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {brand.demo && <Badge tone="outline">Demo</Badge>}
            {brand.status === "setup" && (
              <Badge tone="warn">
                {reading && <Loader2 className="animate-spin" />}
                {reading ? "Reading site" : "Setting up"}
              </Badge>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t border-black/[0.05] pt-4">
          {(
            [
              ["Campaigns", counts.campaigns === undefined ? null : fmt.int(counts.campaigns)],
              ["Contacts", counts.contacts === undefined ? null : fmt.int(counts.contacts)],
              ["Open rate", campaigns === undefined ? null : r.open === null ? "—" : fmt.pct(r.open, 0)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{label}</dt>
              <dd className="num mt-0.5 text-sm font-semibold">{value ?? <Skeleton className="h-4 w-8" />}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="truncate">{latest ? latest.name : brand.status === "ready" ? "No campaigns yet" : "Finish the brand setup"}</span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function NoBrands() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
      <EmailFan className="mb-10 aspect-[16/9] w-full max-w-xl rounded-3xl ring-1 ring-black/[0.05]" />
      <h2 className="text-2xl font-medium tracking-[-0.02em] text-neutral-950">Emails that follow each reader&apos;s taste</h2>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        Give Slice your website and it reads your logo, colours, fonts and voice. Import your contacts, and every campaign is written for
        the taste of the group it goes to, or for each person on a customer list.
      </p>
      <ol className="mt-8 grid w-full gap-3 text-left sm:grid-cols-3">
        {[
          ["Set up the brand", "Kit, voice and footer read from your homepage."],
          ["Import contacts", "A CSV with what people love, grouped by taste."],
          ["Send a campaign", "The builder writes it; you check it and send."],
        ].map(([t, b], i) => (
          <li key={t} className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05]">
            <div className="text-sm font-medium">
              {i + 1}. {t}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{b}</p>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/email/new" className={cn(buttonVariants(), "mt-8 h-10 rounded-full px-5")}>
        <Plus data-icon="inline-start" /> Set up your first brand
      </Link>
    </div>
  );
}

export function EmailBrandList() {
  const { isAuthenticated } = useConvexAuth();
  const brands = useQuery(api.emailBrands.list, isAuthenticated ? {} : "skip") as BrandRow[] | undefined;
  // Every account gets its own copy of the demo brand the first time Email opens.
  const provision = useMutation(api.emailDemo.provision);
  const [provisioned, setProvisioned] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    provision({})
      .catch((err) => console.error("Could not add the demo brand", err))
      .finally(() => setProvisioned(true));
  }, [isAuthenticated, provision]);
  return (
    <>
      <PageHeader
        title="Email"
        description="Each brand is one client: its kit, contacts, audiences and campaigns live together."
        actions={
          <Link href="/dashboard/email/new" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>
            <Plus data-icon="inline-start" /> New brand
          </Link>
        }
      />
      {brands === undefined || (brands.length === 0 && !provisioned) ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[26rem] rounded-2xl" />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <NoBrands />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <BrandCard key={b._id} brand={b} />
          ))}
          <Link
            href="/dashboard/email/new"
            className="group/new flex min-h-[26rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 px-8 text-center text-muted-foreground transition-colors hover:border-black/30 hover:bg-white hover:text-foreground"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover/new:bg-white group-hover/new:shadow-sm">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-medium">New brand</span>
            <span className="max-w-60 text-xs leading-relaxed">From its website in about half a minute, or set up by hand</span>
          </Link>
        </div>
      )}
    </>
  );
}
