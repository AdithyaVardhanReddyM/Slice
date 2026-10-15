"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertCircle, ArrowRight, Eye, Fingerprint, RefreshCw, UserStar, UsersRound } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { personalBlocks } from "@slice/backend/convex/emailDoc";
import type { EmailItem, ItemsBlock } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { errorText } from "@/lib/email/labels";
import { postJson } from "@/lib/pages/stream";
import { docOf, kitOf, profileOf, targetsName, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { Panel, Skeleton } from "@/components/console/primitives";
import { Thumb } from "@/components/console/pages/shared";
import { coverTiles } from "@/components/console/pages/taste-cover";
import { Notice, Spinner } from "@/components/console/setup/atoms";
import { Avatar, ContactAvatar, aboutOf, briefOf, faceOf, firstNameOf, peopleCount, type AudienceRow, type EmailContact } from "@/components/console/email/contacts/shared";
import { EmailPreviewDialog } from "@/components/console/email/campaigns/email-preview-dialog";
import { useBrandItems } from "@/components/console/email/campaigns/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";

/** A group's or a person's version, with `stale` when it was written against an older doc. */
type Version = FunctionReturnType<typeof api.emailCampaigns.versions>[number];

/** Someone the campaign can go to: a taste group, or one of the brand's individual contacts. */
type Target = { kind: "group"; id: string; audience: AudienceRow } | { kind: "person"; id: string; contact: EmailContact };

/**
 * Step 2: who the campaign goes to, as one list: the brand's taste groups and
 * its individual contacts, each ticked in or out, each with the version it
 * gets. One group alone gets the email as written for it; anything more (or
 * an email with taste slots) gets a version each, written by Personalise.
 * New people are added on Contacts, before the email is written for them.
 */
export function RecipientsStep({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const individuals = (audiences ?? []).find((a) => a.kind === "people" && a.size > 0) ?? null;
  const people = useQuery(api.emailContacts.byAudience, individuals ? { audienceId: individuals._id } : "skip");
  const versions = useQuery(api.emailCampaigns.versions, { id: campaign._id });
  const readiness = useQuery(api.emailSend.readiness, { campaignId: campaign._id });
  const setTargets = useMutation(api.emailCampaigns.setTargets);
  const items = useBrandItems(brand._id);
  const pathname = usePathname();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Target | null>(null);

  const locked = campaign.status !== "draft";
  const doc = docOf(campaign);
  const slots = doc ? personalBlocks(doc) : [];
  const itemsBlock = slots.find((b): b is ItemsBlock => b.type === "items");
  const groups = useMemo(() => (audiences ?? []).filter((a) => a.kind === "group").sort((a, b) => b.size - a.size), [audiences]);
  const groupIds = useMemo(() => new Set<string>(campaign.groupIds ?? []), [campaign.groupIds]);
  const contactIds = useMemo(() => new Set<string>(campaign.contactIds ?? []), [campaign.contactIds]);
  const byTarget = useMemo(() => new Map((versions ?? []).map((v) => [(v.group?._id ?? v.contact?._id) as string, v])), [versions]);
  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  const pickedGroups = groups.filter((g) => groupIds.has(g._id));
  const pickedPeople = (people ?? []).filter((c) => contactIds.has(c._id));
  // One group alone gets the email written for it, unless the email has taste slots; anything more gets a version each.
  const many = pickedGroups.length > 1 || pickedPeople.length > 0 || (pickedGroups.length > 0 && slots.length > 0);
  const targets: Target[] = [
    ...pickedGroups.map((a) => ({ kind: "group" as const, id: a._id as string, audience: a })),
    ...pickedPeople.filter((c) => !c.unsubscribed).map((c) => ({ kind: "person" as const, id: c._id as string, contact: c })),
  ];
  const state = campaign.personalization;
  const running = starting || state?.status === "running";
  const stale = targets.filter((t) => byTarget.get(t.id)?.stale);
  const missing = targets.filter((t) => !byTarget.has(t.id) || byTarget.get(t.id)?.status === "failed");
  const done = targets.length - missing.length;

  async function save(next: { groupIds?: string[]; contactIds?: string[] }) {
    if (locked) return;
    setError(null);
    try {
      await setTargets({
        id: campaign._id,
        ...(next.groupIds ? { groupIds: next.groupIds as Id<"emailAudiences">[] } : {}),
        ...(next.contactIds ? { contactIds: next.contactIds as Id<"emailContacts">[] } : {}),
      });
    } catch (err) {
      setError(errorText(err));
    }
  }
  const toggleGroup = (a: AudienceRow) => {
    if (a.status !== "ready" && !groupIds.has(a._id)) return;
    void save({ groupIds: groupIds.has(a._id) ? [...groupIds].filter((id) => id !== a._id) : [...groupIds, a._id] });
  };
  const togglePerson = (c: EmailContact) => void save({ contactIds: contactIds.has(c._id) ? [...contactIds].filter((id) => id !== c._id) : [...contactIds, c._id] });

  async function run(only?: Target[]) {
    setStarting(true);
    setError(null);
    try {
      const ids = only && {
        audienceIds: only.filter((t) => t.kind === "group").map((t) => t.id),
        contactIds: only.filter((t) => t.kind === "person").map((t) => t.id),
      };
      // The agent answers 200 with ok: false when it cannot start (no versions to write, campaign gone).
      const res = await postJson<{ ok: boolean; total?: number; error?: string }>("/api/email/personalise", { campaignId: campaign._id, ...(ids ?? {}) });
      if (!res.ok) throw new Error(res.error ?? "Personalising could not start.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  }

  const row = (t: Target) => {
    const ticked = t.kind === "group" ? groupIds.has(t.id) : contactIds.has(t.id);
    return (
      <RecipientRow
        key={t.id}
        target={t}
        ticked={ticked}
        many={many}
        version={ticked ? byTarget.get(t.id) : undefined}
        slots={slots.length}
        itemsBlockId={itemsBlock?.id}
        itemById={itemById}
        writing={ticked && running && many && !byTarget.has(t.id)}
        locked={locked}
        onToggle={() => (t.kind === "group" ? toggleGroup(t.audience) : togglePerson(t.contact))}
        onPreview={() => setPreviewing(t)}
        onUpdate={() => void run([t])}
      />
    );
  };

  const loading = audiences === undefined || (individuals !== null && people === undefined);
  const contactsHref = `/dashboard/email/${brand.slug}/contacts`;
  const reachable = (people ?? []).filter((c) => !c.unsubscribed);
  const avatars = [
    ...pickedGroups.map((g) => ({ key: g._id as string, name: g.name, image: coverTiles(profileOf(g), 1, true)[0]?.image, group: true })),
    ...pickedPeople.map((c) => ({ key: c._id as string, name: c.name || c.email, image: faceOf(c), group: false })),
  ];

  return (
    // The campaign shell gives the step its page width and padding.
    <div className="w-full space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-neutral-950">Who is it for?</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tick the taste groups and people this goes to. Each gets a version of the email written from their own taste. To add people, import them on{" "}
          <Link href={contactsHref} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
            Contacts
          </Link>{" "}
          before you write the email.
        </p>
      </div>

      {locked && <Notice>This campaign has left the drafts, so who it goes to is fixed.</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : !groups.length && !individuals ? (
        <Panel className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-neutral-100">
            <UsersRound className="size-5 text-neutral-700" />
          </span>
          <h2 className="mt-4 font-semibold">No contacts yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Import a CSV on Contacts and sort it into taste groups, or keep people as individual contacts. Then come back and tick who this goes to.
          </p>
          <Link href={contactsHref} className={cn(buttonVariants(), "mt-5 h-9 rounded-full px-4")}>
            Go to Contacts <ArrowRight data-icon="inline-end" />
          </Link>
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5 sm:p-6">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                {avatars.length > 0 ? (
                  <div className="flex shrink-0 -space-x-2">
                    {avatars.slice(0, 5).map((a) => (
                      <Avatar key={a.key} name={a.name} image={a.image} className={cn("size-10 ring-2 ring-white", a.group && "rounded-xl")} />
                    ))}
                  </div>
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                    <UsersRound className="size-[18px] text-neutral-500" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-lg font-semibold tracking-tight text-neutral-950">
                    {targets.length ? (
                      <>
                        {peopleCount(readiness?.recipients ?? 0, "person")}
                        <span className="font-normal text-muted-foreground"> · {many ? (targets.length === 1 ? "1 version" : `${targets.length} versions`) : "1 email"}</span>
                      </>
                    ) : (
                      "No one yet"
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {targets.length
                      ? `${targetsName(pickedGroups, pickedPeople.length)}${readiness?.excluded ? `, ${fmt.int(readiness.excluded)} unsubscribed left out` : ""}`
                      : "Tick a taste group or a person below."}
                  </p>
                </div>
              </div>
              {many && !locked && (
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {running ? `Writing ${fmt.int(state?.done ?? 0)} of ${fmt.int(state?.total || targets.length)}` : slots.length ? `${done} of ${targets.length} written` : "No taste slots yet"}
                  </span>
                  {stale.length > 0 && !running ? (
                    <Button className="h-9 rounded-full px-4" onClick={() => void run(stale)}>
                      <RefreshCw data-icon="inline-start" /> Update {stale.length} changed
                    </Button>
                  ) : (
                    <Button
                      // Every version written: writing them again replaces them, so it is the quiet option.
                      variant={!running && done > 0 && !missing.length ? "outline" : "default"}
                      className={cn("h-9 rounded-full px-4", !running && done > 0 && !missing.length && "bg-white")}
                      disabled={running || !slots.length || targets.length === 0}
                      onClick={() => void run(missing.length && done ? missing : undefined)}
                    >
                      {running ? <Spinner data-icon="inline-start" /> : <UserStar data-icon="inline-start" />}
                      {running ? "Personalising" : done === 0 ? `Personalise ${targets.length === 1 ? "it" : `all ${targets.length}`}` : missing.length ? `Write the other ${missing.length}` : "Write them again"}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {running && (
              <div className="border-t border-black/[0.05] px-6 py-3">
                <Progress value={state?.total ? Math.round((state.done / state.total) * 100) : 4} />
              </div>
            )}
            {state?.status === "failed" && !running && <p className="border-t border-black/[0.05] px-6 py-3 text-sm text-destructive">{state.error ?? "Personalising stopped."}</p>}
            {many && !slots.length && (
              <p className="border-t border-black/[0.05] px-6 py-3 text-sm text-muted-foreground">
                Everyone would get the same words.{" "}
                <Link href={pathname} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
                  Back to the editor
                </Link>{" "}
                to mark the hero, intro and picks as taste slots, or ask the builder to.
              </p>
            )}
          </Panel>

          {groups.length > 0 && (
            <section className="space-y-3">
              <ListTitle title="Taste groups" hint="One version per group, written for what its members share" />
              <Panel>
                <ul className="divide-y divide-black/[0.05]">{groups.map((a) => row({ kind: "group", id: a._id, audience: a }))}</ul>
              </Panel>
            </section>
          )}

          {individuals && (
            <section className="space-y-3">
              <ListTitle
                title="Individual contacts"
                hint="A version each, written from their own profile"
                actions={
                  !locked && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!reachable.length || reachable.every((c) => contactIds.has(c._id))}
                        onClick={() => void save({ contactIds: reachable.map((c) => c._id) })}
                      >
                        Tick everyone
                      </Button>
                      {contactIds.size > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => void save({ contactIds: [] })}>
                          Clear
                        </Button>
                      )}
                    </>
                  )
                }
              />
              <Panel>
                <ul className="divide-y divide-black/[0.05]">{(people ?? []).map((c) => row({ kind: "person", id: c._id, contact: c }))}</ul>
              </Panel>
            </section>
          )}
        </>
      )}

      <VersionPreview campaign={campaign} brand={brand} target={previewing} version={previewing ? byTarget.get(previewing.id) : undefined} onClose={() => setPreviewing(null)} />
    </div>
  );
}

function ListTitle({ title, hint, actions }: { title: string; hint: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 px-1">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-neutral-950">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

/** A taste group's face: the first picture from its taste. */
function GroupAvatar({ audience, className }: { audience: AudienceRow; className?: string }) {
  return <Avatar name={audience.name} image={coverTiles(profileOf(audience), 1, true)[0]?.image} className={cn("rounded-xl", className)} />;
}

/** What the row and the preview say about the reader. */
function readerOf(t: Target) {
  if (t.kind === "group") {
    const a = t.audience;
    const newcomers = a.newcomers ?? 0;
    return {
      name: a.name,
      first: a.name,
      about: [peopleCount(a.size, "person"), newcomers ? (newcomers === 1 ? "1 hasn't bought yet" : `${newcomers} haven't bought yet`) : null].filter(Boolean).join(", "),
      detail: a.status !== "ready" ? (a.status === "failed" ? "Couldn't be read" : "Still being read") : a.topEntities.length ? `Into ${a.topEntities.slice(0, 3).join(", ")}` : undefined,
      unsubscribed: false,
      avatar: (c: string) => <GroupAvatar audience={a} className={c} />,
    };
  }
  const c = t.contact;
  const bought = c.purchases?.length ? c.purchases : null;
  return {
    name: c.name || c.email,
    first: firstNameOf(c),
    about: aboutOf(c) || c.email,
    detail: c.unsubscribed ? "Unsubscribed" : bought ? `Bought ${bought.slice(0, 2).join(" and ")}${bought.length > 2 ? ` +${bought.length - 2}` : ""}` : "Hasn't bought yet",
    unsubscribed: !!c.unsubscribed,
    avatar: (cls: string) => <ContactAvatar contact={c} className={cls} />,
  };
}

/**
 * One group or person: ticked in or out on the left, the version they get on
 * the right (subject, picks and why), with a preview.
 */
function RecipientRow({
  target,
  ticked,
  many,
  version,
  slots,
  itemsBlockId,
  itemById,
  writing,
  locked,
  onToggle,
  onPreview,
  onUpdate,
}: {
  target: Target;
  ticked: boolean;
  many: boolean;
  version?: Version;
  slots: number;
  itemsBlockId?: string;
  itemById: Map<string, EmailItem>;
  writing: boolean;
  locked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onUpdate: () => void;
}) {
  const reader = readerOf(target);
  const group = target.kind === "group";
  const unavailable = reader.unsubscribed || (group && target.audience.status !== "ready" && !ticked);
  const p = version?.status === "ready" ? version.personalization : null;
  const picks = ((itemsBlockId && (p?.blocks[itemsBlockId] as Partial<ItemsBlock> | undefined)?.itemIds) || [])
    .map((id) => itemById.get(id))
    .filter((i): i is EmailItem => !!i)
    .slice(0, 3);

  let gets: ReactNode;
  if (!ticked) gets = <p className="text-sm text-muted-foreground">{reader.unsubscribed ? "Unsubscribed, left out of sends" : "Not in this campaign"}</p>;
  else if (!many)
    gets = (
      <p className="line-clamp-2 text-sm text-neutral-700">
        <Fingerprint className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
        {group ? (briefOf(target.audience)?.summary ?? "One email, written for this group's taste.") : "The email as written, with their name merged in."}
      </p>
    );
  else if (!slots) gets = <p className="text-sm text-muted-foreground">The shared email, with their name merged in.</p>;
  else if (writing)
    gets = (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" /> Reading {group ? "the group's" : `${reader.first}'s`} taste and picking for {group ? "it" : "them"}
      </p>
    );
  else if (version?.status === "failed")
    gets = (
      <p className="flex items-start gap-1.5 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {version.error ?? "This version could not be written."}
      </p>
    );
  else if (p)
    gets = (
      <div className="flex min-w-0 items-center gap-3.5">
        {picks.length > 0 && (
          <div className="flex shrink-0 gap-1">
            {picks.map((i) => (
              <Thumb key={i.id} src={i.image} alt={i.name} className="aspect-[2/3] w-8 ring-1 ring-black/10" rounded="rounded-[3px]" />
            ))}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-950">{p.subject || "Shared subject line"}</p>
          {p.why && (
            <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground" title={p.why}>
              {p.why}
            </p>
          )}
          {version?.stale && <p className="text-xs text-amber-700">Written for an earlier draft of the email</p>}
        </div>
      </div>
    );
  else gets = <p className="text-sm text-muted-foreground">Not personalised yet</p>;

  return (
    <li className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 md:grid-cols-[auto_minmax(0,17rem)_minmax(0,1fr)_auto]", !ticked && "bg-neutral-50/60")}>
      <Checkbox
        checked={ticked}
        disabled={locked || unavailable}
        onCheckedChange={onToggle}
        aria-label={`${ticked ? "Leave out" : "Send to"} ${reader.name}`}
        className="size-[18px] rounded-[5px] border-neutral-300 bg-white data-checked:border-neutral-900 data-checked:bg-neutral-900 data-checked:text-white"
      />
      <button type="button" disabled={locked || unavailable} onClick={onToggle} className="flex min-w-0 items-center gap-3 text-left disabled:cursor-not-allowed">
        {reader.avatar(cn("size-10", !ticked && "opacity-60 grayscale"))}
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-medium", ticked ? "text-neutral-950" : "text-neutral-600")}>{reader.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{reader.about}</span>
          {reader.detail && <span className="block truncate text-xs text-muted-foreground">{reader.detail}</span>}
        </span>
      </button>
      <div className="col-span-2 min-w-0 md:col-span-1">{gets}</div>
      <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
        {ticked && version?.stale && !locked && !writing && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onUpdate} title="The email changed after this version was written">
            <RefreshCw data-icon="inline-start" /> Update
          </Button>
        )}
        {ticked && !reader.unsubscribed && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onPreview}>
            <Eye data-icon="inline-start" /> Preview
          </Button>
        )}
      </div>
    </li>
  );
}

/** One version as the send renders it: a group's (merge tags show their fallbacks) or a person's (their name merged). */
function VersionPreview({
  campaign,
  brand,
  target,
  version,
  onClose,
}: {
  campaign: EmailCampaign;
  brand: EmailBrand;
  target: Target | null;
  version?: Version;
  onClose: () => void;
}) {
  const render = useQuery(
    api.emailCampaigns.renderFor,
    !target ? "skip" : target.kind === "group" ? { id: campaign._id, audienceId: target.audience._id } : { id: campaign._id, contactId: target.contact._id },
  );
  const why = version?.status === "ready" ? version.personalization.why : undefined;
  const reader = target ? readerOf(target) : null;
  const likes = !target ? [] : target.kind === "group" ? target.audience.topEntities.slice(0, 8) : target.contact.entities.slice(0, 8).map((e) => e.name);
  return (
    <EmailPreviewDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={!target || !reader ? "" : target.kind === "group" ? `${reader.name}: the group's version` : `${reader.name}'s version`}
      description={!target ? undefined : target.kind === "group" ? reader?.about : [target.contact.email, aboutOf(target.contact)].filter(Boolean).join(" · ")}
      html={render?.html}
      subject={render?.subject}
      preheader={render?.preheader}
      from={brand.sender?.fromName ?? brand.name}
      mark={kitOf(brand)?.icon ?? kitOf(brand)?.logo?.src}
      color={kitOf(brand)?.colors.primary}
      aside={
        target && reader ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              {reader.avatar("size-11")}
              <div className="min-w-0">
                <div className="truncate font-medium">{reader.name}</div>
                <div className="truncate text-xs text-muted-foreground">{reader.about}</div>
              </div>
            </div>
            {why ? (
              <p className="leading-relaxed text-neutral-700">
                <Fingerprint className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                {why}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {target.kind === "group" ? "Not personalised yet: this is the shared email." : "Not personalised yet: this is the shared email with their name merged in."}
              </p>
            )}
            {target.kind === "group" && briefOf(target.audience)?.summary && <p className="leading-relaxed text-muted-foreground">{briefOf(target.audience)?.summary}</p>}
            {likes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{target.kind === "group" ? "What they share" : "What they like"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {likes.map((name) => (
                    <span key={name} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
