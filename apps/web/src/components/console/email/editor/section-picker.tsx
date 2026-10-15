"use client";

// Ready-made pieces drawn in the email's own theme, and the ways they get in:
// a click adds after the selection, a drag drops them on the canvas, and the
// "+" between sections opens a compact picker. Shared by the Add panel.

import { useDraggable } from "@dnd-kit/core";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { findBlock, findColumn, findSection, withIds } from "@slice/backend/convex/emailDoc";
import { BLOCK_PRESETS, LAYOUT_PRESETS, SECTION_PRESETS, type BlockInput, type SectionPresetGroup } from "@slice/backend/convex/emailPresets";
import { renderBlockHtml, renderSectionHtml, type RenderContext } from "@slice/backend/convex/emailRender";
import type { EmailBlock, EmailDoc, EmailItem, EmailSectionInput, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { renderContextFor } from "@/lib/email/render-context";
import { useEditorEnv } from "./context";
import { sectionFor, type DragData } from "./dnd";
import type { Selection } from "./model";
import type { EmailEditor } from "./use-email-editor";

/** Section groups as the panels name them. */
export const SECTION_GROUPS: { group: SectionPresetGroup; label: string }[] = [
  { group: "Header", label: "Header" },
  { group: "Hero", label: "Hero" },
  { group: "Text", label: "Text" },
  { group: "Items", label: "Items and picks" },
  { group: "Gallery", label: "Galleries" },
  { group: "Quote", label: "Quotes" },
  { group: "Promotion", label: "Promotions" },
  { group: "Footer", label: "Footer" },
];

/** Items blocks that point at nothing get the brand's first items, so they show something real. */
export function fillItems<T>(input: T, items: EmailItem[]): T {
  if (!items.length) return input;
  const fill = (b: BlockInput): BlockInput => {
    if (b.type !== "items" || (b as Extract<EmailBlock, { type: "items" }>).itemIds.length) return b;
    const ib = b as Extract<EmailBlock, { type: "items" }>;
    const n = Math.min(items.length, Math.max(1, ib.pick === "taste" ? ib.count || 3 : Math.max(ib.count || 0, ib.columns || 0) || 3));
    return { ...ib, itemIds: items.slice(0, n).map((i) => i.id) } as BlockInput;
  };
  const x = input as unknown as { type?: string; columns?: { blocks: BlockInput[] }[] };
  if (x.type) return fill(input as unknown as BlockInput) as unknown as T;
  if (Array.isArray(x.columns)) return { ...x, columns: x.columns.map((c) => ({ ...c, blocks: c.blocks.map(fill) })) } as unknown as T;
  return input;
}

/** Add a preset after the selection: blocks into the selected block's column (or a new section), sections after the selected one. */
export function addPreset(editor: EmailEditor, doc: EmailDoc, sel: Selection | null, preset: { block?: BlockInput; section?: EmailSectionInput }, items: EmailItem[]) {
  if (preset.block) {
    const block = withIds<EmailBlock>(fillItems(preset.block, items));
    if (sel?.kind === "block") {
      const f = findBlock(doc, sel.id);
      if (f) return editor.apply([{ op: "insert_block", columnId: f.column.id, index: f.index + 1, block }], { select: { kind: "block", id: block.id } });
    }
    if (sel?.kind === "column" && findColumn(doc, sel.id)) return editor.apply([{ op: "insert_block", columnId: sel.id, block }], { select: { kind: "block", id: block.id } });
    const section = withIds<EmailSectionInput & { id: string }>(sectionFor(block));
    const after = sel?.kind === "section" && findSection(doc, sel.id) ? sel.id : undefined;
    return editor.apply([{ op: "insert_section", after, section }], { select: { kind: "block", id: block.id } });
  }
  if (preset.section) {
    const section = withIds<EmailSectionInput & { id: string }>(fillItems(preset.section, items));
    let after: string | undefined;
    if (sel?.kind === "section") after = sel.id;
    else if (sel?.kind === "block") after = findBlock(doc, sel.id)?.section.id;
    else if (sel?.kind === "column") after = findColumn(doc, sel.id)?.section.id;
    return editor.apply([{ op: "insert_section", after, section }], { select: { kind: "section", id: section.id } });
  }
}

/** The render context previews use: the brand, its items, sample merge values. */
export function usePreviewContext(): { ctx: RenderContext; theme: EmailTheme; items: EmailItem[] } {
  const { brand, itemMap, items, editor } = useEditorEnv();
  const theme = (editor.doc as EmailDoc).theme;
  return { ctx: renderContextFor(brand, itemMap, undefined, "preview"), theme, items };
}

/** A section drawn at email width and scaled to `width`. */
export function SectionPreview({ section, width, ctx, theme, items }: { section: EmailSectionInput; width: number; ctx: RenderContext; theme: EmailTheme; items: EmailItem[] }) {
  const s = withIds<EmailSectionInput & { id: string }>(fillItems(section, items)) as Parameters<typeof renderSectionHtml>[0];
  const W = theme.width || 600;
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${W}" style="width:${W}px;background-color:${theme.colors.surface};border-collapse:collapse"><tbody>${renderSectionHtml(s, { ...ctx, theme })}</tbody></table>`;
  return (
    <div className="pointer-events-none overflow-hidden select-none" style={{ width }} aria-hidden>
      <div className="email-canvas" style={{ width: W, zoom: width / W }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** A single element drawn at the preview's width on the email surface. */
export function BlockPreview({ block, width, ctx, theme, items }: { block: BlockInput; width: number; ctx: RenderContext; theme: EmailTheme; items: EmailItem[] }) {
  const b = withIds<EmailBlock>(fillItems(block, items));
  const inner = width - 32;
  const html = renderBlockHtml(b, { ...ctx, theme, columnWidthPx: inner, first: true, last: true });
  return (
    <div className="pointer-events-none overflow-hidden select-none" style={{ width, backgroundColor: theme.colors.surface }} aria-hidden>
      <div className="email-canvas" style={{ padding: "14px 16px" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** A preview card that adds its preset on click (or Enter) and drags onto the canvas. */
export function PresetCard({ id, data, onAdd, label, children, className }: { id: string; data: DragData; onAdd: () => void; label: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `preset:${id}`, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Add ${label}`}
      onClick={onAdd}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd();
        } else listeners?.onKeyDown?.(e);
      }}
      className={cn(
        "group/preset relative cursor-grab overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.08] transition-[box-shadow,opacity] outline-none hover:ring-2 hover:ring-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600 active:cursor-grabbing",
        isDragging && "opacity-40",
        className,
      )}
    >
      {children}
      <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover/preset:opacity-100">
        Add
      </span>
    </div>
  );
}

export { BLOCK_PRESETS, LAYOUT_PRESETS, SECTION_PRESETS };

/** The "+" between sections: pick a section to insert there. */
export function SectionPicker({ after, onDone }: { after: string; onDone: () => void }) {
  const { editor } = useEditorEnv();
  const { ctx, theme, items } = usePreviewContext();
  const groups = [...SECTION_GROUPS.map((g) => ({ id: g.group as string, label: g.label })), { id: "Layout", label: "Columns" }];
  const [group, setGroup] = useState("Hero");
  const list = group === "Layout" ? LAYOUT_PRESETS.map((p) => ({ id: p.id, label: p.label, section: p.section })) : SECTION_PRESETS.filter((p) => p.group === group);
  const insert = (section: EmailSectionInput) => {
    const s = withIds<EmailSectionInput & { id: string }>(fillItems(section, items));
    editor.apply([{ op: "insert_section", after, section: s }], { select: { kind: "section", id: s.id } });
    onDone();
  };
  return (
    <div className="flex max-h-[26rem] flex-col">
      <div className="border-b px-3 pt-3 pb-2.5">
        <p className="mb-2 text-sm font-medium">Add a section</p>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={cn("rounded-full px-2.5 py-1 text-xs transition-colors", group === g.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200")}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-thin grid min-h-0 grid-cols-2 gap-2.5 overflow-y-auto overscroll-contain p-3">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => insert(p.section)} className="group/pick flex flex-col gap-1.5 text-left">
            <span className="block overflow-hidden rounded-lg bg-white ring-1 ring-black/[0.08] transition-shadow group-hover/pick:ring-2 group-hover/pick:ring-blue-600">
              <SectionPreview section={p.section} width={156} ctx={ctx} theme={theme} items={items} />
            </span>
            <span className="truncate text-xs text-neutral-600 group-hover/pick:text-neutral-950">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
