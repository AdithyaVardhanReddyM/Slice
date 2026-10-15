"use client";

// Personalise: what changes per reader. Merge tags to place in the text
// (first name, city…), the blocks marked as taste slots (rewritten for each
// individual contact), and Preview as: the canvas shows one person's
// version, with their merge values and their personal blocks.

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Copy, Eye, Fingerprint, UserStar, UsersRound } from "lucide-react";
import { useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { allBlocks } from "@slice/backend/convex/emailDoc";
import { MERGE_TAGS, type EmailDoc, type Personalization } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditorEnv } from "./context";
import { fieldClass } from "./fields";
import { BLOCK_ICON, blockLabel, mergeFor, PERSONAL_TYPES } from "./model";
import { GroupLabel, PanelHeader } from "./panel-ui";

interface Contact {
  _id: Id<"emailContacts">;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  city?: string;
  unsubscribed?: boolean;
}

interface Version {
  contact: { _id: string };
  personalization: Personalization;
  status: "ready" | "failed";
  stale?: boolean;
}

const FALLBACKS: Record<string, string> = { first_name: "there", name: "there", city: "your city" };

function MergeTags() {
  const { editor } = useEditorEnv();
  const [fallbacks, setFallbacks] = useState<Record<string, string>>(FALLBACKS);
  const [copied, setCopied] = useState<string | null>(null);
  const sel = editor.selection;
  const doc = editor.doc as EmailDoc;
  const target = sel?.kind === "block" ? allBlocks(doc).find((x) => x.block.id === sel.id)?.block : undefined;
  const typable = !!target && (target.type === "heading" || target.type === "text" || target.type === "quote" || target.type === "button");

  const insert = (key: string) => {
    const fb = fallbacks[key]?.trim();
    const tag = fb ? `${key}|${fb}` : key;
    if (editor.editing && editor.inline.current) {
      editor.inline.current.insertMerge(tag);
      return;
    }
    if (typable && target) {
      // Open the selected text for typing, then drop the tag at its end.
      editor.startEditing(target.id);
      requestAnimationFrame(() => editor.inline.current?.insertMerge(tag));
      return;
    }
    void navigator.clipboard?.writeText(`{{${tag}}}`);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  };

  return (
    <div className="space-y-2">
      <GroupLabel>Merge tags</GroupLabel>
      <p className="text-xs leading-5 text-muted-foreground">
        {editor.editing ? "Click a tag to put it where the cursor is." : typable ? "Click a tag to add it to the selected text." : "Select a text block to add a tag to it, or copy one."} The fallback shows when a reader has no value.
      </p>
      <div className="divide-y rounded-xl ring-1 ring-black/[0.08]">
        {MERGE_TAGS.filter((t) => t.key !== "brand").map((t) => (
          <div key={t.key} className="flex items-center gap-2 px-2.5 py-2">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(t.key)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-800 ring-1 ring-black/[0.06] transition-colors hover:bg-blue-600/10 hover:text-blue-800"
            >
              {copied === t.key ? <Check className="size-3" /> : !editor.editing && !typable ? <Copy className="size-3 text-neutral-500" /> : null}
              {t.label}
            </button>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t.example}</span>
            <input
              value={fallbacks[t.key] ?? ""}
              onChange={(e) => setFallbacks((f) => ({ ...f, [t.key]: e.target.value }))}
              placeholder="Fallback"
              aria-label={`${t.label} fallback`}
              className={cn(fieldClass, "w-24 shrink-0")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TasteSlots() {
  const { editor, audience } = useEditorEnv();
  const doc = editor.doc as EmailDoc;
  const candidates = allBlocks(doc).filter((x) => PERSONAL_TYPES.has(x.block.type));
  const count = candidates.filter((x) => x.block.personal).length;
  const people = audience?.kind === "people";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <GroupLabel>Taste slots</GroupLabel>
        <span className="text-xs text-muted-foreground">{count ? `${count} marked` : "None yet"}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {people
          ? "Each person's version rewrites these blocks from their own taste: their picks, their hooks, in your voice."
          : "Used when the campaign goes to individual contacts. A taste group gets one email written for the group."}
      </p>
      <div className="divide-y rounded-xl ring-1 ring-black/[0.08]">
        {candidates.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No headings, text, images, buttons, picks or quotes yet.</p>}
        {candidates.map(({ block }) => {
          const Icon = BLOCK_ICON[block.type];
          const selected = editor.selection?.kind === "block" && editor.selection.id === block.id;
          return (
            <div
              key={block.id}
              className={cn("flex items-center gap-2 px-2.5 py-1.5", selected && "bg-blue-600/5")}
              onPointerEnter={() => editor.setHover({ kind: "block", id: block.id })}
              onPointerLeave={() => editor.setHover(null)}
            >
              <button type="button" onClick={() => editor.select({ kind: "block", id: block.id })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <Icon className={cn("size-3.5 shrink-0", block.personal ? "text-blue-700" : "text-neutral-400")} />
                <span className="min-w-0 truncate text-xs">{blockLabel(block, 34)}</span>
              </button>
              <Switch
                size="sm"
                checked={!!block.personal}
                disabled={editor.locked}
                onCheckedChange={(on) => editor.apply([{ op: "update_block", id: block.id, set: { personal: on ? true : null } as unknown as Partial<typeof block> }])}
                aria-label={`Write ${blockLabel(block)} for each person`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewAsList() {
  const { audience, campaign, previewAs, setPreviewAs, brand } = useEditorEnv();
  const router = useRouter();
  const pathname = usePathname();
  const contacts = useQuery(api.emailContacts.byAudience, audience ? { audienceId: audience._id } : "skip") as Contact[] | undefined;
  const versions = useQuery(api.emailCampaigns.versions, audience?.kind === "people" ? { id: campaign._id } : "skip") as Version[] | undefined;

  if (!audience) {
    return (
      <div className="space-y-2">
        <GroupLabel>Preview as</GroupLabel>
        <div className="rounded-xl bg-neutral-50 px-3 py-3 text-xs leading-5 text-muted-foreground ring-1 ring-black/[0.06]">
          Choose who the campaign goes to, then see it the way each of them will.
          <Button size="xs" variant="outline" className="mt-2 flex" onClick={() => router.push(`${pathname}?step=recipients`)}>
            <UsersRound data-icon="inline-start" /> Choose recipients
          </Button>
        </div>
      </div>
    );
  }

  const people = audience.kind === "people";
  const list = (contacts ?? []).filter((c) => !c.unsubscribed).slice(0, 60);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <GroupLabel>Preview as</GroupLabel>
        {previewAs && (
          <button type="button" onClick={() => setPreviewAs(null)} className="text-xs text-muted-foreground hover:text-foreground">
            Back to editing
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs ring-1 ring-black/[0.06]">
        {people ? <UserStar className="size-3.5 shrink-0 text-blue-700" /> : <Fingerprint className="size-3.5 shrink-0 text-neutral-500" />}
        <span className="min-w-0 truncate">
          <span className="font-medium">{audience.name}</span>
          <span className="text-muted-foreground"> · {people ? "a version per person" : "one email for the group"}</span>
        </span>
      </div>
      {contacts === undefined ? (
        <p className="px-1 text-xs text-muted-foreground">Loading people…</p>
      ) : list.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">No one in this audience yet.</p>
      ) : (
        <div className="scrollbar-thin max-h-80 divide-y overflow-y-auto rounded-xl ring-1 ring-black/[0.08]">
          {list.map((c) => {
            const v = versions?.find((x) => x.contact._id === c._id);
            const on = previewAs?.contactId === c._id;
            const state = !people ? "Merge values" : !v ? "Not personalised yet" : v.status === "failed" ? "Could not personalise" : v.stale ? "Written for an earlier draft" : "Their version is ready";
            return (
              <button
                key={c._id}
                type="button"
                onClick={() =>
                  on
                    ? setPreviewAs(null)
                    : setPreviewAs({
                        contactId: c._id,
                        name: c.name,
                        merge: mergeFor(c, brand.name),
                        personalization: v && v.status === "ready" ? v.personalization : null,
                        stale: !!v?.stale,
                      })
                }
                className={cn("flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-neutral-50", on && "bg-blue-600/5")}
              >
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", on ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-700")}>
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{c.name}</span>
                  <span className={cn("block truncate text-[11px]", people && v?.status === "ready" && !v.stale ? "text-emerald-700" : "text-muted-foreground")}>{state}</span>
                </span>
                <Eye className={cn("size-3.5 shrink-0", on ? "text-blue-700" : "text-neutral-300")} />
              </button>
            );
          })}
        </div>
      )}
      {people && (
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">
          Versions are written on the Recipients step with Personalise for each person.
        </p>
      )}
    </div>
  );
}

export function PersonalisePanel() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Personalise" subtitle="What changes from one reader to the next." />
      <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-6">
        <PreviewAsList />
        <TasteSlots />
        <MergeTags />
      </div>
    </div>
  );
}
