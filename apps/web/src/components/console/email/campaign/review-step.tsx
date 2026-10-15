"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarClock, CircleAlert, CircleCheck, CircleX, Mail, MessagesSquare, Send, Smartphone, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { allBlocks, personalBlocks, safeHref } from "@slice/backend/convex/emailDoc";
import type { EmailDoc, SendingMode } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { SENDING_MODE, errorText } from "@/lib/email/labels";
import { postJson } from "@/lib/pages/stream";
import { docOf, footerOf, kitOf, profileOf, targetsName, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { Panel, PanelHeader, Skeleton } from "@/components/console/primitives";
import { coverTiles } from "@/components/console/pages/taste-cover";
import { Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Avatar, peopleCount, type AudienceRow } from "@/components/console/email/contacts/shared";
import { PhoneEmail } from "@/components/console/email/phone";
import { CampaignStatusLabel, when } from "@/components/console/email/campaigns/shared";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const groups = useMemo(() => (audiences ?? []).filter((a) => campaign.groupIds?.includes(a._id)), [audiences, campaign.groupIds]);
  const people = campaign.contactIds?.length ?? 0;
  const targets = groups.length + people;
  // One group alone gets the email written for it (unless it has taste slots); otherwise each group and person gets a version.
  const many = groups.length > 1 || people > 0 || (groups.length > 0 && !!doc && personalBlocks(doc).length > 0);
  const versions = useQuery(api.emailCampaigns.versions, many ? { id: campaign._id } : "skip");
  const recipients = readiness?.recipients ?? 0;
  const recipientsHref = `${pathname}?step=recipients`;
  const sendingHref = `/dashboard/email/${brand.slug}/sending`;

  const checks = useMemo(() => {
    if (!doc) return [];
    const out: Check[] = [];
    const excluded = readiness?.excluded ?? 0;
    const unread = groups.find((g) => g.status !== "ready");
    out.push(
      !targets
        ? { key: "audience", level: "bad", title: "Audience", detail: "Pick who it goes to.", fix: { label: "Choose recipients", href: recipientsHref } }
        : unread
          ? { key: "audience", level: "bad", title: "Audience", detail: unread.status === "failed" ? `${unread.name} could not be read.` : `${unread.name} is still being read.`, fix: { label: "Recipients", href: recipientsHref } }
          : { key: "audience", level: "ok", title: "Audience", detail: `${targetsName(groups, people)}: ${peopleCount(recipients, "person")}${excluded ? `, ${excluded} unsubscribed left out` : ""}.` },
    );
    if (info)
      out.push(
        info.mode === "none"
          ? { key: "sender", level: "bad", title: "Sender", detail: info.reason ?? "No verified domain yet, so only test emails can go out.", fix: { label: "Set up sending", href: sendingHref } }
          : { key: "sender", level: "ok", title: "Sender", detail: `${info.from} · ${SENDING_MODE[info.mode].label}` },
      );
    out.push(...docChecks(doc, brand, pathname));
    if (many) {
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
              ? { key: "personal", level: "bad", title, detail: "The versions have not been written yet.", fix: { ...fix, label: "Personalise" } }
              : written.length < targets
                ? { key: "personal", level: "warn", title, detail: `${written.length} of ${targets} written; the others get the shared version.`, fix }
                : stale.length
                  ? { key: "personal", level: "warn", title, detail: `${stale.length} ${stale.length === 1 ? "was" : "were"} written before the email last changed; update them so everyone gets the latest.`, fix: { ...fix, label: "Update them" } }
                  : { key: "personal", level: "ok", title, detail: `Written for ${targetsName(groups, people) ?? "everyone ticked"}.` },
      );
    }
    return out;
  }, [doc, groups, people, targets, many, recipients, readiness, versions, info, brand, pathname, campaign.personalization, recipientsHref, sendingHref]);

  const blockers = checks.filter((c) => c.level === "bad");
  // Anything the backend refuses that the checklist did not spell out.
  const serverReason = readiness && !readiness.ok && !blockers.length ? readiness.reason : undefined;
  const warnings = checks.filter((c) => c.level === "warn");
  const [editingSubject, setEditingSubject] = useState(false);
  const [showing, setShowing] = useState<Showing>({ kind: "shared" });

  if (!doc) return null;
  const check = (key: string) => checks.find((c) => c.key === key);
  const worst = (...cs: (Check | undefined)[]): Level => (cs.some((c) => c?.level === "bad") ? "bad" : cs.some((c) => c?.level === "warn") ? "warn" : "ok");
  const audience = check("audience");
  const personal = check("personal");
  const sender = check("sender");
  const contentChecks = ["footer", "alt", "links"].map(check);
  const blocks = allBlocks(doc).map((x) => x.block);
  const sectionCount = doc.sections.filter((s) => !s.columns.some((c) => c.blocks.some((b) => b.type === "footer"))).length;
  const imageCount = blocks.filter((b) => b.type === "image").length;
  const linkCount = blocks.filter((b) => b.type === "button" || (b.type === "image" && !!b.href)).length;
  const loading = info === undefined || audiences === undefined || readiness === undefined;
  const versionCount = many ? targets : 0;
  const editorHref = pathname;

  return (
    <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-neutral-950">Review and send</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Checking the email"
              : blockers.length
                ? `${blockers.length} ${blockers.length === 1 ? "thing needs" : "things need"} fixing before it can go out.`
                : warnings.length
                  ? `Ready to send, with ${warnings.length} ${warnings.length === 1 ? "thing" : "things"} worth a look.`
                  : "Everything checks out. Have a last look, then send it."}
          </p>
        </div>

        <Panel>
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              <ReviewRow
                level={worst(audience, personal)}
                label="To"
                title={targets ? `${peopleCount(recipients, "person")}${versionCount ? ` in ${versionCount} versions` : ""}` : "No one yet"}
                lines={[
                  audience?.level === "ok" ? `${targetsName(groups, people)}${readiness?.excluded ? `, ${readiness.excluded} unsubscribed left out` : ""}` : audience?.detail,
                  personal && (personal.level === "ok" ? (personalBlocks(doc).length ? "Every version is written and up to date." : personal.detail) : personal.detail),
                ]}
                action={<RowLink href={(personal?.level !== "ok" && personal?.fix?.href) || recipientsHref}>{personal?.level !== "ok" && personal?.fix ? personal.fix.label : "Edit"}</RowLink>}
              />
              <ReviewRow
                level={sender?.level ?? "ok"}
                label="From"
                title={info?.from ?? ""}
                lines={[
                  sender?.level === "bad" ? sender.detail : `Replies go to ${brand.sender?.replyTo ?? "the from address"}`,
                  info && info.mode === "demo" ? "Demo brand: the send is simulated and nothing leaves Slice." : info ? SENDING_MODE[info.mode].label : undefined,
                ]}
                action={<RowLink href={sendingHref}>{sender?.level === "bad" ? "Set up sending" : "Change"}</RowLink>}
              />
              <ReviewRow
                level={worst(check("subject"), check("preheader"))}
                label="Subject"
                title={doc.subject || "No subject yet"}
                lines={[
                  doc.preheader || "No preview text",
                  ...[check("subject"), check("preheader")].filter((c) => c && c.level !== "ok").map((c) => c!.detail),
                  versionCount ? "Each version can have its own; see them beside the phone." : undefined,
                ]}
                action={
                  campaign.status === "draft" ? (
                    <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setEditingSubject((v) => !v)}>
                      {editingSubject ? "Done" : "Edit"}
                    </Button>
                  ) : undefined
                }
              >
                {editingSubject && <SubjectEditor campaign={campaign} doc={doc} onApply={(subject, preheader) => applyOps({ id: campaign._id, ops: [{ op: "set_subject", subject, preheader }] })} />}
              </ReviewRow>
              <ReviewRow
                level={worst(...contentChecks)}
                label="Content"
                title={`${sectionCount} ${sectionCount === 1 ? "section" : "sections"} · ${imageCount} ${imageCount === 1 ? "image" : "images"} · ${linkCount} ${linkCount === 1 ? "link" : "links"}`}
                lines={
                  contentChecks.every((c) => c?.level === "ok")
                    ? ["Unsubscribe and your address in the footer, alt text on every image, and every link goes somewhere."]
                    : contentChecks.filter((c) => c && c.level !== "ok").map((c) => c!.detail)
                }
                action={<RowLink href={editorHref}>Open the editor</RowLink>}
              />
            </ul>
          )}
          <SendBar
            campaign={campaign}
            mode={info?.mode}
            recipients={recipients}
            blocked={loading || blockers.length > 0 || !readiness?.ok}
            reason={serverReason ?? (blockers.length ? "Fix what's marked in red first." : undefined)}
            onStart={(at) => start({ campaignId: campaign._id, ...(at ? { at } : {}) })}
            onCancel={() => cancel({ campaignId: campaign._id })}
          />
        </Panel>

        {many && versions && versions.length > 0 && (
          <InboxLines campaign={campaign} doc={doc} versions={versions} groups={groups} showing={showing} onShow={setShowing} />
        )}
      </div>

      <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <PhonePreview campaign={campaign} brand={brand} from={brand.sender?.fromName || brand.name} showing={showing} versions={versions} />
      </aside>
    </div>
  );
}

/** Which version the phone shows: the shared email, a taste group's or a person's. */
type Showing = { kind: "shared" } | { kind: "group"; id: Id<"emailAudiences"> } | { kind: "person"; id: Id<"emailContacts"> };
type Version = FunctionReturnType<typeof api.emailCampaigns.versions>[number];

function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full")}>
      {children}
    </Link>
  );
}

/** One line of the review: its state, what it is, the facts, and where to change it. */
function ReviewRow({ level, label, title, lines, action, children }: { level: Level; label: string; title: ReactNode; lines: (string | undefined | false | null)[]; action?: ReactNode; children?: ReactNode }) {
  const Icon = LEVEL_ICON[level];
  const shown = lines.filter((l): l is string => !!l);
  return (
    <li className="px-5 py-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 sm:grid-cols-[auto_6rem_minmax(0,1fr)_auto]">
        <Icon className={cn("mt-0.5 size-5 shrink-0", LEVEL_TONE[level])} />
        <span className="hidden pt-px text-sm text-muted-foreground sm:block">{label}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-950">
            <span className="text-muted-foreground sm:hidden">{label}: </span>
            {title}
          </p>
          {shown.map((l, i) => (
            <p key={i} className={cn("text-sm", level !== "ok" && i > 0 ? "text-neutral-700" : "text-muted-foreground")}>
              {l}
            </p>
          ))}
        </div>
        {action && <div className="-my-1 shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4 sm:ml-[8.25rem]">{children}</div>}
    </li>
  );
}

/** Each version's inbox line, picked to show on the phone. */
function InboxLines({
  campaign,
  doc,
  versions,
  groups,
  showing,
  onShow,
}: {
  campaign: EmailCampaign;
  doc: EmailDoc;
  versions: Version[];
  groups: AudienceRow[];
  showing: Showing;
  onShow: (s: Showing) => void;
}) {
  const rows: { key: string; show: Showing; name: string; note: string; image?: string; group?: boolean; subject: string; preheader: string }[] = [
    { key: "shared", show: { kind: "shared" }, name: "The shared email", note: "Anyone without a version", subject: doc.subject, preheader: doc.preheader },
    ...versions.map((v) => {
      const p = v.status === "ready" ? v.personalization : null;
      const group = v.group ? groups.find((g) => g._id === v.group!._id) : undefined;
      return v.group
        ? {
            key: v.group._id as string,
            show: { kind: "group" as const, id: v.group._id },
            name: v.group.name,
            note: `Taste group · ${peopleCount(v.group.size, "person")}`,
            image: group ? coverTiles(profileOf(group), 1, true)[0]?.image : undefined,
            group: true,
            subject: p?.subject || doc.subject,
            preheader: p?.preheader || doc.preheader,
          }
        : {
            key: v.contact!._id as string,
            show: { kind: "person" as const, id: v.contact!._id },
            name: v.contact!.name,
            note: ["Individual contact", v.contact!.neighborhood ?? v.contact!.city].filter(Boolean).join(" · "),
            image: v.contact!.entities.find((e) => e.image)?.image,
            subject: p?.subject || doc.subject,
            preheader: p?.preheader || doc.preheader,
          };
    }),
  ];
  const current = showing.kind === "shared" ? "shared" : showing.id;
  return (
    <Panel>
      <PanelHeader title="Inbox lines" hint={`What each of the ${versions.length} versions shows before it's opened. Pick one to see it on the phone.`} />
      <ul className="divide-y divide-black/[0.05]">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onShow(r.show)}
              aria-pressed={current === r.key}
              disabled={campaign.status === "sending"}
              className={cn("grid w-full grid-cols-[auto_minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-neutral-50", current === r.key && "bg-neutral-50")}
            >
              {r.key === "shared" ? (
                <span className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                  <Mail className="size-4" />
                </span>
              ) : (
                <Avatar name={r.name} image={r.image} className={cn("size-9", r.group && "rounded-xl")} />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-neutral-950">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.note}</span>
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-950">{r.subject}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.preheader}</span>
                </span>
                {current === r.key && <Smartphone className="size-4 shrink-0 text-neutral-500" aria-label="On the phone" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The chosen version opened in Mail on an iPhone. */
function PhonePreview({ campaign, brand, from, showing, versions }: { campaign: EmailCampaign; brand: EmailBrand; from: string; showing: Showing; versions?: Version[] }) {
  const render = useQuery(
    api.emailCampaigns.renderFor,
    showing.kind === "group" ? { id: campaign._id, audienceId: showing.id } : showing.kind === "person" ? { id: campaign._id, contactId: showing.id } : { id: campaign._id },
  );
  const kit = kitOf(brand);
  const mail = { from, subject: render?.subject ?? "", preheader: render?.preheader ?? "", mark: kit?.icon ?? kit?.logo?.src, color: kit?.colors.primary };
  const v = showing.kind === "shared" ? null : versions?.find((x) => (x.group?._id ?? x.contact?._id) === showing.id);
  const who = showing.kind === "shared" ? "the shared email" : `${v?.group?.name ?? v?.contact?.name ?? "their"}'s version`;
  return (
    <div className="flex flex-col items-center gap-4">
      <PhoneEmail width={300} mail={mail} html={render?.html} />
      <p className="max-w-[300px] truncate text-center text-xs text-muted-foreground">Showing {who}</p>
    </div>
  );
}

type Option = { subject: string; preheader: string; angle: string };

/** Subject and preview text, edited in place, with five suggestions from the agent. */
function SubjectEditor({ campaign, doc, onApply }: { campaign: EmailCampaign; doc: EmailDoc; onApply: (subject: string, preheader: string) => Promise<unknown> }) {
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
    <div className="space-y-4 rounded-xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
      <label className="block space-y-1.5">
        <span className="flex items-baseline justify-between text-sm font-medium">
          Subject
          <span className={cn("num text-xs font-normal", s.length > 60 ? "text-amber-700" : "text-muted-foreground")}>
            {s.length}/{SUBJECT_IDEAL}
          </span>
        </span>
        <Input value={s} disabled={locked} onChange={(e) => setSubject(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} placeholder="Write the subject line" className="bg-white" />
      </label>
      <label className="block space-y-1.5">
        <span className="flex items-baseline justify-between text-sm font-medium">
          Preview text
          <span className={cn("num text-xs font-normal", p.length && (p.length < PREHEADER_RANGE[0] || p.length > PREHEADER_RANGE[1]) ? "text-amber-700" : "text-muted-foreground")}>
            {p.length} · {PREHEADER_RANGE[0]} to {PREHEADER_RANGE[1]} reads best
          </span>
        </span>
        <Input value={p} disabled={locked} onChange={(e) => setPreheader(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} placeholder="The line after the subject" className="bg-white" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{saving ? "Saving" : "This is the shared line; versions with their own keep theirs."}</span>
        {!locked && (
          <Button variant="outline" size="sm" className="bg-white" onClick={() => void suggest()} disabled={suggesting}>
            {suggesting ? <Spinner data-icon="inline-start" /> : <MessagesSquare data-icon="inline-start" />}
            Suggest subject lines
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {options && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{options.length ? "Written from the email and who it goes to. Use one, then edit it if you like." : "No suggestions came back."}</p>
          <ul className="grid gap-2">
            {options.map((o, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-black/[0.05]">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-950">{o.subject}</div>
                  <div className="text-sm text-muted-foreground">{o.preheader}</div>
                  {o.angle && <div className="mt-1 text-xs text-muted-foreground">{o.angle}</div>}
                </div>
                <Button size="sm" variant="outline" className="shrink-0" disabled={saving || (o.subject === doc.subject && o.preheader === doc.preheader)} onClick={() => void commit(o.subject, o.preheader)}>
                  {o.subject === doc.subject && o.preheader === doc.preheader ? "In use" : "Use"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

function SendBar({
  campaign,
  mode,
  recipients,
  blocked,
  reason,
  onStart,
  onCancel,
}: {
  campaign: EmailCampaign;
  mode?: SendingMode;
  recipients: number;
  blocked: boolean;
  reason?: string;
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

  const bar = "border-t border-black/[0.05] bg-neutral-50/70 px-5 py-4";

  if (campaign.status === "scheduled")
    return (
      <div className={cn(bar, "flex flex-wrap items-center gap-4")}>
        <CalendarClock className="size-5 shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1">
          <CampaignStatusLabel status="scheduled" scheduledAt={campaign.scheduledAt} />
          <p className="text-sm text-muted-foreground">Cancel to make changes; it goes back to the drafts.</p>
        </div>
        <Button
          variant="outline"
          className="rounded-full bg-white"
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
      </div>
    );

  // A failed send can go again; anything else past the drafts only shows where it is.
  if (campaign.status !== "draft" && campaign.status !== "failed")
    return (
      <div className={bar}>
        <CampaignStatusLabel status={campaign.status} sentAt={campaign.sentAt} />
      </div>
    );

  return (
    <div className={cn(bar, "space-y-3")}>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="When" className="inline-flex h-9 items-center rounded-full bg-white p-1 ring-1 ring-black/[0.08]">
          {(
            [
              ["now", Send, "Send now"],
              ["later", CalendarClock, "Schedule"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={timing === value}
              onClick={() => setTiming(value)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm text-neutral-600 transition-colors", timing === value && "bg-neutral-900 text-white")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        {timing === "later" && <Input type="datetime-local" value={at} min={minAt} onChange={(e) => setAt(e.target.value)} className="h-9 w-56 bg-white" aria-label="Day and time" />}
        <Button className="ml-auto h-10 rounded-full px-5" disabled={blocked || busy || recipients === 0} onClick={ask}>
          {busy ? <Spinner data-icon="inline-start" /> : timing === "now" ? <Send data-icon="inline-start" /> : <CalendarClock data-icon="inline-start" />}
          {timing === "now" ? `Send to ${who}` : `Schedule for ${who}`}
        </Button>
      </div>
      {(error || (blocked && reason) || mode === "none") && (
        <p className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>{error ?? (mode === "none" ? SENDING_MODE.none.summary : reason)}</p>
      )}
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
    </div>
  );
}
