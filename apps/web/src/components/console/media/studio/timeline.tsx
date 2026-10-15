"use client";

// The video timeline under the canvas: transport, a ruler to scrub, the shots
// in order (click one to work on it), the music and voice tracks, and a bar
// per layer whose ends drag to set when it shows.

import { AlertTriangle, Loader2, Mic, Music, Pause, Play, Plus, Volume2, VolumeX } from "lucide-react";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { docDuration, timeline, type AudioClip, type Layer } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { useStudio } from "./context";
import { layerLabel } from "./layers";

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const LABEL = "w-20 shrink-0 truncate pr-2 text-[11px] text-muted-foreground";

export function Timeline({ muted, onMuted }: { muted: boolean; onMuted: (m: boolean) => void }) {
  const { doc, playback, selection, select, editor, jobs } = useStudio();
  const lane = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const measure = useCallback((el: HTMLDivElement | null) => {
    lane.current = el;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!doc || doc.kind !== "video") return null;
  const duration = Math.max(0.1, docDuration(doc));
  const pps = width / duration;
  const shots = timeline(doc);
  const music = (doc.audio ?? []).filter((a) => a.kind === "music");
  const voice = (doc.audio ?? []).filter((a) => a.kind === "voice");
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running").length;

  const seekFrom = (e: ReactPointerEvent<HTMLElement>) => {
    const r = lane.current?.getBoundingClientRect();
    if (!r) return;
    playback.seek(((e.clientX - r.left) / r.width) * duration);
  };

  return (
    <div className="shrink-0 border-t bg-white select-none">
      <div className="flex h-10 items-center gap-2 px-3">
        <button type="button" onClick={playback.toggle} className="flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800" aria-label={playback.playing ? "Pause" : "Play"}>
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
        </button>
        <span className="text-xs tabular-nums">
          {fmt(playback.time)} <span className="text-muted-foreground">/ {fmt(duration)}</span>
        </span>
        <button type="button" onClick={() => onMuted(!muted)} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100" aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
        {running > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {running} generating
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">Previews play the draft; Export renders the final file.</span>
      </div>
      <div className="relative px-3 pb-3">
        <div className="flex">
          <span className={LABEL} />
          <div ref={measure} className="relative h-5 flex-1 cursor-ew-resize border-b" onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            playback.pause();
            seekFrom(e);
          }} onPointerMove={(e) => e.buttons === 1 && seekFrom(e)}>
            {width > 0 &&
              Array.from({ length: Math.floor(duration) + 1 }, (_, s) => (
                <span key={s} className="absolute bottom-0 h-1.5 border-l border-neutral-300" style={{ left: s * pps }}>
                  {(s % (duration > 30 ? 5 : duration > 12 ? 2 : 1) === 0) && <span className="absolute -top-3.5 left-0.5 text-[10px] text-muted-foreground tabular-nums">{s}s</span>}
                </span>
              ))}
          </div>
        </div>

        <div className="mt-1.5 flex items-center">
          <span className={LABEL}>Shots</span>
          <div className="relative flex h-12 flex-1">
            {shots.map(({ clip, start, end }, i) => {
              const active = selection.kind === "clip" && selection.id === clip.id;
              const job = jobs.find((j) => j.targetId === clip.id && (j.status === "queued" || j.status === "running"));
              return (
                <button
                  key={clip.id}
                  type="button"
                  title={clip.prompt}
                  onClick={() => {
                    select({ kind: "clip", id: clip.id });
                    playback.seek(start + 0.01);
                  }}
                  className={cn("group absolute top-0 h-full overflow-hidden rounded-md bg-neutral-200 bg-cover bg-center ring-1 ring-black/10 transition-shadow", active && "z-10 ring-2 ring-sky-500")}
                  style={{ left: start * pps + 1, width: Math.max(4, (end - start) * pps - 2), backgroundImage: clip.poster ? `url("${clip.poster.replace(/"/g, "%22")}")` : undefined }}
                >
                  <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[10px] font-medium text-white">
                    {i + 1}
                    {clip.kind === "still" && <span className="opacity-80">· still</span>}
                    {clip.status === "pending" || job ? <Loader2 className="size-3 animate-spin" /> : clip.status === "failed" ? <AlertTriangle className="size-3 text-amber-300" /> : null}
                  </span>
                  <span className="absolute right-1.5 bottom-1 text-[10px] text-white/80 tabular-nums">{(end - start).toFixed(1)}s</span>
                </button>
              );
            })}
            {shots.length === 0 && <span className="flex items-center text-xs text-muted-foreground">No shots yet. Ask in the chat, or add a clip or photo from the library.</span>}
          </div>
        </div>

        <SoundRow label="Music" icon={<Music className="size-3" />} tracks={music} pps={pps} empty="Add music" onEmpty={() => select({ kind: "audio", id: "new:music" })} />
        <SoundRow label="Voice" icon={<Mic className="size-3" />} tracks={voice} pps={pps} empty="Add a voiceover" onEmpty={() => select({ kind: "audio", id: "new:voice" })} />

        {doc.layers.length > 0 && (
          <div className="scrollbar-thin mt-1.5 max-h-28 space-y-1 overflow-y-auto">
            {[...doc.layers].reverse().map((l) => (
              <LayerBar key={l.id} l={l} pps={pps} duration={duration} active={selection.kind === "layers" && selection.ids.includes(l.id)} onSelect={() => select({ kind: "layers", ids: [l.id] })} editor={editor} />
            ))}
          </div>
        )}

        {width > 0 && <span className="pointer-events-none absolute top-0 bottom-3 z-20 w-px bg-red-500" style={{ left: `calc(0.75rem + 5rem + ${Math.min(duration, playback.time) * pps}px)` }} />}
      </div>
    </div>
  );
}

function SoundRow({ label, icon, tracks, pps, empty, onEmpty }: { label: string; icon: ReactNode; tracks: AudioClip[]; pps: number; empty: string; onEmpty: () => void }) {
  const { selection, select } = useStudio();
  return (
    <div className="mt-1.5 flex items-center">
      <span className={LABEL}>{label}</span>
      <div className="relative h-7 flex-1">
        {tracks.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => select({ kind: "audio", id: a.id })}
            title={a.text || a.prompt}
            className={cn(
              "absolute top-0 flex h-full items-center gap-1 overflow-hidden rounded-md px-2 text-[11px] text-white",
              a.kind === "music" ? "bg-violet-500" : "bg-teal-600",
              a.status === "pending" && "opacity-60",
              a.status === "failed" && "bg-destructive",
              selection.kind === "audio" && selection.id === a.id && "ring-2 ring-sky-500 ring-offset-1",
            )}
            style={{ left: a.start * pps, width: Math.max(16, a.duration * pps) }}
          >
            {a.status === "pending" ? <Loader2 className="size-3 shrink-0 animate-spin" /> : icon}
            <span className="truncate">{a.kind === "voice" ? a.text : a.prompt}</span>
          </button>
        ))}
        {tracks.length === 0 && (
          <button type="button" onClick={onEmpty} className="flex h-full w-full items-center gap-1 rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:border-neutral-400 hover:text-foreground">
            <Plus className="size-3" /> {empty}
          </button>
        )}
      </div>
    </div>
  );
}

function LayerBar({ l, pps, duration, active, onSelect, editor }: { l: Layer; pps: number; duration: number; active: boolean; onSelect: () => void; editor: ReturnType<typeof useStudio>["editor"] }) {
  const drag = useRef<{ mode: "start" | "end" | "move"; x0: number; s0: number; e0: number } | null>(null);
  const s = l.start ?? 0;
  const e = l.end ?? duration;
  const down = (mode: "start" | "end" | "move", ev: ReactPointerEvent<HTMLElement>) => {
    ev.stopPropagation();
    if (l.locked) return onSelect();
    onSelect();
    editor.checkpoint();
    drag.current = { mode, x0: ev.clientX, s0: s, e0: e };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const move = (ev: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || !pps) return;
    const dt = Math.round(((ev.clientX - d.x0) / pps) * 10) / 10;
    let start = d.s0;
    let end = d.e0;
    if (d.mode === "start") start = Math.min(d.e0 - 0.3, Math.max(0, d.s0 + dt));
    else if (d.mode === "end") end = Math.max(d.s0 + 0.3, Math.min(duration, d.e0 + dt));
    else {
      const k = Math.max(-d.s0, Math.min(duration - d.e0, dt));
      start = d.s0 + k;
      end = d.e0 + k;
    }
    editor.update((doc) => ({ ...doc, layers: doc.layers.map((x) => (x.id === l.id ? { ...x, start: start > 0.05 ? start : undefined, end: end < duration - 0.05 ? end : undefined } : x)) }), { history: false });
  };
  const up = () => {
    drag.current = null;
  };
  return (
    <div className="flex items-center">
      <span className={cn(LABEL, active && "text-foreground")}>{layerLabel(l)}</span>
      <div className="relative h-5 flex-1">
        <div
          onPointerDown={(ev) => down("move", ev)}
          onPointerMove={move}
          onPointerUp={up}
          className={cn("absolute top-0.5 bottom-0.5 cursor-grab rounded bg-neutral-200 ring-1 ring-black/5 active:cursor-grabbing", active && "bg-sky-200 ring-sky-500", l.hidden && "opacity-40")}
          style={{ left: s * pps, width: Math.max(6, (e - s) * pps) }}
        >
          <span onPointerDown={(ev) => down("start", ev)} onPointerMove={move} onPointerUp={up} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-black/10 hover:bg-sky-500" />
          <span onPointerDown={(ev) => down("end", ev)} onPointerMove={move} onPointerUp={up} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-black/10 hover:bg-sky-500" />
        </div>
      </div>
    </div>
  );
}
