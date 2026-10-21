"use client";

// The video timeline. A ruler that adapts to the zoom, a playhead you can grab,
// text and graphics packed into lanes by when they show, the shots as a
// filmstrip (drag to reorder, pull an edge to trim, a cut or a fade between
// them), and the music and voice tracks with their waveforms. Everything
// snaps to the playhead and to shot edges; ⌘ + scroll zooms; S splits at the
// playhead.

import { AlertTriangle, Film, Image as ImageIcon, Loader2, Magnet, Mic, Minus, Music, Pin, Plus, QrCode, Scissors, Shapes, Stamp, Trash2, Type } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { clipLength, docDuration, newId, timeline, type AudioClip, type Clip, type Layer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { useStudio } from "./context";
import { layerLabel } from "./layers";
import { MEDIA_DRAG, type DragItem } from "../sidebar/assets";
import { insertShot, shotFrom } from "./video-ops";
import { bars, useWaveform } from "./waveform";

const HEAD_W = 148;
const RULER_H = 28;
const TEXT_H = 26;
const VIDEO_H = 64;
const AUDIO_H = 44;
const GUTTER = 6;
const FPS = 30;

export const timecode = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * FPS);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

const TYPE_ICON: Record<Layer["type"], ReactNode> = { text: <Type />, image: <ImageIcon />, logo: <Stamp />, shape: <Shapes />, qr: <QrCode /> };

/** Layers on screen for the whole video (no start or end): one lane of chips, not a lane each. */
const throughout = (l: Layer) => l.start === undefined && l.end === undefined;

/** The height that shows every lane, within reason. */
export function timelineHeight(doc: { layers: Layer[] }, viewport: number) {
  const timed = doc.layers.filter((l) => !throughout(l));
  const lanes = packLanes(timed, 1e6).length + (timed.length < doc.layers.length ? 1 : 0);
  return Math.round(Math.min(viewport * 0.46, Math.max(220, 40 + RULER_H + lanes * TEXT_H + VIDEO_H + AUDIO_H * 2 + 12)));
}

/** Layers packed into as few lanes as their times allow. */
function packLanes(layers: Layer[], duration: number): Layer[][] {
  const lanes: { end: number; items: Layer[] }[] = [];
  const sorted = [...layers].sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || (b.end ?? duration) - (a.end ?? duration));
  for (const l of sorted) {
    const s = l.start ?? 0;
    const lane = lanes.find((x) => x.end <= s + 0.001);
    if (lane) {
      lane.items.push(l);
      lane.end = l.end ?? duration;
    } else lanes.push({ end: l.end ?? duration, items: [l] });
  }
  return lanes.map((x) => x.items);
}

/** Ticks for the ruler: a major step that leaves ~90px between labels. */
function tickStep(pps: number) {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  return steps.find((s) => s * pps >= 90) ?? 60;
}

type Drag =
  | { kind: "scrub" }
  | { kind: "shot-move"; id: string; x0: number; moved: boolean; to: number | null }
  | { kind: "shot-trim"; id: string; edge: "in" | "out"; x0: number; in0: number; out0: number; max: number }
  | { kind: "layer"; id: string; mode: "start" | "end" | "move"; x0: number; s0: number; e0: number; moved?: boolean }
  | { kind: "audio"; id: string; mode: "move" | "end"; x0: number; s0: number; d0: number; max: number; moved?: boolean };

/** Pointer travel (px) before pressing on a shot, layer or track counts as a drag rather than a click. */
const CLICK_SLOP = 4;

export function Timeline({ height }: { height: number }) {
  const { doc, editor, selection, select, playback, jobs, assets } = useStudio();
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(0);
  const [pps, setPps] = useState<number | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const drag = useRef<Drag | null>(null);
  const [dragState, setDragState] = useState<Drag | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const duration = Math.max(0.5, docDuration(doc));
  const fitPps = view ? Math.max(6, (view - 48) / duration) : 40;
  const scale = pps ?? fitPps;
  const contentW = Math.max(view, duration * scale + 160);
  const shots = timeline(doc);
  const music = (doc.audio ?? []).filter((a) => a.kind === "music");
  const voice = (doc.audio ?? []).filter((a) => a.kind === "voice");
  const always = doc.layers.filter(throughout);
  const lanes = useMemo(() => packLanes(doc.layers.filter((l) => !throughout(l)), duration), [doc.layers, duration]);
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setView(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘ + scroll zooms around the pointer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = (el.scrollLeft + e.clientX - r.left - GUTTER) / scale;
      const next = Math.min(600, Math.max(4, scale * Math.exp(-e.deltaY * 0.01)));
      setPps(next);
      requestAnimationFrame(() => (el.scrollLeft = at * next + GUTTER - (e.clientX - r.left)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale]);

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playback.playing) return;
    const x = playback.time * scale + GUTTER;
    if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 80;
    if (x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80);
  }, [playback.time, playback.playing, scale]);

  const timeAt = useCallback(
    (clientX: number) => {
      const el = scroller.current!;
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(duration, (clientX - r.left + el.scrollLeft - GUTTER) / scale));
    },
    [duration, scale],
  );

  /** Snap a time to the playhead and to shot and layer edges within 7px. */
  const snap = (t: number, ignore?: string) => {
    if (!snapOn) return { t: Math.round(t * 10) / 10, line: null as number | null };
    const marks = [0, duration, playback.time, ...shots.flatMap((s) => [s.start, s.end]), ...doc.layers.filter((l) => l.id !== ignore).flatMap((l) => [l.start ?? 0, l.end ?? duration])];
    let best: number | null = null;
    for (const m of marks) if (Math.abs(m - t) * scale <= 7 && (best === null || Math.abs(m - t) < Math.abs(best - t))) best = m;
    return best === null ? { t: Math.round(t * 10) / 10, line: null } : { t: best, line: best };
  };

  const begin = (d: Drag, e: ReactPointerEvent) => {
    e.stopPropagation();
    drag.current = d;
    setDragState(d);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (d.kind !== "scrub") editor.checkpoint();
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "scrub") {
      playback.seek(snap(timeAt(e.clientX)).t);
      return;
    }
    const dt = (e.clientX - ("x0" in d ? d.x0 : 0)) / scale;
    if (d.kind === "shot-move") {
      if (!d.moved && Math.abs(e.clientX - d.x0) < CLICK_SLOP) return;
      const t = timeAt(e.clientX);
      const others = shots.filter((s) => s.clip.id !== d.id);
      let to = others.findIndex((s) => t < (s.start + s.end) / 2);
      if (to < 0) to = others.length;
      const next = { ...d, moved: true, to };
      drag.current = next;
      setDragState(next);
      return;
    }
    if (d.kind === "shot-trim") {
      editor.update(
        (doc) => ({
          ...doc,
          video: (doc.video ?? []).map((c) => {
            if (c.id !== d.id) return c;
            if (d.edge === "out") return { ...c, out: Math.round(Math.min(d.max, Math.max(d.in0 + 0.5, d.out0 + dt)) * 10) / 10 };
            return { ...c, in: Math.round(Math.max(0, Math.min(d.out0 - 0.5, d.in0 + dt)) * 10) / 10 };
          }),
        }),
        { history: false },
      );
      return;
    }
    if ((d.kind === "layer" || d.kind === "audio") && d.mode === "move" && !d.moved) {
      // A click selects and moves the playhead; only a real drag moves the layer or track.
      if (Math.abs(e.clientX - d.x0) < CLICK_SLOP) return;
      d.moved = true;
    }
    if (d.kind === "layer") {
      let start = d.s0;
      let end = d.e0;
      let line: number | null = null;
      if (d.mode === "start") {
        const s = snap(d.s0 + dt, d.id);
        start = Math.min(d.e0 - 0.3, Math.max(0, s.t));
        line = s.line;
      } else if (d.mode === "end") {
        const s = snap(d.e0 + dt, d.id);
        end = Math.max(d.s0 + 0.3, Math.min(duration, s.t));
        line = s.line;
      } else {
        const s = snap(d.s0 + dt, d.id);
        const k = Math.max(-d.s0, Math.min(duration - d.e0, s.t - d.s0));
        start = d.s0 + k;
        end = d.e0 + k;
        line = s.line;
      }
      setSnapLine(line);
      editor.update((doc) => ({ ...doc, layers: doc.layers.map((x) => (x.id === d.id ? { ...x, start: start > 0.05 ? start : undefined, end: end < duration - 0.05 ? end : undefined } : x)) }), { history: false });
      return;
    }
    if (d.kind === "audio") {
      editor.update(
        (doc) => ({
          ...doc,
          audio: (doc.audio ?? []).map((a) => {
            if (a.id !== d.id) return a;
            if (d.mode === "move") {
              const s = snap(d.s0 + dt);
              setSnapLine(s.line);
              return { ...a, start: Math.max(0, Math.min(duration - 0.5, s.t)) };
            }
            return { ...a, duration: Math.round(Math.max(0.5, Math.min(d.max, d.d0 + dt)) * 10) / 10 };
          }),
        }),
        { history: false },
      );
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragState(null);
    setSnapLine(null);
    // A click (no drag) on a shot, layer or track puts the playhead where it landed.
    if ((d?.kind === "layer" || d?.kind === "audio") && d.mode === "move" && !d.moved) playback.seek(timeAt(d.x0));
    if (d?.kind === "shot-move") {
      if (!d.moved) {
        const s = shots.find((x) => x.clip.id === d.id);
        if (s) playback.seek(Math.min(s.end - 0.01, Math.max(s.start, timeAt(d.x0))));
        return;
      }
      if (d.to === null) return;
      editor.update((doc) => {
        const list = [...(doc.video ?? [])];
        const from = list.findIndex((c) => c.id === d.id);
        const [c] = list.splice(from, 1);
        list.splice(d.to!, 0, c);
        return { ...doc, video: list };
      });
    }
  };

  const sourceLength = (c: Clip) => (c.kind === "still" ? 30 : (assets.find((a) => a.url === c.src)?.duration ?? Math.max(8, c.out)));

  /** Split what is selected (or the shot under the playhead) at the playhead. */
  const split = () => {
    const t = playback.time;
    if (selection.kind === "layers" && selection.ids.length === 1) {
      const l = doc.layers.find((x) => x.id === selection.ids[0]);
      if (!l || t <= (l.start ?? 0) + 0.2 || t >= (l.end ?? duration) - 0.2) return;
      const copy = { ...l, id: newId("l"), start: t };
      editor.update((d) => ({ ...d, layers: d.layers.flatMap((x) => (x.id === l.id ? [{ ...x, end: t }, copy] : [x])) }));
      select({ kind: "layers", ids: [copy.id] });
      return;
    }
    const at = shots.find((s) => (selection.kind === "clip" ? s.clip.id === selection.id : t >= s.start && t < s.end));
    if (!at || t <= at.start + 0.2 || t >= at.end - 0.2) return;
    const local = t - at.start;
    const c = at.clip;
    const first: Clip = { ...c, out: Math.round((c.in + local) * 100) / 100 };
    const second: Clip = { ...c, id: newId("c"), in: c.kind === "still" ? 0 : first.out, out: c.kind === "still" ? Math.round((clipLength(c) - local) * 100) / 100 : c.out, transition: "cut" };
    if (c.kind === "still") first.out = Math.round(local * 100) / 100;
    editor.update((d) => ({ ...d, video: (d.video ?? []).flatMap((x) => (x.id === c.id ? [first, second] : [x])) }));
    select({ kind: "clip", id: second.id });
  };

  const removeSelected = () => {
    if (selection.kind === "clip") editor.update((d) => ({ ...d, video: (d.video ?? []).filter((c) => c.id !== selection.id) }));
    else if (selection.kind === "audio") editor.update((d) => ({ ...d, audio: (d.audio ?? []).filter((a) => a.id !== selection.id) }));
    else if (selection.kind === "layers") editor.update((d) => ({ ...d, layers: d.layers.filter((l) => !selection.ids.includes(l.id)) }));
    select({ kind: "none" });
  };

  // Timeline keys: S splits; Delete removes shots and tracks (layers are handled by the editor); arrows step frames.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        split();
      } else if ((e.key === "Delete" || e.key === "Backspace") && (selection.kind === "clip" || selection.kind === "audio")) {
        e.preventDefault();
        removeSelected();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && selection.kind !== "layers") {
        e.preventDefault();
        playback.pause();
        playback.seek(playback.time + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / FPS));
      } else if (e.key === "Home") playback.seek(0);
      else if (e.key === "End") playback.seek(duration);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const step = tickStep(scale);
  const ticks = Array.from({ length: Math.floor(duration / step) + 2 }, (_, i) => i * step).filter((t) => t <= duration + step);
  const minor = step / 5;
  const x = (t: number) => t * scale + GUTTER;
  const lanesH = (lanes.length + (always.length ? 1 : 0)) * TEXT_H;
  const tracksTop = RULER_H;

  const headers: { key: string; h: number; icon: ReactNode; label: string; sub?: string }[] = [
    ...(always.length ? [{ key: "on", h: TEXT_H, icon: <Pin />, label: "Whole video" }] : []),
    ...lanes.map((_, i) => ({ key: `t${i}`, h: TEXT_H, icon: <Type />, label: i === 0 ? "Text & graphics" : "", sub: undefined })),
    { key: "v", h: VIDEO_H, icon: <Film />, label: "Shots", sub: `${shots.length}` },
    { key: "m", h: AUDIO_H, icon: <Music />, label: "Music" },
    { key: "a", h: AUDIO_H, icon: <Mic />, label: "Voice" },
  ];

  return (
    <div className="flex shrink-0 flex-col bg-white select-none" style={{ height }}>
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-black/[0.06] px-2">
        <TBtn icon={<Scissors />} label="Split" kbd="S" onClick={split} />
        <TBtn icon={<Trash2 />} label="Delete" onClick={removeSelected} disabled={selection.kind === "none"} />
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        {running.length > 0 && (
          <span className="flex items-center gap-1.5 px-2 text-xs text-neutral-500">
            <Loader2 className="size-3.5 animate-spin" /> {running.length} generating
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" title="Snapping" aria-pressed={snapOn} onClick={() => setSnapOn((s) => !s)} className={cn("flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100", snapOn && "bg-neutral-100 text-neutral-900")}>
            <Magnet className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          <button type="button" aria-label="Zoom out" onClick={() => setPps(Math.max(4, scale / 1.4))} className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100">
            <Minus className="size-3.5" />
          </button>
          <input type="range" min={Math.log(4)} max={Math.log(600)} step={0.01} value={Math.log(scale)} onChange={(e) => setPps(Math.exp(Number(e.target.value)))} className="w-28 accent-neutral-900" aria-label="Timeline zoom" />
          <button type="button" aria-label="Zoom in" onClick={() => setPps(Math.min(600, scale * 1.4))} className="flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100">
            <Plus className="size-3.5" />
          </button>
          <button type="button" onClick={() => setPps(null)} className="h-8 rounded-md px-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100">
            Fit
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {/* Track headers */}
        <div className="sticky left-0 z-20 shrink-0 border-r border-black/[0.06] bg-white" style={{ width: HEAD_W }}>
          <div style={{ height: RULER_H }} className="border-b border-black/[0.06]" />
          {headers.map((h) => (
            <div key={h.key} style={{ height: h.h }} className={cn("flex items-center gap-2 border-b border-black/[0.04] px-3 text-xs text-neutral-500 [&_svg]:size-3.5", h.key === "v" && "bg-neutral-50/70 font-medium text-neutral-700")}>
              {(h.label || h.key === "t0") && h.icon}
              <span className="truncate">{h.label}</span>
              {h.sub && <span className="ml-auto text-neutral-400 tabular-nums">{h.sub}</span>}
            </div>
          ))}
        </div>

        {/* Lanes */}
        <div ref={scroller} className="scrollbar-thin relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="relative" style={{ width: contentW, height: RULER_H + lanesH + VIDEO_H + AUDIO_H * 2 + headers.length }}>
            {/* Ruler */}
            <div
              className="relative z-10 cursor-text border-b border-black/[0.06] bg-white"
              style={{ height: RULER_H }}
              onPointerDown={(e) => {
                playback.pause();
                playback.seek(timeAt(e.clientX));
                begin({ kind: "scrub" }, e);
              }}
            >
              {ticks.map((t) => (
                <span key={t} className="absolute bottom-0 h-2.5 border-l border-neutral-300" style={{ left: x(t) }}>
                  <span className={cn("absolute bottom-2.5 left-1 text-[10px] text-neutral-500 tabular-nums", t === 0 && "left-2.5")}>{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : step < 1 ? `${t.toFixed(t % 1 ? 2 : 0)}s` : `${t}s`}</span>
                </span>
              ))}
              {scale * minor >= 8 && Array.from({ length: Math.floor(duration / minor) + 1 }, (_, i) => i * minor).map((t) => <span key={`m${t}`} className="absolute bottom-0 h-1 border-l border-neutral-200" style={{ left: x(t) }} />)}
              <span className="absolute inset-y-0 bg-neutral-100/70" style={{ left: x(duration), right: 0 }} />
            </div>

            {/* On screen the whole video: one chip per layer, click to select. */}
            {always.length > 0 && (
              <div className="relative border-b border-black/[0.04]" style={{ height: TEXT_H }}>
                <div className="absolute inset-y-0 flex items-center gap-1 overflow-hidden px-[3px]" style={{ left: x(0), width: Math.max(40, duration * scale) }}>
                  {always.map((l) => {
                    const active = selection.kind === "layers" && selection.ids.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => select({ kind: "layers", ids: [l.id] })}
                        title={`${layerLabel(l)}, on screen the whole video. Select it and use Timing to show it for part of it.`}
                        className={cn("flex h-[18px] max-w-44 shrink-0 items-center gap-1.5 rounded-[4px] pr-2 pl-[3px] text-[11px] font-medium transition-colors [&_svg]:size-3 [&_svg]:shrink-0", active ? "bg-blue-500 text-white" : "bg-white text-neutral-700 shadow-[0_1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.08] hover:ring-black/20", l.hidden && "opacity-40")}
                      >
                        <LayerMark l={l} />
                        <span className="truncate">{layerLabel(l)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text and graphics */}
            {lanes.map((lane, i) => (
              <div key={i} className="relative border-b border-black/[0.04]" style={{ height: TEXT_H }} onPointerDown={(e) => (select({ kind: "none" }), playback.seek(timeAt(e.clientX)))}>
                {lane.map((l) => {
                  const s = l.start ?? 0;
                  const en = l.end ?? duration;
                  const active = selection.kind === "layers" && selection.ids.includes(l.id);
                  return (
                    <div
                      key={l.id}
                      onPointerDown={(e) => {
                        select({ kind: "layers", ids: [l.id] });
                        if (!l.locked) begin({ kind: "layer", id: l.id, mode: "move", x0: e.clientX, s0: s, e0: en }, e);
                        else e.stopPropagation();
                      }}
                      className={cn("group absolute top-1 bottom-1 flex cursor-grab items-center gap-1.5 overflow-hidden rounded-md px-2 text-[11px] font-medium ring-1 active:cursor-grabbing [&_svg]:size-3 [&_svg]:shrink-0", active ? "bg-blue-500 text-white ring-blue-600" : "bg-violet-100 text-violet-900 ring-violet-200 hover:bg-violet-200/70", l.hidden && "opacity-40")}
                      style={{ left: x(s), width: Math.max(8, (en - s) * scale) }}
                      title={layerLabel(l)}
                    >
                      {TYPE_ICON[l.type]}
                      <span className="truncate">{layerLabel(l)}</span>
                      {!l.locked && (
                        <>
                          <span onPointerDown={(e) => (select({ kind: "layers", ids: [l.id] }), begin({ kind: "layer", id: l.id, mode: "start", x0: e.clientX, s0: s, e0: en }, e))} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l-md bg-black/10 opacity-0 group-hover:opacity-100" />
                          <span onPointerDown={(e) => (select({ kind: "layers", ids: [l.id] }), begin({ kind: "layer", id: l.id, mode: "end", x0: e.clientX, s0: s, e0: en }, e))} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-md bg-black/10 opacity-0 group-hover:opacity-100" />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Shots */}
            <div
              className={cn("relative border-b border-black/[0.06] bg-neutral-50/70", dropAt !== null && "bg-blue-50")}
              style={{ height: VIDEO_H }}
              onPointerDown={(e) => (select({ kind: "none" }), playback.seek(timeAt(e.clientX)))}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
                e.preventDefault();
                setDropAt(timeAt(e.clientX));
              }}
              onDragLeave={() => setDropAt(null)}
              onDrop={(e) => {
                setDropAt(null);
                const raw = e.dataTransfer.getData(MEDIA_DRAG);
                if (!raw) return;
                e.preventDefault();
                const item = JSON.parse(raw) as DragItem;
                const clip = shotFrom({ ...item, duration: assets.find((a) => a.url === item.url)?.duration });
                if (!clip) return;
                editor.update((d) => insertShot(d, clip, timeAt(e.clientX)));
                select({ kind: "clip", id: clip.id });
              }}
            >
              {shots.map(({ clip, start, end }, i) => {
                const active = selection.kind === "clip" && selection.id === clip.id;
                const job = jobs.find((j) => j.targetId === clip.id && (j.status === "queued" || j.status === "running"));
                const moving = dragState?.kind === "shot-move" && dragState.id === clip.id && dragState.moved;
                const w = Math.max(10, (end - start) * scale - 2);
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => {
                      select({ kind: "clip", id: clip.id });
                      begin({ kind: "shot-move", id: clip.id, x0: e.clientX, moved: false, to: null }, e);
                    }}
                    title={clip.prompt}
                    className={cn("group absolute top-1.5 bottom-1.5 cursor-grab overflow-hidden rounded-md bg-neutral-300 ring-1 ring-black/10 active:cursor-grabbing", active && "z-10 ring-2 ring-blue-500", moving && "opacity-50")}
                    style={{ left: x(start) + 1, width: w, backgroundImage: clip.poster ? `url("${clip.poster.replace(/"/g, "%22")}")` : undefined, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
                  >
                    <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/20" />
                    <span className="absolute top-1 left-1.5 flex items-center gap-1 text-[10px] font-semibold text-white drop-shadow">
                      {i + 1}
                      {clip.kind === "still" && <span className="font-normal opacity-80">still</span>}
                      {clip.status === "pending" || job ? <Loader2 className="size-3 animate-spin" /> : clip.status === "failed" ? <AlertTriangle className="size-3 text-amber-300" /> : null}
                    </span>
                    {w > 48 && <span className="absolute right-1.5 bottom-1 text-[10px] text-white/90 tabular-nums drop-shadow">{(end - start).toFixed(1)}s</span>}
                    {i > 0 && (
                      <button
                        type="button"
                        title={clip.transition === "fade" ? "Fade in (click for a cut)" : "Cut (click for a fade)"}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => editor.update((d) => ({ ...d, video: (d.video ?? []).map((c) => (c.id === clip.id ? { ...c, transition: c.transition === "fade" ? "cut" : "fade" } : c)) }))}
                        className={cn("absolute bottom-1 left-1 flex h-4 items-center rounded px-1 text-[9px] font-semibold uppercase", clip.transition === "fade" ? "bg-white text-neutral-900" : "bg-black/40 text-white/80 opacity-0 group-hover:opacity-100")}
                      >
                        {clip.transition === "fade" ? "Fade" : "Cut"}
                      </button>
                    )}
                    {clip.kind === "motion" && (
                      <span onPointerDown={(e) => (select({ kind: "clip", id: clip.id }), begin({ kind: "shot-trim", id: clip.id, edge: "in", x0: e.clientX, in0: clip.in, out0: clip.out, max: sourceLength(clip) }, e))} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/60" title="Trim the start" />
                    )}
                    <span onPointerDown={(e) => (select({ kind: "clip", id: clip.id }), begin({ kind: "shot-trim", id: clip.id, edge: "out", x0: e.clientX, in0: clip.in, out0: clip.out, max: sourceLength(clip) }, e))} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/60" title="Trim the end" />
                  </div>
                );
              })}
              {dragState?.kind === "shot-move" && dragState.moved && dragState.to !== null && (() => {
                const others = shots.filter((s) => s.clip.id !== dragState.id);
                const at = dragState.to < others.length ? others[dragState.to].start : (others[others.length - 1]?.end ?? 0);
                const before = shots.find((s) => s.clip.id === dragState.id);
                const shift = before && before.start < at ? clipLength(before.clip) : 0;
                return <span className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 rounded bg-blue-500" style={{ left: x(at - shift) }} />;
              })()}
              {dropAt !== null && (() => {
                const at = shots.find((s) => dropAt < (s.start + s.end) / 2)?.start ?? shots[shots.length - 1]?.end ?? 0;
                return <span className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 rounded bg-blue-500" style={{ left: x(at) }} />;
              })()}
              {shots.length === 0 && <span className="absolute inset-y-0 left-3 flex items-center text-xs text-neutral-500">No shots yet: generate one from the left, or drop a clip or photo here.</span>}
            </div>

            <AudioLane tracks={music} kind="music" duration={duration} x={x} scale={scale} onBegin={begin} timeAt={timeAt} />
            <AudioLane tracks={voice} kind="voice" duration={duration} x={x} scale={scale} onBegin={begin} timeAt={timeAt} />

            {/* Snap guide and playhead */}
            {snapLine !== null && <span className="pointer-events-none absolute z-20 w-px bg-amber-500" style={{ left: x(snapLine), top: tracksTop, bottom: 0 }} />}
            <div className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: x(Math.min(duration, playback.time)) }}>
              <span className="absolute top-0 bottom-0 w-px -translate-x-1/2 bg-red-500" />
              <span
                className="pointer-events-auto absolute top-0 h-4 w-3 -translate-x-1/2 cursor-ew-resize rounded-b-[4px] bg-red-500"
                onPointerDown={(e) => {
                  playback.pause();
                  begin({ kind: "scrub" }, e);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What a layer looks like, small: a shape's colour, the logo, a photo; else its kind's icon. */
function LayerMark({ l }: { l: Layer }) {
  const { kit } = useStudio();
  const box = "size-3 shrink-0 rounded-[3px] ring-1 ring-black/10";
  if (l.type === "shape") return <span className={box} style={{ background: l.fill }} />;
  const src = l.type === "image" ? l.src : l.type === "logo" ? (l.src ?? kit?.logo?.src) : undefined;
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn(box, "bg-white", l.type === "logo" ? "object-contain p-px" : "object-cover")} />
    );
  return <span className="flex size-3 shrink-0 items-center justify-center">{TYPE_ICON[l.type]}</span>;
}

function TBtn({ icon, label, kbd, onClick, disabled }: { icon: ReactNode; label: string; kbd?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={kbd ? `${label} (${kbd})` : label} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 [&_svg]:size-4">
      {icon}
      {label}
    </button>
  );
}

function AudioLane({ tracks, kind, duration, x, scale, onBegin, timeAt }: { tracks: AudioClip[]; kind: "music" | "voice"; duration: number; x: (t: number) => number; scale: number; onBegin: (d: Drag, e: ReactPointerEvent) => void; timeAt: (clientX: number) => number }) {
  const { selection, select, playback, assets } = useStudio();
  return (
    <div className="relative border-b border-black/[0.04]" style={{ height: AUDIO_H }} onPointerDown={(e) => (select({ kind: "none" }), playback.seek(timeAt(e.clientX)))}>
      {tracks.map((a) => {
        const active = selection.kind === "audio" && selection.id === a.id;
        const shown = Math.max(0, Math.min(a.duration, duration - a.start));
        const over = a.duration - shown;
        const source = assets.find((x) => x.url === a.src)?.duration ?? a.duration;
        return (
          <div
            key={a.id}
            onPointerDown={(e) => {
              select({ kind: "audio", id: a.id });
              onBegin({ kind: "audio", id: a.id, mode: "move", x0: e.clientX, s0: a.start, d0: a.duration, max: source }, e);
            }}
            title={(a.kind === "voice" ? a.text : a.prompt) + (over > 0.05 ? `\n\nRuns ${over.toFixed(1)}s past the end; the export cuts it there.` : "")}
            className={cn("group absolute top-1.5 bottom-1.5 cursor-grab overflow-hidden rounded-md ring-1 active:cursor-grabbing", kind === "music" ? "bg-emerald-50 ring-emerald-200" : "bg-sky-50 ring-sky-200", active && "ring-2 ring-blue-500", a.status === "failed" && "bg-red-50 ring-red-200")}
            style={{ left: x(Math.min(a.start, duration)), width: Math.max(16, shown * scale) }}
          >
            <Wave src={a.src} width={Math.max(16, shown * scale)} from={0} to={Math.min(1, shown / Math.max(0.1, source))} color={kind === "music" ? "bg-emerald-500/60" : "bg-sky-500/60"} pending={a.status === "pending"} />
            <span className="absolute top-0.5 left-1.5 flex items-center gap-1 text-[10px] font-medium text-neutral-700 [&_svg]:size-3">
              {a.status === "pending" ? <Loader2 className="animate-spin" /> : kind === "music" ? <Music /> : <Mic />}
              <span className="max-w-48 truncate">{kind === "voice" ? a.text : a.prompt}</span>
              <span className="text-neutral-400 tabular-nums">{Math.round(a.volume * 100)}%</span>
            </span>
            <span onPointerDown={(e) => (select({ kind: "audio", id: a.id }), onBegin({ kind: "audio", id: a.id, mode: "end", x0: e.clientX, s0: a.start, d0: a.duration, max: Math.min(source, duration - a.start + 0.01) }, e))} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/10" title="Trim the end" />
          </div>
        );
      })}
      {tracks.length === 0 && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => select({ kind: "audio", id: kind === "music" ? "new:music" : "new:voice" })} className="absolute inset-y-1.5 left-1.5 flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-2.5 text-[11px] text-neutral-500 hover:border-neutral-400 hover:text-neutral-800 [&_svg]:size-3">
          <Plus /> {kind === "music" ? "Add music" : "Add a voiceover"}
        </button>
      )}
    </div>
  );
}

function Wave({ src, width, from, to, color, pending }: { src?: string; width: number; from: number; to: number; color: string; pending?: boolean }) {
  const peaks = useWaveform(pending ? undefined : src);
  const n = Math.max(4, Math.floor(width / 3));
  const shape = peaks ? bars(peaks, n, from, to) : Array.from({ length: n }, () => 0.2);
  return (
    <div className="absolute inset-x-1 bottom-1 top-4 flex items-center gap-px">
      {shape.map((p, i) => (
        <span key={i} className={cn("flex-1 rounded-full", color)} style={{ height: `${Math.max(10, p * 100)}%` }} />
      ))}
    </div>
  );
}

