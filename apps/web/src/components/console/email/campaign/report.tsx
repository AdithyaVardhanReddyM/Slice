"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Check, ChartNoAxesColumn, FlaskConical, Link2, MailOpen, MousePointerClick, Search } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { CampaignStats, SendStatus } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { renderDocFor } from "@/lib/email/render-context";
import { docOf, statsOf, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { Segmented } from "@/components/console/form";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { EmailFrame } from "@/components/console/email/email-frame";
import { CampaignStatusLabel, useBrandItems, when } from "@/components/console/email/campaigns/shared";
import { Avatar, peopleCount } from "@/components/console/email/contacts/shared";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SEND_STATUS: Record<SendStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
  skipped: "Skipped",
};

// Opens keep the console's accent; clicks a blue that stays apart from it for colour-blind readers too.
const chartConfig = {
  opens: { label: "Opens", color: "var(--chart-1)" },
  clicks: { label: "Clicks", color: "#0369a1" },
} satisfies ChartConfig;

const pct = (n: number, d: number) => (d > 0 ? fmt.pct(n / d, 1) : "–");

/** "3:45 PM" within a day, "Oct 12, 3 PM" across days. */
function tickFormat(spanMs: number) {
  return (at: number) =>
    new Date(at).toLocaleString(
      "en-US",
      spanMs <= 36 * 3600_000 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric" },
    );
}

/** "stackhousebooks.com/books/piranesi" from a tracked URL. */
function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * What happened to a sent campaign: who got it, opened and clicked, over
 * time, which links pulled, and with personal versions how each version did
 * and each person's result. The report query is reactive, so a demo send
 * fills in while you watch.
 */
export function CampaignReport({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const report = useQuery(api.emailCampaigns.report, { id: campaign._id });
  const items = useBrandItems(brand._id);
  const doc = docOf(campaign);
  const html = useMemo(() => (items ? renderDocFor(brand, doc, items) : null), [brand, doc, items]);
  const stats: CampaignStats | null = (report?.stats as CampaignStats | undefined) ?? statsOf(campaign);
  const simulated = campaign.sendingMode === "demo";

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CampaignStatusLabel status={campaign.status} scheduledAt={campaign.scheduledAt} sentAt={campaign.sentAt} />
            {simulated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                <FlaskConical className="size-3" /> Simulated send: nothing left Slice
              </span>
            )}
          </div>
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-neutral-950">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[doc?.subject && `“${doc.subject}”`, report?.to && `to ${report.to}`, campaign.sentAt && `sent ${when(campaign.sentAt)}`].filter(Boolean).join(" · ")}
          </p>
          {campaign.status === "sending" && stats && stats.recipients > 0 && (
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sending</span>
                <span className="num">
                  {fmt.int(stats.sent + stats.failed)} of {fmt.int(stats.recipients)}
                </span>
              </div>
              <Progress value={Math.round(((stats.sent + stats.failed) / stats.recipients) * 100)} />
            </div>
          )}
        </header>

        <Kpis stats={stats} />
        <Timeline timeline={report?.timeline} loading={report === undefined} />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <TopLinks links={report?.links} loading={report === undefined} clicked={stats?.clicked ?? 0} />
          <Rates stats={stats} />
        </div>
        {report?.versions && <Versions versions={report.versions} />}
        {report?.people && <People people={report.people} />}
      </div>

      <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <Panel>
          <PanelHeader title="The email" hint={report?.versions ? "The shared design; each group and person got their own version" : "As it was sent"} />
          <div className="max-h-[calc(100svh-10rem)] overflow-y-auto bg-neutral-100 p-3">
            {html ? <EmailFrame html={html} thumbnail /> : <Skeleton className="h-[32rem] w-full" />}
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function Kpi({ label, value, rate, hint, icon }: { label: string; value: number | undefined; rate?: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-5 py-5">
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {icon}
        {label}
      </span>
      {value === undefined ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <span className="num text-[28px] leading-none font-medium tracking-[-0.03em] text-neutral-950">{rate ?? fmt.int(value)}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">{value === undefined ? " " : (hint ?? " ")}</span>
    </div>
  );
}

function Kpis({ stats }: { stats: CampaignStats | null }) {
  const s = stats ?? undefined;
  const arrived = s ? s.delivered || s.sent : 0;
  return (
    <Panel className="grid grid-cols-2 divide-black/[0.05] sm:grid-cols-3 sm:divide-x xl:grid-cols-6">
      <Kpi label="Recipients" value={s?.recipients} hint={s && s.failed ? `${fmt.int(s.failed)} failed to send` : "In the audience at send"} />
      <Kpi label="Delivered" value={s?.delivered} rate={s ? pct(s.delivered, s.sent || s.recipients) : undefined} hint={s ? `${fmt.int(s.delivered)} inboxes` : undefined} />
      <Kpi label="Opened" icon={<MailOpen className="size-3.5" />} value={s?.opened} rate={s ? pct(s.opened, arrived) : undefined} hint={s ? peopleCount(s.opened, "person") : undefined} />
      <Kpi
        label="Clicked"
        icon={<MousePointerClick className="size-3.5" />}
        value={s?.clicked}
        rate={s ? pct(s.clicked, arrived) : undefined}
        hint={s ? `${peopleCount(s.clicked, "person")} · ${pct(s.clicked, s.opened)} of opens` : undefined}
      />
      <Kpi label="Unsubscribed" value={s?.unsubscribed} rate={s ? pct(s.unsubscribed, arrived) : undefined} hint={s ? peopleCount(s.unsubscribed, "person") : undefined} />
      <Kpi label="Bounced" value={s?.bounced} rate={s ? pct(s.bounced, s.sent || s.recipients) : undefined} hint={s ? `${fmt.int(s.bounced)} addresses${s.complained ? `, ${s.complained} spam reports` : ""}` : undefined} />
    </Panel>
  );
}

type Point = { at: number; opens: number; clicks: number };

function Timeline({ timeline, loading }: { timeline?: Point[]; loading: boolean }) {
  const [mode, setMode] = useState<"total" | "period">("total");
  const data = useMemo(() => {
    const sorted = [...(timeline ?? [])].sort((a, b) => a.at - b.at);
    if (mode === "period") return sorted;
    let opens = 0;
    let clicks = 0;
    return sorted.map((p) => ({ at: p.at, opens: (opens += p.opens), clicks: (clicks += p.clicks) }));
  }, [timeline, mode]);
  const span = data.length > 1 ? data[data.length - 1].at - data[0].at : 0;
  const format = tickFormat(span);
  const empty = !loading && data.every((p) => !p.opens && !p.clicks);

  return (
    <Panel>
      <PanelHeader
        title="Opens and clicks over time"
        hint={mode === "total" ? "Running total since the send" : "In each period"}
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "total", label: "Running total" },
              { value: "period", label: "Per period" },
            ]}
          />
        }
      />
      <div className="relative px-2 pt-4 pb-3">
        {loading ? (
          <Skeleton className="mx-3 h-[240px]" />
        ) : empty ? (
          <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
              <ChartNoAxesColumn className="size-5" />
            </span>
            <p className="text-sm font-medium text-neutral-950">No opens yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">They show up here as people open the email and click through.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
            <AreaChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
              <defs>
                {(["opens", "clicks"] as const).map((k) => (
                  <linearGradient key={k} id={`report-fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${k})`} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={`var(--color-${k})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="at" type="number" scale="time" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tickMargin={10} minTickGap={40} tickFormatter={format} />
              <YAxis tickLine={false} axisLine={false} width={36} tickMargin={6} allowDecimals={false} />
              <ChartTooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<ChartTooltipContent indicator="line" labelFormatter={(_, payload) => when(Number(payload?.[0]?.payload?.at ?? 0))} />} />
              <Area dataKey="opens" type="monotone" stroke="var(--color-opens)" strokeWidth={2} fill="url(#report-fill-opens)" dot={false} isAnimationActive={false} />
              <Area dataKey="clicks" type="monotone" stroke="var(--color-clicks)" strokeWidth={2} fill="url(#report-fill-clicks)" dot={false} isAnimationActive={false} />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  );
}

type LinkRow = { url: string; label?: string; blockId?: string; clicks: number };

function TopLinks({ links, loading, clicked }: { links?: LinkRow[]; loading: boolean; clicked: number }) {
  const rows = [...(links ?? [])].sort((a, b) => b.clicks - a.clicks).slice(0, 8);
  const top = Math.max(1, ...rows.map((r) => r.clicks));
  return (
    <Panel>
      <PanelHeader title="Top links" hint={clicked ? `${peopleCount(clicked, "person")} clicked` : "Clicks on each link in the email"} />
      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No clicks yet.</p>
      ) : (
        <ul className="divide-y divide-black/[0.05]">
          {rows.map((r) => (
            <li key={`${r.url}-${r.blockId ?? ""}`} className="space-y-1.5 px-5 py-3">
              <div className="flex items-center gap-3 text-sm">
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={r.url}>
                  {r.label ? <span className="font-medium">{r.label}</span> : null}
                  <span className={cn(r.label && "ml-1.5 text-muted-foreground")}>{shortUrl(r.url)}</span>
                </a>
                <span className="num shrink-0 font-medium">{fmt.int(r.clicks)}</span>
              </div>
              <span className="ml-6.5 block h-1 overflow-hidden rounded-full bg-neutral-100">
                <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(3, (r.clicks / top) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The funnel in words: of everyone it reached, how many opened, clicked or left. */
function Rates({ stats }: { stats: CampaignStats | null }) {
  if (!stats) return null;
  const arrived = stats.delivered || stats.sent;
  const rows: [string, number, number][] = [
    ["Delivered", stats.delivered, stats.sent || stats.recipients],
    ["Opened", stats.opened, arrived],
    ["Clicked", stats.clicked, arrived],
    ["Unsubscribed", stats.unsubscribed, arrived],
    ["Bounced", stats.bounced, stats.sent || stats.recipients],
  ];
  return (
    <Panel>
      <PanelHeader title="Rates" hint="Opens and clicks against what arrived" />
      <dl className="space-y-3 p-5">
        {rows.map(([label, n, d]) => (
          <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <span className="block h-full rounded-full bg-neutral-800" style={{ width: `${d ? Math.min(100, (n / d) * 100) : 0}%` }} />
            </dd>
            <dd className="num text-right font-medium">{pct(n, d)}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

type VersionRow = { key: string; label: string; kind: "group" | "person"; sent: number; opened: number; clicked: number };

/** How each version did: every taste group's, and the individual contacts' own versions together. */
function Versions({ versions }: { versions: VersionRow[] }) {
  return (
    <Panel>
      <PanelHeader title="By version" hint="Opens and clicks for each group's version, and for the people who got their own" />
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Version</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Opened</TableHead>
            <TableHead className="pr-5 text-right">Clicked</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v) => (
            <TableRow key={v.key}>
              <TableCell className="py-2.5 pl-5">
                <div className="font-medium">{v.label}</div>
                <div className="text-xs text-muted-foreground">{v.kind === "group" ? "One version for the group" : "A version each"}</div>
              </TableCell>
              <TableCell className="num text-right">{fmt.int(v.sent)}</TableCell>
              <TableCell className="num text-right">
                {fmt.int(v.opened)} <span className="text-muted-foreground">({pct(v.opened, v.sent)})</span>
              </TableCell>
              <TableCell className="num pr-5 text-right">
                {fmt.int(v.clicked)} <span className="text-muted-foreground">({pct(v.clicked, v.sent)})</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

type PersonRow = { contactId: string; name: string; email: string; status: SendStatus | string; opened: unknown; clicked: unknown; subject: string; version?: string };

/** Each person: the version they got, their subject line and what they did with it. */
function People({ people }: { people: PersonRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? people.filter((p) => p.name.toLowerCase().includes(needle) || p.email.includes(needle) || p.subject.toLowerCase().includes(needle)) : people;
  const opened = people.filter((p) => !!p.opened).length;
  return (
    <Panel>
      <PanelHeader
        title="Each person"
        hint={`${peopleCount(people.length, "person")}, ${opened} opened their version`}
        actions={
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="h-8 pl-8" aria-label="Search people" />
          </div>
        }
      />
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Person</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Their subject line</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Opened</TableHead>
            <TableHead className="pr-5 text-center">Clicked</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((p) => (
            <TableRow key={p.contactId}>
              <TableCell className="py-2.5 pl-5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.name || p.email} className="size-8" />
                  <div className="min-w-0">
                    <div className="max-w-44 truncate font-medium">{p.name || p.email}</div>
                    <div className="max-w-44 truncate text-xs text-muted-foreground">{p.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="max-w-40 truncate text-muted-foreground">{p.version}</TableCell>
              <TableCell className="max-w-72 truncate" title={p.subject}>
                {p.subject}
              </TableCell>
              <TableCell className="text-muted-foreground">{SEND_STATUS[p.status as SendStatus] ?? p.status}</TableCell>
              <TableCell className="text-center">{p.opened ? <Check className="mx-auto size-4 text-emerald-600" aria-label="Opened" /> : <span className="text-muted-foreground">–</span>}</TableCell>
              <TableCell className="pr-5 text-center">{p.clicked ? <Check className="mx-auto size-4 text-emerald-600" aria-label="Clicked" /> : <span className="text-muted-foreground">–</span>}</TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                Nobody matches.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
