"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CalendarClock, CircleAlert, CircleCheck, CircleX, ListChecks, MessagesSquare, Send, TriangleAlert, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { allBlocks, personalBlocks, safeHref } from "@slice/backend/convex/emailDoc";
import type { EmailDoc, SendingMode } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { SENDING_MODE, errorText } from "@/lib/email/labels";
import { postJson } from "@/lib/pages/stream";
import { docOf, footerOf, kitOf, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { Notice, Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { peopleCount } from "@/components/console/email/contacts/shared";
import { CampaignStatusLabel, when } from "@/components/console/email/campaigns/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Level = "ok" | "warn" | "bad";
type Check = { key: string; level: Level; title: string; detail: string; fix?: { label: string; href: string } };

const SUBJECT_IDEAL = 50;
const PREHEADER_RANGE = [40, 90] as const;

/** What could go wrong in this email, found in the doc itself. */
function docChecks(doc: EmailDoc, brand: EmailBrand, editorHref: string): Check[] {
  const blocks = allBlocks(doc).map((x) => x.block);
  const checks: Check[] = [];

  const subject = doc.subject.trim();
  checks.push(
    !subject
      ? { key: "subject", level: "bad", title: "Subject line", detail: "There is no subject yet." }
      : subject.length > 60
        ? { key: "subject", level: "warn", title: "Subject line", detail: `${subject.length} characters: phones cut it near ${SUBJECT_IDEAL}.` }
        : { key: "subject", level: "ok", title: "Subject line", detail: `${subject.length} characters.` },
  );

  const pre = doc.preheader.trim();
  checks.push(
    !pre
      ? { key: "preheader", level: "warn", title: "Preview text", detail: "Empty, so inboxes show the first words of the email instead." }
      : pre.toLowerCase() === subject.toLowerCase()
        ? { key: "preheader", level: "warn", title: "Preview text", detail: "It repeats the subject; use it to add something." }
        : { key: "preheader", level: "ok", title: "Preview text", detail: `${pre.length} characters.` },
  );

  const footer = blocks.find((b) => b.type === "footer");
  const address = (footer?.type === "footer" && footer.address) || footerOf(brand)?.address;
  checks.push(
    !footer || footer.type !== "footer" || !footer.unsubscribeLabel.trim()
      ? { key: "footer", level: "bad", title: "Footer and unsubscribe", detail: "The email needs a footer with an unsubscribe link.", fix: { label: "Add a footer", href: editorHref } }
      : !address
        ? { key: "footer", level: "warn", title: "Footer and unsubscribe", detail: "Unsubscribe is there, but no postal address: most anti-spam laws ask for one.", fix: { label: "Add it in the brand kit", href: `/dashboard/email/${brand.slug}/brand` } }
        : { key: "footer", level: "ok", title: "Footer and unsubscribe", detail: "One-click unsubscribe and your address." },
  );

  const pictures = blocks.filter((b) => b.type === "image" || b.type === "video");
  const noAlt = pictures.filter((b) => (b.type === "image" || b.type === "video") && !b.alt.trim());
  checks.push(
    noAlt.length
      ? { key: "alt", level: "warn", title: "Image descriptions", detail: `${noAlt.length} of ${pictures.length} ${pictures.length === 1 ? "image has" : "images have"} no alt text, which many inboxes show while images load.`, fix: { label: "Fix in the editor", href: editorHref } }
      : { key: "alt", level: "ok", title: "Image descriptions", detail: pictures.length ? `All ${pictures.length} images have alt text.` : "No images." },
  );

  const links = blocks.flatMap((b) => (b.type === "button" ? [{ label: b.label, href: b.href }] : b.type === "image" && b.href ? [{ label: b.alt || "An image", href: b.href }] : []));
  const broken = links.filter((l) => !l.href.trim() || l.href.trim() === "#" || !safeHref(l.href));
  checks.push(
    broken.length
      ? { key: "links", level: "warn", title: "Links", detail: `${broken.map((l) => `"${l.label}"`).join(", ")} ${broken.length === 1 ? "goes" : "go"} nowhere yet.`, fix: { label: "Fix in the editor", href: editorHref } }
      : { key: "links", level: "ok", title: "Links", detail: links.length ? `${links.length} ${links.length === 1 ? "link" : "links"}, each tracked for the report.` : "No buttons or linked images." },
  );
  return checks;
}

const LEVEL_ICON: Record<Level, LucideIcon> = { ok: CircleCheck, warn: CircleAlert, bad: CircleX };
const LEVEL_TONE: Record<Level, string> = { ok: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600" };

/**
 * Step 3: everything checked, the inbox line edited and the send (now or at a
 * time). Demo brands simulate the send; a brand with no sending set up can
 * only send tests until a domain is verified.
 */
export function ReviewStep({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const pathname = usePathname();
  const info = useQuery(api.emailBrands.sendingInfo, { id: brand._id });
  // The backend's own answer to "can it go?": the same checks `start` makes, plus who it reaches.
  const readiness = useQuery(api.emailSend.readiness, { campaignId: campaign._id });
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const applyOps = useMutation(api.emailCampaigns.applyOps);
  const start = useMutation(api.emailSend.start);
  const cancel = useMutation(api.emailSend.cancel);

  const doc = docOf(campaign);
  const audience = (audiences ?? []).find((a) => a._id === campaign.audienceId) ?? null;
  const versions = useQuery(api.emailCampaigns.versions, audience?.kind === "people" ? { id: campaign._id } : "skip");
  const recipients = readiness?.recipients ?? 0;
  const recipientsHref = `${pathname}?step=recipients`;
  const sendingHref = `/dashboard/email/${brand.slug}/sending`;

  const checks = useMemo(() => {
    if (!doc) return [];
    const out: Check[] = [];
    const excluded = readiness?.excluded ?? 0;
    out.push(
      !audience
        ? { key: "audience", level: "bad", title: "Audience", detail: "Pick who it goes to.", fix: { label: "Choose recipients", href: recipientsHref } }
        : audience.status !== "ready"
          ? { key: "audience", level: "bad", title: "Audience", detail: audience.status === "failed" ? `${audience.name} could not be read.` : `${audience.name} is still being read.`, fix: { label: "Recipients", href: recipientsHref } }
          : { key: "audience", level: "ok", title: "Audience", detail: `${audience.name}: ${peopleCount(recipients, audience.kind === "people" ? "person" : "contact")}${excluded ? `, ${excluded} unsubscribed left out` : ""}.` },
    );
    if (info)
      out.push(
        info.mode === "none"
          ? { key: "sender", level: "bad", title: "Sender", detail: info.reason ?? "No verified domain yet, so only test emails can go out.", fix: { label: "Set up sending", href: sendingHref } }
          : { key: "sender", level: "ok", title: "Sender", detail: `${info.from} · ${SENDING_MODE[info.mode].label}` },
      );
    out.push(...docChecks(doc, brand, pathname));
    if (audience?.kind === "people") {
      const p = campaign.personalization;
      const written = (versions ?? []).filter((v) => v.status === "ready");
      const stale = written.filter((v) => v.stale);
      const title = "Personal versions";
      const fix = { label: "Recipients", href: recipientsHref };
      out.push(
        !personalBlocks(doc).length
          ? { key: "personal", level: "ok", title, detail: "No taste slots, so everyone gets the shared email with their own name merged in." }
          : p?.status === "running"
            ? { key: "personal", level: "bad", title, detail: `Writing them now: ${p.done} of ${p.total}.`, fix }
            : !written.length
              ? { key: "personal", level: "bad", title, detail: "Each person's version has not been written yet.", fix: { ...fix, label: "Personalise" } }
              : written.length < recipients
                ? { key: "personal", level: "warn", title, detail: `${written.length} of ${recipients} written; the others get the shared version.`, fix }
                : stale.length
                  ? { key: "personal", level: "warn", title, detail: `${stale.length} ${stale.length === 1 ? "was" : "were"} written before the email last changed; update them so everyone gets the latest.`, fix: { ...fix, label: "Update them" } }
                  : { key: "personal", level: "ok", title, detail: `Written for ${peopleCount(written.length, "person")}.` },
      );
    }
    return out;
  }, [doc, audience, recipients, readiness, versions, info, brand, pathname, campaign.personalization, recipientsHref, sendingHref]);

  const blockers = checks.filter((c) => c.level === "bad");
  // Anything the backend refuses that the checklist did not spell out.
  const serverReason = readiness && !readiness.ok && !blockers.length ? readiness.reason : undefined;
  const warnings = checks.filter((c) => c.level === "warn");

  if (!doc) return null;

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-neutral-950">Review and send</h1>
          <p className="text-sm text-muted-foreground">
            {blockers.length
              ? `${blockers.length} ${blockers.length === 1 ? "thing needs" : "things need"} fixing before it can go out.`
              : warnings.length
                ? `Ready to send, with ${warnings.length} ${warnings.length === 1 ? "thing" : "things"} worth a look.`
                : "Everything checks out."}
          </p>
        </div>

        <Panel>
          <PanelHeader title="Checklist" hint="Checked against the email and the brand as they are now" actions={<ListChecks className="size-4 text-muted-foreground" />} />
          {info === undefined || audiences === undefined ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {checks.map((c) => {
                const Icon = LEVEL_ICON[c.level];
                return (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-3.5">
                    <Icon className={cn("mt-0.5 size-[18px] shrink-0", LEVEL_TONE[c.level])} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-950">{c.title}</div>
                      <div className="text-sm text-muted-foreground">{c.detail}</div>
                    </div>
                    {c.fix && c.level !== "ok" && (
                      <Link href={c.fix.href} className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-sm font-medium text-neutral-900 hover:underline">
                        {c.fix.label} <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <InboxLine campaign={campaign} doc={doc} onApply={(subject, preheader) => applyOps({ id: campaign._id, ops: [{ op: "set_subject", subject, preheader }] })} />

        <SendPanel
          campaign={campaign}
          mode={info?.mode}
          recipients={recipients}
          blocked={blockers.length > 0 || !readiness?.ok}
          reason={serverReason}
          sendingHref={sendingHref}
          onStart={(at) => start({ campaignId: campaign._id, ...(at ? { at } : {}) })}
          onCancel={() => cancel({ campaignId: campaign._id })}
        />
      </div>

      <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
        <InboxMock brand={brand} from={info?.from} subject={doc.subject} preheader={doc.preheader} />
        <Panel>
          <PanelHeader title="Sender" actions={<Link href={sendingHref} className="text-sm text-muted-foreground hover:text-foreground">Change</Link>} />
          <dl className="divide-y divide-black/[0.05] text-sm">
            <Row label="From">{info ? info.from : <Skeleton className="h-4 w-40" />}</Row>
            <Row label="Reply to">{brand.sender?.replyTo ?? <span className="text-muted-foreground">Not set, replies go to the from address</span>}</Row>
            <Row label="Sending">{info ? SENDING_MODE[info.mode].label : <Skeleton className="h-4 w-24" />}</Row>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-5 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

type Option = { subject: string; preheader: string; angle: string };

/** Subject and preview text, edited in place, with five suggestions from the agent. */
function InboxLine({ campaign, doc, onApply }: { campaign: EmailCampaign; doc: EmailDoc; onApply: (subject: string, preheader: string) => Promise<unknown> }) {
  // Drafts exist only while typing, so an agent edit elsewhere shows through when the field is idle.
  const [subject, setSubject] = useState<string | null>(null);
  const [preheader, setPreheader] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = campaign.status !== "draft";
  const s = subject ?? doc.subject;
  const p = preheader ?? doc.preheader;

  async function commit(nextSubject = s, nextPreheader = p) {
    if (nextSubject === doc.subject && nextPreheader === doc.preheader) {
      setSubject(null);
      setPreheader(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onApply(nextSubject.trim(), nextPreheader.trim());
      setSubject(null);
      setPreheader(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await postJson<{ options?: Option[]; error?: string }>("/api/email/subjects", { campaignId: campaign._id });
      if (!res.options?.length && res.error) throw new Error(res.error);
      setOptions(res.options ?? []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Subject and preview text"
        hint="What people see in their inbox before they open it"
        actions={
          !locked && (
            <Button variant="outline" size="sm" onClick={() => void suggest()} disabled={suggesting}>
              {suggesting ? <Spinner data-icon="inline-start" /> : <MessagesSquare data-icon="inline-start" />}
              Suggest subject lines
            </Button>
          )
        }
      />
      <div className="space-y-4 p-5">
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between text-sm font-medium">
            Subject
            <span className={cn("num text-xs font-normal", s.length > 60 ? "text-amber-700" : "text-muted-foreground")}>
              {s.length}/{SUBJECT_IDEAL}
            </span>
          </span>
          <Input value={s} disabled={locked} onChange={(e) => setSubject(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} placeholder="Write the subject line" />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between text-sm font-medium">
            Preview text
            <span className={cn("num text-xs font-normal", p.length && (p.length < PREHEADER_RANGE[0] || p.length > PREHEADER_RANGE[1]) ? "text-amber-700" : "text-muted-foreground")}>
              {p.length} · {PREHEADER_RANGE[0]} to {PREHEADER_RANGE[1]} reads best
            </span>
          </span>
          <Input value={p} disabled={locked} onChange={(e) => setPreheader(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} placeholder="The line after the subject" />
        </label>
        {saving && <p className="text-xs text-muted-foreground">Saving</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {options && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{options.length ? "Written from the email and its audience. Use one, then edit it if you like." : "No suggestions came back."}</p>
            <ul className="grid gap-2">
              {options.map((o, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3 ring-1 ring-black/[0.04]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-neutral-950">{o.subject}</div>
                    <div className="text-sm text-muted-foreground">{o.preheader}</div>
                    {o.angle && <div className="mt-1 text-xs text-muted-foreground">{o.angle}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 bg-white"
                    disabled={saving || (o.subject === doc.subject && o.preheader === doc.preheader)}
                    onClick={() => void commit(o.subject, o.preheader)}
                  >
                    {o.subject === doc.subject && o.preheader === doc.preheader ? "In use" : "Use"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** "Tomorrow 9:00" in the browser's zone, as a datetime-local value. */
function defaultSchedule() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SendPanel({
  campaign,
  mode,
  recipients,
  blocked,
  reason,
  sendingHref,
  onStart,
  onCancel,
}: {
  campaign: EmailCampaign;
  mode?: SendingMode;
  recipients: number;
  blocked: boolean;
  reason?: string;
  sendingHref: string;
  onStart: (at?: number) => Promise<unknown>;
  onCancel: () => Promise<unknown>;
}) {
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [at, setAt] = useState(defaultSchedule);
  const [minAt] = useState(() => toLocalInput(new Date()));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const atMs = new Date(at).getTime();
  const who = peopleCount(recipients, "person");

  /** A scheduled time has to be in the future; checked when the merchant asks, not on every render. */
  function ask() {
    if (timing === "later" && (!Number.isFinite(atMs) || atMs < Date.now() + 60_000)) {
      setError("Pick a time at least a minute from now.");
      return;
    }
    setError(null);
    setConfirm(true);
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onStart(timing === "later" ? atMs : undefined);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (campaign.status === "scheduled")
    return (
      <Panel className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <CampaignStatusLabel status="scheduled" scheduledAt={campaign.scheduledAt} />
          <p className="text-sm text-muted-foreground">Cancel to make changes; it goes back to the drafts.</p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onCancel();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Spinner data-icon="inline-start" />}
          Cancel the schedule
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </Panel>
    );

  // A failed send can go again; anything else past the drafts only shows where it is.
  if (campaign.status !== "draft" && campaign.status !== "failed")
    return (
      <Panel className="p-5">
        <CampaignStatusLabel status={campaign.status} sentAt={campaign.sentAt} />
      </Panel>
    );

  return (
    <Panel>
      <PanelHeader title="Send" hint={`To ${who}`} />
      <div className="space-y-4 p-5">
        {mode === "demo" && <Notice>{SENDING_MODE.demo.summary}</Notice>}
        {mode === "none" && (
          <Notice tone="warn" icon={<TriangleAlert />}>
            {SENDING_MODE.none.summary}{" "}
            <Link href={sendingHref} className="font-medium underline underline-offset-4">
              Set up sending
            </Link>
          </Notice>
        )}
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="When">
          {(
            [
              ["now", Send, "Send now", "It starts going out right away."],
              ["later", CalendarClock, "Schedule", "Pick a day and time."],
            ] as const
          ).map(([value, Icon, title, body]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={timing === value}
              onClick={() => setTiming(value)}
              className={cn(
                "flex items-start gap-3 rounded-xl p-3.5 text-left ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-50",
                timing === value && "bg-neutral-50 ring-2 ring-neutral-900 hover:bg-neutral-50",
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{body}</span>
              </span>
            </button>
          ))}
        </div>
        {timing === "later" && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Day and time</span>
            <Input type="datetime-local" value={at} min={minAt} onChange={(e) => setAt(e.target.value)} className="max-w-64" />
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-3 border-t border-black/[0.05] pt-4">
          {blocked && <span className="text-sm text-muted-foreground">{reason ?? "Fix the checklist first."}</span>}
          <Button className="h-10 rounded-full px-5" disabled={blocked || busy || recipients === 0} onClick={ask}>
            {busy ? <Spinner data-icon="inline-start" /> : timing === "now" ? <Send data-icon="inline-start" /> : <CalendarClock data-icon="inline-start" />}
            {timing === "now" ? `Send to ${who}` : "Schedule"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={false}
        title={timing === "now" ? `Send ${campaign.name} to ${who} now?` : `Schedule ${campaign.name} for ${Number.isFinite(atMs) ? when(atMs) : "that time"}?`}
        description={
          mode === "demo"
            ? "This is a demo brand: nothing leaves Slice. Deliveries, opens and clicks are simulated over the next couple of minutes so the report moves."
            : timing === "now"
              ? "Once it starts going out it cannot be called back."
              : "You can cancel it until then."
        }
        actionLabel={timing === "now" ? "Send now" : "Schedule"}
        onConfirm={() => void go()}
      />
    </Panel>
  );
}

/** The email as it lands: a phone inbox with this campaign on top. */
function InboxMock({ brand, from, subject, preheader }: { brand: EmailBrand; from?: string; subject: string; preheader: string }) {
  const kit = kitOf(brand);
  const name = brand.sender?.fromName || brand.name;
  const mark = kit?.icon ?? kit?.logo?.src;
  const [broken, setBroken] = useState(false);
  return (
    <div className="overflow-hidden rounded-[2rem] bg-neutral-900 p-2.5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.45)]">
      <div className="overflow-hidden rounded-[1.6rem] bg-white">
        <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[11px] font-semibold text-neutral-900">
          <span>9:41</span>
          <span className="h-4 w-16 rounded-full bg-neutral-900" />
          <span className="num">100%</span>
        </div>
        <div className="px-5 pb-2">
          <div className="text-xl font-bold tracking-tight text-neutral-950">Inbox</div>
        </div>
        <div className="flex gap-3 border-y border-black/[0.06] bg-sky-50/60 px-4 py-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
            style={{ background: kit?.colors.primary ?? "#171717", color: kit?.colors.primaryForeground ?? "#fff" }}
          >
            {mark && !broken ? (
              // The brand's own logo host; next/image would need it allow-listed.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mark} alt="" className="size-full bg-white object-contain p-1" onError={() => setBroken(true)} />
            ) : (
              name.charAt(0)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-neutral-950">{name}</span>
              <span className="shrink-0 text-xs text-sky-700">Now</span>
            </div>
            <div className="truncate text-sm font-medium text-neutral-950">{subject || "No subject"}</div>
            <div className="line-clamp-2 text-sm text-neutral-500">{preheader || "The first words of the email show here."}</div>
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 border-b border-black/[0.04] px-4 py-3 opacity-50">
            <span className="size-9 shrink-0 rounded-full bg-neutral-200" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <span className="block h-2.5 w-24 rounded-full bg-neutral-200" />
              <span className="block h-2.5 w-44 rounded-full bg-neutral-200" />
              <span className="block h-2.5 w-36 rounded-full bg-neutral-100" />
            </div>
          </div>
        ))}
        <div className="truncate px-5 py-3 text-center text-[11px] text-muted-foreground">{from ? `From ${from}` : " "}</div>
      </div>
    </div>
  );
}
