"use client";

// The studio canvas: the creative drawn by the shared Stage (so it looks as it
// exports), with an editing layer on top. Click to select (Shift adds), drag
// to move with snapping to the frame and the other layers, handles to resize
// (Shift keeps the shape; corners scale text), double-click text to retype it,
// and drop a picture from the library to place it.

import { useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { docDuration, layerVisibleAt, newId, type Layer, type MediaDoc, type MediaKit } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Stage, useFitScale } from "../stage";
import type { CreativeDoc } from "./use-doc";

export const LIBRARY_MIME = "application/x-slice-media";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

interface Guide {
  axis: "x" | "y";
  at: number;
}

type Drag =
  | { kind: "move"; x0: number; y0: number; start: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: "resize"; x0: number; y0: number; id: string; handle: Handle; box: { x: number; y: number; w: number; h: number }; size?: number; moved: boolean };

const visible = (doc: MediaDoc, t: number) => {
  const duration = docDuration(doc);
  return doc.layers.filter((l) => (doc.kind === "video" ? layerVisibleAt(l, t, duration) : !l.hidden));
};

export function EditCanvas({
  doc,
  kit,
  time,
  playing,
  muted,
  selected,
  onSelect,
  editor,
  onFit,
}: {
  doc: MediaDoc;
  kit: MediaKit | undefined;
  time: number;
  playing: boolean;
  muted: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  editor: Pick<CreativeDoc, "update" | "checkpoint">;
  onFit?: (id: string, size: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const scale = useFitScale(box, doc.w, doc.h);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const shown = visible(doc, time);
  const point = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const hit = (p: { x: number; y: number }) => [...shown].reverse().find((l) => !l.locked && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || editing) return;
    const p = point(e);
    const l = hit(p);
    if (!l) {
      onSelect([]);
      return;
    }
    let ids = selected;
    if (e.shiftKey) ids = selected.includes(l.id) ? selected.filter((x) => x !== l.id) : [...selected, l.id];
    else if (!selected.includes(l.id)) ids = [l.id];
    onSelect(ids);
    const start = new Map(doc.layers.filter((x) => ids.includes(x.id) && !x.locked).map((x) => [x.id, { x: x.x, y: x.y }]));
    if (!start.size) return;
    drag.current = { kind: "move", x0: p.x, y0: p.y, start, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const snap = (ids: Set<string>, rect: { x: number; y: number; w: number; h: number }) => {
    const threshold = 8 / scale;
    const others = shown.filter((l) => !ids.has(l.id));
    const xs = [0, doc.w / 2, doc.w, ...others.flatMap((l) => [l.x, l.x + l.w / 2, l.x + l.w])];
    const ys = [0, doc.h / 2, doc.h, ...others.flatMap((l) => [l.y, l.y + l.h / 2, l.y + l.h])];
    const best = (edges: number[], lines: number[]) => {
      let d = Infinity;
      let line = 0;
      for (const e of edges)
        for (const c of lines)
          if (Math.abs(c - e) < Math.abs(d)) {
            d = c - e;
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
    if (e.shiftKey && corner) {
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
  };

  const startResize = (e: ReactPointerEvent, l: Layer, handle: Handle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const p = point(e);
    drag.current = { kind: "resize", x0: p.x, y0: p.y, id: l.id, handle, box: { x: l.x, y: l.y, w: l.w, h: l.h }, size: l.type === "text" ? l.size : undefined, moved: false };
    (e.currentTarget.parentElement?.parentElement as HTMLElement | null)?.setPointerCapture(e.pointerId);
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const l = hit(point(e));
    if (l?.type === "text") {
      onSelect([l.id]);
      setEditing(l.id);
    }
  };

  const onDrop = (e: ReactDragEvent) => {
    setDropping(false);
    const raw = e.dataTransfer.getData(LIBRARY_MIME);
    if (!raw) return;
    e.preventDefault();
    let item: { url: string; w?: number; h?: number };
    try {
      item = JSON.parse(raw);
    } catch {
      return;
    }
    const p = point(e);
    const w = Math.round(doc.w * 0.45);
    const h = item.w && item.h ? Math.round((w * item.h) / item.w) : w;
    const layer: Layer = { id: newId("l"), type: "image", src: item.url, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), w, h, fit: "cover", role: "photo" };
    editor.update((d) => ({ ...d, layers: [...d.layers, layer] }));
    onSelect([layer.id]);
  };

  const single = selected.length === 1 ? doc.layers.find((l) => l.id === selected[0]) : undefined;
  const editingLayer = editing ? doc.layers.find((l) => l.id === editing && l.type === "text") : undefined;

  return (
    <div ref={box} className="relative size-full">
      {scale > 0 && (
        <div className="absolute top-1/2 left-1/2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_32px_-8px_rgba(0,0,0,0.18)]" style={{ width: doc.w * scale, height: doc.h * scale, translate: "-50% -50%" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: doc.w, height: doc.h }}>
            <Stage doc={doc} kit={kit} time={time} playing={playing} muted={muted} onFit={onFit} />
          </div>
          <div
            ref={frame}
            className={cn("absolute inset-0 touch-none select-none", dropping && "ring-2 ring-sky-500 ring-offset-2")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => !drag.current && setHover(null)}
            onDoubleClick={onDoubleClick}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(LIBRARY_MIME)) return;
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
          >
            {hover && !selected.includes(hover) && <Box l={doc.layers.find((l) => l.id === hover)} scale={scale} className="ring-1 ring-sky-500/60" />}
            {selected.map((id) => (
              <Box key={id} l={doc.layers.find((l) => l.id === id)} scale={scale} className={cn("ring-[1.5px]", doc.layers.find((l) => l.id === id)?.locked ? "ring-amber-500" : "ring-sky-500")} />
            ))}
            {single && !single.locked && !editingLayer && (
              <div className="pointer-events-none absolute" style={{ left: single.x * scale, top: single.y * scale, width: single.w * scale, height: single.h * scale, rotate: single.rotation ? `${single.rotation}deg` : undefined }}>
                {HANDLES.map((hd) => (
                  <span
                    key={hd}
                    onPointerDown={(e) => startResize(e, single, hd)}
                    className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-sky-500 bg-white shadow-sm"
                    style={{ left: hd.includes("w") ? 0 : hd.includes("e") ? "100%" : "50%", top: hd.includes("n") ? 0 : hd.includes("s") ? "100%" : "50%", cursor: CURSOR[hd] }}
                  />
                ))}
              </div>
            )}
            {guides.map((g, i) => (
              <span key={i} className="pointer-events-none absolute bg-fuchsia-500" style={g.axis === "x" ? { left: g.at * scale, top: 0, bottom: 0, width: 1 } : { top: g.at * scale, left: 0, right: 0, height: 1 }} />
            ))}
            {editingLayer && editingLayer.type === "text" && (
              <InlineText
                key={editingLayer.id}
                layer={editingLayer}
                scale={scale}
                onDone={(text) => {
                  setEditing(null);
                  if (text !== null && text !== editingLayer.text) editor.update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === editingLayer.id && l.type === "text" ? { ...l, text } : l)) }));
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Box({ l, scale, className }: { l: Layer | undefined; scale: number; className?: string }) {
  if (!l) return null;
  return <span className={cn("pointer-events-none absolute rounded-[1px]", className)} style={{ left: l.x * scale, top: l.y * scale, width: l.w * scale, height: l.h * scale, rotate: l.rotation ? `${l.rotation}deg` : undefined }} />;
}

function InlineText({ layer, scale, onDone }: { layer: Extract<Layer, { type: "text" }>; scale: number; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(layer.text);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
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
      className="absolute z-10 resize-none rounded-sm bg-white/95 p-1.5 text-sm leading-5 text-neutral-900 shadow-lg ring-2 ring-sky-500 outline-none"
      style={{ left: layer.x * scale, top: layer.y * scale, width: Math.max(160, layer.w * scale), height: Math.max(64, layer.h * scale), textAlign: layer.align ?? "left" }}
    />
  );
}
