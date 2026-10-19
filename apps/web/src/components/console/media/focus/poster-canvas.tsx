"use client";

// The design surface of the focus editors: the creative drawn by the shared
// Stage (exactly as it exports) at a zoom the editor controls, with an
// editing layer on top. Click selects (Shift adds), dragging empty space draws
// a selection box, dragging moves with snapping to the frame and the other
// layers, the handles resize (corners keep text in proportion; Shift keeps
// any shape), the round handle rotates (Shift snaps to 15°), double-click
// edits text in place, and pictures dropped from the sidebar become layers.

import { useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { docDuration, fontStack, layerVisibleAt, newId, type Layer, type MediaDoc, type MediaKit, type TextLayer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Stage } from "../stage";
import { MEDIA_DRAG, type DragItem } from "../sidebar/assets";
import type { CreativeDoc } from "./use-doc";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

interface Guide {
  axis: "x" | "y";
  at: number;
}

type Drag =
  | { kind: "move"; x0: number; y0: number; start: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: "resize"; x0: number; y0: number; id: string; handle: Handle; box: { x: number; y: number; w: number; h: number }; size?: number; moved: boolean }
  | { kind: "rotate"; id: string; cx: number; cy: number; moved: boolean }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; base: string[] };

export function visibleLayers(doc: MediaDoc, t: number) {
  const duration = docDuration(doc);
  return doc.layers.filter((l) => (doc.kind === "video" ? layerVisibleAt(l, t, duration) : !l.hidden));
}

export function PosterCanvas({
  doc,
  kit,
  scale,
  time = 0,
  playing = false,
  muted = false,
  selected,
  onSelect,
  editor,
  className,
}: {
  doc: MediaDoc;
  kit: MediaKit | undefined;
  /** Screen px per doc px. */
  scale: number;
  time?: number;
  playing?: boolean;
  muted?: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  editor: Pick<CreativeDoc, "update" | "checkpoint">;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Extract<Drag, { kind: "marquee" }> | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const shown = visibleLayers(doc, time);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  /** The top layer under a point, rotation included. */
  const hit = (p: { x: number; y: number }) =>
    [...shown].reverse().find((l) => {
      if (l.locked) return false;
      const cx = l.x + l.w / 2;
      const cy = l.y + l.h / 2;
      const a = (-(l.rotation ?? 0) * Math.PI) / 180;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      return Math.abs(lx) <= l.w / 2 && Math.abs(ly) <= l.h / 2;
    });

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || editing) return;
    const p = point(e);
    const l = hit(p);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!l) {
      const base = e.shiftKey ? selected : [];
      if (!base.length) onSelect([]);
      drag.current = { kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, base };
      return;
    }
    let ids = selected;
    if (e.shiftKey) ids = selected.includes(l.id) ? selected.filter((x) => x !== l.id) : [...selected, l.id];
    else if (!selected.includes(l.id)) ids = [l.id];
    onSelect(ids);
    const start = new Map(doc.layers.filter((x) => ids.includes(x.id) && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }]));
    if (start.size) drag.current = { kind: "move", x0: p.x, y0: p.y, start, moved: false };
  };

  const snap = (ids: Set<string>, rect: { x: number; y: number; w: number; h: number }) => {
    const threshold = 6 / scale;
    const others = shown.filter((l) => !ids.has(l.id));
    const xs = [0, doc.w / 2, doc.w, ...others.flatMap((l) => [l.x, l.x + l.w / 2, l.x + l.w])];
    const ys = [0, doc.h / 2, doc.h, ...others.flatMap((l) => [l.y, l.y + l.h / 2, l.y + l.h])];
    const best = (edges: number[], lines: number[]) => {
      let d = Infinity;
      let line = 0;
      for (const ed of edges)
        for (const c of lines)
          if (Math.abs(c - ed) < Math.abs(d)) {
            d = c - ed;
            line = c;
          }
      return Math.abs(d) <= threshold ? { d, line } : null;
    };
    const sx = best([rect.x, rect.x + rect.w / 2, rect.x + rect.w], xs);
    const sy = best([rect.y, rect.y + rect.h / 2, rect.y + rect.h], ys);
    return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides: [...(sx ? [{ axis: "x" as const, at: sx.line }] : []), ...(sy ? [{ axis: "y" as const, at: sy.line }] : [])] };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const p = point(e);
    if (!d) {
      setHover(hit(p)?.id ?? null);
      return;
    }
    if (d.kind === "marquee") {
      const next = { ...d, x1: p.x, y1: p.y };
      drag.current = next;
      setMarquee(next);
      const a = { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), r: Math.max(d.x0, p.x), b: Math.max(d.y0, p.y) };
      if ((a.r - a.x) * scale + (a.b - a.y) * scale < 4) return;
      onSelect([...new Set([...d.base, ...shown.filter((l) => !l.locked && l.x < a.r && l.x + l.w > a.x && l.y < a.b && l.y + l.h > a.y).map((l) => l.id)])]);
      return;
    }
    if (d.kind === "rotate") {
      if (!d.moved) {
        d.moved = true;
        editor.checkpoint();
      }
      let deg = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((Math.round(deg) % 360) + 540) % 360 - 180;
      editor.update((doc) => ({ ...doc, layers: doc.layers.map((l) => (l.id === d.id ? { ...l, rotation: Math.abs(deg) < 1 ? undefined : deg } : l)) }), { history: false });
      return;
    }
    let dx = p.x - d.x0;
    let dy = p.y - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * scale < 3) return;
      d.moved = true;
      editor.checkpoint();
    }
    if (d.kind === "move") {
      const moving = doc.layers.filter((l) => d.start.has(l.id));
      const x = Math.min(...moving.map((l) => d.start.get(l.id)!.x)) + dx;
      const y = Math.min(...moving.map((l) => d.start.get(l.id)!.y)) + dy;
      const r = Math.max(...moving.map((l) => d.start.get(l.id)!.x + l.w)) + dx;
      const b = Math.max(...moving.map((l) => d.start.get(l.id)!.y + l.h)) + dy;
      const s = e.altKey ? { dx: 0, dy: 0, guides: [] } : snap(new Set(d.start.keys()), { x, y, w: r - x, h: b - y });
      dx += s.dx;
      dy += s.dy;
      setGuides(s.guides);
      editor.update((doc) => ({ ...doc, layers: doc.layers.map((l) => (d.start.has(l.id) ? { ...l, x: Math.round(d.start.get(l.id)!.x + dx), y: Math.round(d.start.get(l.id)!.y + dy) } : l)) }), { history: false });
      return;
    }
    const { box: b0, handle } = d;
    let { x, y, w, h } = b0;
    if (handle.includes("e")) w = b0.w + dx;
    if (handle.includes("w")) {
      w = b0.w - dx;
      x = b0.x + dx;
    }
    if (handle.includes("s")) h = b0.h + dy;
    if (handle.includes("n")) {
      h = b0.h - dy;
      y = b0.y + dy;
    }
    const corner = handle.length === 2;
    const layer = doc.layers.find((l) => l.id === d.id);
    // Corners keep the shape of text and pictures; Shift keeps it for anything.
    if (corner && (e.shiftKey || layer?.type === "text" || layer?.type === "image" || layer?.type === "logo" || layer?.type === "qr")) {
      const k = Math.max(w / b0.w, h / b0.h);
      w = b0.w * k;
      h = b0.h * k;
      if (handle.includes("w")) x = b0.x + b0.w - w;
      if (handle.includes("n")) y = b0.y + b0.h - h;
    }
    w = Math.max(12, w);
    h = Math.max(12, h);
    const size = d.size && corner ? Math.max(6, Math.round(d.size * (w / b0.w))) : undefined;
    editor.update((doc) => ({ ...doc, layers: doc.layers.map((l) => (l.id === d.id ? ({ ...l, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...(size && l.type === "text" ? { size } : {}) } as Layer) : l)) }), { history: false });
  };

  const onPointerUp = () => {
    drag.current = null;
    setGuides([]);
    setMarquee(null);
  };

  const startResize = (e: ReactPointerEvent, l: Layer, handle: Handle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = point(e);
    drag.current = { kind: "resize", x0: p.x, y0: p.y, id: l.id, handle, box: { x: l.x, y: l.y, w: l.w, h: l.h }, size: l.type === "text" ? l.size : undefined, moved: false };
    frame.current?.setPointerCapture(e.pointerId);
  };
  const startRotate = (e: ReactPointerEvent, l: Layer) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = { kind: "rotate", id: l.id, cx: l.x + l.w / 2, cy: l.y + l.h / 2, moved: false };
    frame.current?.setPointerCapture(e.pointerId);
  };

  const onDrop = (e: ReactDragEvent) => {
    setDropping(false);
    const raw = e.dataTransfer.getData(MEDIA_DRAG);
    if (!raw) return;
    e.preventDefault();
    let item: DragItem;
    try {
      item = JSON.parse(raw);
    } catch {
      return;
    }
    if (item.kind !== "image") return;
    const p = point(e);
    const w = Math.round(doc.w * 0.45);
    const h = item.w && item.h ? Math.round((w * item.h) / item.w) : w;
    const layer: Layer = { id: newId("l"), type: "image", src: item.url, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, fit: "cover", role: "photo" };
    editor.update((d) => ({ ...d, layers: [...d.layers, layer] }));
    onSelect([layer.id]);
  };

  const single = selected.length === 1 ? doc.layers.find((l) => l.id === selected[0]) : undefined;
  const editingLayer = editing ? (doc.layers.find((l) => l.id === editing && l.type === "text") as TextLayer | undefined) : undefined;
  // While a text is retyped in place, the stage hides it so only the editor shows.
  const drawn = editingLayer ? { ...doc, layers: doc.layers.map((l) => (l.id === editingLayer.id ? { ...l, opacity: 0 } : l)) } : doc;
  const groupBox = selected.length > 1 ? (() => {
    const ls = doc.layers.filter((l) => selected.includes(l.id));
    const x = Math.min(...ls.map((l) => l.x));
    const y = Math.min(...ls.map((l) => l.y));
    return { x, y, w: Math.max(...ls.map((l) => l.x + l.w)) - x, h: Math.max(...ls.map((l) => l.y + l.h)) - y };
  })() : null;

  return (
    <div className={cn("relative shadow-[0_1px_3px_rgba(0,0,0,0.08),0_20px_50px_-20px_rgba(0,0,0,0.3)]", className)} style={{ width: doc.w * scale, height: doc.h * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: doc.w, height: doc.h }}>
        <Stage doc={drawn} kit={kit} time={time} playing={playing} muted={muted} />
      </div>
      <div
        ref={frame}
        className={cn("absolute inset-0 touch-none select-none", dropping && "ring-2 ring-blue-500 ring-offset-2")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => !drag.current && setHover(null)}
        onDoubleClick={(e) => {
          const l = hit(point(e));
          if (l?.type === "text") {
            onSelect([l.id]);
            setEditing(l.id);
          }
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        {hover && !selected.includes(hover) && !marquee && <Box l={doc.layers.find((l) => l.id === hover)} scale={scale} className="ring-1 ring-blue-500/60" />}
        {selected.map((id) => {
          const l = doc.layers.find((x) => x.id === id);
          return <Box key={id} l={l} scale={scale} className={cn("ring-[1.5px]", l?.locked ? "ring-amber-500" : "ring-blue-500")} />;
        })}
        {groupBox && <span className="pointer-events-none absolute ring-1 ring-blue-500/50 ring-offset-0 [outline:1px_dashed_rgb(59_130_246_/_0.6)]" style={{ left: groupBox.x * scale - 4, top: groupBox.y * scale - 4, width: groupBox.w * scale + 8, height: groupBox.h * scale + 8 }} />}
        {single && !single.locked && !editingLayer && (
          <div className="pointer-events-none absolute" style={{ left: single.x * scale, top: single.y * scale, width: single.w * scale, height: single.h * scale, rotate: single.rotation ? `${single.rotation}deg` : undefined }}>
            {HANDLES.map((hd) => (
              <span
                key={hd}
                onPointerDown={(e) => startResize(e, single, hd)}
                className={cn("pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border border-blue-500 bg-white shadow-sm", hd.length === 2 ? "size-2.5 rounded-full" : hd === "n" || hd === "s" ? "h-1.5 w-4 rounded-full" : "h-4 w-1.5 rounded-full")}
                style={{ left: hd.includes("w") ? 0 : hd.includes("e") ? "100%" : "50%", top: hd.includes("n") ? 0 : hd.includes("s") ? "100%" : "50%", cursor: CURSOR[hd] }}
              />
            ))}
            <span className="pointer-events-none absolute top-0 left-1/2 h-5 w-px -translate-y-full bg-blue-500/70" />
            <span
              onPointerDown={(e) => startRotate(e, single)}
              title="Rotate (Shift snaps)"
              className="pointer-events-auto absolute top-0 left-1/2 size-3 -translate-x-1/2 -translate-y-[calc(100%+20px)] cursor-grab rounded-full border border-blue-500 bg-white shadow-sm active:cursor-grabbing"
            />
          </div>
        )}
        {guides.map((g, i) => (
          <span key={i} className="pointer-events-none absolute bg-fuchsia-500" style={g.axis === "x" ? { left: g.at * scale, top: 0, bottom: 0, width: 1 } : { top: g.at * scale, left: 0, right: 0, height: 1 }} />
        ))}
        {marquee && (
          <span
            className="pointer-events-none absolute bg-blue-500/[0.06] ring-1 ring-blue-500/70"
            style={{ left: Math.min(marquee.x0, marquee.x1) * scale, top: Math.min(marquee.y0, marquee.y1) * scale, width: Math.abs(marquee.x1 - marquee.x0) * scale, height: Math.abs(marquee.y1 - marquee.y0) * scale }}
          />
        )}
        {editingLayer && (
          <InlineText
            key={editingLayer.id}
            layer={editingLayer}
            kit={kit}
            scale={scale}
            onDone={(text) => {
              setEditing(null);
              if (text !== null && text !== editingLayer.text) editor.update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === editingLayer.id && l.type === "text" ? { ...l, text } : l)) }));
            }}
          />
        )}
      </div>
    </div>
  );
}

function Box({ l, scale, className }: { l: Layer | undefined; scale: number; className?: string }) {
  if (!l) return null;
  return <span className={cn("pointer-events-none absolute", className)} style={{ left: l.x * scale, top: l.y * scale, width: l.w * scale, height: l.h * scale, rotate: l.rotation ? `${l.rotation}deg` : undefined }} />;
}

/** Retyping a text where it sits, in its own font, size and colour. */
function InlineText({ layer: l, kit, scale, onDone }: { layer: TextLayer; kit: MediaKit | undefined; scale: number; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(l.text);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const style: CSSProperties = {
    left: l.x * scale,
    top: l.y * scale,
    width: l.w * scale,
    minHeight: l.h * scale,
    rotate: l.rotation ? `${l.rotation}deg` : undefined,
    fontFamily: fontStack(l.font === "body" ? kit?.fonts.body : kit?.fonts.heading),
    fontSize: l.size * scale,
    fontWeight: l.weight ?? (l.font === "body" ? 400 : 600),
    fontStyle: l.italic ? "italic" : undefined,
    lineHeight: l.lineHeight ?? (l.role === "body" || l.role === "subhead" ? 1.25 : 1.05),
    letterSpacing: l.tracking ? `${l.tracking}em` : undefined,
    textTransform: l.uppercase ? "uppercase" : undefined,
    textAlign: l.align ?? "left",
    color: l.color,
    background: l.bg ?? "transparent",
    borderRadius: (l.radius ?? 0) * scale,
    padding: `${(l.padY ?? 0) * scale}px ${(l.padX ?? 0) * scale}px`,
  };
  return (
    <textarea
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish(null);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(text);
      }}
      className="absolute z-10 resize-none overflow-hidden outline-2 outline-offset-2 outline-blue-500"
      style={style}
    />
  );
}
