"use client";

import Image from "next/image";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRight, CircleDollarSign, Film, ImageIcon, Plus } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { TIERS, type MediaKit, type Tier } from "@slice/backend/convex/mediaTypes";
import { usd } from "@/lib/media/kit";
import { Badge, PageHeader, Skeleton } from "@/components/console/primitives";
import { buttonVariants } from "@/components/ui/button";

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.media.list>>>[number];

function Cover({ row }: { row: Row }) {
  const kit = row.kit as MediaKit | undefined;
  const colors = kit?.colors;
  return (
    <div className="relative aspect-[16/10] overflow-hidden border-b" style={{ background: colors?.background ?? "#f4f4f5" }}>
      {row.cover ? (
        // Generated and uploaded media live on Convex storage and brand hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.cover} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3">
          <span className="text-2xl font-semibold tracking-tight" style={{ color: colors?.foreground, fontFamily: kit?.fonts?.heading?.family }}>
            {kit?.wordmark ?? kit?.name ?? row.name}
          </span>
          <span className="text-xs text-muted-foreground">No creatives yet</span>
        </div>
      )}
      {colors && (
        <div className="absolute right-3 bottom-3 flex gap-1 rounded-full bg-white/85 p-1 shadow-sm backdrop-blur">
          {[colors.primary, colors.accent, colors.foreground, colors.background].map((c, i) => (
            <span key={i} className="size-3.5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ row }: { row: Row }) {
  const pct = row.budget ? Math.min(100, (row.spend / row.budget) * 100) : 0;
  return (
    <Link href={`/dashboard/media/${row._id}`} className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-md">
      <Cover row={row} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{row.name}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {row.audiences} audience{row.audiences === 1 ? "" : "s"} · {row.formats.length} format{row.formats.length === 1 ? "" : "s"}
            </p>
          </div>
          <Badge tone="outline">{TIERS[(row.tier as Tier) ?? "smart"]?.label ?? row.tier}</Badge>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t pt-4">
          {(
            [
              ["Creatives", String(row.creatives), ImageIcon],
              ["Videos", String(row.videos), Film],
              ["Spent", usd(row.spend), CircleDollarSign],
            ] as const
          ).map(([label, value, Icon]) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Icon className="size-3" /> {label}
              </dt>
              <dd className="num mt-0.5 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto space-y-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {usd(row.spend)} of {usd(row.budget)} budget
            </span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function NoCampaigns() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-16 text-center">
      <div className="relative mb-8 aspect-[522/336] w-full max-w-md overflow-hidden rounded-xl shadow-xl ring-1 ring-foreground/10">
        <Image src="/illustrations/media-card.svg" alt="" fill priority sizes="448px" className="object-cover" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No campaigns yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Bring a brand from Pages or Email, import one from its website, or start from scratch. Add your product shots and clips if you have them.
        Slice asks Qloo what each audience is into, then designs posters and short videos for every audience and format, mixing premium and
        low-cost models to stay inside your budget.
      </p>
      <ol className="mt-6 grid w-full gap-3 text-left sm:grid-cols-3">
        {[
          ["1. Brand and brief", "Kit, products and your own photos or clips, plus the offer and call to action."],
          ["2. Audiences and formats", "Taste groups from Pages or a few interests; story, feed, landscape, print."],
          ["3. Generate and edit", "The agent drafts every creative; edit on the canvas or in chat, then export."],
        ].map(([t, b]) => (
          <li key={t} className="rounded-lg border p-3">
            <div className="text-sm font-medium">{t}</div>
            <p className="mt-1 text-xs text-muted-foreground">{b}</p>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/media/new" className={buttonVariants({ className: "mt-6" })}>
        <Plus data-icon="inline-start" /> Start a campaign
      </Link>
    </div>
  );
}

export function MediaCampaignList() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.media.list, isAuthenticated ? {} : "skip");
  return (
    <>
      <PageHeader
        title="Media"
        description="Posters and short videos for each audience and format, designed from your brand and what Qloo knows about their taste."
        actions={
          <Link href="/dashboard/media/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" /> New campaign
          </Link>
        }
      />
      {rows === undefined ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[22rem] rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <NoCampaigns />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <CampaignCard key={r._id} row={r} />
          ))}
        </div>
      )}
    </>
  );
}
