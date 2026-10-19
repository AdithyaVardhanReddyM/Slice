"use client";

// The infinite canvas. Board units map to the screen as screen = board × zoom +
// offset. Trackpad scroll pans, pinch or ⌘/Ctrl + scroll zooms around the
// pointer, Space-drag or the middle button pans, dragging empty space draws a
// selection box, dragging a node moves the selection (committed on release).
// Node content lives in the scaled world; names, outlines and the toolbar are
// drawn in screen space so they stay crisp at any zoom.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { bounds, type BoardNode, type NodeKey } from "./model";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardHandle {
  fit(keys?: NodeKey[], opts?: { maxZoom?: number; animate?: boolean }): void;
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

type Gesture =
  | { kind: "pan"; x0: number; y0: number; vx: number; vy: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; base: NodeKey[] }
  | { kind: "move"; x0: number; y0: number; keys: NodeKey[]; moved: boolean };

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
  /** Leave this much room on the left (the sidebar) and bottom (the prompt bar) when fitting. */
  inset?: { left: number; bottom: number; top: number };
  /** Node content, drawn in board units. */
  renderNode: (node: BoardNode, ctx: { zoom: number; selected: boolean; hovered: boolean }) => ReactNode;
  /** Drawn in screen space above the selection (the node toolbar). */
  overlay?: (ctx: { rect: { x: number; y: number; w: number; h: number } | null; zoom: number; dragging: boolean }) => ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Board = forwardRef<BoardHandle, BoardProps>(function Board({ nodes, selected, onSelect, onOpen, onMove, onDrop, onViewport, initial, inset = { left: 0, bottom: 0, top: 0 }, renderNode, overlay, children, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<Viewport>(initial ?? { x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<NodeKey | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<{ keys: Set<NodeKey>; dx: number; dy: number } | null>(null);
  const [space, setSpace] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fitted = useRef(!!initial);
  // Double-clicks are read from pointer-downs: capture retargets the browser's dblclick to the board.
  const lastDown = useRef<{ key: string; at: number } | null>(null);

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

  const fit = useCallback(
    (keys?: NodeKey[], opts: { maxZoom?: number; animate?: boolean } = {}) => {
      const list = keys?.length ? nodes.filter((n) => keys.includes(n.key)) : nodes;
      const b = bounds(list);
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
    [nodes, size, inset.left, inset.bottom, inset.top, apply],
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
    [fit, zoomAround, size, inset.left],
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

  const startGesture = (g: Gesture | null) => {
    gestureRef.current = g;
    setGesture(g);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-board-ui]")) return;
    const p = local(e);
    const nodeEl = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || space || (e.button === 0 && e.altKey && !nodeEl)) {
      e.preventDefault();
      const v = viewRef.current;
      startGesture({ kind: "pan", x0: p.x, y0: p.y, vx: v.x, vy: v.y });
      return;
    }
    if (e.button !== 0) return;
    if (!nodeEl) {
      const base = e.shiftKey || e.metaKey ? selected : [];
      if (!base.length) onSelect([]);
      startGesture({ kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, base });
      return;
    }
    const key = nodeEl.dataset.node!;
    const now = performance.now();
    if (lastDown.current?.key === key && now - lastDown.current.at < 380 && !e.shiftKey && !e.metaKey) {
      lastDown.current = null;
      const n = nodes.find((x) => x.key === key);
      if (n) onOpen(n);
      return;
    }
    lastDown.current = { key, at: now };
    let keys = selected;
    if (e.shiftKey || e.metaKey) keys = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    else if (!selected.includes(key)) keys = [key];
    onSelect(keys);
    if (keys.includes(key)) startGesture({ kind: "move", x0: p.x, y0: p.y, keys, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const p = local(e);
    if (g.kind === "pan") {
      apply({ ...viewRef.current, x: g.vx + (p.x - g.x0), y: g.vy + (p.y - g.y0) });
      return;
    }
    if (g.kind === "marquee") {
      const next = { ...g, x1: p.x, y1: p.y };
      startGesture(next);
      const v = viewRef.current;
      const a = { x: (Math.min(g.x0, p.x) - v.x) / v.zoom, y: (Math.min(g.y0, p.y) - v.y) / v.zoom, r: (Math.max(g.x0, p.x) - v.x) / v.zoom, b: (Math.max(g.y0, p.y) - v.y) / v.zoom };
      if (Math.abs(p.x - g.x0) + Math.abs(p.y - g.y0) < DRAG_SLOP) return;
      const hit = nodes.filter((n) => n.x < a.r && n.x + n.w > a.x && n.y < a.b && n.y + n.h > a.y).map((n) => n.key);
      onSelect([...new Set([...g.base, ...hit])]);
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
    startGesture(null);
    if (g?.kind === "move" && drag) {
      const moves = nodes.filter((n) => drag.keys.has(n.key)).map((node) => ({ node, x: Math.round(node.x + drag.dx), y: Math.round(node.y + drag.dy) }));
      if (moves.length && (drag.dx || drag.dy)) onMove(moves);
    }
    setDrag(null);
  };

  const v = view;
  const shown = (n: BoardNode) => (drag?.keys.has(n.key) ? { ...n, x: n.x + drag.dx, y: n.y + drag.dy } : n);
  const sel = nodes.filter((n) => selected.includes(n.key)).map(shown);
  const selRect = bounds(sel.map((n) => ({ ...n, y: n.y + 34, h: n.h - 34 })));
  const screenRect = selRect ? { x: selRect.x * v.zoom + v.x, y: (selRect.y + 34) * v.zoom + v.y, w: selRect.w * v.zoom, h: (selRect.h - 34) * v.zoom } : null;
  // Dots every 24 board px; sparser when far out so the grid never turns to noise.
  const step = 24 * (v.zoom < 0.35 ? 4 : v.zoom < 0.7 ? 2 : 1) * v.zoom;
  const marquee = gesture?.kind === "marquee" && Math.abs(gesture.x1 - gesture.x0) + Math.abs(gesture.y1 - gesture.y0) >= DRAG_SLOP ? gesture : null;

  return (
    <div
      ref={box}
      className={cn("relative size-full touch-none overflow-hidden bg-[#f6f5f3] select-none", space || gesture?.kind === "pan" ? "cursor-grab" : "", gesture?.kind === "pan" && "cursor-grabbing", className)}
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.13) 1px, transparent 0)",
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${v.x}px ${v.y}px`,
      }}
      onPointerDown={onPointerDown}
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
        {nodes.map((n0) => {
          const n = shown(n0);
          const isSel = selected.includes(n.key);
          return (
            <div
              key={n.key}
              data-node={n.key}
              onPointerEnter={() => setHover(n.key)}
              onPointerLeave={() => setHover((h) => (h === n.key ? null : h))}
              className={cn("absolute", drag?.keys.has(n.key) && "z-10 opacity-95")}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
            >
              {renderNode(n, { zoom: v.zoom, selected: isSel, hovered: hover === n.key })}
            </div>
          );
        })}
      </div>

      {/* Names above nodes, outlines, in screen space. */}
      <div className="pointer-events-none absolute inset-0">
        {nodes.map((n0) => {
          const n = shown(n0);
          const left = n.x * v.zoom + v.x;
          const top = n.y * v.zoom + v.y;
          const w = n.w * v.zoom;
          const h = n.h * v.zoom;
          if (left > size.w + 40 || top > size.h + 40 || left + w < -40 || top + h < -40) return null;
          const isSel = selected.includes(n.key);
          return (
            <div key={n.key}>
              {w > 64 && (
                <div className="absolute flex items-center gap-1.5 text-[11px] leading-none" style={{ left, top: top - 18, width: w }}>
                  <span className={cn("min-w-0 shrink-0 truncate font-medium", isSel ? "text-blue-600" : "text-neutral-700")} style={{ maxWidth: w > 170 ? "68%" : "100%" }}>
                    {n.name}
                  </span>
                  {w > 170 && <span className="min-w-0 truncate text-neutral-400">{n.meta}</span>}
                </div>
              )}
              {(isSel || hover === n.key) && <div className={cn("absolute rounded-[3px]", isSel ? "ring-2 ring-blue-500" : "ring-1 ring-blue-400/70")} style={{ left, top, width: w, height: h }} />}
            </div>
          );
        })}
        {marquee && (
          <div
            className="absolute rounded-[2px] bg-blue-500/[0.06] ring-1 ring-blue-500/70"
            style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
          />
        )}
      </div>

      {dropping && <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-blue-500/50 bg-blue-500/[0.03]" />}

      <div data-board-ui className="contents">
        {overlay?.({ rect: screenRect, zoom: v.zoom, dragging: !!drag || gesture?.kind === "marquee" })}
        {children}
      </div>
    </div>
  );
});
