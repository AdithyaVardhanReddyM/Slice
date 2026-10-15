"use client";

// "View as": the versions a campaign has (one per taste group, one per person
// ticked) as a list the editor can switch the canvas to. The canvas picker and
// the Personalise panel's Preview as list both read it from useViewAs.

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronDown, PenLine } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { profileOf } from "@/lib/email/types";
import { coverTiles } from "@/components/console/pages/taste-cover";
import { Avatar } from "@/components/console/email/contacts/shared";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEditorEnv, type PreviewAs } from "./context";
import { mergeFor } from "./model";

type Version = FunctionReturnType<typeof api.emailCampaigns.versions>[number];

export interface ViewAsRow {
  /** The group's audience id or the person's contact id. */
  key: string;
  kind: "group" | "person";
  name: string;
  image?: string;
  merge: Record<string, string | undefined>;
  version?: Version;
}

/** What a row's version looks like now, in a few words. */
export function versionState(row: ViewAsRow, many: boolean) {
  const v = row.version;
  if (!many) return "Merge values";
  if (!v) return "Not personalised yet";
  if (v.status === "failed") return "Could not personalise";
  return v.stale ? "Written for an earlier draft" : "Version ready";
}

export const previewOf = (row: ViewAsRow): PreviewAs => ({
  key: row.key,
  name: row.name,
  merge: row.merge,
  personalization: row.version?.status === "ready" ? row.version.personalization : null,
  stale: !!row.version?.stale,
});

/**
 * The campaign's versions to view: each group ticked, then each person ticked
 * (a version each), or with one group alone its members with their merge values.
 */
export function useViewAs() {
  const { audience, campaign, brand } = useEditorEnv();
  const recipients = useQuery(api.emailCampaigns.recipients, audience ? { id: campaign._id } : "skip");
  const versions = useQuery(api.emailCampaigns.versions, audience?.kind === "versions" ? { id: campaign._id } : "skip");
  const many = audience?.kind === "versions";
  const versionOf = (key: string) => versions?.find((x) => (x.group?._id ?? x.contact?._id) === key);
  const rows: ViewAsRow[] = !audience
    ? []
    : many
      ? [
          ...audience.groups.map((g) => ({
            key: g._id as string,
            kind: "group" as const,
            name: g.name,
            image: coverTiles(profileOf(g), 1, true)[0]?.image,
            merge: mergeFor(null, brand.name),
            version: versionOf(g._id),
          })),
          ...(recipients ?? [])
            .filter((c) => !c.group && !c.unsubscribed)
            .map((c) => ({ key: c._id as string, kind: "person" as const, name: c.name, image: c.image, merge: mergeFor(c, brand.name), version: versionOf(c._id) })),
        ]
      : (recipients ?? [])
          .filter((c) => !c.unsubscribed)
          .slice(0, 60)
          .map((c) => ({ key: c._id as string, kind: "person" as const, name: c.name, image: c.image, merge: mergeFor(c, brand.name) }));
  return { audience, rows, many, loading: !!audience && recipients === undefined };
}

function RowAvatar({ row, className }: { row: Pick<ViewAsRow, "kind" | "name" | "image">; className?: string }) {
  return <Avatar name={row.name} image={row.image} className={cn("size-7 text-[11px]", row.kind === "group" && "rounded-lg", className)} />;
}

/**
 * Over the canvas when the campaign has versions: which one the canvas shows.
 * The shared email is what you edit; a group's or a person's version is
 * read-only, with "Back to editing" beside it.
 */
export function ViewAsPicker() {
  const { previewAs, setPreviewAs, editor } = useEditorEnv();
  const { rows, many, loading } = useViewAs();
  if (!many) return null;
  const current = previewAs ? rows.find((r) => r.key === previewAs.key) : undefined;
  const groups = rows.filter((r) => r.kind === "group");
  const people = rows.filter((r) => r.kind === "person");

  const item = (r: ViewAsRow) => {
    const on = previewAs?.key === r.key;
    const state = versionState(r, many);
    return (
      <DropdownMenuItem key={r.key} onClick={() => (on ? setPreviewAs(null) : (editor.select(null), setPreviewAs(previewOf(r))))} className="gap-2.5 py-1.5">
        <RowAvatar row={r} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.name}</span>
          <span className={cn("block truncate text-xs", state === "Version ready" ? "text-emerald-700" : "text-muted-foreground")}>{state}</span>
        </span>
        {on && <Check className="size-4" />}
      </DropdownMenuItem>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-white p-1 shadow-lg ring-1 ring-black/10 animate-in fade-in-0 slide-in-from-top-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex h-8 max-w-[22rem] min-w-0 items-center gap-2 rounded-full pr-3 pl-1 text-sm text-neutral-700 transition-colors outline-none hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-neutral-100"
              />
            }
          >
            {current ? (
              <RowAvatar row={current} className="size-6" />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                <PenLine className="size-3.5" />
              </span>
            )}
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">Viewing </span>
              <span className="font-medium text-neutral-950">{previewAs ? `${previewAs.name}'s version` : "the shared email"}</span>
              {previewAs && !previewAs.personalization && <span className="text-muted-foreground"> · not personalised yet</span>}
              {previewAs?.stale && <span className="text-muted-foreground"> · earlier draft</span>}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-[22rem]">
            <DropdownMenuItem onClick={() => setPreviewAs(null)} className="gap-2.5 py-1.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                <PenLine className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">The shared email</span>
                <span className="block truncate text-xs text-muted-foreground">What you edit, and the fallback for anyone else</span>
              </span>
              {!previewAs && <Check className="size-4" />}
            </DropdownMenuItem>
            {loading ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">Loading versions…</div>
            ) : (
              <>
                {groups.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Taste groups</DropdownMenuLabel>
                      {groups.map(item)}
                    </DropdownMenuGroup>
                  </>
                )}
                {people.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Individual contacts</DropdownMenuLabel>
                      {people.map(item)}
                    </DropdownMenuGroup>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {previewAs && (
          <Button size="xs" variant="secondary" className="mr-0.5 rounded-full" onClick={() => setPreviewAs(null)}>
            Back to editing
          </Button>
        )}
      </div>
    </div>
  );
}
