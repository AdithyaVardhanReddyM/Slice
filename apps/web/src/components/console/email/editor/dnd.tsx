"use client";

// Drag and drop for the editor: sections reorder, blocks reorder and move
// between columns (the canvas reflows live while a block crosses columns),
// and presets from the Add panel drop between blocks or sections with a line
// showing where they land. One DndContext spans the Add panel and the canvas.

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { GripVertical, LayoutPanelTop } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { applyOps, findBlock, findColumn, withIds } from "@slice/backend/convex/emailDoc";
import type { EmailBlock, EmailDoc, EmailSectionInput } from "@slice/backend/convex/emailTypes";
import { BLOCK_ICON, BLOCK_LABEL, sectionName } from "./model";
import type { EmailEditor } from "./use-email-editor";

type BlockInput = Omit<EmailBlock, "id"> & { id?: string };

export type DragData =
  | { kind: "section"; id: string }
  | { kind: "block"; id: string }
  | { kind: "preset-block"; label: string; block: BlockInput }
  | { kind: "preset-section"; label: string; section: EmailSectionInput };

export type DropData = { kind: "section"; id: string } | { kind: "block"; id: string } | { kind: "column"; id: string };

/** Where a preset will land: an index among a column's blocks, or among the sections. */
export type DropTarget =
  | { kind: "block"; columnId: string; index: number; anchor: string | null; edge: "before" | "after" | "inside" }
  | { kind: "section"; index: number; anchor: string; edge: "before" | "after" };

interface DragState {
  /** What is being dragged, if anything. */
  active: DragData | null;
  /** The doc as it looks mid-drag (a block moved into another column). */
  dragDoc: EmailDoc | null;
  target: DropTarget | null;
}

const DragCtx = createContext<DragState>({ active: null, dragDoc: null, target: null });

export const useDrag = () => useContext(DragCtx);

/** The block or section element on the canvas, for measuring where the pointer is. */
const elementOf = (kind: "block" | "section", id: string) => document.querySelector<HTMLElement>(`[data-editor-${kind}="${CSS.escape(id)}"]`);

const isBlockish = (d: DragData | undefined) => d?.kind === "block" || d?.kind === "preset-block";

/** Sections drop on sections; blocks on blocks or columns. A preset outside the canvas drops nowhere. */
const collision: CollisionDetection = (args) => {
  const active = args.active.data.current as DragData | undefined;
  if (!active) return [];
  const blockish = isBlockish(active);
  const containers = args.droppableContainers.filter((c) => {
    const k = (c.data.current as DropData | undefined)?.kind;
    return blockish ? k === "block" || k === "column" : k === "section";
  });
  const within = pointerWithin({ ...args, droppableContainers: containers });
  if (within.length) {
    // The innermost: a block inside the column the pointer is also in.
    const blocks = within.filter((c) => args.droppableContainers.find((d) => d.id === c.id)?.data.current?.kind === "block");
    return blocks.length ? blocks : within;
  }
  if (active.kind === "preset-block" || active.kind === "preset-section") return [];
  return closestCenter({ ...args, droppableContainers: containers.filter((c) => (c.data.current as DropData | undefined)?.kind !== "column") });
};

/** The ghost sits just under the pointer, wherever on the dragged card the drag began. */
const atCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const at = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!draggingNodeRect || !at) return transform;
  return { ...transform, x: transform.x + at.x - draggingNodeRect.left - 14, y: transform.y + at.y - draggingNodeRect.top - 18 };
};

/** A one-column section holding a single block (a block dropped where there is no column). */
export function sectionFor(block: BlockInput): EmailSectionInput {
  return { padding: [12, 32, 12, 32], columns: [{ width: 1, blocks: [block] }] };
}

export function EditorDnd({ editor, children }: { editor: EmailEditor; children: ReactNode }) {
  const [active, setActive] = useState<DragData | null>(null);
  const [dragDoc, setDragDoc] = useState<EmailDoc | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const dragDocRef = useRef<EmailDoc | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const overRef = useRef<DropData | null>(null);
  const scrollRaf = useRef(0);
  const doc = editor.doc;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setDrag = (d: EmailDoc | null) => {
    dragDocRef.current = d;
    setDragDoc(d);
  };
  const setDrop = (t: DropTarget | null) => {
    // The pointer moves constantly; only a new place re-renders the canvas.
    const prev = targetRef.current;
    if (prev === t || (prev && t && JSON.stringify(prev) === JSON.stringify(t))) return;
    targetRef.current = t;
    setTarget(t);
  };

  /** Where a preset lands for the pointer over `over`. */
  const presetTarget = useCallback(
    (a: DragData, over: DropData | null): DropTarget | null => {
      if (!doc || !over) return null;
      const y = pointer.current.y;
      const below = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return y > r.top + r.height / 2;
      };
      if (a.kind === "preset-section" && over.kind === "section") {
        const index = doc.sections.findIndex((s) => s.id === over.id);
        if (index < 0) return null;
        const after = below(elementOf("section", over.id));
        return { kind: "section", index: after ? index + 1 : index, anchor: over.id, edge: after ? "after" : "before" };
      }
      if (a.kind === "preset-block" && over.kind === "block") {
        const f = findBlock(doc, over.id);
        if (!f) return null;
        const after = below(elementOf("block", over.id));
        return { kind: "block", columnId: f.column.id, index: after ? f.index + 1 : f.index, anchor: over.id, edge: after ? "after" : "before" };
      }
      if (a.kind === "preset-block" && over.kind === "column") {
        const f = findColumn(doc, over.id);
        if (!f) return null;
        const last = f.column.blocks[f.column.blocks.length - 1];
        return { kind: "block", columnId: over.id, index: f.column.blocks.length, anchor: last?.id ?? null, edge: last ? "after" : "inside" };
      }
      return null;
    },
    [doc],
  );

  // Track the pointer while dragging (for before/after) and scroll the canvas near its edges:
  // dnd-kit only scrolls the dragged node's own ancestors, and presets come from the panel.
  useEffect(() => {
    if (!active) return;
    const preset = active.kind === "preset-block" || active.kind === "preset-section";
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (preset && overRef.current) setDrop(presetTarget(active, overRef.current));
    };
    const tick = () => {
      // Blocks and sections dragged on the canvas already scroll it (dnd-kit); presets need this.
      if (!preset) return;
      const scroller = document.querySelector<HTMLElement>("[data-email-scroller]");
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        const { x, y } = pointer.current;
        if (x >= r.left && x <= r.right) {
          const edge = 72;
          const up = y < r.top + edge ? -(r.top + edge - y) : 0;
          const down = y > r.bottom - edge ? y - (r.bottom - edge) : 0;
          const speed = (up || down) / 4;
          if (speed) scroller.scrollTop += Math.max(-24, Math.min(24, speed));
        }
      }
      scrollRaf.current = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    scrollRaf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(scrollRaf.current);
    };
  }, [active, presetTarget]);

  const onDragStart = (e: DragStartEvent) => {
    const ev = e.activatorEvent as PointerEvent | KeyboardEvent;
    if ("clientY" in ev) pointer.current = { x: ev.clientX, y: ev.clientY };
    setActive((e.active.data.current as DragData) ?? null);
    editor.stopEditing();
  };

  const onDragOver = (e: DragOverEvent) => {
    const a = e.active.data.current as DragData | undefined;
    const over = (e.over?.data.current as DropData | undefined) ?? null;
    overRef.current = over;
    if (!a || !doc) return;
    if (a.kind === "preset-block" || a.kind === "preset-section") {
      setDrop(presetTarget(a, over));
      return;
    }
    if (a.kind !== "block" || !over) return;
    // A block crossing into another column: move it there now so the canvas reflows around it.
    const cur = dragDocRef.current ?? doc;
    const from = findBlock(cur, a.id);
    if (!from) return;
    let columnId: string;
    let index: number;
    if (over.kind === "block") {
      if (over.id === a.id) return;
      const to = findBlock(cur, over.id);
      if (!to || to.column.id === from.column.id) return;
      const el = elementOf("block", over.id);
      const r = el?.getBoundingClientRect();
      columnId = to.column.id;
      index = to.index + (r && pointer.current.y > r.top + r.height / 2 ? 1 : 0);
    } else if (over.kind === "column") {
      if (over.id === from.column.id) return;
      const to = findColumn(cur, over.id);
      if (!to) return;
      columnId = over.id;
      index = to.column.blocks.length;
    } else return;
    setDrag(applyOps(cur, [{ op: "move_block", id: a.id, columnId, index }]).doc);
  };

  const reset = () => {
    setActive(null);
    setDrag(null);
    setDrop(null);
    overRef.current = null;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const a = e.active.data.current as DragData | undefined;
    const over = (e.over?.data.current as DropData | undefined) ?? null;
    const t = targetRef.current;
    const cur = dragDocRef.current ?? doc;
    reset();
    if (!a || !doc || !cur) return;

    if (a.kind === "section") {
      if (over?.kind !== "section" || over.id === a.id) return;
      const index = doc.sections.findIndex((s) => s.id === over.id);
      if (index >= 0) editor.apply([{ op: "move_section", id: a.id, index }], { select: { kind: "section", id: a.id } });
      return;
    }

    if (a.kind === "block") {
      let final = cur;
      const at = findBlock(cur, a.id);
      if (!at) return;
      if (over?.kind === "block" && over.id !== a.id) {
        const o = findBlock(cur, over.id);
        // Same column: the sortable list already shows it at the over block's place.
        if (o && o.column.id === at.column.id) final = applyOps(cur, [{ op: "move_block", id: a.id, columnId: at.column.id, index: o.index }]).doc;
      }
      const end = findBlock(final, a.id);
      const start = findBlock(doc, a.id);
      if (end && start && (end.column.id !== start.column.id || end.index !== start.index)) {
        editor.apply([{ op: "move_block", id: a.id, columnId: end.column.id, index: end.index }], { select: { kind: "block", id: a.id } });
      }
      return;
    }

    if (!t) return;
    if (a.kind === "preset-block" && t.kind === "block") {
      const block = withIds<EmailBlock>(a.block);
      editor.apply([{ op: "insert_block", columnId: t.columnId, index: t.index, block }], { select: { kind: "block", id: block.id } });
    } else if (a.kind === "preset-section" && t.kind === "section") {
      const section = withIds<EmailSectionInput & { id: string }>(a.section);
      const after = t.index === 0 ? "start" : doc.sections[t.index - 1]?.id;
      editor.apply([{ op: "insert_section", after, section }], { select: { kind: "section", id: section.id } });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={reset}>
      <DragCtx.Provider value={{ active, dragDoc, target }}>{children}</DragCtx.Provider>
      <DragOverlay dropAnimation={null} modifiers={[atCursor]}>{active ? <DragGhost data={active} doc={doc} /> : null}</DragOverlay>
    </DndContext>
  );
}

/** What follows the pointer: a small card naming what is being moved. */
function DragGhost({ data, doc }: { data: DragData; doc: EmailDoc | null }) {
  let label = "";
  let Icon = LayoutPanelTop;
  if (data.kind === "section") {
    const i = doc?.sections.findIndex((s) => s.id === data.id) ?? -1;
    label = doc && i >= 0 ? sectionName(doc.sections[i], i) : "Section";
  } else if (data.kind === "block") {
    const f = doc ? findBlock(doc, data.id) : null;
    label = f ? BLOCK_LABEL[f.block.type] : "Block";
    if (f) Icon = BLOCK_ICON[f.block.type];
  } else if (data.kind === "preset-block") {
    label = data.label;
    Icon = BLOCK_ICON[data.block.type as EmailBlock["type"]] ?? LayoutPanelTop;
  } else label = data.label;
  return (
    <div className="pointer-events-none inline-flex h-9 cursor-grabbing items-center gap-2 rounded-xl bg-neutral-900 pr-3.5 pl-2 text-sm font-medium text-white shadow-xl ring-1 ring-black/10">
      <GripVertical className="size-4 text-white/50" />
      <Icon className="size-4" />
      {label}
    </div>
  );
}
