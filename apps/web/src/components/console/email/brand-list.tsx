"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { fillMergePlain } from "@slice/backend/convex/emailRender";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { CAMPAIGN_STATUS } from "@/lib/email/labels";
import { audienceNameOf, campaignAt, docOf, kitOf, rates, statsOf, sumStats, type CampaignRow } from "@/lib/email/types";
import { Badge, PageHeader, Skeleton } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";
import { countsOf, hostOf, type BrandRow } from "./brand-shell";
import { ComposeFrame } from "./compose-frame";

/** The card artwork: the latest campaign in the compose window (who it went to, its subject) and the brand's logo on the body. */
function BrandArt({ brand, latest }: { brand: BrandRow; latest: CampaignRow | undefined }) {
  const kit = kitOf(brand);
  const logo = kit?.logo?.src ?? kit?.icon;
  const [broken, setBroken] = useState<string | null>(null);
  const subject = docOf(latest)?.subject;
  return (
    <ComposeFrame
      className="border-b border-black/[0.05]"
      hoverZoom
      to={latest ? audienceNameOf(latest) : undefined}
      subject={subject ? fillMergePlain(subject, { brand: brand.name }) : undefined}
      bodyBackground={kit ? (kit.logo?.onDark ? kit.colors.foreground : kit.colors.background) : undefined}
      body={
        logo && broken !== logo ? (
          // Merchant logos live on arbitrary hosts; next/image would need every one allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={kit?.logo?.alt ?? brand.name} className="max-h-[44%] max-w-[70%] object-contain" onError={() => setBroken(logo)} />
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

function BrandCard({ brand }: { brand: BrandRow }) {
  const campaigns = useQuery(api.emailCampaigns.list, { brandId: brand._id }) as CampaignRow[] | undefined;
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
      <BrandArt brand={brand} latest={latest} />
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
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{latest ? latest.name : brand.status === "ready" ? "No campaigns yet" : "Finish the brand setup"}</span>
            {latest && <Badge tone={CAMPAIGN_STATUS[latest.status]?.tone ?? "outline"}>{CAMPAIGN_STATUS[latest.status]?.label ?? latest.status}</Badge>}
          </span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

/** The compose window with a taste group and a subject filled in: the empty states' picture of what the service sends. */
export function SampleComposeFrame({ className, priority, sizes }: { className?: string; priority?: boolean; sizes?: string }) {
  return <ComposeFrame className={className} priority={priority} sizes={sizes} to="Fans of slow-burn mysteries" subject="Hi there, we picked these for you" />;
}

function NoBrands() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
      <SampleComposeFrame className="mb-10 w-full max-w-xl rounded-3xl ring-1 ring-black/[0.05]" priority sizes="576px" />
      <h2 className="text-2xl font-medium tracking-[-0.02em] text-neutral-950">Emails that follow each reader&apos;s taste</h2>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
        Give Slice your website and it reads your logo, colours, fonts and voice. Import your contacts, and every campaign is written for
        the taste of the group it goes to, or for each individual contact you pick.
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
