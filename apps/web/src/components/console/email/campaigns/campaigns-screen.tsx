"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BarChart3, Copy, MoreHorizontal, PenLine, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { EMAIL_TEMPLATES } from "@slice/backend/convex/emailTemplates";
import type { CampaignStatus, EmailItem } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { errorText, relativeTime } from "@/lib/email/labels";
import { renderDocFor, renderTemplateFor } from "@/lib/email/render-context";
import { docOf, profileOf, rates, statsOf, type EmailBrand } from "@/lib/email/types";
import { Segmented } from "@/components/console/form";
import { PageHeader, Skeleton } from "@/components/console/primitives";
import { coverTiles } from "@/components/console/pages/taste-cover";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { ConsolePage } from "@/components/console/shell-ui";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Avatar, KIND_ICON, type AudienceRow } from "@/components/console/email/contacts/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CampaignStatusLabel, EmailThumb, useBrandItems } from "./shared";

type CampaignRow = FunctionReturnType<typeof api.emailCampaigns.list>[number];
type Filter = "all" | "draft" | "scheduled" | "sent";

const FILTER_LABEL: Record<Filter, string> = { all: "All", draft: "Drafts", scheduled: "Scheduled", sent: "Sent" };

/** Which filter a status falls under: sending and failed sends live with the sent ones. */
const bucket = (s: CampaignStatus): Filter => (s === "draft" ? "draft" : s === "scheduled" ? "scheduled" : "sent");

export function CampaignsScreen() {
  const brand = useEmailBrand();
  const router = useRouter();
  const campaigns = useQuery(api.emailCampaigns.list, { brandId: brand._id });
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const items = useBrandItems(brand._id);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const base = `/dashboard/email/${brand.slug}/campaigns`;

  const byAudience = useMemo(() => new Map((audiences ?? []).map((a) => [a._id as string, a])), [audiences]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...(campaigns ?? [])]
      .filter((c) => filter === "all" || bucket(c.status) === filter)
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (docOf(c)?.subject ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [campaigns, filter, q]);
  const count = (f: Filter) => (campaigns ?? []).filter((c) => f === "all" || bucket(c.status) === f).length;
  const sent = count("sent");

  return (
    <ConsolePage>
      <PageHeader
        title={
          <>
            Campaigns {campaigns && campaigns.length > 0 && <span className="font-normal text-muted-foreground">{campaigns.length}</span>}
          </>
        }
        description={
          campaigns && campaigns.length > 0
            ? `${sent} sent, ${campaigns.length - sent} not sent yet. Each goes to one taste group (one email written for it) or to individual contacts you tick (a version for each person).`
            : "Each campaign goes to one taste group (one email written for its taste) or to individual contacts you tick (a version for each person)."
        }
        actions={
          <Link href={`${base}/new`} className={cn(buttonVariants(), "h-9 rounded-full px-4")}>
            <Plus data-icon="inline-start" /> New campaign
          </Link>
        }
      />

      {campaigns === undefined ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[30rem] rounded-2xl" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <NoCampaigns brand={brand} items={items ?? []} href={`${base}/new`} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={(Object.keys(FILTER_LABEL) as Filter[])
                .filter((f) => f === "all" || count(f) > 0)
                .map((f) => ({
                  value: f,
                  label: (
                    <span className="flex items-center gap-1.5">
                      {FILTER_LABEL[f]}
                      <span className="tabular-nums opacity-60">{count(f)}</span>
                    </span>
                  ),
                }))}
            />
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="h-9 rounded-full bg-white pl-9" aria-label="Search campaigns" />
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/10 px-6 py-14 text-center">
              <div className="text-sm font-medium">No campaigns match</div>
              <p className="text-sm text-muted-foreground">Try another search or show all campaigns.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => (
                <CampaignCard
                  key={c._id}
                  campaign={c}
                  brand={brand}
                  items={items}
                  audience={c.audienceId ? byAudience.get(c.audienceId) : undefined}
                  href={`${base}/${c._id}`}
                  onOpen={() => router.push(`${base}/${c._id}`)}
                />
              ))}
              {(filter === "all" || filter === "draft") && !q && (
                <Link
                  href={`${base}/new`}
                  className="group/new flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/10 text-muted-foreground transition-colors hover:border-black/25 hover:bg-white/60 hover:text-foreground"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-transform group-hover/new:scale-110">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-sm font-medium">New campaign</span>
                  <span className="max-w-60 text-center text-sm text-muted-foreground">Describe it, or start from a template in your brand&apos;s look</span>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </ConsolePage>
  );
}

function StatCell({ label, value, rate }: { label: string; value: string; rate?: string | null }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <div className="num truncate text-sm font-semibold text-neutral-950">
        {value}
        {rate && <span className="ml-1 text-xs font-normal text-muted-foreground">{rate}</span>}
      </div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CampaignCard({
  campaign,
  brand,
  items,
  audience,
  href,
  onOpen,
}: {
  campaign: CampaignRow;
  brand: EmailBrand;
  items: EmailItem[] | undefined;
  audience?: AudienceRow;
  href: string;
  onOpen: () => void;
}) {
  const doc = docOf(campaign);
  const html = useMemo(() => (items ? renderDocFor(brand, doc, items) : null), [brand, doc, items]);
  const stats = statsOf(campaign);
  const r = rates(stats);
  const out = campaign.status !== "draft" && campaign.status !== "scheduled";
  const AudienceIcon = KIND_ICON[audience?.kind ?? campaign.audienceKind ?? ""] ?? UsersRound;
  const date =
    campaign.status === "sent" && campaign.sentAt
      ? `Sent ${relativeTime(campaign.sentAt)}`
      : campaign.status === "scheduled"
        ? null
        : `Edited ${relativeTime(campaign.updatedAt)}`;

  return (
    <div
      role="link"
      tabIndex={-1}
      onClick={onOpen}
      className="group/email flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] ring-1 ring-black/[0.06] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
    >
      <div className="relative">
        <EmailThumb html={html} className="aspect-[5/6] border-b border-black/[0.05]" />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
          <CampaignStatusLabel status={campaign.status} scheduledAt={campaign.scheduledAt} pill />
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 justify-center pb-3 opacity-0 transition-all duration-200 group-hover/email:translate-y-0 group-hover/email:opacity-100">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-xs font-medium text-white shadow-lg">
            {out ? <BarChart3 className="size-3" /> : <PenLine className="size-3" />}
            {out ? "View report" : "Open in editor"}
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-neutral-950 outline-none hover:underline focus-visible:underline">
              {campaign.name}
            </Link>
            <p className="truncate text-sm text-muted-foreground">{doc?.subject || "No subject yet"}</p>
          </div>
          <CampaignMenu campaign={campaign} href={href} out={out} />
        </div>

        <div className="flex min-w-0 items-center gap-2.5 text-sm">
          {audience ? (
            <Avatar name={audience.name} image={coverTiles(profileOf(audience), 1)[0]?.image} className="size-7 rounded-lg" />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-muted-foreground">
              <AudienceIcon className="size-3.5" />
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate">
              {audience || campaign.audienceName ? (
                <>
                  <span className="text-muted-foreground">For </span>
                  <span className="font-medium">{audience?.name ?? campaign.audienceName}</span>
                </>
              ) : (
                <span className="text-muted-foreground">No audience yet</span>
              )}
            </div>
            {date && <div className="truncate text-xs text-muted-foreground">{date}</div>}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-3 divide-x divide-black/[0.06] border-t border-black/[0.05] pt-3.5">
          {out && stats ? (
            <>
              <StatCell label="Sent" value={fmt.int(stats.sent || stats.recipients)} />
              <StatCell label="Opened" value={fmt.int(stats.opened)} rate={r.open !== null ? fmt.pct(r.open, 0) : null} />
              <StatCell label="Clicked" value={fmt.int(stats.clicked)} rate={r.click !== null ? fmt.pct(r.click, 0) : null} />
            </>
          ) : (
            <>
              <StatCell label="Sent" value="–" />
              <StatCell label="Opened" value="–" />
              <StatCell label="Clicked" value="–" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignMenu({ campaign, href, out }: { campaign: CampaignRow; href: string; out: boolean }) {
  const router = useRouter();
  const duplicate = useMutation(api.emailCampaigns.duplicate);
  const remove = useMutation(api.emailCampaigns.remove);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div onClick={(e) => e.stopPropagation()} className="-mt-1 -mr-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${campaign.name}`} className="text-muted-foreground data-popup-open:bg-muted" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => router.push(href)}>
            {out ? <BarChart3 /> : <PenLine />} {out ? "View report" : "Open in editor"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void duplicate({ id: campaign._id }).catch((err) => setError(errorText(err)))}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          {campaign.status === "draft" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm || !!error}
        onOpenChange={(o) => {
          setConfirm(o);
          if (!o) setError(null);
        }}
        title={error ? "That did not work" : `Delete ${campaign.name}?`}
        description={error ?? "The draft, its chat with the builder and any personal versions go with it. This cannot be undone."}
        actionLabel={error ? "OK" : "Delete draft"}
        destructive={!error}
        onConfirm={() => {
          if (!error) void remove({ id: campaign._id }).catch((err) => setError(errorText(err)));
        }}
      />
    </div>
  );
}

/** Three templates in the brand's own look, fanned out: what a first campaign could be. */
function NoCampaigns({ brand, items, href }: { brand: EmailBrand; items: EmailItem[]; href: string }) {
  const picks = useMemo(() => EMAIL_TEMPLATES.filter((t) => t.category !== "Letter").slice(0, 3), []);
  const renders = useMemo(
    () => picks.map((t) => renderTemplateFor(brand, t.id, items)),
    [picks, brand, items],
  );
  const layouts = ["left-[6%] top-[18%] -rotate-[6deg]", "left-1/2 top-[8%] z-10 -translate-x-1/2", "right-[6%] top-[18%] rotate-[6deg]"];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center">
      <div className="group/email relative mb-8 h-72 w-full overflow-hidden rounded-3xl bg-white ring-1 ring-black/[0.05]">
        {renders.map((html, i) => (
          <div key={picks[i]?.id ?? i} className={cn("absolute w-[34%] overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10", layouts[i])}>
            <EmailThumb html={html} className="aspect-[3/4]" />
          </div>
        ))}
      </div>
      <h2 className="text-xl font-semibold tracking-tight">No campaigns yet</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Say what you want to send and who it is for, or pick a template. Every template is already in {brand.name}&apos;s colours and fonts.
      </p>
      <Link href={href} className={cn(buttonVariants(), "mt-6 h-10 rounded-full px-5")}>
        <Plus data-icon="inline-start" /> New campaign
      </Link>
    </div>
  );
}
