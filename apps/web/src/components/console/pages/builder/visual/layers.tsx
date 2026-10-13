"use client";
"use no memo";
// The tree is read from the live canvas DOM on every render, so the compiler must not cache it.

// The visual editor's left panel: the page as a tree (sections, then what is
// inside them). Hovering a row outlines the element on the page, clicking
// selects it and scrolls it into view; the selected element's branch opens
// by itself. A dot marks what the merchant changed by hand.

import {
  ChevronRight,
  Columns3,
  EyeOff,
  Film,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Link,
  List,
  Menu,
  Minus,
  MousePointerClick,
  PanelBottom,
  PanelTop,
  Quote,
  RectangleHorizontal,
  Rows3,
  Shapes,
  Square,
  TextCursorInput,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PG_ID, kindOf, previewOf, type Kind } from "./model";
import type { VisualEditor } from "./use-visual-editor";

const ICONS: Record<Kind, LucideIcon> = {
  section: RectangleHorizontal,
  header: PanelTop,
  footer: PanelBottom,
  nav: Menu,
  heading: Heading,
  text: Type,
  button: MousePointerClick,
  link: Link,
  image: ImageIcon,
  video: Film,
  icon: Shapes,
  list: List,
  item: Minus,
  form: TextCursorInput,
  field: TextCursorInput,
  row: Columns3,
  stack: Rows3,
  grid: LayoutGrid,
  box: Square,
  divider: Minus,
  quote: Quote,
};

export function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = ICONS[kind] ?? Square;
  return <Icon className={className} />;
}

/** Children worth listing: elements, not the shapes inside an icon or line breaks. */
const childrenOf = (el: Element) => (el.tagName.toUpperCase() === "SVG" ? [] : [...el.children].filter((c) => !["BR", "WBR", "SOURCE"].includes(c.tagName.toUpperCase())));

function Row({ ed, el, depth, open, toggle }: { ed: VisualEditor; el: Element; depth: number; open: Set<Element>; toggle: (el: Element) => void }) {
  const kids = childrenOf(el);
  const expanded = open.has(el);
  const selected = ed.selected === el;
  const ref = useRef<HTMLDivElement>(null);
  const hidden = ed.win?.getComputedStyle(el).display === "none";
  const id = el.getAttribute(PG_ID);
  const edited = !!id && !!ed.hand.elements[id];
  const preview = previewOf(el);
  const name = ed.name(el);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <>
      <div
        ref={ref}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={kids.length ? expanded : undefined}
        tabIndex={-1}
        onClick={() => ed.select(el, { scroll: true })}
        onPointerEnter={() => ed.hover(el)}
        onPointerLeave={() => ed.hover(null)}
        className={cn(
          "group/layer flex h-7 cursor-default items-center gap-1 rounded-md pr-2 text-xs select-none",
          selected ? "bg-blue-600/10 text-blue-800 dark:text-blue-300" : "hover:bg-muted",
          hidden && "opacity-50",
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            if (kids.length) toggle(el);
          }}
          className={cn("flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground", !kids.length && "invisible")}
        >
          <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
        </button>
        <KindIcon kind={kindOf(el, ed.win)} className={cn("size-3.5 shrink-0", selected ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground")} />
        <span className={cn("min-w-0 truncate", depth === 0 && "font-medium")}>{name}</span>
        {preview && !name.includes(preview.slice(0, 12)) && <span className="min-w-0 flex-1 truncate text-muted-foreground">{preview}</span>}
        <span className="flex-1" />
        {hidden && <EyeOff className="size-3 shrink-0 text-muted-foreground" aria-label="Hidden" />}
        {edited && <span className="size-1.5 shrink-0 rounded-full bg-blue-600" title="Changed by you" />}
      </div>
      {expanded && kids.map((k, i) => <Row key={i} ed={ed} el={k} depth={depth + 1} open={open} toggle={toggle} />)}
    </>
  );
}

export function LayersPanel({ ed }: { ed: VisualEditor }) {
  const [open, setOpen] = useState<Set<Element>>(() => new Set());
  const toggle = (el: Element) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(el)) next.delete(el);
      else next.add(el);
      return next;
    });

  // Open the selected element's branch (once per selection, so it can be closed again).
  const { selected, body } = ed;
  const [openedFor, setOpenedFor] = useState<Element | null>(null);
  if (selected !== openedFor) {
    setOpenedFor(selected);
    const chain: Element[] = [];
    for (let p = selected?.parentElement; p && body && p !== body; p = p.parentElement) chain.push(p);
    if (chain.some((c) => !open.has(c))) setOpen(new Set([...open, ...chain]));
  }

  // Read from the live DOM on every render; rows are keyed by the tree revision so they follow
  // elements that were added, removed or moved.
  const top = body ? childrenOf(body) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <h2 className="text-xs font-medium">Layers</h2>
        {open.size > 0 && (
          <button type="button" onClick={() => setOpen(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
            Collapse all
          </button>
        )}
      </div>
      <div role="tree" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" onPointerLeave={() => ed.hover(null)}>
        {!ed.ready ? <p className="p-2 text-xs text-muted-foreground">Opening the page…</p> : top.map((el, i) => <Row key={`${ed.treeRev}-${i}`} ed={ed} el={el} depth={0} open={open} toggle={toggle} />)}
      </div>
    </div>
  );
}
