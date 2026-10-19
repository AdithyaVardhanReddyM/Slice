"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AlertCircle, FileText, PenLine, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/pages/stream";
import { AGE_LABEL, AUDIENCE_KIND_LABEL, audienceBriefOf, profileOf, type Audience, type Member, type Page } from "@/lib/pages/types";
import { publicPageUrl } from "@/lib/pages/urls";
import { CopyButton, Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AudienceTabs, CLOSE_ON_COVER } from "./audience-drawer";
import { useBrand } from "./brand-context";
import { EntityStrip, ProgressLine, StatusBadge, Thumb, audienceSizeLabel } from "./shared";
import { TasteCover, coverTiles } from "./taste-cover";
import { useCompileAudience } from "./use-compile-audience";

/** A person's face in the list: the first picture from their taste, like their @mention pill. */
const avatarOf = (person: Audience, member?: Member) => coverTiles(profileOf(person), 1)[0]?.image ?? member?.entities.find((e) => e.image)?.image;

/** "25 to 29, Brooklyn": what the row says about them. */
const aboutOf = (member?: Member) => [member?.age ? (AGE_LABEL[member.age] ?? member.age) : null, member?.city].filter(Boolean).join(", ");

/**
 * A customer list kept one by one: the list's cover, then its people on the
 * left and the chosen person's taste profile on the right. Pages are written
 * for one person at a time, in the builder, with @ and their name.
 */
export function PeopleDrawer({
  list,
  people,
  personId,
  onPerson,
  onClose,
}: {
  list: Audience | null;
  people: Audience[];
  personId: string | null;
  onPerson: (id: string) => void;
  onClose: () => void;
}) {
  const remove = useMutation(api.pagesAudiences.remove);
  const run = useCompileAudience();
  const uploadId = list?.sources.uploadId;
  const members = useQuery(api.pagesUploads.members, uploadId ? { uploadId } : "skip") as Member[] | undefined;
  const memberOf = useMemo(() => new Map((members ?? []).map((m) => [m._id as string, m])), [members]);
  const person = people.find((p) => p._id === personId) ?? people[0] ?? null;

  return (
    <Sheet open={!!list} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className={cn("w-full gap-0 overflow-y-auto bg-background data-[side=right]:sm:max-w-5xl", CLOSE_ON_COVER)}>
        {list && (
          <>
            <TasteCover
              tiles={coverTiles(profileOf(list))}
              icon={UsersRound}
              kindLabel={AUDIENCE_KIND_LABEL.people}
              title={list.name}
              subtitle={audienceSizeLabel(list)}
              corner={list.status !== "ready" ? <StatusBadge status={list.status} className="mr-10" /> : undefined}
              className="aspect-[21/6] shrink-0"
            />
            <SheetHeader className="sr-only">
              <SheetTitle>{list.name}</SheetTitle>
              <SheetDescription>{audienceSizeLabel(list)}</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 border-b px-6 py-5">
              <p className="text-[15px] leading-relaxed">
                Each person has their own taste profile, read by Qloo from their row. To write a page for one of them, type{" "}
                <span className="font-medium">@</span> and their name in the builder.
              </p>
              {list.status !== "ready" && <ProgressLine progress={list.progress} status={list.status} error={list.error} />}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void run(list._id, people.map((p) => p._id))}
                  disabled={list.status === "compiling"}
                >
                  <RefreshCw data-icon="inline-start" /> Recompile everyone
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive">
                      <Trash2 data-icon="inline-start" /> Delete list
                    </Button>
                  }
                  title={`Delete ${list.name}?`}
                  description={`This removes the list and the ${audienceSizeLabel(list)} in it. Pages built for them keep what they say and stop listing them. This cannot be undone.`}
                  actionLabel="Delete list"
                  onConfirm={async () => {
                    await remove({ id: list._id });
                    onClose();
                  }}
                />
              </div>
            </div>

            <div className="grid min-h-[70svh] md:grid-cols-[15rem_minmax(0,1fr)]">
              <nav aria-label="People" className="border-b md:border-r md:border-b-0">
                <ul className="flex gap-1 overflow-x-auto p-2 md:sticky md:top-0 md:flex-col md:overflow-visible">
                  {people.map((p) => (
                    <li key={p._id} className="shrink-0">
                      <PersonRow person={p} member={memberOf.get(p.sources.memberId ?? "")} active={p._id === person?._id} onClick={() => onPerson(p._id)} />
                    </li>
                  ))}
                  {people.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Reading the rows…</li>}
                </ul>
              </nav>
              <div className="min-w-0">{person && <PersonPanel key={person._id} person={person} member={memberOf.get(person.sources.memberId ?? "")} />}</div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PersonRow({ person, member, active, onClick }: { person: Audience; member?: Member; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        "flex w-full min-w-48 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-muted",
      )}
    >
      <Thumb src={avatarOf(person, member)} className="size-9" rounded="rounded-full" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{aboutOf(member) || " "}</span>
      </span>
      {person.status === "compiling" && <Spinner className="size-3.5 text-muted-foreground" />}
      {person.status === "failed" && <AlertCircle className="size-4 shrink-0 text-destructive" aria-label="Could not be read" />}
    </button>
  );
}

function PersonPanel({ person, member }: { person: Audience; member?: Member }) {
  const brand = useBrand();
  const run = useCompileAudience();
  const pages = useQuery(api.pages.list, { brandId: brand._id }) as Page[] | undefined;
  const theirs = (pages ?? []).filter((p) => p.audienceIds.includes(person._id));
  const brief = audienceBriefOf(person);
  const [briefBusy, setBriefBusy] = useState(false);
  const firstName = person.name.split(/\s+/)[0];

  async function writeBrief(id: Id<"pagesAudiences">) {
    setBriefBusy(true);
    try {
      await postJson("/api/pages/audience-brief", { audience_id: id });
    } catch {
      /* the agent may be offline; the brief stays empty */
    } finally {
      setBriefBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-4 border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-4">
          <Thumb src={avatarOf(person, member)} className="size-12" rounded="rounded-full" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">{person.name}</h3>
            {aboutOf(member) && <p className="text-sm text-muted-foreground">{aboutOf(member)}</p>}
          </div>
          <Button nativeButton={false} render={<Link href={`/dashboard/pages/${brand.slug}/new?for=${person._id}`} />}>
            <Plus data-icon="inline-start" /> Build a page for {firstName}
          </Button>
        </div>

        {person.status !== "ready" ? (
          <ProgressLine progress={person.progress} status={person.status} error={person.error} />
        ) : brief?.summary ? (
          <p className="text-[15px] leading-relaxed">{brief.summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No brief yet. Write one to get a summary of who {firstName} is.</p>
        )}

        {member && member.entities.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">From their row, as Qloo knows them</p>
            <EntityStrip items={member.entities} max={14} size="size-5" />
          </div>
        )}

        {theirs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Their {theirs.length === 1 ? "page" : "pages"}</p>
            <ul className="divide-y rounded-lg border">
              {theirs.map((p) => (
                <li key={p._id} className="flex items-center gap-3 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <Link href={`/dashboard/pages/${brand.slug}/${p.slug}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                    {p.title}
                  </Link>
                  <StatusBadge status={p.status === "published" ? "published" : "draft"} />
                  {p.status === "published" && <CopyButton value={publicPageUrl(brand.slug, p.slug)} label="Copy link" size="sm" />}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void run(person._id)} disabled={person.status === "compiling"}>
            <RefreshCw data-icon="inline-start" /> Recompile
          </Button>
          <Button variant="outline" size="sm" onClick={() => void writeBrief(person._id)} disabled={briefBusy || !person.profile}>
            {briefBusy ? <Spinner data-icon="inline-start" /> : <PenLine data-icon="inline-start" />}
            {brief ? "Rewrite brief" : "Write brief"}
          </Button>
        </div>
      </div>
      <AudienceTabs audience={person} />
    </>
  );
}
