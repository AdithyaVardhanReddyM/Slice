"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertCircle, Boxes, Check, MailX, MapPin, PenLine, Search, ShoppingBag, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { profileOf } from "@/lib/email/types";
import { errorText, relativeTime } from "@/lib/email/labels";
import { CLOSE_ON_COVER } from "@/components/console/pages/audience-drawer";
import { BrandsList, CultureLists, DemographicsBars, TagChips, TagTable } from "@/components/console/pages/profile-view";
import { EntityStrip, Hint, ProgressLine, Thumb } from "@/components/console/pages/shared";
import { TasteCover, coverTiles } from "@/components/console/pages/taste-cover";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Spinner } from "@/components/console/setup/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  KIND_ICON,
  KIND_LABEL,
  Pill,
  ContactAvatar,
  aboutOf,
  briefOf,
  historyWords,
  isBusy,
  peopleCount,
  statusLabel,
  type AudienceRow,
  type EmailContact,
} from "./shared";

/** The group itself, in the people column of a taste group. */
const GROUP = "group";

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/[0.06]">
      <header className="border-b border-black/[0.05] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

/**
 * A taste group or the individual contacts: the cover, then its people (with
 * search) on the left and on the right either the group's profile and brief or
 * the chosen person's taste.
 */
export function AudienceDrawer({
  audience,
  personId,
  onPerson,
  onClose,
}: {
  audience: AudienceRow | null;
  personId: string | null;
  onPerson: (id: string | null) => void;
  onClose: () => void;
}) {
  const contacts = useQuery(api.emailContacts.byAudience, audience ? { audienceId: audience._id } : "skip");
  const [q, setQ] = useState("");
  const group = audience?.kind === "group";
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = contacts ?? [];
    return needle ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.email.includes(needle) || (c.city ?? "").toLowerCase().includes(needle)) : all;
  }, [contacts, q]);
  // A group opens on itself; the individual contacts open on their first person.
  const selected = personId ?? (group ? GROUP : (contacts?.[0]?._id ?? null));
  const person = contacts?.find((c) => c._id === selected) ?? null;

  return (
    <Sheet
      open={!!audience}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          onClose();
        }
      }}
    >
      <SheetContent className={cn("w-full gap-0 overflow-y-auto bg-canvas data-[side=right]:sm:max-w-5xl", CLOSE_ON_COVER)}>
        {audience && (
          <>
            <TasteCover
              tiles={coverTiles(profileOf(audience), 5, true)}
              icon={KIND_ICON[audience.kind] ?? UsersRound}
              kindLabel={KIND_LABEL[audience.kind] ?? audience.kind}
              title={audience.name}
              subtitle={peopleCount(audience.size, group ? "contact" : "person")}
              corner={isBusy(audience.status) ? <Pill className="mr-10">{statusLabel(audience.status)}</Pill> : undefined}
              className="aspect-[21/6] shrink-0"
            />
            <SheetHeader className="sr-only">
              <SheetTitle>{audience.name}</SheetTitle>
              <SheetDescription>{peopleCount(audience.size)}</SheetDescription>
            </SheetHeader>
            <AudienceBar audience={audience} onRemoved={onClose} />

            <div className="grid min-h-[70svh] md:grid-cols-[17rem_minmax(0,1fr)]">
              <nav aria-label="People" className="border-b border-black/[0.05] bg-white md:border-r md:border-b-0">
                <div className="space-y-1 p-2 md:sticky md:top-0">
                  <div className="relative p-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="h-8 pl-8" aria-label="Search people" />
                  </div>
                  <ul className="flex gap-1 overflow-x-auto md:max-h-[calc(100svh-6rem)] md:flex-col md:overflow-y-auto">
                    {group && !q && (
                      <li className="shrink-0">
                        <button
                          type="button"
                          onClick={() => onPerson(null)}
                          aria-current={selected === GROUP || undefined}
                          className={cn(
                            "flex w-full min-w-48 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-neutral-100",
                            selected === GROUP && "bg-neutral-100",
                          )}
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
                            <Boxes className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">The group</span>
                            <span className="block truncate text-xs text-muted-foreground">Profile and brief</span>
                          </span>
                        </button>
                      </li>
                    )}
                    {shown.map((c) => (
                      <li key={c._id} className="shrink-0">
                        <PersonRow contact={c} active={c._id === selected} onClick={() => onPerson(c._id)} />
                      </li>
                    ))}
                    {contacts === undefined && (
                      <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                        <Spinner className="size-3.5" /> Loading people
                      </li>
                    )}
                    {contacts && shown.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{q ? "Nobody matches." : "No people yet."}</li>}
                  </ul>
                </div>
              </nav>
              <div className="min-w-0">
                {selected === GROUP ? <GroupPanel audience={audience} /> : person ? <PersonPanel key={person._id} contact={person} onRemoved={() => onPerson(null)} /> : null}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** What it is, progress, and for a group rename and delete. */
function AudienceBar({ audience, onRemoved }: { audience: AudienceRow; onRemoved: () => void }) {
  const rename = useMutation(api.emailAudiences.rename);
  // Deleting a group deletes its people too (the backend cascades).
  const remove = useMutation(api.emailAudiences.remove);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(audience.name);
  const brief = briefOf(audience);
  const group = audience.kind === "group";

  async function save() {
    const next = name.trim();
    if (next && next !== audience.name) await rename({ id: audience._id, name: next });
    setEditing(false);
  }

  return (
    <div className="space-y-4 border-b border-black/[0.05] bg-white px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-9 max-w-sm text-base font-semibold" aria-label="Name" />
            <Button type="submit" size="sm">
              <Check data-icon="inline-start" /> Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-neutral-800">
            {group
              ? (brief?.summary ?? "People whose tastes sit close together. A campaign for them is written once, for the group's taste.")
              : "Each person has their own taste profile. Tick them on a campaign and each gets a version of the email written for them."}
          </p>
        )}
        {!editing && group && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setName(audience.name);
                setEditing(true);
              }}
            >
              <PenLine data-icon="inline-start" /> Rename
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 data-icon="inline-start" /> Delete group
                </Button>
              }
              title={`Delete ${audience.name}?`}
              description={`The group and the ${peopleCount(audience.size)} in it are removed, and draft campaigns written for it lose their audience. Campaigns already sent keep their reports. This cannot be undone.`}
              actionLabel="Delete group"
              onConfirm={async () => {
                await remove({ id: audience._id });
                onRemoved();
              }}
            />
          </div>
        )}
      </div>
      {isBusy(audience.status) || audience.error ? <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} /> : null}
    </div>
  );
}

function PersonRow({ contact, active, onClick }: { contact: EmailContact; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn("flex w-full min-w-48 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-neutral-100", active && "bg-neutral-100")}
    >
      <ContactAvatar contact={contact} className={cn(contact.unsubscribed && "opacity-50 grayscale")} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", contact.unsubscribed && "text-muted-foreground")}>{contact.name || contact.email}</span>
        <span className="block truncate text-xs text-muted-foreground">{contact.unsubscribed ? "Unsubscribed" : aboutOf(contact) || contact.email}</span>
      </span>
      {contact.profileStatus === "compiling" && <Spinner className="size-3.5 text-muted-foreground" />}
      {contact.profileStatus === "failed" && <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Could not be read" />}
    </button>
  );
}

function GroupPanel({ audience }: { audience: AudienceRow }) {
  const profile = profileOf(audience);
  const brief = briefOf(audience);
  return (
    <div className="space-y-5 p-6">
      {brief ? (
        <Panel title="How to write to them" description="The agent's read of this group, from its Qloo profile">
          <dl className="divide-y divide-black/[0.05] text-sm">
            {(
              [
                ["Speak to them", brief.speakTo],
                ["Lead with", brief.leadWith],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="leading-relaxed">{value}</dd>
              </div>
            ))}
          </dl>
          {brief.hooks.length > 0 && (
            <ol className="grid gap-3 border-t border-black/[0.05] p-4 sm:grid-cols-2">
              {brief.hooks.map((h, i) => (
                <li key={i} className="flex gap-3 rounded-xl bg-neutral-50 p-3.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white tabular-nums">{i + 1}</span>
                  <div className="min-w-0 text-sm">
                    <p className="leading-relaxed">{h.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{h.evidence}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ) : (
        <Hint>The agent writes a brief for the group once its profile is ready.</Hint>
      )}
      {profile ? (
        <>
          <Panel title="What they love" description="Authors, books, films, artists and places this group over-indexes on">
            <div className="p-4">
              <CultureLists culture={profile.culture} max={6} />
            </div>
          </Panel>
          <Panel title="Taste tags" description={`${fmt.int(profile.tags.length)} tags from Qloo, strongest first in each group`}>
            <TagTable tags={profile.tags} perGroup={6} />
          </Panel>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel title="Brands they trust" description="Affinity out of 100">
              <BrandsList brands={profile.brands} max={6} />
            </Panel>
            <Panel title="Demographics" description="Skew against the Qloo baseline">
              <div className="p-4">
                <DemographicsBars demographics={profile.demographics} />
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Hint>The profile appears once Qloo has read the group.</Hint>
      )}
    </div>
  );
}

function PersonPanel({ contact, onRemoved }: { contact: EmailContact; onRemoved: () => void }) {
  const remove = useMutation(api.emailContacts.remove);
  const items = useQuery(api.emailItems.list, { brandId: contact.brandId });
  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i._id as string, i])), [items]);
  const bought = (contact.boughtItemIds ?? []).map((id) => itemById.get(id)).filter((i) => !!i);
  const words = historyWords(items);
  // Books show as covers; restaurants and products as photos.
  const covers = bought.every((i) => i.kind === "book");
  // Purchases the catalog didn't have, as written.
  const named = new Set(bought.map((i) => i.name.toLowerCase()));
  const elsewhere = (contact.purchases ?? []).filter((p) => !named.has(p.toLowerCase()) && ![...named].some((n) => p.toLowerCase().startsWith(n)));
  // The list queries leave profiles out; the person's own row has it.
  const full = useQuery(api.emailContacts.get, contact.hasProfile ? { id: contact._id } : "skip");
  const [error, setError] = useState<string | null>(null);
  const profile = profileOf(full);
  const first = contact.firstName || contact.name.split(/\s+/)[0] || "them";

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <ContactAvatar contact={contact} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="truncate">{contact.name || contact.email}</span>
            {contact.unsubscribed && (
              <Badge variant="secondary" className="font-normal">
                <MailX /> Unsubscribed{contact.unsubscribedAt ? ` ${relativeTime(contact.unsubscribedAt)}` : ""}
              </Badge>
            )}
          </h3>
          <p className="truncate text-sm text-muted-foreground">{[contact.email, aboutOf(contact)].filter(Boolean).join(" · ")}</p>
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 data-icon="inline-start" /> Remove
            </Button>
          }
          title={`Remove ${contact.name || contact.email}?`}
          description="They are removed from your contacts and get no more campaigns. Reports of campaigns already sent keep their row."
          actionLabel="Remove contact"
          onConfirm={async () => {
            try {
              await remove({ id: contact._id });
              onRemoved();
            } catch (err) {
              setError(errorText(err));
            }
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {contact.profileStatus === "compiling" || contact.profileStatus === "pending" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3.5" /> Qloo is reading {first}&apos;s taste
        </p>
      ) : contact.profileStatus === "failed" ? (
        <p className="text-sm text-destructive">{contact.profileError ?? `Qloo could not read ${first}'s taste.`}</p>
      ) : null}

      {contact.placement && (
        <div className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
            <MapPin className="size-4" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{words.none}: placed by age and location</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{contact.placement.note}</p>
          </div>
        </div>
      )}

      <Panel title={words.heading} description="Recent orders or bookings, newest first. Items from the catalog link to it; Qloo reads their taste from them.">
        <div className="space-y-3 p-4">
          {bought.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {bought.map((i) => (
                <li key={i._id} className={covers ? "w-20" : "w-28"}>
                  <Thumb src={i.image} alt={i.name} className={cn("ring-1 ring-black/10", covers ? "aspect-[2/3] w-20" : "aspect-[4/3] w-28")} rounded="rounded-md" />
                  <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{i.name}</p>
                </li>
              ))}
            </ul>
          )}
          {elsewhere.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {elsewhere.map((p) => (
                <Badge key={p} variant="outline" className="font-normal">
                  <ShoppingBag /> {p}
                </Badge>
              ))}
            </div>
          )}
          {!bought.length && !elsewhere.length && <Hint>{words.none}.</Hint>}
        </div>
      </Panel>

      {contact.interests.length > 0 && (
        <Panel title="What they like" description="What the business knows they like">
          <div className="flex flex-wrap gap-1.5 p-4">
            {contact.interests.map((t) => (
              <Badge key={t} variant="secondary" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </Panel>
      )}

      {contact.entities.length > 0 && (
        <Panel title="How Qloo reads it" description={`What they ${words.did} and like, as Qloo knows it`}>
          <div className="p-4">
            <EntityStrip items={contact.entities} max={16} size="size-6" />
          </div>
        </Panel>
      )}

      {profile && (
        <>
          {profile.tags.length > 0 && (
            <Panel title="Their taste" description="Qloo tags read from what they like">
              <div className="p-4">
                <TagChips tags={profile.tags} max={14} />
              </div>
            </Panel>
          )}
          <Panel title="What else they would love" description="Qloo recommendations from their taste: hooks for their version of a campaign">
            <div className="p-4">
              <CultureLists culture={profile.culture} max={6} />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
