"use client";

// One section of the email on the canvas, with its columns and blocks. Section
// and column boxes are React wrappers styled like the renderer's tables;
// blocks are the renderer's own HTML (edit mode). Around them: hover and
// selection outlines, name chips, drag handles, drop lines for presets, empty
// column drop zones and "+" buttons between sections.

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LayoutPanelTop, Plus, UserStar } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { columnWidths, renderBlockHtml, sectionStyle, type RenderContext } from "@slice/backend/convex/emailRender";
import { resolveColor } from "@slice/backend/convex/emailThemes";
import type { Box, EmailBlock, EmailColumn, EmailSection, EmailTheme } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEditorEnv } from "./context";
import { useDrag, type DropTarget } from "./dnd";
import { startInline } from "./inline";
import { BLOCK_ICON, BLOCK_LABEL, INLINE_TYPES, PHONE_WIDTH, reactStyle, sectionName } from "./model";
import { SectionPicker } from "./section-picker";

const DEFAULT_SECTION_PADDING: Box = [24, 32, 24, 32];

/** Section padding on a phone, the way the email's media query tightens it. */
function phonePadding(p: Box): Box {
  return [p[0] >= 48 ? 36 : p[0], p[1] >= 24 && p[3] >= 24 ? 20 : p[1], p[2] >= 48 ? 36 : p[2], p[1] >= 24 && p[3] >= 24 ? 20 : p[3]];
}

/** How the section lays out at this width: its padding, whether columns stack, and each column's px width. */
export function sectionLayout(section: EmailSection, theme: EmailTheme, phone: boolean) {
  const base = section.padding ?? DEFAULT_SECTION_PADDING;
  const padding = phone ? phonePadding(base) : base;
  const width = phone ? PHONE_WIDTH : theme.width || 600;
  const stack = phone && section.columns.length > 1 && section.stackOnMobile !== false;
  const inner = Math.max(100, width - padding[1] - padding[3]);
  const widths = stack ? section.columns.map(() => inner) : columnWidths({ ...section, padding }, { ...theme, width });
  return { padding, stack, widths, gap: section.columns.length > 1 ? (section.gap ?? 24) : 0 };
}

const VALIGN = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

/** The 2px line a preset will be dropped on. */
function DropLine({ edge, label }: { edge: "before" | "after"; label?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 z-30 flex items-center", edge === "before" ? "-top-[3px]" : "-bottom-[3px]")}>
      <span className="size-2 shrink-0 rounded-full border-2 border-blue-600 bg-white" />
      <span className="h-0.5 flex-1 bg-blue-600" />
      {label && <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-2 py-0.5 font-sans text-[11px] leading-4 font-medium text-white shadow-sm">{label}</span>}
      <span className="size-2 shrink-0 rounded-full border-2 border-blue-600 bg-white" />
    </div>
  );
}

/** A small tag naming what is selected or hovered ("Text", "Hero"). */
function NameChip({ children, tone, className }: { children: ReactNode; tone: "selected" | "hover"; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-20 inline-flex h-5 items-center gap-1 rounded-t-[5px] px-1.5 font-sans text-[11px] leading-none font-medium whitespace-nowrap",
        tone === "selected" ? "bg-blue-600 text-white" : "bg-blue-500/90 text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* Blocks ---------------------------------------------------------------------------- */

function CanvasBlock({
  block,
  columnId,
  sectionId,
  ctx,
  theme,
  sectionBackground,
  columnWidthPx,
  first,
  last,
  target,
  readOnly,
}: {
  block: EmailBlock;
  columnId: string;
  sectionId: string;
  ctx: RenderContext;
  theme: EmailTheme;
  sectionBackground: EmailSection["background"];
  columnWidthPx: number;
  first: boolean;
  last: boolean;
  target: DropTarget | null;
  readOnly: boolean;
}) {
  const { editor, audience } = useEditorEnv();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { kind: "block", id: block.id, columnId },
    disabled: readOnly,
  });
  const host = useRef<HTMLDivElement>(null);
  const clickAt = useRef<{ x: number; y: number } | null>(null);
  const html = renderBlockHtml(block, { ...ctx, theme, sectionBackground, columnWidthPx, first, last });
  const selected = editor.selection?.kind === "block" && editor.selection.id === block.id;
  const hovered = !selected && editor.hover?.kind === "block" && editor.hover.id === block.id;
  const editing = editor.editing === block.id;
  const Icon = BLOCK_ICON[block.type];

  // Type in place: the renderer's text element becomes editable until the merchant clicks away.
  const { apply, stopEditing, takeCommand, registerInline } = editor;
  useLayoutEffect(() => {
    if (!editing || !host.current) return;
    const at = clickAt.current;
    clickAt.current = null;
    const started = startInline({
      host: host.current,
      block,
      at,
      command: takeCommand(),
      onCommit: (set) => apply([{ op: "update_block", id: block.id, set }]),
      onDone: stopEditing,
    });
    if (!started) {
      stopEditing();
      return;
    }
    registerInline(started.handle);
    return () => {
      started.cleanup();
      registerInline(null, started.handle);
    };
    // The block is read when editing starts; a commit ends editing before it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : undefined };
  const dropHere = target?.kind === "block" && target.anchor === block.id && target.edge !== "inside" ? target.edge : null;
  const personal = block.personal && audience?.kind === "people";

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-editor-block={block.id}
      className={cn("group/block relative", editing && "z-10")}
      onPointerEnter={() => !readOnly && editor.setHover({ kind: "block", id: block.id })}
      onPointerLeave={() => editor.hover?.id === block.id && editor.setHover(readOnly ? null : { kind: "section", id: sectionId })}
      onClick={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
        if (readOnly || editing) return;
        editor.select({ kind: "block", id: block.id });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (readOnly || !INLINE_TYPES.has(block.type)) return;
        clickAt.current = { x: e.clientX, y: e.clientY };
        editor.startEditing(block.id);
      }}
    >
      <div ref={host} dangerouslySetInnerHTML={{ __html: html }} />
      {!readOnly && (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-10 rounded-[2px]",
              selected ? "ring-2 ring-blue-600" : hovered ? "ring-1 ring-blue-500/80" : "",
              editing && "ring-blue-600/70",
            )}
          />
          {(selected || hovered) && !editing && (
            <NameChip tone={selected ? "selected" : "hover"} className="-top-5 left-0">
              <Icon className="size-3" />
              {BLOCK_LABEL[block.type]}
            </NameChip>
          )}
          {personal && (
            <span className="pointer-events-none absolute top-1 right-1 z-20 inline-flex size-5 items-center justify-center rounded-full bg-white/95 text-blue-700 shadow-sm ring-1 ring-blue-600/20" title="Written for each person">
              <UserStar className="size-3" />
            </span>
          )}
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move ${BLOCK_LABEL[block.type].toLowerCase()}`}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute top-1/2 -left-7 z-20 m-0 flex h-7 w-5 -translate-y-1/2 cursor-grab appearance-none items-center justify-center rounded-md border-0 bg-white p-0 text-neutral-500 opacity-0 shadow-sm ring-1 ring-black/10 transition-opacity hover:text-neutral-900 focus-visible:opacity-100 active:cursor-grabbing group-hover/block:opacity-100",
              selected && "opacity-100",
            )}
          >
            <GripVertical className="size-3.5" />
          </button>
        </>
      )}
      {dropHere && <DropLine edge={dropHere} />}
    </div>
  );
}

/* Columns ----------------------------------------------------------------------------- */

function CanvasColumn({
  column,
  section,
  width,
  stacked,
  ctx,
  theme,
  readOnly,
}: {
  column: EmailColumn;
  section: EmailSection;
  width: number;
  stacked: boolean;
  ctx: RenderContext;
  theme: EmailTheme;
  readOnly: boolean;
}) {
  const { editor, setPanel } = useEditorEnv();
  const { target } = useDrag();
  const { setNodeRef } = useDroppable({ id: `col:${column.id}`, data: { kind: "column", id: column.id }, disabled: readOnly });
  const pad = column.padding ?? [0, 0, 0, 0];
  const innerW = Math.max(40, width - pad[1] - pad[3]);
  const bgRef = column.background ?? section.background;
  const bg = resolveColor(column.background, theme);
  const selected = editor.selection?.kind === "column" && editor.selection.id === column.id;
  const empty = column.blocks.length === 0;
  const dropInside = target?.kind === "block" && target.columnId === column.id && target.edge === "inside";

  return (
    <div
      ref={setNodeRef}
      data-editor-column={column.id}
      className="relative flex min-w-0 flex-col"
      style={{
        // Widths include padding, as the renderer's table cells do.
        boxSizing: "border-box",
        width: stacked ? "100%" : width,
        flex: stacked ? undefined : "none",
        padding: `${pad[0]}px ${pad[1]}px ${pad[2]}px ${pad[3]}px`,
        backgroundColor: bg,
        justifyContent: VALIGN[column.verticalAlign ?? "top"],
      }}
      onClick={(e) => {
        if (readOnly || section.columns.length < 2) return;
        e.stopPropagation();
        editor.select({ kind: "column", id: column.id });
      }}
    >
      <SortableContext id={column.id} items={column.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {column.blocks.map((b, i) => (
          <CanvasBlock
            key={b.id}
            block={b}
            columnId={column.id}
            sectionId={section.id}
            ctx={ctx}
            theme={theme}
            sectionBackground={bgRef}
            columnWidthPx={innerW}
            first={i === 0}
            last={i === column.blocks.length - 1}
            target={target}
            readOnly={readOnly}
          />
        ))}
      </SortableContext>
      {empty && !readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            editor.select({ kind: "column", id: column.id });
            setPanel("add");
          }}
          className={cn(
            "m-0 flex min-h-24 w-full appearance-none flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent p-3 font-sans text-xs text-neutral-500 transition-colors",
            dropInside ? "border-blue-600 bg-blue-600/5 text-blue-700" : "border-neutral-400/60 hover:border-neutral-500 hover:text-neutral-700",
          )}
        >
          <Plus className="size-4" />
          {dropInside ? "Drop it here" : "Drop an element here, or click to add"}
        </button>
      )}
      {selected && <span aria-hidden className="pointer-events-none absolute inset-0 z-10 ring-2 ring-blue-600 ring-inset" />}
      {selected && (
        <NameChip tone="selected" className="-top-5 left-0">
          Column
        </NameChip>
      )}
    </div>
  );
}

/* Sections ---------------------------------------------------------------------------- */

/** "+" on a section edge: a compact picker of sections to insert there. */
function InsertSection({ after, edge }: { after: string; edge: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Add a section here"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute left-1/2 z-30 m-0 flex size-7 -translate-x-1/2 appearance-none items-center justify-center rounded-full border-0 bg-blue-600 p-0 text-white opacity-0 shadow-md transition-[opacity,transform] group-hover/section:opacity-100 hover:scale-110 focus-visible:opacity-100 data-popup-open:opacity-100",
              edge === "top" ? "-top-3.5" : "-bottom-3.5",
            )}
          />
        }
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </PopoverTrigger>
      <PopoverContent side={edge === "top" ? "top" : "bottom"} className="w-[22rem] p-0" data-inline-keep>
        <SectionPicker after={after} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

export function CanvasSection({
  section,
  index,
  ctx,
  theme,
  phone,
  readOnly,
  fresh,
}: {
  section: EmailSection;
  index: number;
  ctx: RenderContext;
  theme: EmailTheme;
  phone: boolean;
  readOnly: boolean;
  fresh: boolean;
}) {
  const { editor } = useEditorEnv();
  const { target, active } = useDrag();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { kind: "section", id: section.id },
    disabled: readOnly,
  });
  const { padding, stack, widths, gap } = sectionLayout(section, theme, phone);
  const box = reactStyle(sectionStyle({ ...section, padding }, theme));
  const selected = editor.selection?.kind === "section" && editor.selection.id === section.id;
  const hovered = !selected && editor.hover?.kind === "section" && editor.hover.id === section.id;
  const name = sectionName(section, index);
  const dropHere = target?.kind === "section" && target.anchor === section.id ? target.edge : null;
  const dragging = !!active;

  return (
    <div
      ref={setNodeRef}
      data-editor-section={section.id}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : undefined }}
      className={cn("group/section relative", fresh && "animate-in fade-in-0 slide-in-from-bottom-3 duration-500")}
      onPointerEnter={() => !readOnly && editor.setHover({ kind: "section", id: section.id })}
      onPointerLeave={() => editor.hover?.id === section.id && editor.setHover(null)}
      onClick={() => !readOnly && editor.select({ kind: "section", id: section.id })}
    >
      <div style={box}>
        <div style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: stack ? 20 : gap, alignItems: "stretch" }}>
          {section.columns.map((c, i) => (
            <CanvasColumn key={c.id} column={c} section={section} width={widths[i]} stacked={stack} ctx={ctx} theme={theme} readOnly={readOnly} />
          ))}
        </div>
      </div>
      {!readOnly && (
        <>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-[5]",
              selected ? "ring-2 ring-blue-600 ring-inset" : hovered && !dragging ? "ring-1 ring-blue-400 ring-inset" : "",
            )}
          />
          {(selected || (hovered && !dragging)) && (
            <NameChip tone={selected ? "selected" : "hover"} className="top-0 left-0 rounded-t-none rounded-br-[5px]">
              <LayoutPanelTop className="size-3" />
              {name}
            </NameChip>
          )}
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Move the ${name} section`}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute top-3 -left-11 z-20 m-0 flex h-9 w-7 cursor-grab appearance-none items-center justify-center rounded-lg border-0 bg-white p-0 text-neutral-500 opacity-0 shadow-sm ring-1 ring-black/10 transition-opacity hover:text-neutral-900 focus-visible:opacity-100 active:cursor-grabbing group-hover/section:opacity-100",
              selected && "opacity-100",
            )}
          >
            <GripVertical className="size-4" />
          </button>
          {!dragging && index === 0 && <InsertSection after="start" edge="top" />}
          {!dragging && <InsertSection after={section.id} edge="bottom" />}
        </>
      )}
      {dropHere && <DropLine edge={dropHere} label="Drop the section here" />}
    </div>
  );
}

/** Scroll a newly selected thing into view (a section added from the panel, a layer clicked). */
export function useRevealSelection(scroller: RefObject<HTMLElement | null>) {
  const { editor } = useEditorEnv();
  const sel = editor.selection;
  useEffect(() => {
    if (!sel || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-editor-${sel.kind}="${CSS_ESCAPE(sel.id)}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = scroller.current.getBoundingClientRect();
    if (r.top < s.top + 40 || r.top > s.bottom - 80) el.scrollIntoView({ block: r.height > s.height - 120 ? "start" : "center", behavior: "smooth" });
  }, [sel, scroller]);
}

const CSS_ESCAPE = (s: string) => (typeof window !== "undefined" && window.CSS?.escape ? window.CSS.escape(s) : s);
