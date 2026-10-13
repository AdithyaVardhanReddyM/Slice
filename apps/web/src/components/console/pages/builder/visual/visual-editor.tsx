"use client";

// Edit mode of the page editor: the chat steps aside for a design surface.
// Layers on the left, the page in the middle (click to select, double-click
// to type), the inspector on the right. Edits are saved as the page's hand
// edits (HtmlDoc.hand) and posted to the chat, which is how the builder
// learns about them and keeps them.

import { AlertCircle, Check, MessageSquare, MousePointer2, Redo2, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BrandKit, HtmlDoc } from "@slice/backend/convex/pagesTypes";
import type { Brand, Page, Variant } from "@/lib/pages/types";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { Spinner } from "@/components/console/setup/atoms";
import { ConfirmDialog } from "@/components/console/settings/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "../../shared";
import { EditorTopbar, useAppSurface } from "../editor-shell";
import { DeviceToggle, type Device } from "../preview";
import { Inspector } from "./inspector";
import { LayersPanel } from "./layers";
import { useVisualEditor } from "./use-visual-editor";

export type EditorMode = "chat" | "edit";

/** Chat or Edit, in the top bar of both modes. */
export function ModeSwitch({ mode, onChange, editDisabled }: { mode: EditorMode; onChange: (m: EditorMode) => void; editDisabled?: string | null }) {
  const options = [
    { value: "chat" as const, label: "Chat", icon: MessageSquare },
    { value: "edit" as const, label: "Edit", icon: MousePointer2 },
  ];
  return (
    <div role="radiogroup" aria-label="Editor mode" className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
      {options.map((o) => {
        const disabled = o.value === "edit" && !!editDisabled && mode !== "edit";
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            disabled={disabled}
            onClick={() => mode !== o.value && onChange(o.value)}
            className={cn(
              "inline-flex h-[calc(100%-1px)] items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50",
              mode === o.value ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            <o.icon className="size-3.5" />
            {o.label}
          </button>
        );
        return disabled ? (
          <Tooltip key={o.value}>
            <TooltipTrigger render={<span className="inline-flex h-full" />}>{button}</TooltipTrigger>
            <TooltipContent>{editDisabled}</TooltipContent>
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}

export function VisualEditor({
  brand,
  page,
  version,
  onExit,
}: {
  brand: Brand;
  page: Page;
  version: Variant;
  /** Back to the chat, after the edits are saved. */
  onExit: () => void;
}) {
  useAppSurface();
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const kit = brand.kit as BrandKit;
  const doc = version.doc as HtmlDoc;
  const ed = useVisualEditor({ frame, kit, doc, variantId: version._id as Id<"pagesVariants">, baseVersion: version.version, device });
  const fonts = (doc.meta.fonts ?? []).map((f) => f.split(":")[0].trim()).filter(Boolean);
  const photos = (brand.site?.images ?? []).filter((p) => p.src.startsWith("http"));

  async function leave() {
    if (await ed.save()) onExit();
  }

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-background">
      <EditorTopbar
        brand={brand}
        title={page.title}
        badge={<StatusBadge status={page.status} />}
        center={<ModeSwitch mode="edit" onChange={() => void leave()} />}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={ed.undo} disabled={!ed.canUndo} aria-label="Undo" />}>
                <Undo2 />
              </TooltipTrigger>
              <TooltipContent>Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={ed.redo} disabled={!ed.canRedo} aria-label="Redo" />}>
                <Redo2 />
              </TooltipTrigger>
              <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center" />
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:inline-flex">
              {ed.saving ? (
                <>
                  <Spinner className="size-3.5" /> Saving
                </>
              ) : ed.dirty ? (
                "Unsaved changes"
              ) : (
                <>
                  <Check className="size-3.5" /> Saved
                </>
              )}
            </span>
            {ed.dirty && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" disabled={ed.saving}>
                    Discard
                  </Button>
                }
                title="Discard your changes?"
                description="Everything you changed since the last save goes back to how it was."
                actionLabel="Discard changes"
                destructive
                onConfirm={ed.discard}
              />
            )}
            <Button size="sm" variant="outline" onClick={() => void ed.save()} disabled={!ed.dirty || ed.saving}>
              Save
            </Button>
            <Button size="sm" onClick={() => void leave()} disabled={ed.saving}>
              Done
            </Button>
          </>
        }
      />
      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_19rem] xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <aside className="min-h-0 border-r">
          <LayersPanel ed={ed} />
        </aside>
        <section className="relative flex min-h-0 min-w-0 flex-col gap-3 bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {device === "mobile" ? "Phone view: what you change here applies on phones only." : "Click anything to select it. Double-click text to type."}
            </p>
            <DeviceToggle value={device} onChange={setDevice} />
          </div>
          <div className={cn("relative flex min-h-0 flex-1 justify-center overflow-hidden rounded-xl border bg-background shadow-xs", device === "mobile" && "bg-muted/50 py-4")}>
            <div className={cn("relative h-full bg-background transition-[width] duration-300", device === "mobile" ? "w-[390px] overflow-hidden rounded-[1.75rem] shadow-sm ring-1 ring-foreground/10" : "w-full")}>
              <iframe ref={frame} src="/p/_edit" title="Page editor" className="size-full border-0" />
              {!ed.ready && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
                  <Spinner className="size-4" /> Opening the page
                </div>
              )}
            </div>
          </div>
          {ed.notice && (
            <div role="alert" className="absolute inset-x-0 bottom-6 mx-auto flex w-fit max-w-[min(36rem,calc(100%-2rem))] items-start gap-2 rounded-lg border bg-background px-3 py-2 text-sm shadow-md">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="min-w-0">{ed.notice}</span>
              <button type="button" onClick={ed.clearNotice} aria-label="Dismiss" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </section>
        <aside className="min-h-0 border-l">
          <Inspector ed={ed} kit={kit} fonts={fonts} photos={photos} />
        </aside>
      </div>
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground lg:hidden">The visual editor needs a wider window.</div>
    </div>
  );
}
