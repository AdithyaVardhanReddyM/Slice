"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Boxes, FileSpreadsheet, MoreHorizontal, Plus, Trash2, Upload, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { MAX_PEOPLE_LIST } from "@slice/backend/convex/emailTypes";
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

const LIST_ICON = { csv: FileSpreadsheet, manual: UserPlus, demo: FileSpreadsheet } as const;

// Empty blocks in the cover's mosaic shape while a list is still being read.
const GHOST_TILES = [0, 1, 2, 3, 4].map((i) => ({ key: `ghost-${i}`, name: "" }));

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
  const groups = all.filter((a) => a.kind === "group").length;
  const openAudience = (id: string, personId: string | null = null) => {
    setPerson(personId);
    setOpen(id);
  };

  return (
    <ConsolePage>
      <PageHeader
        title="Contacts"
        description="Who your campaigns go to. Qloo reads what each person likes, so a list either splits into taste groups that each get their own email, or stays one by one and every person gets a version written for them."
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
                ["Lists", lists.length],
                ["Taste groups", groups],
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
          {[...lists]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((l) => (
              <ListSection key={l._id} list={l} audiences={all.filter((a) => a.listId === l._id)} size={l.rowCount} onOpen={openAudience} />
            ))}
        </div>
      )}

      <ImportContactsSheet open={importing} onOpenChange={(o) => setSheet(o ? "import" : null)} />
      <AddContactSheet open={adding} onOpenChange={(o) => setSheet(o ? "add" : null)} />
      <AudienceDrawer audience={opened} personId={person} onPerson={setPerson} onClose={() => setOpen(null)} />
    </ConsolePage>
  );
}

/** One list: its header, then its taste groups as covers or its people as faces. */
function ListSection({
  list,
  audiences,
  size,
  onOpen,
}: {
  list: ListRow;
  audiences: AudienceRow[];
  size: number;
  onOpen: (audienceId: string, personId?: string | null) => void;
}) {
  const remove = useMutation(api.emailLists.remove);
  const [confirm, setConfirm] = useState(false);
  const Icon = LIST_ICON[list.source] ?? FileSpreadsheet;
  const busy = isBusy(list.status);
  const groups = audiences.filter((a) => a.kind === "group").sort((a, b) => b.size - a.size);
  const people = audiences.find((a) => a.kind === "people");
  const meta = [
    peopleCount(size, list.mode === "people" ? "person" : "contact"),
    list.mode === "groups" ? (groups.length ? `${groups.length} taste groups` : "Grouped by taste") : "Kept one by one",
    list.filename,
    `added ${relativeTime(list.createdAt)}`,
  ].filter(Boolean);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06]">
          <Icon className="size-[18px] text-neutral-800" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-neutral-950">{list.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{meta.join(" · ")}</p>
        </div>
        {busy && <Pill>{statusLabel(list.status)}</Pill>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${list.name}`} className="text-muted-foreground" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete ${list.name}?`}
          description={`Its ${peopleCount(size)} and ${list.mode === "groups" ? "taste groups" : "profiles"} go with it. Campaigns already sent keep their reports. This cannot be undone.`}
          actionLabel="Delete list"
          onConfirm={() => void remove({ id: list._id })}
        />
      </div>

      {list.status === "failed" ? (
        <Panel className="p-5">
          <ProgressLine progress={list.progress} status={list.status} error={list.error ?? "The import failed."} />
        </Panel>
      ) : busy && audiences.length === 0 ? (
        <Panel className="grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <TasteCover tiles={GHOST_TILES} icon={list.mode === "groups" ? Boxes : UsersRound} kindLabel={list.mode === "groups" ? "Taste groups" : "One by one"} title={list.name} subtitle={peopleCount(size)} />
          <div className="flex flex-col justify-center gap-3 p-6">
            <ProgressLine progress={list.progress ?? { value: 0.05, label: statusLabel(list.status) }} status={list.status} />
            <p className="text-sm text-muted-foreground">
              {list.mode === "groups"
                ? "Qloo reads what everyone likes, then the list splits into taste groups. Each gets a cover, a profile and a brief."
                : "Qloo reads each person's taste, one after another. Their faces fill in as it goes."}
            </p>
          </div>
        </Panel>
      ) : list.mode === "groups" ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((a) => (
            <AudienceCard key={a._id} audience={a} onClick={() => onOpen(a._id)} />
          ))}
        </div>
      ) : people ? (
        <PeopleListCard audience={people} onOpen={onOpen} />
      ) : null}
    </section>
  );
}

const FACES_SHOWN = 12;

/** A list kept one by one: its merged cover beside the people themselves. */
function PeopleListCard({ audience, onOpen }: { audience: AudienceRow; onOpen: (audienceId: string, personId?: string | null) => void }) {
  const contacts = useQuery(api.emailContacts.byAudience, { audienceId: audience._id });
  const shown = (contacts ?? []).slice(0, FACES_SHOWN);
  const more = (contacts?.length ?? 0) - shown.length;
  const unsubscribed = audience.unsubscribed ?? 0;
  return (
    <Panel className="grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <button type="button" onClick={() => onOpen(audience._id)} className="group block text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <TasteCover
          tiles={coverTiles(profileOf(audience))}
          icon={UsersRound}
          kindLabel="One by one"
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
                  <span className="block truncate text-xs text-muted-foreground">{c.unsubscribed ? "Unsubscribed" : (c.city ?? c.entities[0]?.name ?? " ")}</span>
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
            {more > 0 ? `and ${more} more · ` : ""}
            {unsubscribed > 0 ? `${fmt.int(unsubscribed)} unsubscribed · ` : ""}
            Each gets their own version of a campaign. Up to {MAX_PEOPLE_LIST} people.
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpen(audience._id)}>
            <UsersRound data-icon="inline-start" /> See everyone
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** First visit: what a list becomes, and the two ways in. */
function NoContacts({ onImport, onAdd }: { onImport: () => void; onAdd: () => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {(
        [
          {
            icon: Boxes,
            kind: "Taste groups",
            title: "Upload a list and group it by taste",
            body: "A CSV of subscribers with what they like (favourite authors, books, films, genres). Qloo reads everyone and splits the list into a few taste groups, each with its own email.",
            action: (
              <Button className="h-9 rounded-full px-4" onClick={onImport}>
                <Upload data-icon="inline-start" /> Import contacts
              </Button>
            ),
          },
          {
            icon: UsersRound,
            kind: "One by one",
            title: "Keep a short list one by one",
            body: `Up to ${MAX_PEOPLE_LIST} people, each with their own taste profile: a book club, your regulars. Every campaign to them writes a version for each person.`,
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
