"use client";

// Layers: the email as a tree (sections, their columns, the blocks inside).
// Hovering a row outlines it on the canvas, clicking selects it, and the
// handles reorder sections, and blocks within their column.

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, Columns2, EyeOff, GripVertical, LayoutPanelTop, UserStar } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { EmailBlock, EmailColumn, EmailDoc, EmailSection } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { useEditorEnv } from "./context";
import { BLOCK_ICON, BLOCK_LABEL, blockText, sectionName, type Selection } from "./model";
import { PanelHeader } from "./panel-ui";

function Row({ id, sel, depth, icon, label, detail, open, onToggle, trailing, disabled }: { id: string; sel: Selection; depth: number; icon: ReactNode; label: string; detail?: string; open?: boolean; onToggle?: () => void; trailing?: ReactNode; disabled?: boolean }) {
  const { editor } = useEditorEnv();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const selected = editor.selection?.kind === sel.kind && editor.selection.id === sel.id;
  const hovered = editor.hover?.kind === sel.kind && editor.hover.id === sel.id;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, paddingLeft: 4 + depth * 14 }}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={onToggle ? open : undefined}
      onClick={() => editor.select(sel)}
      onPointerEnter={() => editor.setHover(sel)}
      onPointerLeave={() => hovered && editor.setHover(null)}
      className={cn(
        "group/layer relative flex h-8 cursor-default items-center gap-1.5 rounded-lg pr-1.5 text-xs select-none",
        selected ? "bg-blue-600/10 text-blue-900" : hovered ? "bg-neutral-100" : "hover:bg-neutral-100",
        isDragging && "z-10 bg-white opacity-90 shadow-md ring-1 ring-black/10",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Collapse" : "Expand"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn("flex size-4 shrink-0 items-center justify-center rounded text-neutral-400", !onToggle && "invisible")}
      >
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
      </button>
      <span className={cn("shrink-0 [&_svg]:size-3.5", selected ? "text-blue-700" : "text-neutral-500")}>{icon}</span>
      <span className={cn("min-w-0 truncate", depth === 0 && "font-medium")}>{label}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-neutral-400">{detail}</span>}
      {!detail && <span className="flex-1" />}
      {trailing}
      {!disabled && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Move ${label}`}
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded text-neutral-400 opacity-0 group-hover/layer:opacity-100 hover:text-neutral-800 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function BlockRows({ column, depth, locked }: { column: EmailColumn; depth: number; locked: boolean }) {
  return (
    <SortableContext id={column.id} items={column.blocks.map((b) => `b:${b.id}`)} strategy={verticalListSortingStrategy}>
      {column.blocks.map((b: EmailBlock) => {
        const Icon = BLOCK_ICON[b.type];
        return (
          <Row
            key={b.id}
            id={`b:${b.id}`}
            sel={{ kind: "block", id: b.id }}
            depth={depth}
            icon={<Icon />}
            label={BLOCK_LABEL[b.type]}
            detail={blockText(b)}
            disabled={locked}
            trailing={
              <>
                {b.hideOn && <EyeOff className="size-3 shrink-0 text-neutral-400" aria-label={b.hideOn === "mobile" ? "Hidden on phones" : "Hidden on desktop"} />}
                {b.personal && <UserStar className="size-3 shrink-0 text-blue-700" aria-label="Taste slot" />}
              </>
            }
          />
        );
      })}
      {column.blocks.length === 0 && (
        <p className="h-7 text-[11px] leading-7 text-neutral-400" style={{ paddingLeft: 26 + depth * 14 }}>
          Empty
        </p>
      )}
    </SortableContext>
  );
}

function SectionRows({ section, index, open, onToggle, locked }: { section: EmailSection; index: number; open: boolean; onToggle: () => void; locked: boolean }) {
  return (
    <>
      <Row id={`s:${section.id}`} sel={{ kind: "section", id: section.id }} depth={0} icon={<LayoutPanelTop />} label={sectionName(section, index)} open={open} onToggle={onToggle} disabled={locked} />
      {open &&
        (section.columns.length === 1 ? (
          <BlockRows column={section.columns[0]} depth={1} locked={locked} />
        ) : (
          section.columns.map((c, i) => (
            <div key={c.id}>
              <Row id={`c:${c.id}`} sel={{ kind: "column", id: c.id }} depth={1} icon={<Columns2 />} label={`Column ${i + 1}`} detail={`${Math.round(c.width * 100)}%`} disabled />
              <BlockRows column={c} depth={2} locked={locked} />
            </div>
          ))
        ))}
    </>
  );
}

/** Sections drop on sections, blocks on blocks. */
const sameKind: CollisionDetection = (args) => closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id)[0] === String(args.active.id)[0]) });

export function LayersPanel() {
  const { editor } = useEditorEnv();
  const doc = editor.doc as EmailDoc;
  const [closed, setClosed] = useState<string[]>([]);
  // While a section moves, every section folds so its rows travel as one.
  const [movingSection, setMovingSection] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // The selected block's section opens by itself.
  const sel = editor.selection;
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (sel && sel.id !== openedFor) {
    setOpenedFor(sel.id);
    const owner = doc.sections.find((s) => s.id === sel.id || s.columns.some((c) => c.id === sel.id || c.blocks.some((b) => b.id === sel.id)));
    if (owner && closed.includes(owner.id)) setClosed(closed.filter((x) => x !== owner.id));
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setMovingSection(false);
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const o = String(over.id);
    if (a.startsWith("s:") && o.startsWith("s:")) {
      const index = doc.sections.findIndex((s) => s.id === o.slice(2));
      if (index >= 0) editor.apply([{ op: "move_section", id: a.slice(2), index }]);
      return;
    }
    if (a.startsWith("b:") && o.startsWith("b:")) {
      const target = doc.sections.flatMap((s) => s.columns).find((c) => c.blocks.some((b) => b.id === o.slice(2)));
      if (!target) return;
      editor.apply([{ op: "move_block", id: a.slice(2), columnId: target.id, index: target.blocks.findIndex((b) => b.id === o.slice(2)) }]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title="Layers" subtitle="Every section and block, top to bottom. Drag to reorder.">
        <button type="button" onClick={() => setClosed(closed.length ? [] : doc.sections.map((s) => s.id))} className="mt-1 shrink-0 text-xs text-muted-foreground hover:text-foreground">
          {closed.length ? "Expand all" : "Collapse all"}
        </button>
      </PanelHeader>
      <div role="tree" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6" onPointerLeave={() => editor.setHover(null)}>
        <DndContext
          sensors={sensors}
          collisionDetection={sameKind}
          onDragStart={({ active }) => setMovingSection(String(active.id).startsWith("s:"))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setMovingSection(false)}
        >
          <SortableContext items={doc.sections.map((s) => `s:${s.id}`)} strategy={verticalListSortingStrategy}>
            {doc.sections.map((s, i) => (
              <SectionRows key={s.id} section={s} index={i} open={!movingSection && !closed.includes(s.id)} onToggle={() => setClosed(closed.includes(s.id) ? closed.filter((x) => x !== s.id) : [...closed, s.id])} locked={editor.locked} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
