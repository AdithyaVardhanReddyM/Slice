"use client";

// The infinite canvas. Board units map to the screen as screen = board × zoom +
// offset. Trackpad scroll pans, pinch or ⌘/Ctrl + scroll zooms around the
// pointer, Space-drag, the middle button or the hand tool pans; with the select
// tool, dragging empty space draws a selection box and dragging a node moves
// the selection (committed on release).
// Shapes: the frame and arrow tools draw with a drag (an arrow started or
// ended on something is pinned to it and follows it), text and sticky notes
// are placed with a click. A frame carries what sits in it when it moves; on a
// frame not yet selected a drag draws a selection box instead (a click, or its
// name, takes the frame). Frames and notes resize from their handles, an
// arrow's ends drag elsewhere.
// Node content lives in the scaled world; names, outlines, handles and the
// toolbar are drawn in screen space so they stay crisp at any zoom.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { bounds, contentsOf, labelled, layerOf, layoutArrows, pinnable, type BoardNode, type NodeKey } from "./model";
import { ARROW_STROKE, arrowHead, arrowLine, contains, lineHits, type Box, type DrawTool, type End } from "./shapes";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardHandle {
  fit(keys?: NodeKey[], opts?: { maxZoom?: number; animate?: boolean }): void;
  /** Fit a box in board units (for things placed but not drawn yet). */
  fitBox(box: { x: number; y: number; w: number; h: number }, opts?: { maxZoom?: number; animate?: boolean }): void;
  zoomBy(factor: number): void;
  zoomTo(zoom: number): void;
  /** Board point under a screen point (drops). */
  toBoard(clientX: number, clientY: number): { x: number; y: number };
  /** The board point at the centre of the view. */
  center(): { x: number; y: number };
  viewport(): Viewport;
}

export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const DRAG_SLOP = 3;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLE_CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

type Gesture =
  | { kind: "pan"; x0: number; y0: number; vx: number; vy: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; base: NodeKey[] }
  | { kind: "move"; x0: number; y0: number; keys: NodeKey[]; moved: boolean }
  /** A press on a frame not yet selected: a click selects it, a drag draws a selection box. */
  | { kind: "frame"; x0: number; y0: number; key: NodeKey }
  | { kind: "draw"; tool: "frame" | "arrow"; x0: number; y0: number; x1: number; y1: number; from: End; target?: NodeKey }
  | { kind: "resize"; key: NodeKey; handle: Handle; x0: number; y0: number; box: Box; now: Box }
  | { kind: "end"; key: NodeKey; which: "from" | "to"; at: End; moved: boolean };

/** Something drawn with a drawing tool, in board units (`click`: a press without a drag). */
export interface Drawn {
  tool: DrawTool;
  from: End;
  to: End;
  click: boolean;
}

export interface BoardProps {
  nodes: BoardNode[];
  selected: NodeKey[];
  onSelect: (keys: NodeKey[]) => void;
  onOpen: (node: BoardNode) => void;
  /** Positions after a move, in board units. */
  onMove: (moves: { node: BoardNode; x: number; y: number }[]) => void;
  /** Something dropped on empty canvas (library item or files). */
  onDrop?: (e: DragEvent, at: { x: number; y: number }) => void;
  onViewport?: (v: Viewport) => void;
  initial?: Viewport | null;
  /** "hand": a plain drag pans, wherever it starts; the drawing tools draw. */
  tool?: "select" | "hand" | DrawTool;
  onDraw?: (d: Drawn) => void;
  /** A frame or note resized from its handles. */
  onResize?: (node: BoardNode, box: Box) => void;
  /** An arrow's end dragged somewhere else (onto something pins it there). */
  onArrowEnd?: (node: BoardNode, which: "from" | "to", end: End) => void;
  /** A frame's new name (null: left as it was). */
  onRename?: (node: BoardNode, name: string | null) => void;
  /** The shape being typed in: no handles, and a frame's name becomes a field. */
  editing?: NodeKey | null;
  /** Leave this much room on the left (the sidebar) and bottom (the prompt bar) when fitting. */
  inset?: { left: number; bottom: number; top: number };
  /** Node content, drawn in board units. */
  renderNode: (node: BoardNode, ctx: { zoom: number; selected: boolean; hovered: boolean }) => ReactNode;
  /** Drawn in screen space above the selection (the node toolbar). */
  overlay?: (ctx: { rect: { x: number; y: number; w: number; h: number } | null; zoom: number; dragging: boolean }) => ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Board = forwardRef<BoardHandle, BoardProps>(function Board({ nodes, selected, onSelect, onOpen, onMove, onDrop, onViewport, initial, tool = "select", onDraw, onResize, onArrowEnd, onRename, editing, inset = { left: 0, bottom: 0, top: 0 }, renderNode, overlay, children, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<Viewport>(initial ?? { x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<NodeKey | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [drag, setDragState] = useState<{ keys: Set<NodeKey>; dx: number; dy: number } | null>(null);
  // The release reads the latest move, which may not have rendered yet.
  const dragRef = useRef(drag);
  const setDrag = (d: typeof drag) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [space, setSpace] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fitted = useRef(!!initial);
  // Double-clicks are read from pointer-downs: capture retargets the browser's dblclick to the board.
  const lastDown = useRef<{ key: string; at: number } | null>(null);
  // A press that opened a field to type in: its mousedown must not take the focus back to the page.
  const keepFocus = useRef(false);

  const apply = useCallback(
    (v: Viewport, smooth = false) => {
      viewRef.current = v;
      setAnimate(smooth);
      setView(v);
      onViewport?.(v);
    },
    [onViewport],
  );

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitBox = useCallback(
    (b: { x: number; y: number; w: number; h: number } | null, opts: { maxZoom?: number; animate?: boolean } = {}) => {
      const W = size.w - inset.left;
      const H = size.h - inset.bottom - inset.top;
      if (!W || !H) return;
      if (!b) {
        apply({ x: inset.left + W / 2 - 200, y: inset.top + H / 2 - 160, zoom: 1 }, opts.animate);
        return;
      }
      const pad = 72;
      const zoom = clampZoom(Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h), opts.maxZoom ?? 1));
      apply({ x: inset.left + (W - b.w * zoom) / 2 - b.x * zoom, y: inset.top + (H - b.h * zoom) / 2 - b.y * zoom, zoom }, opts.animate ?? true);
    },
    [size, inset.left, inset.bottom, inset.top, apply],
  );

  const fit = useCallback(
    (keys?: NodeKey[], opts: { maxZoom?: number; animate?: boolean } = {}) => fitBox(bounds(keys?.length ? nodes.filter((n) => keys.includes(n.key)) : nodes), opts),
    [nodes, fitBox],
  );

  // First look: fit everything once the box has a size.
  useEffect(() => {
    if (fitted.current || !size.w) return;
    fitted.current = true;
    fit(undefined, { animate: false });
  }, [size.w, fit]);

  const zoomAround = useCallback(
    (factor: number, cx: number, cy: number, smooth = false) => {
      const v = viewRef.current;
      const zoom = clampZoom(v.zoom * factor);
      const k = zoom / v.zoom;
      apply({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, smooth);
    },
    [apply],
  );

  useImperativeHandle(
    ref,
    () => ({
      fit,
      fitBox,
      zoomBy: (f) => zoomAround(f, inset.left + (size.w - inset.left) / 2, size.h / 2, true),
      zoomTo: (z) => zoomAround(z / viewRef.current.zoom, inset.left + (size.w - inset.left) / 2, size.h / 2, true),
      toBoard: (cx, cy) => {
        const r = box.current!.getBoundingClientRect();
        const v = viewRef.current;
        return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
      },
      center: () => {
        const v = viewRef.current;
        return { x: (inset.left + (size.w - inset.left) / 2 - v.x) / v.zoom, y: (size.h / 2 - v.y) / v.zoom };
      },
      viewport: () => viewRef.current,
    }),
    [fit, fitBox, zoomAround, size, inset.left],
  );

  // Wheel: pan, or zoom with pinch / ⌘. Non-passive so the page itself never zooms.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-board-scroll]")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAround(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0085)), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = viewRef.current;
        apply({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply, zoomAround]);

  // Space held: the hand.
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target) && !e.repeat) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (p: { x: number; y: number }) => {
    const v = viewRef.current;
    return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
  };

  const startGesture = (g: Gesture | null) => {
    gestureRef.current = g;
    setGesture(g);
  };

  // Where everything is drawn right now: mid-drag, mid-resize, an arrow's end on its way, pinned ends following their nodes.
  const shown = (n: BoardNode): BoardNode => {
    if (gesture?.kind === "resize" && gesture.key === n.key) return { ...n, ...gesture.now };
    if (gesture?.kind === "end" && gesture.key === n.key && n.shape) return { ...n, shape: { ...n.shape, [gesture.which]: gesture.at } };
    if (!drag?.keys.has(n.key)) return n;
    if (n.kind === "arrow" && n.shape?.from && n.shape.to) {
      const shift = (e: End) => (e.node ? e : { ...e, x: e.x + drag.dx, y: e.y + drag.dy });
      return { ...n, shape: { ...n.shape, from: shift(n.shape.from), to: shift(n.shape.to) } };
    }
    return { ...n, x: n.x + drag.dx, y: n.y + drag.dy };
  };
  const laid = layoutArrows(nodes.map(shown));
  // Frames under what is made, notes and text over it, arrows on top.
  const ordered = [...laid].sort((a, b) => layerOf(a) - layerOf(b));

  /** The topmost thing an arrow's end can pin to at a board point. */
  const pinAt = (p: { x: number; y: number }, except?: NodeKey) => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const n = ordered[i];
      if (n.key !== except && pinnable(n) && contains(n, p)) return n;
    }
    return undefined;
  };

  /** What moves when these move: a frame takes what sits in it. */
  const withContents = (keys: NodeKey[]) => {
    const out = new Set(keys);
    for (const n of laid) if (n.kind === "frame" && out.has(n.key)) for (const c of contentsOf(n, laid)) out.add(c.key);
    return [...out];
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    keepFocus.current = false;
    if ((e.target as HTMLElement).closest("[data-board-ui]")) return;
    const p = local(e);
    const at = toWorld(p);
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    const handleEl = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    e.currentTarget.setPointerCapture(e.pointerId);
    const hand = space || tool === "hand";
    if (e.button === 1 || (e.button === 0 && (hand || (e.altKey && !nodeEl)))) {
      e.preventDefault();
      const v = viewRef.current;
      startGesture({ kind: "pan", x0: p.x, y0: p.y, vx: v.x, vy: v.y });
      return;
    }
    if (e.button !== 0) return;
    if (handleEl) {
      const key = handleEl.dataset.key!;
      const n = laid.find((x) => x.key === key);
      const h = handleEl.dataset.handle as Handle | "from" | "to";
      if (!n) return;
      if (h === "from" || h === "to") startGesture({ kind: "end", key, which: h, at: n.shape?.[h] ?? at, moved: false });
      else startGesture({ kind: "resize", key, handle: h, x0: p.x, y0: p.y, box: { x: n.x, y: n.y, w: n.w, h: n.h }, now: { x: n.x, y: n.y, w: n.w, h: n.h } });
      return;
    }
    const under = nodeEl ? laid.find((x) => x.key === nodeEl.dataset.node) : undefined;
    if (tool !== "select" && tool !== "hand") {
      // The text tool on a text, or the note tool on a note: type in it.
      if (tool === "text" || tool === "sticky") {
        keepFocus.current = true;
        if (under?.kind === tool) onOpen(under);
        else onDraw?.({ tool, from: at, to: at, click: true });
      } else {
        const pin = tool === "arrow" ? pinAt(at) : undefined;
        startGesture({ kind: "draw", tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y, from: { ...at, node: pin?.key } });
      }
      return;
    }
    if (!under) {
      const base = e.shiftKey || e.metaKey ? selected : [];
      if (!base.length) onSelect([]);
      startGesture({ kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, base });
      return;
    }
    const key = under.key;
    const now = e.timeStamp;
    if (lastDown.current?.key === key && now - lastDown.current.at < 380 && !e.shiftKey && !e.metaKey) {
      lastDown.current = null;
      keepFocus.current = !!under.shape;
      onOpen(under);
      return;
    }
    lastDown.current = { key, at: now };
    if (under.kind === "frame" && nodeEl?.dataset.label === undefined && !selected.includes(key) && !e.shiftKey && !e.metaKey) {
      startGesture({ kind: "frame", x0: p.x, y0: p.y, key });
      return;
    }
    let keys = selected;
    if (e.shiftKey || e.metaKey) keys = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    else if (!selected.includes(key)) keys = [key];
    onSelect(keys);
    if (keys.includes(key)) startGesture({ kind: "move", x0: p.x, y0: p.y, keys: withContents(keys), moved: false });
  };

  const marqueeTo = (g: Extract<Gesture, { kind: "marquee" }>, p: { x: number; y: number }) => {
    startGesture({ ...g, x1: p.x, y1: p.y });
    if (Math.abs(p.x - g.x0) + Math.abs(p.y - g.y0) < DRAG_SLOP) return;
    const a = toWorld({ x: Math.min(g.x0, p.x), y: Math.min(g.y0, p.y) });
    const b = toWorld({ x: Math.max(g.x0, p.x), y: Math.max(g.y0, p.y) });
    const area = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    // A frame only when the box takes all of it (a box drawn inside one picks what is in it); an arrow when it crosses the box.
    const hit = laid
      .filter((n) => (n.kind === "frame" ? n.x >= a.x && n.x + n.w <= b.x && n.y >= a.y && n.y + n.h <= b.y : n.line ? lineHits(n.line, area) : n.x < b.x && n.x + n.w > a.x && n.y < b.y && n.y + n.h > a.y))
      .map((n) => n.key);
    onSelect([...new Set([...g.base, ...hit])]);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = local(e);
    if (g.kind === "pan") {
      apply({ ...viewRef.current, x: g.vx + (p.x - g.x0), y: g.vy + (p.y - g.y0) });
      return;
    }
    if (g.kind === "frame") {
      if (Math.hypot(p.x - g.x0, p.y - g.y0) < DRAG_SLOP) return;
      onSelect([]);
      marqueeTo({ kind: "marquee", x0: g.x0, y0: g.y0, x1: g.x0, y1: g.y0, base: [] }, p);
      return;
    }
    if (g.kind === "marquee") {
      marqueeTo(g, p);
      return;
    }
    if (g.kind === "draw") {
      const pin = g.tool === "arrow" ? pinAt(toWorld(p), g.from.node) : undefined;
      startGesture({ ...g, x1: p.x, y1: p.y, target: pin?.key });
      return;
    }
    if (g.kind === "end") {
      const at = toWorld(p);
      const n = laid.find((x) => x.key === g.key);
      const other = n?.shape?.[g.which === "from" ? "to" : "from"]?.node;
      startGesture({ ...g, at: { ...at, node: pinAt(at, other)?.key }, moved: true });
      return;
    }
    if (g.kind === "resize") {
      const z = viewRef.current.zoom;
      const dx = (p.x - g.x0) / z;
      const dy = (p.y - g.y0) / z;
      const min = laid.find((x) => x.key === g.key)?.kind === "sticky" ? 100 : 80;
      const b = g.box;
      let { x, y, w, h } = b;
      if (g.handle.includes("e")) w = Math.max(min, b.w + dx);
      if (g.handle.includes("w")) {
        w = Math.max(min, b.w - dx);
        x = b.x + b.w - w;
      }
      if (g.handle.includes("s")) h = Math.max(min, b.h + dy);
      if (g.handle.includes("n")) {
        h = Math.max(min, b.h - dy);
        y = b.y + b.h - h;
      }
      startGesture({ ...g, now: { x, y, w, h } });
      return;
    }
    const dx = (p.x - g.x0) / viewRef.current.zoom;
    const dy = (p.y - g.y0) / viewRef.current.zoom;
    if (!g.moved && Math.hypot(p.x - g.x0, p.y - g.y0) < DRAG_SLOP) return;
    if (!g.moved) gestureRef.current = { ...g, moved: true };
    setDrag({ keys: new Set(g.keys), dx, dy });
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    const d = dragRef.current;
    startGesture(null);
    if (g?.kind === "move" && d) {
      const moves = nodes.filter((n) => d.keys.has(n.key)).map((node) => ({ node, x: Math.round(node.x + d.dx), y: Math.round(node.y + d.dy) }));
      if (moves.length && (d.dx || d.dy)) onMove(moves);
    }
    if (g?.kind === "frame") onSelect([g.key]);
    if (g?.kind === "draw") {
      const click = Math.hypot(g.x1 - g.x0, g.y1 - g.y0) < DRAG_SLOP * 2;
      onDraw?.({ tool: g.tool, from: g.from, to: click ? g.from : { ...toWorld({ x: g.x1, y: g.y1 }), node: g.target }, click });
    }
    if (g?.kind === "resize") {
      const n = nodes.find((x) => x.key === g.key);
      const b = g.box;
      if (n && (g.now.x !== b.x || g.now.y !== b.y || g.now.w !== b.w || g.now.h !== b.h)) onResize?.(n, g.now);
    }
    if (g?.kind === "end" && g.moved) {
      const n = nodes.find((x) => x.key === g.key);
      if (n) onArrowEnd?.(n, g.which, g.at);
    }
    setDrag(null);
  };

  const v = view;
  const sel = laid.filter((n) => selected.includes(n.key));
  const selRect = bounds(sel.map((n) => ({ ...n, y: n.y + 34, h: n.h - 34 })));
  const screenRect = selRect ? { x: selRect.x * v.zoom + v.x, y: (selRect.y + 34) * v.zoom + v.y, w: selRect.w * v.zoom, h: (selRect.h - 34) * v.zoom } : null;
  // Dots every 24 board px; sparser when far out so the grid never turns to noise.
  const step = 24 * (v.zoom < 0.35 ? 4 : v.zoom < 0.7 ? 2 : 1) * v.zoom;
  const marquee = gesture?.kind === "marquee" && Math.abs(gesture.x1 - gesture.x0) + Math.abs(gesture.y1 - gesture.y0) >= DRAG_SLOP ? gesture : null;
  const toScreen = (l: { x1: number; y1: number; x2: number; y2: number }) => ({ x1: l.x1 * v.zoom + v.x, y1: l.y1 * v.zoom + v.y, x2: l.x2 * v.zoom + v.x, y2: l.y2 * v.zoom + v.y });
  // The one shape whose handles show (frames and notes resize, an arrow's ends move).
  const handled = sel.length === 1 && !drag && !gesture && tool === "select" && editing !== sel[0].key && ["frame", "sticky", "arrow"].includes(sel[0].kind) ? sel[0] : null;
  // A frame or an arrow being drawn, and what an arrow's ends are pinned to.
  const draft = gesture?.kind === "draw" && Math.hypot(gesture.x1 - gesture.x0, gesture.y1 - gesture.y0) >= DRAG_SLOP ? gesture : null;
  const byKey = new Map(laid.map((n) => [n.key, n]));
  const draftLine = draft?.tool === "arrow" ? toScreen(arrowLine(draft.from, { x: (draft.x1 - v.x) / v.zoom, y: (draft.y1 - v.y) / v.zoom, node: draft.target }, (k) => byKey.get(k))) : null;
  const pinned = [draft?.from.node, draft?.target, gesture?.kind === "end" ? gesture.at.node : undefined].flatMap((k) => (k && byKey.get(k) ? [byKey.get(k)!] : []));

  return (
    <div
      ref={box}
      className={cn(
        "relative size-full touch-none overflow-hidden bg-[#f6f5f3] select-none",
        (space || tool === "hand") && "cursor-grab",
        !space && (tool === "frame" || tool === "arrow" || tool === "sticky") && "cursor-crosshair",
        !space && tool === "text" && "cursor-text",
        gesture?.kind === "pan" && "cursor-grabbing",
        className,
      )}
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.13) 1px, transparent 0)",
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => {
        if (!keepFocus.current) return;
        keepFocus.current = false;
        e.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => {
        if (!onDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (!onDrop) return;
        e.preventDefault();
        const p = local(e);
        onDrop(e.nativeEvent, { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });
      }}
    >
      <div className={cn("absolute top-0 left-0 origin-top-left", animate && "transition-transform duration-300 ease-out")} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` }} onTransitionEnd={() => setAnimate(false)}>
        {ordered.map((n) => {
          const isSel = selected.includes(n.key);
          return (
            <div
              key={n.key}
              data-node={n.key}
              onPointerEnter={() => setHover(n.key)}
              onPointerLeave={() => setHover((h) => (h === n.key ? null : h))}
              // An arrow is hit on its line only, not across its box.
              className={cn("absolute", n.kind === "arrow" && "pointer-events-none", drag?.keys.has(n.key) && n.kind !== "frame" && "z-10 opacity-95")}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
            >
              {renderNode(n, { zoom: v.zoom, selected: isSel, hovered: hover === n.key })}
            </div>
          );
        })}
      </div>

      {/* Names above nodes, outlines, handles, in screen space. */}
      <div className="pointer-events-none absolute inset-0">
        {ordered.map((n) => {
          const left = n.x * v.zoom + v.x;
          const top = n.y * v.zoom + v.y;
          const w = n.w * v.zoom;
          const h = n.h * v.zoom;
          if (left > size.w + 40 || top > size.h + 40 || left + w < -40 || top + h < -40) return null;
          const isSel = selected.includes(n.key);
          const frame = n.kind === "frame";
          return (
            <div key={n.key}>
              {frame && editing === n.key && onRename ? (
                <FrameName node={n} style={{ left, top: top - 22, maxWidth: Math.max(120, w) }} onDone={(name) => onRename(n, name)} />
              ) : (
                labelled(n) &&
                w > 64 && (
                  // A frame's name takes the frame: click to select, drag to move it, double-click to rename.
                  <div data-node={frame ? n.key : undefined} data-label={frame ? "" : undefined} className={cn("absolute flex items-center gap-1.5 text-[11px] leading-none", frame && "pointer-events-auto -my-1 py-1")} style={{ left, top: top - 18, width: frame ? undefined : w, maxWidth: w }}>
                    <span className={cn("min-w-0 shrink-0 truncate font-medium", isSel ? "text-blue-600" : frame ? "text-neutral-500" : "text-neutral-700")} style={{ maxWidth: w > 170 && !frame ? "68%" : "100%" }}>
                      {n.name}
                    </span>
                    {w > 170 && n.meta && <span className="min-w-0 truncate text-neutral-400">{n.meta}</span>}
                  </div>
                )
              )}
              {n.kind !== "arrow" && (isSel || (hover === n.key && tool === "select" && !space)) && <div className={cn("absolute rounded-[3px]", isSel ? "ring-2 ring-blue-500" : "ring-1 ring-blue-400/70")} style={{ left, top, width: w, height: h }} />}
            </div>
          );
        })}
        {/* What an arrow being drawn, or an end being dragged, will pin to. */}
        {pinned.map((n) => (
          <div key={`pin-${n.key}`} className="absolute rounded-[4px] ring-2 ring-blue-500/80 ring-offset-2 ring-offset-transparent" style={{ left: n.x * v.zoom + v.x, top: n.y * v.zoom + v.y, width: n.w * v.zoom, height: n.h * v.zoom }} />
        ))}
        {handled && handled.line && (
          <>
            {(["from", "to"] as const).map((end) => (
              <div
                key={end}
                data-handle={end}
                data-key={handled.key}
                title={end === "from" ? "Drag to move the start (onto something to pin it)" : "Drag to move the end (onto something to pin it)"}
                className={cn("pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-blue-500 bg-white shadow-sm", handled.shape?.[end]?.node && "bg-blue-500")}
                style={end === "from" ? { left: handled.line!.x1 * v.zoom + v.x, top: handled.line!.y1 * v.zoom + v.y } : { left: handled.line!.x2 * v.zoom + v.x, top: handled.line!.y2 * v.zoom + v.y }}
              />
            ))}
          </>
        )}
        {handled &&
          !handled.line &&
          (handled.kind === "sticky" ? (["nw", "ne", "se", "sw"] as Handle[]) : (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[])).map((hd) => {
            const left = handled.x * v.zoom + v.x + (hd.includes("e") ? handled.w * v.zoom : hd.includes("w") ? 0 : (handled.w * v.zoom) / 2);
            const top = handled.y * v.zoom + v.y + (hd.includes("s") ? handled.h * v.zoom : hd.includes("n") ? 0 : (handled.h * v.zoom) / 2);
            return <div key={hd} data-handle={hd} data-key={handled.key} className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-[1.5px] border-blue-500 bg-white shadow-sm" style={{ left, top, cursor: HANDLE_CURSOR[hd] }} />;
          })}
        {draft?.tool === "frame" && (
          <div className="absolute rounded-[3px] bg-blue-500/[0.04] ring-1 ring-blue-500" style={{ left: Math.min(draft.x0, draft.x1), top: Math.min(draft.y0, draft.y1), width: Math.abs(draft.x1 - draft.x0), height: Math.abs(draft.y1 - draft.y0) }}>
            <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap text-white tabular-nums">
              {Math.round(Math.abs(draft.x1 - draft.x0) / v.zoom)} × {Math.round(Math.abs(draft.y1 - draft.y0) / v.zoom)}
            </span>
          </div>
        )}
        {draftLine && (
          <svg className="absolute inset-0 size-full overflow-visible">
            <path d={`M${draftLine.x1},${draftLine.y1} L${draftLine.x2},${draftLine.y2}`} stroke="#1f1f1f" strokeWidth={ARROW_STROKE * v.zoom} strokeLinecap="round" fill="none" />
            <path d={arrowHead(draftLine, (14 + ARROW_STROKE * 2) * v.zoom)} stroke="#1f1f1f" strokeWidth={ARROW_STROKE * v.zoom} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
        {marquee && (
          <div
            className="absolute rounded-[2px] bg-blue-500/[0.06] ring-1 ring-blue-500/70"
            style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
          />
        )}
      </div>

      {dropping && <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-blue-500/50 bg-blue-500/[0.03]" />}

      <div data-board-ui className="contents">
        {overlay?.({ rect: screenRect, zoom: v.zoom, dragging: !!drag || gesture?.kind === "marquee" || gesture?.kind === "resize" || gesture?.kind === "end" })}
        {children}
      </div>
    </div>
  );
});

/** A frame's name, typed over where it shows. */
function FrameName({ node, style, onDone }: { node: BoardNode; style: CSSProperties; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(node.shape?.text ?? node.name);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      data-board-ui
      autoFocus
      value={value}
      aria-label="Frame name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        else if (e.key === "Escape") finish(null);
      }}
      className="pointer-events-auto absolute h-5 w-48 rounded-[3px] bg-white px-1 text-[11px] font-medium text-neutral-900 shadow-sm ring-1 ring-blue-500 outline-none"
      style={style}
    />
  );
}
