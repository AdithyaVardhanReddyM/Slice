"use client";

// Personalise: what changes per reader. Merge tags to place in the text
// (first name, city…), the blocks marked as taste slots (rewritten for each
// taste group and person ticked), and Preview as: the canvas shows one
// group's or person's version, with their merge values and personal blocks.

import { usePathname, useRouter } from "next/navigation";
import { Check, Copy, Eye, Fingerprint, UserStar, UsersRound } from "lucide-react";
import { useState } from "react";
import { allBlocks } from "@slice/backend/convex/emailDoc";
import { MERGE_TAGS, type EmailDoc } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditorEnv } from "./context";
import { fieldClass } from "./fields";
import { BLOCK_ICON, blockLabel, PERSONAL_TYPES } from "./model";
import { GroupLabel, PanelHeader } from "./panel-ui";
import { previewOf, useViewAs, versionState } from "./view-as";

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
  const many = audience?.kind === "versions";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <GroupLabel>Taste slots</GroupLabel>
        <span className="text-xs text-muted-foreground">{count ? `${count} marked` : "None yet"}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {many
          ? "Each group's and each person's version rewrites these blocks from their own taste: their picks, their hooks, in your voice."
          : "Each taste group and person ticked gets a version of these blocks, written from their own taste."}
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
                aria-label={`Write ${blockLabel(block)} for each version`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewAsList() {
  const { previewAs, setPreviewAs, editor } = useEditorEnv();
  const { audience, rows, many, loading } = useViewAs();
  const router = useRouter();
  const pathname = usePathname();

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
        {many ? <UserStar className="size-3.5 shrink-0 text-blue-700" /> : <Fingerprint className="size-3.5 shrink-0 text-neutral-500" />}
        <span className="min-w-0 truncate">
          <span className="font-medium">{audience.name}</span>
          <span className="text-muted-foreground"> · {many ? "a version each" : "one email for the group"}</span>
        </span>
      </div>
      {loading ? (
        <p className="px-1 text-xs text-muted-foreground">Loading people…</p>
      ) : rows.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">No one to preview yet.</p>
      ) : (
        <div className="scrollbar-thin max-h-80 divide-y overflow-y-auto rounded-xl ring-1 ring-black/[0.08]">
          {rows.map((r) => {
            const on = previewAs?.key === r.key;
            const state = versionState(r, many);
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => (on ? setPreviewAs(null) : (editor.select(null), setPreviewAs(previewOf(r))))}
                className={cn("flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-neutral-50", on && "bg-blue-600/5")}
              >
                <span className={cn("flex size-7 shrink-0 items-center justify-center text-xs font-semibold", r.kind === "group" ? "rounded-lg" : "rounded-full", on ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-700")}>
                  {r.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{r.name}</span>
                  <span className={cn("block truncate text-[11px]", state === "Version ready" ? "text-emerald-700" : "text-muted-foreground")}>
                    {r.kind === "group" && many ? `Taste group · ${state}` : state}
                  </span>
                </span>
                <Eye className={cn("size-3.5 shrink-0", on ? "text-blue-700" : "text-neutral-300")} />
              </button>
            );
          })}
        </div>
      )}
      {many && <p className="px-1 text-[11px] leading-4 text-muted-foreground">Versions are written on the Recipients step with Personalise.</p>}
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
