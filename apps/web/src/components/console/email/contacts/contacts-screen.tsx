"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Boxes, FileSpreadsheet, MoreHorizontal, Plus, Trash2, Upload, UserPlus, UsersRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { fmt } from "@/lib/format";
import { profileOf } from "@/lib/email/types";
import { relativeTime } from "@/lib/email/labels";
import { PageHeader, Panel, Skeleton } from "@/components/console/primitives";
import { ProgressLine } from "@/components/console/pages/shared";
import { TasteCover, coverTiles } from "@/components/console/pages/taste-cover";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { ConsolePage } from "@/components/console/shell-ui";
import { useEmailBrand } from "@/components/console/email/brand-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AddContactSheet } from "./add-contact-sheet";
import { AudienceDrawer } from "./audience-drawer";
import { ImportContactsSheet } from "./import-sheet";
import { AudienceCard, ContactAvatar, Pill, firstNameOf, isBusy, peopleCount, statusLabel, type AudienceRow, type ListRow } from "./shared";

// Empty blocks in the cover's mosaic shape while there is no taste to show yet.
const GHOST_TILES = [0, 1, 2, 3, 4].map((i) => ({ key: `ghost-${i}`, name: "" }));

/**
 * Contacts in two kinds: taste groups (people with similar taste, one email
 * each) and individual contacts (a profile each, ticked per campaign). Which
 * upload someone came from is only history, at the bottom.
 */
export function ContactsScreen() {
  const brand = useEmailBrand();
  const router = useRouter();
  const params = useSearchParams();
  const lists = useQuery(api.emailLists.list, { brandId: brand._id });
  const audiences = useQuery(api.emailAudiences.list, { brandId: brand._id });
  const counts = useQuery(api.emailContacts.counts, { brandId: brand._id });
  const [person, setPerson] = useState<string | null>(null);

  // The URL holds what is open, so the overview and campaigns can link straight to it:
  // ?open=<audienceId> opens that audience's drawer, ?import=1 and ?add=1 the sheets.
  const base = `/dashboard/email/${brand.slug}/contacts`;
  const open = params.get("open");
  const importing = params.get("import") !== null;
  const adding = params.get("add") !== null;
  const go = (query: string | null) => router.replace(query ? `${base}?${query}` : base, { scroll: false });
  const setSheet = (key: "import" | "add" | null) => go(key && `${key}=1`);
  const setOpen = (id: string | null) => go(id && `open=${id}`);

  const all = audiences ?? [];
  const opened = all.find((a) => a._id === open) ?? null;
  const groups = all.filter((a) => a.kind === "group").sort((a, b) => b.size - a.size);
  const individuals = all.find((a) => a.kind === "people") ?? null;
  // Everyone added by hand may have been removed again; an empty "Added by hand" row says nothing.
  const uploads = [...(lists ?? [])].filter((l) => l.source !== "manual" || l.rowCount > 0).sort((a, b) => b.createdAt - a.createdAt);
  const inFlight = uploads.filter((l) => isBusy(l.status) || l.status === "failed");
  const openAudience = (id: string, personId: string | null = null) => {
    setPerson(personId);
    setOpen(id);
  };

  return (
    <ConsolePage>
      <PageHeader
        title="Contacts"
        description="Who your campaigns go to. A taste group gets one email written for its taste; an individual contact gets their own version of each campaign you tick them for."
        actions={
          lists && lists.length > 0 ? (
            <>
              <Button variant="outline" className="h-9 rounded-full bg-white px-3.5" onClick={() => setSheet("add")}>
                <UserPlus data-icon="inline-start" /> Add contact
              </Button>
              <Button className="h-9 rounded-full px-3.5" onClick={() => setSheet("import")}>
                <Upload data-icon="inline-start" /> Import contacts
              </Button>
            </>
          ) : undefined
        }
      />

      {lists === undefined || audiences === undefined ? (
        <div className="space-y-5">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : lists.length === 0 ? (
        <NoContacts onImport={() => setSheet("import")} onAdd={() => setSheet("add")} />
      ) : (
        <div className="space-y-10">
          <Panel className="grid grid-cols-2 divide-black/[0.05] sm:grid-cols-4 sm:divide-x">
            {(
              [
                ["Contacts", counts?.total],
                ["Taste groups", groups.length],
                ["Individual contacts", individuals?.size ?? 0],
                ["Unsubscribed", counts?.unsubscribed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="px-6 py-5">
                <div className="text-[13px] text-muted-foreground">{label}</div>
                <div className="num mt-1 text-[28px] leading-none font-medium tracking-[-0.03em] text-neutral-950">
                  {value === undefined ? <Skeleton className="h-7 w-12" /> : fmt.int(value)}
                </div>
              </div>
            ))}
          </Panel>

          {inFlight.map((l) => (
            <UploadProgress key={l._id} list={l} />
          ))}

          <section className="space-y-4">
            <SectionTitle icon={Boxes} title="Taste groups" hint="People with similar taste. Each group gets one email, written for what it loves." />
            {groups.length ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((a) => (
                  <AudienceCard key={a._id} audience={a} onClick={() => openAudience(a._id)} />
                ))}
              </div>
            ) : (
              <EmptyKind>No taste groups yet. Import contacts and sort them into taste groups, or add someone to a taste group.</EmptyKind>
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle
              icon={UsersRound}
              title="Individual contacts"
              hint="Each has their own taste profile. Tick them on a campaign and each gets a version written for them."
            />
            {individuals && individuals.size > 0 ? (
              <IndividualsCard audience={individuals} onOpen={openAudience} />
            ) : (
              <EmptyKind>No individual contacts yet. Add someone by hand, or import a short list and keep them as individual contacts.</EmptyKind>
            )}
          </section>

          <UploadHistory lists={uploads} />
        </div>
      )}

      <ImportContactsSheet open={importing} onOpenChange={(o) => setSheet(o ? "import" : null)} />
      <AddContactSheet open={adding} onOpenChange={(o) => setSheet(o ? "add" : null)} />
      <AudienceDrawer audience={opened} personId={person} onPerson={setPerson} onClose={() => setOpen(null)} />
    </ConsolePage>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]">
        <Icon className="size-[18px] text-neutral-800" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function EmptyKind({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-black/10 px-6 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

/** An upload still being read (or one that failed), until its people are in place. */
function UploadProgress({ list }: { list: ListRow }) {
  const remove = useMutation(api.emailLists.remove);
  const failed = list.status === "failed";
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
        <FileSpreadsheet className="size-[18px] text-neutral-800" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-sm font-medium">
          {failed ? "Could not import" : "Importing"} {peopleCount(list.rowCount)} from {list.filename ?? list.name}{" "}
          {list.mode === "groups" ? "into taste groups" : "as individual contacts"}
        </p>
        <ProgressLine progress={list.progress ?? { value: 0.05, label: statusLabel(list.status) }} status={list.status} error={failed ? (list.error ?? "The import failed.") : undefined} />
      </div>
      {failed && (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove({ id: list._id })}>
          <Trash2 data-icon="inline-start" /> Remove
        </Button>
      )}
    </Panel>
  );
}

const FACES_SHOWN = 12;

/** The individual contacts: their merged cover beside the people themselves. */
function IndividualsCard({ audience, onOpen }: { audience: AudienceRow; onOpen: (audienceId: string, personId?: string | null) => void }) {
  const contacts = useQuery(api.emailContacts.byAudience, { audienceId: audience._id });
  const shown = (contacts ?? []).slice(0, FACES_SHOWN);
  const more = (contacts?.length ?? 0) - shown.length;
  const unsubscribed = audience.unsubscribed ?? 0;
  return (
    <Panel className="grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <button type="button" onClick={() => onOpen(audience._id)} className="group block text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <TasteCover
          tiles={coverTiles(profileOf(audience), 5, true)}
          icon={UsersRound}
          kindLabel="Individuals"
          title={audience.name}
          subtitle={peopleCount(audience.size, "person")}
          corner={isBusy(audience.status) ? <Pill>{statusLabel(audience.status)}</Pill> : undefined}
          className="h-full min-h-56"
        />
      </button>
      <div className="flex min-w-0 flex-col gap-4 p-5">
        {isBusy(audience.status) && <ProgressLine progress={audience.progress} status={audience.status} error={audience.error} />}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((c) => (
            <li key={c._id}>
              <button
                type="button"
                onClick={() => onOpen(audience._id, c._id)}
                className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-neutral-100"
              >
                <ContactAvatar contact={c} className={c.unsubscribed ? "opacity-50 grayscale" : undefined} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{firstNameOf(c)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.unsubscribed ? "Unsubscribed" : (c.neighborhood ?? c.city ?? c.entities[0]?.name ?? " ")}</span>
                </span>
              </button>
            </li>
          ))}
          {contacts === undefined &&
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-2.5 p-1.5">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </li>
            ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] pt-4 text-sm">
          <span className="text-muted-foreground">
            {more > 0 ? `and ${more} more${unsubscribed > 0 ? "," : "."} ` : ""}
            {unsubscribed > 0 ? `${fmt.int(unsubscribed)} unsubscribed. ` : ""}
            Ticked people get their own version of a campaign.
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpen(audience._id)}>
            <UsersRound data-icon="inline-start" /> See everyone
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Every import and where its people went; removing one removes the people it brought in. */
function UploadHistory({ lists }: { lists: ListRow[] }) {
  if (!lists.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-950">Import history</h2>
        <p className="text-sm text-muted-foreground">Each file you imported, and people added by hand.</p>
      </div>
      <Panel className="divide-y divide-black/[0.05]">
        {lists.map((l) => (
          <UploadRow key={l._id} list={l} />
        ))}
      </Panel>
    </section>
  );
}

function UploadRow({ list }: { list: ListRow }) {
  const remove = useMutation(api.emailLists.remove);
  const [confirm, setConfirm] = useState(false);
  const manual = list.source === "manual";
  const label = manual ? "Added by hand" : (list.filename ?? list.name);
  const where = manual ? "one at a time" : list.mode === "groups" ? "sorted into taste groups" : "kept as individual contacts";
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {manual ? <UserPlus className="size-4 shrink-0 text-muted-foreground" /> : <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="flex gap-x-3 text-xs text-muted-foreground">
          <span className="truncate">
            {peopleCount(list.rowCount)} {where}
          </span>
          <span className="shrink-0">{relativeTime(list.createdAt)}</span>
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} className="text-muted-foreground" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <Trash2 /> Remove its contacts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove the ${peopleCount(list.rowCount)} from ${label}?`}
        description="They leave their taste groups or the individual contacts, and a group left empty goes. Campaigns already sent keep their reports. This cannot be undone."
        actionLabel="Remove contacts"
        onConfirm={() => void remove({ id: list._id })}
      />
    </div>
  );
}

/** First visit: the two kinds of contact, and the two ways in. */
function NoContacts({ onImport, onAdd }: { onImport: () => void; onAdd: () => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {(
        [
          {
            icon: Boxes,
            kind: "Taste groups",
            title: "Sort a list into taste groups",
            body: "Upload your customers with what they bought or booked, plus neighbourhood, city and age if you have them. Qloo reads their taste from it and groups people who buy alike; anyone who hasn't bought yet joins the group people like them go for.",
            action: (
              <Button className="h-9 rounded-full px-4" onClick={onImport}>
                <Upload data-icon="inline-start" /> Import contacts
              </Button>
            ),
          },
          {
            icon: UsersRound,
            kind: "Individuals",
            title: "Keep people as individual contacts",
            body: "Each person gets their own taste profile: your regulars, a book club, VIPs. Tick them on a campaign and each gets a version written for them.",
            action: (
              <Button variant="outline" className="h-9 rounded-full bg-white px-4" onClick={onAdd}>
                <Plus data-icon="inline-start" /> Add a contact
              </Button>
            ),
          },
        ] as const
      ).map((c) => (
        <Panel key={c.kind} className="flex flex-col">
          <TasteCover tiles={GHOST_TILES} icon={c.icon} kindLabel={c.kind} title={<span className="text-white/90">{c.title}</span>} />
          <div className="flex flex-1 flex-col items-start gap-4 p-6">
            <p className="text-sm text-muted-foreground">{c.body}</p>
            <div className="mt-auto">{c.action}</div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
