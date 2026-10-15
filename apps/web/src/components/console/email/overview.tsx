"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  Mail,
  Palette,
  Plus,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { googleFontsHrefs } from "@slice/backend/convex/emailThemes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { CAMPAIGN_STATUS, relativeTime } from "@/lib/email/labels";
import { brandTheme, renderDocFor, renderTemplateFor, templateIdFor } from "@/lib/email/render-context";
import {
  aboutOf,
  audienceNameOf,
  campaignAt,
  docOf,
  domainOf,
  kitOf,
  profileOf,
  rates,
  statsOf,
  sumStats,
  type AudienceRow,
  type BrandLike,
  type CampaignRow,
  type EmailBrand,
  type EmailItemRow,
} from "@/lib/email/types";
import { Panel, Skeleton } from "@/components/console/primitives";
import { ConsolePage } from "@/components/console/shell-ui";
import { buttonVariants } from "@/components/ui/button";
import { KIND_ICON, TasteCover, coverTiles } from "@/components/console/pages/taste-cover";
import { useEmailBrand } from "./brand-context";
import { EmailBrandGlyph, countsOf, hostOf, type BrandRow } from "./brand-shell";
import { historyWords } from "./contacts/shared";
import { EmailFrame } from "./email-frame";

/* Shared pieces: campaign thumbnails and cards (also used by the brand list and the home tile) */

/** An email drawn small on its own backdrop colour, cropped to the card. */
export function EmailThumb({
  html,
  backdrop,
  className,
  children,
}: {
  html: string | null | undefined;
  backdrop?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: backdrop ?? "#f1f0ec" }}>
      {html ? (
        <EmailFrame html={html} width={640} height={800} thumbnail title="" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Mail className="size-8 text-black/15" />
        </div>
      )}
      {children}
    </div>
  );
}

/** The live render of a campaign; drafts without content fall back to an empty card. */
export function useCampaignHtml(brand: BrandLike | null | undefined, campaign: CampaignRow | null | undefined, items: EmailItemRow[] | undefined) {
  const doc = campaign ? docOf(campaign) : null;
  return useMemo(() => (brand && doc ? renderDocFor(brand, doc, items) : null), [brand, doc, items]);
}

export function CampaignStatusChip({ status, className }: { status: CampaignRow["status"]; className?: string }) {
  const s = CAMPAIGN_STATUS[status] ?? { label: status, tone: "outline" };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold shadow-sm backdrop-blur",
        s.tone === "ok" ? "bg-emerald-50/95 text-emerald-700" : s.tone === "bad" ? "bg-red-50/95 text-red-700" : s.tone === "warn" ? "bg-amber-50/95 text-amber-800" : "bg-white/95 text-neutral-700",
        className,
      )}
    >
      {status === "scheduled" && <CalendarClock className="size-3" />}
      {s.label}
    </span>
  );
}

/** One line of what a campaign did: sent, opened and clicked, or where it is in the making. */
export function campaignLine(c: CampaignRow) {
  const stats = statsOf(c);
  const r = rates(stats);
  if ((c.status === "sent" || c.status === "sending") && stats && r.base) {
    return `${fmt.int(r.base)} delivered · ${fmt.pct(r.open ?? 0, 0)} opened · ${fmt.pct(r.click ?? 0, 0)} clicked`;
  }
  if (c.status === "scheduled" && c.scheduledAt)
    return `Goes out ${new Date(c.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return `Edited ${relativeTime(c.updatedAt)}`;
}

export function CampaignCard({
  campaign,
  brand,
  items,
  href,
  meta,
}: {
  campaign: CampaignRow;
  brand: BrandLike;
  items: EmailItemRow[] | undefined;
  href: string;
  /** Overrides the audience line (the home tile names the brand too). */
  meta?: ReactNode;
}) {
  const html = useCampaignHtml(brand, campaign, items);
  const backdrop = docOf(campaign)?.theme?.colors?.backdrop;
  const audience = audienceNameOf(campaign);
  return (
    <Link href={href} className="group flex min-w-0 flex-col">
      <EmailThumb
        html={html}
        backdrop={backdrop}
        className="aspect-[4/5] rounded-2xl ring-1 ring-black/[0.06] transition-shadow group-hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)]"
      >
        <CampaignStatusChip status={campaign.status} className="absolute top-2.5 left-2.5" />
      </EmailThumb>
      <span className="mt-3 block min-w-0">
        <span className="block truncate text-sm font-medium text-neutral-950 group-hover:underline group-hover:underline-offset-4">{campaign.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta ?? (audience ? `To ${audience}` : "No audience yet")}</span>
        <span className="num mt-0.5 block truncate text-xs text-muted-foreground">{campaignLine(campaign)}</span>
      </span>
    </Link>
  );
}

/* Hero ---------------------------------------------------------------------------------- */

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="num mt-1 text-[30px] leading-none font-medium tracking-[-0.03em] text-neutral-950">{value ?? <Skeleton className="h-8 w-12" />}</dd>
    </div>
  );
}

function BrandHero({
  brand,
  campaigns,
  items,
  contacts,
}: {
  brand: EmailBrand;
  campaigns: CampaignRow[] | undefined;
  items: EmailItemRow[] | undefined;
  contacts: number | undefined;
}) {
  const base = `/dashboard/email/${brand.slug}`;
  const kit = kitOf(brand);
  const about = aboutOf(brand);
  const theme = useMemo(() => brandTheme(kit), [kit]);
  const fonts = useMemo(() => googleFontsHrefs(theme), [theme]);
  const sent = campaigns?.filter((c) => c.status === "sent" || c.status === "sending");
  const total = useMemo(() => (sent ? sumStats(sent.map(statsOf)) : null), [sent]);
  const r = rates(total);
  const latest = useMemo(() => [...(campaigns ?? [])].sort((a, b) => campaignAt(b) - campaignAt(a))[0], [campaigns]);
  const latestHtml = useCampaignHtml(brand, latest, items);
  const welcomeId = templateIdFor("welcome");
  const welcomeHtml = useMemo(() => (latest || campaigns === undefined ? null : renderTemplateFor(brand, welcomeId, items ?? [])), [latest, campaigns, brand, welcomeId, items]);
  const html = latestHtml ?? welcomeHtml;
  const button = {
    borderRadius: theme.button.shape === "pill" ? 999 : theme.button.shape === "square" ? 0 : 6,
    background: theme.colors.primary,
    color: theme.colors.onPrimary,
    textTransform: theme.button.uppercase ? ("uppercase" as const) : undefined,
  };

  return (
    <Panel className="home-rise grid rounded-3xl lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      {fonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div className="flex min-w-0 flex-col gap-7 p-6 lg:p-9">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <EmailBrandGlyph brand={brand} />
            {brand.url ? (
              <a href={brand.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground">
                {hostOf(brand.url)} <ArrowUpRight className="size-3.5 shrink-0" />
              </a>
            ) : (
              <span>Email brand</span>
            )}
            {brand.demo && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">Demo</span>}
          </div>
          <h1 className="pt-1 text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-neutral-950 sm:text-[44px]">{brand.name}</h1>
          {about?.summary && <p className="line-clamp-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{about.summary}</p>}
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <HeroStat label="Campaigns sent" value={sent?.length} />
          <HeroStat label="Emails delivered" value={total ? fmt.compact(r.base) : undefined} />
          <HeroStat label="Open rate" value={total ? (r.open === null ? "—" : fmt.pct(r.open, 0)) : undefined} />
          <HeroStat label="Click rate" value={total ? (r.click === null ? "—" : fmt.pct(r.click, 0)) : undefined} />
          <HeroStat label="Contacts" value={contacts === undefined ? undefined : fmt.int(contacts)} />
        </dl>

        {kit && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Palette</span>
              <span className="flex h-7 -space-x-1.5">
                {(["primary", "foreground", "background", "accent", "muted", "surface"] as const).map((k) => (
                  <span key={k} title={`${k} ${kit.colors[k]}`} className="size-7 rounded-full ring-2 ring-white" style={{ background: kit.colors[k], boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)" }} />
                ))}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Type</span>
              <span className="flex h-7 items-baseline gap-2">
                <span className="text-2xl leading-none font-semibold" style={{ fontFamily: `"${theme.fonts.heading.family}", ${theme.fonts.heading.fallback}` }}>
                  Aa
                </span>
                <span className="truncate text-sm">{theme.fonts.heading.family}</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Button</span>
              <span className="flex h-7 items-center">
                <span className="truncate px-3 py-1 text-xs font-semibold" style={button}>
                  {historyWords(items).did === "booked" ? "Book now" : "Shop now"}
                </span>
              </span>
            </div>
            <Link href={`${base}/brand`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mb-0.5 ml-auto rounded-full text-muted-foreground hover:bg-white")}>
              <Palette data-icon="inline-start" /> Edit kit
            </Link>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={`${base}/campaigns/new`} className={cn(buttonVariants(), "h-10 rounded-full px-4")}>
            <Plus data-icon="inline-start" /> New campaign
          </Link>
          <Link href={`${base}/contacts`} className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-full px-4")}>
            <UserPlus data-icon="inline-start" /> Import contacts
          </Link>
        </div>
      </div>

      {/* The latest email resting on the brand's own colour, like a sheet on a desk. */}
      <div
        className="relative hidden min-h-80 overflow-hidden border-l lg:block"
        style={{
          background: `radial-gradient(90% 70% at 100% 0%, color-mix(in oklab, ${theme.colors.primary} 28%, transparent), transparent 70%), ${theme.colors.accent}`,
        }}
      >
        {html ? (
          <>
            <span className="absolute top-5 left-10 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 shadow-sm">
              {latest ? (latest.status === "sent" ? `Sent ${relativeTime(campaignAt(latest))}` : CAMPAIGN_STATUS[latest.status]?.label) : "Your welcome email, in your kit"}
            </span>
            <Link
              href={latest ? `${base}/campaigns/${latest._id}` : `${base}/campaigns/new`}
              className="absolute inset-x-10 top-14 bottom-0 block overflow-hidden rounded-t-xl shadow-2xl ring-1 shadow-black/20 ring-black/10 transition-transform duration-500 hover:-translate-y-1.5"
              style={{ background: theme.colors.surface }}
            >
              <EmailFrame html={html} width={600} thumbnail title="" />
            </Link>
          </>
        ) : (
          <Skeleton className="absolute inset-x-10 top-14 bottom-0 rounded-b-none bg-white/40" />
        )}
      </div>
    </Panel>
  );
}

/* Next steps ---------------------------------------------------------------------------- */

type Step = { key: string; title: string; body: string; href: string; cta: string; done: boolean; note?: string };

/** The path from a new brand to its first send, ticked off as it goes; demo brands skip the domain. */
function setupSteps(brand: EmailBrand, campaigns: CampaignRow[], items: EmailItemRow[], contacts: number): Step[] {
  const base = `/dashboard/email/${brand.slug}`;
  const domain = domainOf(brand);
  const drafts = campaigns.filter((c) => c.status === "draft");
  const sent = campaigns.some((c) => c.status !== "draft");
  const steps: Step[] = [
    {
      key: "setup",
      title: "Set up the brand",
      body: "Check the kit, voice and footer every email is built from.",
      href: brand.status === "setup" ? `/dashboard/email/new?brand=${brand._id}` : `${base}/brand`,
      cta: "Finish setup",
      done: brand.status !== "setup",
      note: "Kit and voice",
    },
  ];
  if (!brand.demo)
    steps.push({
      key: "domain",
      title: domain ? `Verify ${domain.name}` : "Connect your sending domain",
      body: domain ? "Add the DNS records, then verify. Campaigns go out once it is verified." : "Campaigns go to real inboxes from your own address once your domain is verified.",
      href: `${base}/sending`,
      cta: domain ? "Verify domain" : "Connect domain",
      done: domain?.status === "verified",
      note: domain?.name,
    });
  steps.push(
    {
      key: "contacts",
      title: "Import contacts",
      body: "Upload a CSV: Slice reads each person's taste and sorts them into taste groups, or keeps them as individual contacts.",
      href: `${base}/contacts`,
      cta: "Import contacts",
      done: contacts > 0,
      note: `${fmt.int(contacts)} ${contacts === 1 ? "contact" : "contacts"}`,
    },
    {
      key: "items",
      title: "Add what you sell",
      body: "Books, products or events. Taste picks in your emails come from this catalog.",
      href: `${base}/brand?tab=items`,
      cta: "Add items",
      done: items.length > 0,
      note: `${fmt.int(items.length)} in the catalog`,
    },
    {
      key: "campaign",
      title: "Create your first campaign",
      body: "Describe it or start from a template; the builder writes it in your kit and voice.",
      href: `${base}/campaigns/new`,
      cta: "New campaign",
      done: campaigns.length > 0,
      note: `${fmt.int(campaigns.length)} ${campaigns.length === 1 ? "campaign" : "campaigns"}`,
    },
    {
      key: "send",
      title: drafts.length && !sent ? `Send ${drafts[0].name}` : "Send your first campaign",
      body: "Pick who it goes to, check it over, then send it or schedule it.",
      href: drafts.length ? `${base}/campaigns/${drafts[0]._id}` : `${base}/campaigns/new`,
      cta: "Review and send",
      done: sent,
    },
  );
  return steps;
}

function NextSteps({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done);
  return (
    <Panel className="h-full">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-neutral-950">Next steps</h2>
          <span className="num text-[13px] text-muted-foreground">
            {done} of {steps.length} done
          </span>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((s) => (
            <span key={s.key} className={cn("h-1.5 flex-1 rounded-full", s.done ? "bg-emerald-500" : "bg-neutral-200")} />
          ))}
        </div>
      </div>
      <ol className="space-y-0.5 px-2 pb-2">
        {steps.map((s, i) =>
          s === current ? (
            <li key={s.key} className="my-1 rounded-xl bg-neutral-50 p-3.5 ring-1 ring-black/[0.05]">
              <div className="flex items-start gap-3">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 font-medium text-neutral-950">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                  <Link href={s.href} className={cn(buttonVariants({ size: "sm" }), "mt-3 rounded-full px-3.5")}>
                    {s.cta} <ArrowRight data-icon="inline-end" />
                  </Link>
                </div>
              </div>
            </li>
          ) : (
            <li key={s.key}>
              <Link href={s.href} className="group flex items-center gap-3 rounded-xl px-3.5 py-2 transition-colors hover:bg-neutral-50">
                {s.done ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <Check className="size-3.5" strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-muted-foreground ring-1 ring-black/10">{i + 1}</span>
                )}
                <span className={cn("min-w-0 flex-1 truncate text-sm", s.done ? "text-muted-foreground" : "text-neutral-800")}>{s.title}</span>
                {s.done && s.note ? (
                  <span className="num shrink-0 text-xs text-muted-foreground">{s.note}</span>
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </Link>
            </li>
          ),
        )}
      </ol>
    </Panel>
  );
}

/* Sections ------------------------------------------------------------------------------ */

function SectionHeading({ title, description, href, linkLabel }: { title: string; description?: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          {linkLabel} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function NewCampaignTile({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group/new flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 text-center text-muted-foreground transition-colors hover:border-black/30 hover:bg-white hover:text-foreground",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover/new:bg-white group-hover/new:shadow-sm">
        <Plus className="size-5" />
      </span>
      <span className="text-sm font-medium">New campaign</span>
      <span className="text-xs">Describe it, or start from a template in your kit</span>
    </Link>
  );
}

function LatestCampaigns({ brand, campaigns, items, wide }: { brand: EmailBrand; campaigns: CampaignRow[] | undefined; items: EmailItemRow[] | undefined; wide: boolean }) {
  const base = `/dashboard/email/${brand.slug}`;
  const shown = useMemo(() => [...(campaigns ?? [])].sort((a, b) => campaignAt(b) - campaignAt(a)).slice(0, wide ? 4 : 3), [campaigns, wide]);
  const cols = wide ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <section>
      <SectionHeading title="Latest campaigns" description="Each one as your readers see it." href={`${base}/campaigns`} linkLabel="All campaigns" />
      {campaigns === undefined ? (
        <div className={cn("grid gap-5", cols)}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn("grid gap-5", cols)}>
          {shown.map((c) => (
            <CampaignCard key={c._id} campaign={c} brand={brand} items={items} href={`${base}/campaigns/${c._id}`} />
          ))}
          <NewCampaignTile href={`${base}/campaigns/new`} />
        </div>
      )}
    </section>
  );
}

const AUDIENCE_KIND: Record<string, { label: string; icon: LucideIcon }> = {
  group: { label: "Taste group", icon: KIND_ICON.csv },
  people: { label: "Individuals", icon: UsersRound },
};

function Audiences({ brand, audiences }: { brand: EmailBrand; audiences: AudienceRow[] | undefined }) {
  const base = `/dashboard/email/${brand.slug}`;
  return (
    <section>
      <SectionHeading title="Audiences" description="Who your campaigns speak to: taste groups and individual contacts, read through Qloo." href={`${base}/contacts`} linkLabel="All contacts" />
      {audiences === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...audiences.filter((a) => a.kind === "group").sort((a, b) => b.size - a.size), ...audiences.filter((a) => a.kind === "people" && a.size > 0)].slice(0, 7).map((a) => {
            const kind = AUDIENCE_KIND[a.kind] ?? AUDIENCE_KIND.group;
            return (
              <Link
                key={a._id}
                href={`${base}/contacts?open=${a._id}`}
                className="group block overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_28px_-16px_rgba(20,20,20,0.10)] ring-1 ring-black/[0.05] transition-shadow hover:shadow-lg"
              >
                <TasteCover
                  tiles={coverTiles(profileOf(a), 5, true)}
                  icon={kind.icon}
                  kindLabel={kind.label}
                  title={a.name}
                  subtitle={`${fmt.int(a.size)} ${a.size === 1 ? "person" : "people"}`}
                />
                <div className="truncate px-4 py-3 text-xs text-muted-foreground">
                  {a.status === "ready" ? (a.topEntities?.slice(0, 3).join(", ") || "Profile ready") : a.status === "failed" ? "Profile failed" : (a.progress?.label ?? "Reading their taste")}
                </div>
              </Link>
            );
          })}
          <Link
            href={`${base}/contacts`}
            className="group/new flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 text-center text-muted-foreground transition-colors hover:border-black/30 hover:bg-white hover:text-foreground"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover/new:bg-white group-hover/new:shadow-sm">
              <UserPlus className="size-5" />
            </span>
            <span className="text-sm font-medium">{audiences.length ? "Import more contacts" : "Import contacts"}</span>
            <span className="max-w-52 text-xs">A CSV with emails and what people love; Slice groups them by taste</span>
          </Link>
        </div>
      )}
    </section>
  );
}

/* Screen -------------------------------------------------------------------------------- */

export function EmailOverview() {
  const brand = useEmailBrand();
  const campaigns = useQuery(api.emailCampaigns.list, { brandId: brand._id }) as CampaignRow[] | undefined;
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id }) as AudienceRow[] | undefined;
  const items = useQuery(api.emailItems.list, { brandId: brand._id }) as EmailItemRow[] | undefined;
  const rows = useQuery(api.emailBrands.list, {}) as BrandRow[] | undefined;
  const contacts = countsOf(rows?.find((r) => r._id === brand._id)).contacts;
  const steps = campaigns && items && contacts !== undefined ? setupSteps(brand, campaigns, items, contacts) : [];
  const open = steps.some((s) => !s.done);

  return (
    <ConsolePage className="space-y-12">
      <BrandHero brand={brand} campaigns={campaigns} items={items} contacts={contacts} />
      <div className={cn("home-rise grid gap-6", open && "lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]")} style={{ animationDelay: "80ms" }}>
        <LatestCampaigns brand={brand} campaigns={campaigns} items={items} wide={!open} />
        {open && (
          <div className="lg:pt-[3.25rem]">
            <NextSteps steps={steps} />
          </div>
        )}
      </div>
      <div className="home-rise" style={{ animationDelay: "160ms" }}>
        <Audiences brand={brand} audiences={audiences} />
      </div>
    </ConsolePage>
  );
}
