"use client";

// Shared by the poster and video editors: the layer keyboard shortcuts, the
// fit-to-box zoom of the page, and its zoom control.

import { Maximize, Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { newId, type Layer } from "@slice/backend/convex/mediaTypes";
import type { FocusEnv } from "./context";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']");

/** The layer shortcuts both editors share: delete, nudge, duplicate, copy and paste, order, undo. */
export function useLayerKeys(env: FocusEnv, opts: { onEscape: () => void; video?: boolean }) {
  const clipboard = useRef<Layer[]>([]);
  useEffect(() => {
    const { doc, editor, selection, select, playback } = env;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        editor.redo();
        return;
      }
      if (e.key === "Escape") {
        if (selection.kind !== "none") select({ kind: "none" });
        else opts.onEscape();
        return;
      }
      if (opts.video && e.key === " ") {
        e.preventDefault();
        playback.toggle();
        return;
      }
      const ids = selection.kind === "layers" ? new Set(selection.ids.filter((id) => !doc.layers.find((l) => l.id === id)?.locked)) : new Set<string>();
      if (mod && key === "a" && !opts.video) {
        e.preventDefault();
        select({ kind: "layers", ids: doc.layers.filter((l) => !l.locked && !l.hidden).map((l) => l.id) });
        return;
      }
      if (mod && key === "c" && ids.size) {
        clipboard.current = doc.layers.filter((l) => ids.has(l.id));
        return;
      }
      if (mod && key === "v" && clipboard.current.length) {
        e.preventDefault();
        const copies = clipboard.current.map((l) => ({ ...l, id: newId("l"), x: l.x + 32, y: l.y + 32 }));
        clipboard.current = copies;
        editor.update((d) => ({ ...d, layers: [...d.layers, ...copies] }));
        select({ kind: "layers", ids: copies.map((l) => l.id) });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && ids.size) {
        e.preventDefault();
        editor.update((d) => ({ ...d, layers: d.layers.filter((l) => !ids.has(l.id)) }));
        select({ kind: "none" });
        return;
      }
      if (!ids.size) return;
      if (mod && key === "d") {
        e.preventDefault();
        const copies = doc.layers.filter((l) => ids.has(l.id)).map((l) => ({ ...l, id: newId("l"), x: l.x + 24, y: l.y + 24 }));
        editor.update((d) => ({ ...d, layers: [...d.layers, ...copies] }));
        select({ kind: "layers", ids: copies.map((l) => l.id) });
        return;
      }
      if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        editor.update((d) => {
          const moving = d.layers.filter((l) => ids.has(l.id));
          const rest = d.layers.filter((l) => !ids.has(l.id));
          return { ...d, layers: e.key === "]" ? [...rest, ...moving] : [...moving, ...rest] };
        });
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (delta) {
        e.preventDefault();
        editor.update((d) => ({ ...d, layers: d.layers.map((l) => (ids.has(l.id) ? { ...l, x: l.x + delta[0], y: l.y + delta[1] } : l)) }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

/** Fit-to-box zoom for a doc, with manual zoom on top (⌘ + scroll, the buttons). */
export function useStageZoom(box: React.RefObject<HTMLDivElement | null>, w: number, h: number, pad = 64) {
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const W = el.clientWidth - pad * 2;
      const H = el.clientHeight - pad * 2;
      if (W > 0 && H > 0) setFit(Math.min(W / w, H / h));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, w, h, pad]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.05, (z ?? fit) * Math.exp(-e.deltaY * 0.01))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [box, fit]);
  return { scale: zoom ?? fit, fit, zoomed: zoom !== null, setZoom };
}

export function ZoomPill({ scale, onZoom, onFit }: { scale: number; onZoom: (z: number) => void; onFit: () => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.07]">
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(scale / 1.25)} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Minus className="size-3.5" />
      </button>
      <span className="w-12 text-center text-xs font-medium text-neutral-700 tabular-nums">{Math.round(scale * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(scale * 1.25)} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Plus className="size-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      <button type="button" aria-label="Fit" title="Fit" onClick={onFit} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Maximize className="size-3.5" />
      </button>
    </div>
  );
}
