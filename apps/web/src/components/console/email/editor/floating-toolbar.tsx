"use client";

// The toolbar floating over the selection. Text blocks get type controls
// (font, size, bold, italic, underline, colour, link, alignment, line height,
// lists); every block gets Edit with AI, padding, the taste-slot toggle,
// duplicate, move and delete. Sections and columns get their own short set.
// While text is being typed in, formatting applies to the selected words.

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Baseline,
  Bold,
  ChevronDown,
  Copy,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessagesSquare,
  PaintBucket,
  Scan,
  Trash2,
  Underline,
  UnfoldVertical,
  UserStar,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { findBlock, findColumn, findSection } from "@slice/backend/convex/emailDoc";
import { DEFAULT_SECTION_PADDING } from "@slice/backend/convex/emailRender";
import { resolveColor } from "@slice/backend/convex/emailThemes";
import type { Align, Box, EmailBlock, EmailDoc, EmailSection, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { SliderField } from "@/components/console/pages/builder/visual/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { duplicate } from "./actions";
import { useEditorEnv } from "./context";
import { BoxField, ColorRefField, fieldClass } from "./fields";
import { relayout } from "./inspector";
import { INLINE_TYPES, isMac, PERSONAL_TYPES, type Selection } from "./model";
import type { InlineState } from "./use-email-editor";

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

function TB({ label, icon: Icon, onClick, pressed, disabled, children, className }: { label: string; icon?: LucideIcon; onClick?: () => void; pressed?: boolean; disabled?: boolean; children?: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onMouseDown={keep}
            onClick={onClick}
            className={cn(
              "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-40",
              pressed && "bg-blue-600/10 text-blue-700 hover:bg-blue-600/15 hover:text-blue-800",
              className,
            )}
          />
        }
      >
        {Icon && <Icon className="size-4" />}
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Sep = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />;

/** A toolbar button that opens a small popover (sizes, padding, link…). */
function TBPopover({ label, trigger, children, width = "w-56" }: { label: string; trigger: ReactNode; children: ReactNode; width?: string }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  onMouseDown={keep}
                  className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950 data-popup-open:bg-neutral-100"
                />
              }
            />
          }
        >
          {trigger}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" align="start" className={cn(width, "gap-2.5 p-2.5")} data-inline-keep>
        {children}
      </PopoverContent>
    </Popover>
  );
}

const SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64];
const ALIGN_ICON: Record<Align, LucideIcon> = { left: AlignLeft, center: AlignCenter, right: AlignRight };

/** The words-in-progress formatting state, refreshed as the caret moves. */
function useInlineState(on: boolean, read: () => InlineState | undefined): InlineState | undefined {
  const [state, setState] = useState<InlineState | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    const update = () => setState(read());
    update();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [on, read]);
  return on ? state : undefined;
}

function LinkEditor({ initial, onApply, onRemove }: { initial: string; onApply: (href: string) => void; onRemove?: () => void }) {
  const [href, setHref] = useState(initial);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = href.trim();
        if (v) onApply(/^(https?:|mailto:|tel:|#|\{\{)/i.test(v) ? v : `https://${v}`);
      }}
    >
      <p className="text-xs font-medium">Link</p>
      <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://… or mailto:…" className={fieldClass} aria-label="Link address" />
      <div className="flex items-center justify-between gap-2">
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-xs text-muted-foreground hover:text-foreground">
            Remove link
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white">
          Apply
        </button>
      </div>
    </form>
  );
}

function PaddingControl({ value, fallback, onChange }: { value: Box | undefined; fallback: Box; onChange: (b: Box | undefined) => void }) {
  return (
    <TBPopover label="Padding" trigger={<Scan className="size-4" />} width="w-64">
      <p className="text-xs font-medium">Padding</p>
      <BoxField value={value} fallback={fallback} onChange={onChange} />
    </TBPopover>
  );
}

/* Text and every block ------------------------------------------------------------------------ */

function BlockTools({ block, theme }: { block: EmailBlock; theme: EmailTheme }) {
  const { editor, editWithAI, audience } = useEditorEnv();
  const doc = editor.doc as EmailDoc;
  const f = findBlock(doc, block.id);
  const editing = editor.editing === block.id;
  const inline = editor.inline;
  const read = () => inline.current?.state();
  const state = useInlineState(editing, read);
  const set = (fields: Record<string, unknown>, coalesce?: string) => editor.apply([{ op: "update_block", id: block.id, set: fields as Partial<EmailBlock> }], { coalesce: coalesce ? `${block.id}:${coalesce}` : undefined });
  const textual = INLINE_TYPES.has(block.type);
  const rich = block.type === "text" || block.type === "heading" || block.type === "quote";
  const mod = isMac() ? "⌘" : "Ctrl+";

  /** Formatting: on the words being typed, or on the whole text (opening it for typing). */
  const format = (command: string, value?: string) => {
    if (editing && inline.current) inline.current.exec(command, value);
    else editor.startEditing(block.id, { command, value });
  };

  const sizeOf = block.type === "heading" ? (block.size ?? (block.level === 1 ? 34 : block.level === 2 ? 26 : 20)) : block.type === "text" ? (block.size ?? 16) : undefined;
  const align = "align" in block ? (block.align as Align) : undefined;
  const AlignIcon = align ? ALIGN_ICON[align] : AlignLeft;
  const colorValue = block.type === "heading" || block.type === "text" || block.type === "button" ? block.color : undefined;
  const index = f?.index ?? 0;
  const count = f?.column.blocks.length ?? 1;

  return (
    <>
      <TB label="Edit with AI" icon={MessagesSquare} onClick={() => editWithAI({ kind: "block", id: block.id })} className="gap-1.5 pr-2.5 font-medium text-neutral-900">
        <span className="text-[13px]">Edit with AI</span>
      </TB>
      <Sep />
      {block.type === "heading" && (
        <TBPopover
          label="Font"
          trigger={
            <span className="flex max-w-28 items-center gap-1 text-[13px]">
              <span className="truncate">{(block.font === "body" ? theme.fonts.body : theme.fonts.heading).family}</span>
              <ChevronDown className="size-3.5 shrink-0 text-neutral-400" />
            </span>
          }
        >
          {(["heading", "body"] as const).map((k) => {
            const font = theme.fonts[k];
            const on = (block.font ?? "heading") === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => set({ font: k })}
                className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted", on && "bg-blue-600/5")}
              >
                <span className="truncate text-sm" style={{ fontFamily: `'${font.family}', ${font.fallback}` }}>
                  {font.family}
                </span>
                <span className="text-[11px] text-muted-foreground">{k === "heading" ? "Heading" : "Body"}</span>
              </button>
            );
          })}
          <p className="px-2 text-[11px] leading-4 text-muted-foreground">Fonts come from the theme. Change them in Themes.</p>
        </TBPopover>
      )}
      {sizeOf !== undefined && (
        <TBPopover
          label="Font size"
          width="w-36"
          trigger={
            <span className="flex items-center gap-0.5 text-[13px] tabular-nums">
              {sizeOf}
              <ChevronDown className="size-3.5 text-neutral-400" />
            </span>
          }
        >
          <div className="scrollbar-thin -mx-1 max-h-60 overflow-y-auto">
            {SIZES.map((s) => (
              <button key={s} type="button" onClick={() => set({ size: s })} className={cn("flex w-full items-center rounded-md px-2 py-1 text-left text-sm tabular-nums hover:bg-muted", s === sizeOf && "bg-blue-600/5 font-medium text-blue-700")}>
                {s}
              </button>
            ))}
          </div>
        </TBPopover>
      )}
      {textual && rich && (
        <>
          <TB label={`Bold (${mod}B)`} icon={Bold} pressed={state?.bold} onClick={() => format("bold")} />
          <TB label={`Italic (${mod}I)`} icon={Italic} pressed={state?.italic} onClick={() => format("italic")} />
          <TB label={`Underline (${mod}U)`} icon={Underline} pressed={state?.underline} onClick={() => format("underline")} />
        </>
      )}
      {(block.type === "heading" || block.type === "text" || block.type === "button") && (
        <ColorRefField
          value={colorValue}
          theme={theme}
          onChange={(c) => {
            // Words picked while typing get their own colour; otherwise the whole block changes.
            const sel = window.getSelection();
            const words = editing && sel && !sel.isCollapsed;
            if (words && c) inline.current?.exec("foreColor", resolveColor(c, theme) ?? c);
            else set({ color: c ?? null });
          }}
          trigger={
            <button type="button" aria-label="Text colour" onMouseDown={keep} className="inline-flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100">
              <Baseline className="size-4" />
              <span className="-mt-0.5 h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: resolveColor(colorValue, theme) ?? theme.colors.text }} />
            </button>
          }
        />
      )}
      {(rich || block.type === "button" || block.type === "image" || block.type === "logo") && (
        <TBPopover label="Link" trigger={<Link2 className={cn("size-4", (state?.link || ("href" in block && block.href && block.href !== "#")) && "text-blue-700")} />} width="w-72">
          {rich ? (
            <LinkEditor key={String(editing)} initial="" onApply={(href) => format("createLink", href)} onRemove={editing ? () => inline.current?.exec("unlink") : undefined} />
          ) : (
            <LinkEditor
              initial={"href" in block && block.href && block.href !== "#" ? (block.href as string) : ""}
              onApply={(href) => set({ href })}
              onRemove={block.type === "button" ? undefined : () => set({ href: null })}
            />
          )}
        </TBPopover>
      )}
      {align && (
        <TBPopover label="Align" width="w-auto" trigger={<AlignIcon className="size-4" />}>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = ALIGN_ICON[a];
              return (
                <button key={a} type="button" aria-label={a} onClick={() => set({ align: a })} className={cn("inline-flex size-8 items-center justify-center rounded-md hover:bg-muted", align === a && "bg-blue-600/10 text-blue-700")}>
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </TBPopover>
      )}
      {block.type === "text" && (
        <>
          <TBPopover label="Line height" trigger={<UnfoldVertical className="size-4" />} width="w-60">
            <p className="text-xs font-medium">Line height</p>
            <SliderField value={block.lineHeight} fallback={1.6} min={1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v }, "lineHeight")} />
          </TBPopover>
          <TB label="Bulleted list" icon={List} pressed={state?.ul} onClick={() => format("insertUnorderedList")} />
          <TB label="Numbered list" icon={ListOrdered} pressed={state?.ol} onClick={() => format("insertOrderedList")} />
        </>
      )}
      {textual && <Sep />}
      <PaddingControl value={block.padding} fallback={[0, 0, 16, 0]} onChange={(b) => set({ padding: b ?? null }, "padding")} />
      {PERSONAL_TYPES.has(block.type) && (
        <TB
          label={block.personal ? "Taste slot: written for each person" : audience?.kind === "people" ? "Write it for each person" : "Make it a taste slot"}
          icon={UserStar}
          pressed={!!block.personal}
          onClick={() => set({ personal: block.personal ? null : true })}
        />
      )}
      <TB label={`Duplicate (${mod}D)`} icon={Copy} onClick={() => duplicate(editor, doc, { kind: "block", id: block.id })} />
      <TB label="Move up" icon={ArrowUp} disabled={index === 0} onClick={() => f && editor.apply([{ op: "move_block", id: block.id, columnId: f.column.id, index: index - 1 }])} />
      <TB label="Move down" icon={ArrowDown} disabled={index >= count - 1} onClick={() => f && editor.apply([{ op: "move_block", id: block.id, columnId: f.column.id, index: index + 1 }])} />
      <TB label="Delete" icon={Trash2} onClick={() => editor.apply([{ op: "remove_block", id: block.id }], { select: null })} className="hover:bg-red-50 hover:text-red-600" />
    </>
  );
}

/* Sections and columns ------------------------------------------------------------------------- */

const LAYOUTS: { label: string; widths: number[] }[] = [
  { label: "One column", widths: [1] },
  { label: "Two, equal", widths: [0.5, 0.5] },
  { label: "Two, narrow first", widths: [1 / 3, 2 / 3] },
  { label: "Two, wide first", widths: [2 / 3, 1 / 3] },
  { label: "Three", widths: [1 / 3, 1 / 3, 1 / 3] },
];

function SectionTools({ section, theme }: { section: EmailSection; theme: EmailTheme }) {
  const { editor, editWithAI } = useEditorEnv();
  const doc = editor.doc as EmailDoc;
  const index = doc.sections.findIndex((s) => s.id === section.id);
  const set = (fields: Record<string, unknown>, coalesce?: string) => editor.apply([{ op: "update_section", id: section.id, set: fields as Partial<EmailSection> }], { coalesce: coalesce ? `${section.id}:${coalesce}` : undefined });
  return (
    <>
      <TB label="Edit with AI" icon={MessagesSquare} onClick={() => editWithAI({ kind: "section", id: section.id })} className="gap-1.5 pr-2.5 font-medium text-neutral-900">
        <span className="text-[13px]">Edit with AI</span>
      </TB>
      <Sep />
      <ColorRefField
        value={section.background}
        theme={theme}
        auto={theme.colors.surface}
        autoLabel="Email surface"
        onChange={(c) => set({ background: c ?? null })}
        trigger={
          <button type="button" aria-label="Background colour" className="inline-flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100">
            <PaintBucket className="size-4" />
            <span className="-mt-0.5 h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: resolveColor(section.background, theme) ?? theme.colors.surface }} />
          </button>
        }
      />
      <TBPopover
        label="Columns"
        width="w-auto"
        trigger={
          <span className="flex items-center gap-1 text-[13px]">
            {section.columns.length} {section.columns.length === 1 ? "column" : "columns"}
            <ChevronDown className="size-3.5 text-neutral-400" />
          </span>
        }
      >
        <div className="flex gap-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.label}
              type="button"
              title={l.label}
              aria-label={l.label}
              onClick={() => editor.apply([{ op: "set_columns", sectionId: section.id, columns: relayout(section, l.widths) }])}
              className="flex h-9 w-12 items-stretch gap-0.5 rounded-md p-1 ring-1 ring-black/10 hover:ring-blue-600"
            >
              {l.widths.map((w, i) => (
                <span key={i} className="rounded-[3px] bg-neutral-300" style={{ flex: w }} />
              ))}
            </button>
          ))}
        </div>
      </TBPopover>
      <PaddingControl value={section.padding} fallback={DEFAULT_SECTION_PADDING} onChange={(b) => set({ padding: b ?? null }, "padding")} />
      <TB label="Duplicate" icon={Copy} onClick={() => duplicate(editor, doc, { kind: "section", id: section.id })} />
      <TB label="Move up" icon={ArrowUp} disabled={index <= 0} onClick={() => editor.apply([{ op: "move_section", id: section.id, index: index - 1 }])} />
      <TB label="Move down" icon={ArrowDown} disabled={index >= doc.sections.length - 1} onClick={() => editor.apply([{ op: "move_section", id: section.id, index: index + 1 }])} />
      <TB label="Delete section" icon={Trash2} onClick={() => editor.apply([{ op: "remove_section", id: section.id }], { select: null })} className="hover:bg-red-50 hover:text-red-600" />
    </>
  );
}

function ColumnTools({ columnId, theme }: { columnId: string; theme: EmailTheme }) {
  const { editor } = useEditorEnv();
  const f = findColumn(editor.doc as EmailDoc, columnId);
  if (!f) return null;
  const set = (fields: Record<string, unknown>) => editor.apply([{ op: "update_column", id: columnId, set: fields }]);
  return (
    <>
      <ColorRefField
        value={f.column.background}
        theme={theme}
        autoLabel="Section's"
        onChange={(c) => set({ background: c ?? null })}
        trigger={
          <button type="button" aria-label="Column background" className="inline-flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100">
            <PaintBucket className="size-4" />
            <span className="-mt-0.5 h-[3px] w-4 rounded-full ring-1 ring-black/10" style={{ background: resolveColor(f.column.background ?? f.section.background, theme) ?? theme.colors.surface }} />
          </button>
        }
      />
      <PaddingControl value={f.column.padding} fallback={[0, 0, 0, 0]} onChange={(b) => set({ padding: b ?? null })} />
      <Sep />
      <TB label="Select the section" onClick={() => editor.select({ kind: "section", id: f.section.id })} className="px-2.5 text-[13px]">
        Section
      </TB>
    </>
  );
}

/* Placement ------------------------------------------------------------------------------------ */

interface Place {
  key: string;
  top: number;
  left: number;
}

/** Where the bar sits: above a block (below when there is no room), inside a section's top right. */
function usePlacement(layer: RefObject<HTMLDivElement | null>, bar: RefObject<HTMLDivElement | null>, sel: Selection | null, deps: unknown[]): Place | null {
  const [place, setPlace] = useState<Place | null>(null);
  const key = sel ? `${sel.kind}:${sel.id}` : "";
  useLayoutEffect(() => {
    const root = layer.current;
    const el = sel && root ? root.querySelector<HTMLElement>(`[data-editor-${sel.kind}="${window.CSS.escape(sel.id)}"]`) : null;
    if (!sel || !root || !el) return;
    const measure = () => {
      const lr = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const w = bar.current?.offsetWidth ?? 420;
      const h = bar.current?.offsetHeight ?? 40;
      let top: number;
      let left: number;
      if (sel.kind === "block") {
        // Leave room for the block's name tag above it.
        top = r.top - lr.top - h - 26;
        if (top < 4) top = r.bottom - lr.top + 10;
        left = r.left - lr.left + r.width / 2 - w / 2;
      } else {
        top = r.top - lr.top + 10;
        left = r.right - lr.left - w - 10;
      }
      left = Math.max(8, Math.min(left, lr.width - w - 8));
      setPlace((p) => (p && p.key === key && Math.abs(p.top - top) < 0.5 && Math.abs(p.left - left) < 0.5 ? p : { key, top, left }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(root);
    if (bar.current) ro.observe(bar.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, bar, sel, key, ...deps]);
  // A placement measured for another selection does not count.
  return place && place.key === key ? place : null;
}

export function FloatingToolbar({ layer }: { layer: RefObject<HTMLDivElement | null> }) {
  const { editor } = useEditorEnv();
  const bar = useRef<HTMLDivElement>(null);
  const sel = editor.selection;
  const doc = editor.doc as EmailDoc;
  const place = usePlacement(layer, bar, sel, [doc, editor.device, editor.editing]);
  if (!sel) return null;
  const theme = doc.theme;

  let tools: ReactElement | null = null;
  if (sel.kind === "block") {
    const f = findBlock(doc, sel.id);
    if (f) tools = <BlockTools key={f.block.id} block={f.block} theme={theme} />;
  } else if (sel.kind === "section") {
    const f = findSection(doc, sel.id);
    if (f) tools = <SectionTools section={f.section} theme={theme} />;
  } else tools = <ColumnTools columnId={sel.id} theme={theme} />;
  if (!tools) return null;

  return (
    <div
      ref={bar}
      data-editor-toolbar
      role="toolbar"
      aria-label="Selection tools"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // Keep the caret in the text being typed when the bar is clicked between buttons.
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      className={cn(
        "absolute z-40 flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.08] transition-opacity duration-150",
        place ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0 }}
    >
      {tools}
    </div>
  );
}
