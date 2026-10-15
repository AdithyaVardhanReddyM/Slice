"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertCircle, Boxes, Check, Eye, Fingerprint, MailX, RefreshCw, Upload, UserPlus, UserStar, UsersRound } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { personalBlocks } from "@slice/backend/convex/emailDoc";
import type { EmailItem, ItemsBlock } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { errorText } from "@/lib/email/labels";
import { postJson } from "@/lib/pages/stream";
import { docOf, type EmailBrand, type EmailCampaign } from "@/lib/email/types";
import { Panel, Skeleton } from "@/components/console/primitives";
import { Thumb } from "@/components/console/pages/shared";
import { Notice, Spinner } from "@/components/console/setup/atoms";
import { AddContactSheet } from "@/components/console/email/contacts/add-contact-sheet";
import { ImportContactsSheet } from "@/components/console/email/contacts/import-sheet";
import { AudienceCard, ContactAvatar, aboutOf, briefOf, firstNameOf, peopleCount, type AudienceRow, type EmailContact } from "@/components/console/email/contacts/shared";
import { EmailPreviewDialog } from "@/components/console/email/campaigns/email-preview-dialog";
import { useBrandItems } from "@/components/console/email/campaigns/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** One person's version, with `stale` when it was written against an older doc. */
type Version = FunctionReturnType<typeof api.emailCampaigns.versions>[number];

/**
 * Step 2: who the campaign goes to. One taste group (one email written for
 * its taste), or individual contacts ticked one by one, where every ticked
 * person gets their own version of the personal blocks.
 */
export function RecipientsStep({ campaign, brand }: { campaign: EmailCampaign; brand: EmailBrand }) {
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const setAudience = useMutation(api.emailCampaigns.setAudience);
  const [sheet, setSheet] = useState<"import" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = campaign.status !== "draft";

  const all = audiences ?? [];
  const selected = all.find((a) => a._id === campaign.audienceId) ?? null;
  const groups = all.filter((a) => a.kind === "group").sort((a, b) => b.size - a.size);
  const individuals = all.find((a) => a.kind === "people" && a.size > 0) ?? null;

  /** Aims the campaign at a group, or at the individual contacts (no one ticked yet). */
  async function pick(a: AudienceRow) {
    if (locked || a._id === campaign.audienceId || (a.kind === "group" && a.status !== "ready")) return true;
    setError(null);
    try {
      await setAudience({ id: campaign._id, audienceId: a._id });
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  const grid = (list: AudienceRow[]) => (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((a) => (
        <AudienceCard
          key={a._id}
          audience={a}
          selected={a._id === campaign.audienceId}
          onClick={() => void pick(a)}
          className={cn((locked || a.status !== "ready") && a._id !== campaign.audienceId && "cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none")}
        />
      ))}
    </div>
  );

  return (
    // The campaign shell gives the step its page width and padding.
    <div className="w-full space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em] text-neutral-950">Who is it for?</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pick one taste group, or tick individual contacts. A taste group gets one email written for its taste; each person you tick gets their own version, written from their profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 rounded-full bg-white px-3.5" onClick={() => setSheet("add")}>
            <UserPlus data-icon="inline-start" /> Add by hand
          </Button>
          <Button variant="outline" className="h-9 rounded-full bg-white px-3.5" onClick={() => setSheet("import")}>
            <Upload data-icon="inline-start" /> Import contacts
          </Button>
        </div>
      </div>

      {locked && <Notice>This campaign has left the drafts, so who it goes to is fixed.</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}

      {audiences === undefined ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <Panel className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-neutral-100">
            <UsersRound className="size-5 text-neutral-700" />
          </span>
          <h2 className="mt-4 font-semibold">No contacts yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Import a CSV and sort it into taste groups, or add people as individual contacts. Qloo reads what each person likes so the email can follow it.
          </p>
          <div className="mt-5 flex gap-2">
            <Button className="h-9 rounded-full px-4" onClick={() => setSheet("import")}>
              <Upload data-icon="inline-start" /> Import contacts
            </Button>
            <Button variant="outline" className="h-9 rounded-full px-4" onClick={() => setSheet("add")}>
              <UserPlus data-icon="inline-start" /> Add by hand
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          {groups.length > 0 && (
            <section className="space-y-4">
              <SectionTitle icon={Boxes} title="Taste groups" hint="One email, written for the group's taste" />
              {grid(groups)}
            </section>
          )}
          {individuals && (
            <section className="space-y-4">
              <SectionTitle icon={UsersRound} title="Individual contacts" hint="Tick who gets it: each person gets a version written for them" />
              <PickPeople campaign={campaign} audience={individuals} locked={locked} onUse={() => pick(individuals)} />
            </section>
          )}
        </>
      )}

      {selected?.kind === "group" && <GroupNote audience={selected} />}
      {selected?.kind === "people" && (campaign.contactIds?.length ?? 0) > 0 && <Personalise campaign={campaign} brand={brand} audience={selected} />}

      <ImportContactsSheet open={sheet === "import"} onOpenChange={(o) => setSheet(o ? "import" : null)} />
      <AddContactSheet open={sheet === "add"} onOpenChange={(o) => setSheet(o ? "add" : null)} />
    </div>
  );
}

/** The individual contacts as a tick list; ticking someone also aims the campaign at the individuals. */
function PickPeople({ campaign, audience, locked, onUse }: { campaign: EmailCampaign; audience: AudienceRow; locked: boolean; onUse: () => Promise<boolean> }) {
  const contacts = useQuery(api.emailContacts.byAudience, { audienceId: audience._id });
  const setContacts = useMutation(api.emailCampaigns.setContacts);
  const [error, setError] = useState<string | null>(null);
  const active = campaign.audienceId === audience._id;
  const ticked = useMemo(() => new Set<string>(active ? (campaign.contactIds ?? []) : []), [active, campaign.contactIds]);
  const reachable = (contacts ?? []).filter((c) => !c.unsubscribed);

  async function save(ids: string[]) {
    if (locked) return;
    setError(null);
    try {
      if (!active && !(await onUse())) return;
      await setContacts({ id: campaign._id, contactIds: ids as Id<"emailContacts">[] });
    } catch (err) {
      setError(errorText(err));
    }
  }
  const toggle = (id: string) => void save(ticked.has(id) ? [...ticked].filter((x) => x !== id) : [...ticked, id]);

  return (
    <Panel className={cn("overflow-visible", active && "ring-2 ring-neutral-900")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-3.5">
        <p className="text-sm">
          {active && ticked.size ? (
            <span className="font-medium text-neutral-950">
              {fmt.int(ticked.size)} of {peopleCount(reachable.length, "person")} ticked
            </span>
          ) : (
            <span className="text-muted-foreground">{peopleCount(audience.size, "person")}. Tick the ones this campaign is for.</span>
          )}
        </p>
        {!locked && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!reachable.length || ticked.size === reachable.length} onClick={() => void save(reachable.map((c) => c._id))}>
              Tick everyone
            </Button>
            {ticked.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void save([])}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}
      {contacts === undefined ? (
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => {
            const on = ticked.has(c._id);
            return (
              <li key={c._id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={locked || !!c.unsubscribed}
                  onClick={() => toggle(c._id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    on && "bg-neutral-100",
                    c.unsubscribed && "opacity-60",
                  )}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-neutral-900 bg-neutral-900 text-white" : "border-black/20 bg-white")}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <ContactAvatar contact={c} className="size-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-950">{c.name || c.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.unsubscribed ? "Unsubscribed" : aboutOf(c) || c.entities[0]?.name || c.email}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: typeof Boxes; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]">
        <Icon className="size-[18px] text-neutral-800" />
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/** For a group: how the builder writes to them, from the brief. */
function GroupNote({ audience }: { audience: AudienceRow }) {
  const brief = briefOf(audience);
  if (!brief) return null;
  return (
    <Panel className="grid gap-6 p-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Fingerprint className="size-3.5" /> Written for {audience.name}
        </span>
        <p className="text-[15px] leading-relaxed text-neutral-900">{brief.summary}</p>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Speak to them</dt>
          <dd className="mt-1 leading-relaxed">{brief.speakTo}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lead with</dt>
          <dd className="mt-1 leading-relaxed">{brief.leadWith}</dd>
        </div>
        {brief.hooks.slice(0, 2).map((h, i) => (
          <div key={i}>
            <dt className="text-muted-foreground">Hook {i + 1}</dt>
            <dd className="mt-1 leading-relaxed">
              {h.text} <span className="text-xs text-muted-foreground">({h.evidence})</span>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** For the individuals ticked: write everyone's version, watch it fill, check each person's. */
function Personalise({ campaign, brand, audience }: { campaign: EmailCampaign; brand: EmailBrand; audience: AudienceRow }) {
  const pathname = usePathname();
  const everyone = useQuery(api.emailContacts.byAudience, { audienceId: audience._id });
  const contacts = useMemo(() => {
    const picked = new Set<string>(campaign.contactIds ?? []);
    return everyone?.filter((c) => picked.has(c._id));
  }, [everyone, campaign.contactIds]);
  const versions = useQuery(api.emailCampaigns.versions, { id: campaign._id });
  const items = useBrandItems(brand._id);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<EmailContact | null>(null);

  const doc = docOf(campaign);
  const slots = doc ? personalBlocks(doc) : [];
  const itemsBlock = slots.find((b): b is ItemsBlock => b.type === "items");
  const state = campaign.personalization;
  const running = starting || state?.status === "running";
  const byContact = useMemo(() => new Map((versions ?? []).map((v) => [v.contact._id as string, v])), [versions]);
  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const active = (contacts ?? []).filter((c) => !c.unsubscribed);
  const stale = active.filter((c) => byContact.get(c._id)?.stale);
  const missing = active.filter((c) => !byContact.has(c._id) || byContact.get(c._id)?.status === "failed");
  const done = active.length - missing.length;

  async function run(contactIds?: Id<"emailContacts">[]) {
    setStarting(true);
    setError(null);
    try {
      // The agent answers 200 with ok: false when it cannot start (no versions to write, campaign gone).
      const res = await postJson<{ ok: boolean; total?: number; error?: string }>("/api/email/personalise", { campaignId: campaign._id, ...(contactIds ? { contactIds } : {}) });
      if (!res.ok) throw new Error(res.error ?? "Personalising could not start.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  }

  const locked = campaign.status !== "draft";

  return (
    <section className="space-y-5">
      <Panel className="overflow-visible">
        <div className="flex flex-wrap items-center gap-4 p-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-white">
            <UserStar className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">Personalise for each person</h2>
            <p className="text-sm text-muted-foreground">
              {slots.length
                ? `The builder rewrites the ${slots.length === 1 ? "taste slot" : `${slots.length} taste slots`} for each of the ${peopleCount(active.length, "person")} from their own profile, and picks their items by taste.`
                : "This email has no taste slots yet, so everyone would get the same words. Mark blocks as personal in the editor first."}
            </p>
          </div>
          {!locked &&
            (stale.length > 0 && !running ? (
              <Button className="h-9 rounded-full px-4" onClick={() => void run(stale.map((c) => c._id))}>
                <RefreshCw data-icon="inline-start" /> Update {stale.length} changed
              </Button>
            ) : (
              <Button className="h-9 rounded-full px-4" disabled={running || !slots.length || active.length === 0} onClick={() => void run(missing.length && done ? missing.map((c) => c._id) : undefined)}>
                {running ? <Spinner data-icon="inline-start" /> : <UserStar data-icon="inline-start" />}
                {running ? "Personalising" : done === 0 ? "Personalise for each person" : missing.length ? `Write the other ${missing.length}` : "Write them again"}
              </Button>
            ))}
        </div>
        {!slots.length && (
          <div className="border-t border-black/[0.05] px-6 py-3 text-sm">
            <Link href={pathname} className="font-medium underline-offset-4 hover:underline">
              Back to the editor
            </Link>
            <span className="text-muted-foreground"> and use the personal toggle on the hero, intro and picks, or ask the builder to mark them.</span>
          </div>
        )}
        {(running || state?.status === "failed" || error) && (
          <div className="space-y-2 border-t border-black/[0.05] px-6 py-4">
            {error || state?.status === "failed" ? (
              <p className="text-sm text-destructive">{error ?? state?.error ?? "Personalising stopped."}</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Writing each person&apos;s version</span>
                  <span className="num text-xs text-muted-foreground">
                    {fmt.int(state?.done ?? 0)} of {fmt.int(state?.total || active.length)}
                  </span>
                </div>
                <Progress value={state?.total ? Math.round((state.done / state.total) * 100) : 4} />
              </>
            )}
          </div>
        )}
      </Panel>

      {contacts === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => (
            <PersonCard
              key={c._id}
              contact={c}
              version={byContact.get(c._id)}
              baseSubject={doc?.subject ?? ""}
              itemsBlockId={itemsBlock?.id}
              itemById={itemById}
              writing={running && !byContact.has(c._id)}
              locked={locked}
              onPreview={() => setPreviewing(c)}
              onUpdate={() => void run([c._id])}
            />
          ))}
        </ul>
      )}

      <PersonPreview campaign={campaign} brand={brand} contact={previewing} version={previewing ? byContact.get(previewing._id) : undefined} onClose={() => setPreviewing(null)} />
    </section>
  );
}

function PersonCard({
  contact,
  version,
  baseSubject,
  itemsBlockId,
  itemById,
  writing,
  locked,
  onPreview,
  onUpdate,
}: {
  contact: EmailContact;
  version?: Version;
  baseSubject: string;
  itemsBlockId?: string;
  itemById: Map<string, EmailItem>;
  writing: boolean;
  locked: boolean;
  onPreview: () => void;
  onUpdate: () => void;
}) {
  const p = version?.status === "ready" ? version.personalization : null;
  const stale = !!version?.stale;
  const picks = ((itemsBlockId && (p?.blocks[itemsBlockId] as Partial<ItemsBlock> | undefined)?.itemIds) || [])
    .map((id) => itemById.get(id))
    .filter((i): i is EmailItem => !!i)
    .slice(0, 4);

  return (
    <li className={cn("flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)] ring-1 ring-black/[0.06]", contact.unsubscribed && "opacity-60")}>
      <div className="flex items-center gap-3">
        <ContactAvatar contact={contact} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-950">{contact.name || contact.email}</div>
          <div className="truncate text-xs text-muted-foreground">{aboutOf(contact) || contact.email}</div>
        </div>
        {contact.unsubscribed ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MailX className="size-3.5" /> Unsubscribed
          </span>
        ) : writing ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Writing
          </span>
        ) : stale && !locked ? (
          <Button variant="outline" size="xs" onClick={onUpdate} title="The email changed after this version was written">
            <RefreshCw data-icon="inline-start" /> Update
          </Button>
        ) : null}
      </div>

      {contact.unsubscribed ? (
        <p className="text-sm text-muted-foreground">Left out of sends.</p>
      ) : version?.status === "failed" ? (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {version.error ?? `${firstNameOf(contact)}'s version could not be written.`}
        </p>
      ) : p ? (
        <>
          <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
            <div className="truncate text-sm font-medium text-neutral-950">{p.subject || baseSubject || "No subject"}</div>
            {p.preheader && <div className="truncate text-xs text-muted-foreground">{p.preheader}</div>}
          </div>
          {picks.length > 0 && (
            <div className="flex gap-2">
              {picks.map((i) => (
                <Thumb key={i.id} src={i.image} alt={i.name} className="aspect-[2/3] w-12 ring-1 ring-black/10" rounded="rounded-md" />
              ))}
            </div>
          )}
          {p.why && (
            <p className="line-clamp-3 text-sm leading-relaxed text-neutral-700">
              <Fingerprint className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
              {p.why}
            </p>
          )}
          {stale && <p className="text-xs text-amber-700">Written for an earlier draft of the email.</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{writing ? `Reading ${firstNameOf(contact)}'s taste and picking for them.` : "Not personalised yet."}</p>
      )}

      {!contact.unsubscribed && (
        <Button variant="ghost" size="sm" className="mt-auto self-start" onClick={onPreview}>
          <Eye data-icon="inline-start" /> Preview {p ? `${firstNameOf(contact)}'s version` : "as them"}
        </Button>
      )}
    </li>
  );
}

/** One person's email, as the send renders it (personalised and merged). */
function PersonPreview({
  campaign,
  brand,
  contact,
  version,
  onClose,
}: {
  campaign: EmailCampaign;
  brand: EmailBrand;
  contact: EmailContact | null;
  version?: Version;
  onClose: () => void;
}) {
  const render = useQuery(api.emailCampaigns.renderFor, contact ? { id: campaign._id, contactId: contact._id } : "skip");
  const why = version?.status === "ready" ? version.personalization.why : undefined;
  return (
    <EmailPreviewDialog
      open={!!contact}
      onOpenChange={(o) => !o && onClose()}
      title={contact ? `${contact.name || contact.email}'s version` : ""}
      description={contact ? [contact.email, aboutOf(contact)].filter(Boolean).join(" · ") : undefined}
      html={render?.html}
      subject={render?.subject}
      preheader={render?.preheader}
      from={brand.sender?.fromName ?? brand.name}
      aside={
        contact ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <ContactAvatar contact={contact} className="size-11" />
              <div className="min-w-0">
                <div className="truncate font-medium">{contact.name}</div>
                <div className="truncate text-xs text-muted-foreground">{aboutOf(contact) || contact.email}</div>
              </div>
            </div>
            {why ? (
              <p className="leading-relaxed text-neutral-700">
                <Fingerprint className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                {why}
              </p>
            ) : (
              <p className="text-muted-foreground">Not personalised yet: this is the shared email with their name merged in.</p>
            )}
            {contact.entities.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">What they like</p>
                <div className="flex flex-wrap gap-1.5">
                  {contact.entities.slice(0, 8).map((e) => (
                    <span key={e.id} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                      {e.name}
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
