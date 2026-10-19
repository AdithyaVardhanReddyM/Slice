"use client";

// The video editor: a media bin on the left (the library, text styles, new
// shots and sound), the preview in the middle with transport controls (text
// and pictures stay editable on the frame at the playhead), the inspector on
// the right, and the timeline below, which can be pulled taller.

import { Film, Image as ImageIcon, Loader2, Mic, Music, Pause, Play, Plus, Repeat, SkipBack, SkipForward, StepBack, StepForward, Type, Volume2, VolumeX, Clapperboard } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VIDEO_MODELS, docDuration, newId, timeline, type Layer, type MediaBrief, type ShotRole } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usd, usePromptPicks } from "../prompt/options";
import type { DragItem } from "../sidebar/assets";
import { useStudio } from "./context";
import { shotEstimate } from "./costs";
import { useLayerKeys, useStageZoom } from "./hooks";
import { Inspector } from "./inspector";
import { newLayer } from "./layers";
import { MediaPanel, PanelTitle } from "./panels";
import { PosterCanvas } from "./poster-canvas";
import { Timeline, timecode, timelineHeight } from "./timeline";
import { insertShot, overlayFrom, shotFrom } from "./video-ops";

const BIN = [
  { id: "media", label: "Media", icon: <ImageIcon /> },
  { id: "text", label: "Text", icon: <Type /> },
  { id: "generate", label: "Generate", icon: <Clapperboard /> },
] as const;

export function VideoEditor({ onClose }: { onClose: () => void }) {
  const env = useStudio();
  const { doc, kit, editor, selection, select, playback } = env;
  const [bin, setBin] = useState<(typeof BIN)[number]["id"]>("media");
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(true);
  const [tlHeight, setTlHeight] = useState(() => timelineHeight(doc, typeof window === "undefined" ? 840 : window.innerHeight));
  const box = useRef<HTMLDivElement>(null);
  const { scale } = useStageZoom(box, doc.w, doc.h, 28);
  useLayerKeys(env, { onEscape: onClose, video: true });
  const duration = docDuration(doc);
  const selectedLayers = selection.kind === "layers" ? selection.ids.filter((id) => doc.layers.some((l) => l.id === id)) : [];

  // One pass when looping is off.
  const last = useRef(0);
  useEffect(() => {
    if (!loop && playback.playing && playback.time < last.current - 0.5) {
      playback.pause();
      playback.seek(duration);
    }
    last.current = playback.time;
  }, [playback, loop, duration]);

  const addFromBin = (item: DragItem, as: "shot" | "layer" | "music") => {
    if (as === "music") {
      const id = newId("a");
      editor.update((d) => ({ ...d, audio: [...(d.audio ?? []).filter((a) => a.kind !== "music"), { id, kind: "music", src: item.url, start: 0, duration: Math.max(1, Math.min(duration, env.assets.find((a) => a.url === item.url)?.duration ?? duration)), volume: 0.5, status: "ready" }] }));
      select({ kind: "audio", id });
      return;
    }
    if (as === "layer") {
      const l = overlayFrom(doc, item.url, playback.time, item);
      editor.update((d) => ({ ...d, layers: [...d.layers, l] }));
      select({ kind: "layers", ids: [l.id] });
      return;
    }
    const clip = shotFrom({ ...item, duration: env.assets.find((a) => a.url === item.url)?.duration });
    if (!clip) return;
    editor.update((d) => insertShot(d, clip, selection.kind === "clip" ? (timeline(d).find((s) => s.clip.id === selection.id)?.end ?? null) : playback.time));
    select({ kind: "clip", id: clip.id });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Media bin */}
        <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-black/[0.06] py-2">
          {BIN.map((r) => (
            <button key={r.id} type="button" onClick={() => setBin(r.id)} className={cn("flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 [&_svg]:size-5", bin === r.id && "bg-neutral-100 text-neutral-950")}>
              {r.icon}
              {r.label}
            </button>
          ))}
        </nav>
        <aside className="scrollbar-thin w-[272px] shrink-0 overflow-y-auto border-r border-black/[0.06]">
          {bin === "media" && <BinMedia onAdd={addFromBin} />}
          {bin === "text" && <BinText />}
          {bin === "generate" && <BinGenerate />}
        </aside>

        {/* Preview */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#ececea]">
          <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center" onPointerDown={(e) => e.target === e.currentTarget && select({ kind: "none" })}>
            {scale > 0 && <PosterCanvas doc={doc} kit={kit} scale={scale} time={playback.time} playing={playback.playing} muted={muted} selected={selectedLayers} onSelect={(ids) => select(ids.length ? { kind: "layers", ids } : { kind: "none" })} editor={editor} />}
          </div>
          <Transport muted={muted} setMuted={setMuted} loop={loop} setLoop={setLoop} />
        </main>

        <aside className="scrollbar-thin w-[320px] shrink-0 overflow-y-auto border-l border-black/[0.06]">
          <Inspector />
        </aside>
      </div>

      {/* Pull the timeline taller or shorter. */}
      <div
        className="group relative z-10 h-1.5 shrink-0 cursor-row-resize bg-transparent"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const y0 = e.clientY;
          const h0 = tlHeight;
          const move = (ev: PointerEvent) => setTlHeight(Math.min(Math.round(window.innerHeight * 0.62), Math.max(170, h0 - (ev.clientY - y0))));
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover:bg-blue-500" />
      </div>
      <Timeline height={tlHeight} />
    </div>
  );
}

function Transport({ muted, setMuted, loop, setLoop }: { muted: boolean; setMuted: (m: boolean) => void; loop: boolean; setLoop: (l: boolean) => void }) {
  const { doc, playback, jobs } = useStudio();
  const duration = docDuration(doc);
  const shots = timeline(doc);
  const prev = () => {
    const before = shots.filter((s) => s.start < playback.time - 0.05).pop();
    playback.seek(before?.start ?? 0);
  };
  const next = () => playback.seek(shots.find((s) => s.start > playback.time + 0.05)?.start ?? duration);
  const b = "flex size-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:size-4";
  const pending = (doc.video ?? []).filter((c) => c.status === "pending").length + jobs.filter((j) => (j.status === "queued" || j.status === "running") && (j.kind === "music" || j.kind === "voice")).length;
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-t border-black/[0.06] bg-white px-4">
      <div className="flex w-56 items-baseline gap-1.5 font-mono text-[13px] tabular-nums">
        <span className="font-semibold text-neutral-950">{timecode(playback.time)}</span>
        <span className="text-neutral-400">/ {timecode(duration)}</span>
      </div>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <button type="button" className={b} onClick={() => playback.seek(0)} title="To the start (Home)">
          <SkipBack />
        </button>
        <button type="button" className={b} onClick={prev} title="Previous shot">
          <StepBack />
        </button>
        <button type="button" onClick={playback.toggle} className="mx-1 flex size-10 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800" aria-label={playback.playing ? "Pause" : "Play"} title="Play / pause (Space)">
          {playback.playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <button type="button" className={b} onClick={next} title="Next shot">
          <StepForward />
        </button>
        <button type="button" className={b} onClick={() => playback.seek(duration)} title="To the end (End)">
          <SkipForward />
        </button>
      </div>
      <div className="flex w-56 items-center justify-end gap-1">
        {pending > 0 && (
          <span className="mr-1 flex items-center gap-1.5 text-xs text-neutral-500">
            <Loader2 className="size-3.5 animate-spin" /> {pending} generating
          </span>
        )}
        <button type="button" className={cn(b, loop && "bg-neutral-100 text-neutral-950")} aria-pressed={loop} onClick={() => setLoop(!loop)} title="Loop">
          <Repeat />
        </button>
        <button type="button" className={b} onClick={() => setMuted(!muted)} title={muted ? "Sound on" : "Mute"}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </div>
    </div>
  );
}

function BinMedia({ onAdd }: { onAdd: (item: DragItem, as: "shot" | "layer" | "music") => void }) {
  const [pick, setPick] = useState<DragItem | null>(null);
  return (
    <>
      <MediaPanel accept={["image", "video", "audio"]} onPick={setPick} />
      {pick && (
        <div className="sticky bottom-0 space-y-2 border-t bg-white p-3">
          <p className="truncate text-xs font-medium">{pick.name || (pick.kind === "audio" ? "Track" : pick.kind === "video" ? "Clip" : "Picture")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {pick.kind !== "audio" && (
              <Button size="sm" variant="outline" onClick={() => (onAdd(pick, "shot"), setPick(null))}>
                <Film /> As a shot
              </Button>
            )}
            {pick.kind === "image" && (
              <Button size="sm" variant="outline" onClick={() => (onAdd(pick, "layer"), setPick(null))}>
                <ImageIcon /> On top
              </Button>
            )}
            {pick.kind === "audio" && (
              <Button size="sm" variant="outline" className="col-span-2" onClick={() => (onAdd(pick, "music"), setPick(null))}>
                <Music /> Use as the music
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Or drag it onto the timeline or the frame.</p>
        </div>
      )}
    </>
  );
}

const TEXT_STYLES: { label: string; kind: "headline" | "subhead" | "body" | "cta"; patch?: Partial<Layer>; sample: (f: { heading: string; body: string }) => ReactNode }[] = [
  { label: "Title", kind: "headline", sample: (f) => <span className="text-2xl font-bold" style={{ fontFamily: f.heading }}>Title</span> },
  { label: "Subtitle", kind: "subhead", sample: (f) => <span className="text-base font-medium" style={{ fontFamily: f.body }}>A line that sells it</span> },
  { label: "Caption", kind: "body", patch: { bg: "rgba(0,0,0,0.55)", color: "#ffffff", padX: 28, padY: 14, radius: 12, valign: "middle" }, sample: (f) => <span className="rounded bg-black/60 px-2 py-1 text-xs text-white" style={{ fontFamily: f.body }}>What they say, for muted feeds</span> },
  { label: "Button", kind: "cta", sample: (f) => <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white" style={{ fontFamily: f.body }}>Shop now</span> },
];

function BinText() {
  const { doc, kit, campaign, editor, select, playback } = useStudio();
  const duration = docDuration(doc);
  const fonts = { heading: kit?.fonts.heading.family ?? "inherit", body: kit?.fonts.body.family ?? "inherit" };
  const add = (s: (typeof TEXT_STYLES)[number]) => {
    const l = newLayer(s.kind, doc, kit, campaign.brief as MediaBrief | undefined);
    if (!l) return;
    const start = Math.min(Math.max(0, playback.time), Math.max(0, duration - 1));
    const layer = { ...l, ...s.patch, ...(s.kind === "body" && s.patch ? { y: Math.round(doc.h * 0.72), text: "Your caption here" } : {}), start, end: Math.min(duration, start + 3), anim: s.kind === "cta" ? "pop" : "rise" } as Layer;
    editor.update((d) => ({ ...d, layers: [...d.layers, layer] }));
    select({ kind: "layers", ids: [layer.id] });
  };
  return (
    <div className="pb-6">
      <PanelTitle>Text</PanelTitle>
      <div className="space-y-2 px-4">
        {TEXT_STYLES.map((s) => (
          <button key={s.label} type="button" onClick={() => add(s)} className="flex h-14 w-full items-center rounded-lg bg-neutral-50 px-3 text-left ring-1 ring-black/[0.05] hover:bg-neutral-100">
            {s.sample(fonts)}
          </button>
        ))}
        <p className="text-[11px] leading-4 text-muted-foreground">Added at the playhead for 3 seconds. Pull its ends on the timeline to change when it shows.</p>
      </div>
    </div>
  );
}

const ROLES: { value: ShotRole; label: string }[] = [
  { value: "hero", label: "Hero (the opening)" },
  { value: "product", label: "Product close-up" },
  { value: "broll", label: "B-roll (mood)" },
  { value: "talent", label: "Person on camera" },
];

function BinGenerate() {
  const { creative, campaign, act, pending, select, selection } = useStudio();
  const [picks] = usePromptPicks();
  const [kind, setKind] = useState<"motion" | "still">("motion");
  const [role, setRole] = useState<ShotRole>("broll");
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(4);
  const [model, setModel] = useState(picks.videoModel);
  const est = shotEstimate(campaign.tier, { kind, role: kind === "still" ? "still" : role, in: 0, out: seconds }, kind === "motion" ? model : "auto");
  const after = selection.kind === "clip" ? selection.id : "";
  return (
    <div className="space-y-6 pb-6">
      <div>
        <PanelTitle>New shot</PanelTitle>
        <div className="space-y-2.5 px-4">
          <div className="flex rounded-lg bg-neutral-100 p-0.5">
            {(["motion", "still"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("h-7 flex-1 rounded-md text-xs font-medium text-neutral-600", kind === k && "bg-white text-neutral-950 shadow-sm")}>
                {k === "motion" ? "Video" : "Still (cheap)"}
              </button>
            ))}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What happens: subject, action, camera move, light" className="w-full resize-none rounded-lg bg-neutral-50 px-2.5 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
          {kind === "motion" && (
            <>
              <select value={role} onChange={(e) => setRole(e.target.value as ShotRole)} className="h-8 w-full rounded-md bg-neutral-50 px-2 text-xs ring-1 ring-black/[0.08] outline-none">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 w-full rounded-md bg-neutral-50 px-2 text-xs ring-1 ring-black/[0.08] outline-none">
                {VIDEO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({usd(m.perSecond)}/s)
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="flex rounded-md bg-neutral-100 p-0.5">
              {[2, 3, 4, 6, 8].map((s) => (
                <button key={s} type="button" onClick={() => setSeconds(s)} className={cn("h-7 w-8 rounded-[5px] text-xs font-medium text-neutral-600", seconds === s && "bg-white text-neutral-950 shadow-sm")}>
                  {s}s
                </button>
              ))}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">≈ {usd(est.usd)}</span>
          </div>
          <Button
            className="w-full"
            disabled={!prompt.trim() || pending.includes("add")}
            onClick={() =>
              void act("add_shots", { creative_id: creative._id, after, shots: [{ kind, role: kind === "still" ? "still" : role, prompt: prompt.trim(), seconds, transition: "cut", quality: kind === "motion" ? model : "auto" }] }, "add").then((ok) => ok && setPrompt(""))
            }
          >
            {pending.includes("add") ? <Loader2 className="animate-spin" /> : <Plus />} Add {after ? "after the selected shot" : "at the end"}
          </Button>
        </div>
      </div>
      <div>
        <PanelTitle>Sound</PanelTitle>
        <div className="grid gap-2 px-4">
          <button type="button" onClick={() => select({ kind: "audio", id: "new:music" })} className="flex items-center gap-3 rounded-lg bg-neutral-50 p-3 text-left ring-1 ring-black/[0.05] hover:bg-neutral-100">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Music className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Music</span>
              <span className="block text-xs text-muted-foreground">Lyria, fitted to the cut</span>
            </span>
          </button>
          <button type="button" onClick={() => select({ kind: "audio", id: "new:voice" })} className="flex items-center gap-3 rounded-lg bg-neutral-50 p-3 text-left ring-1 ring-black/[0.05] hover:bg-neutral-100">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <Mic className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">Voiceover</span>
              <span className="block text-xs text-muted-foreground">Gemini TTS, in the brand&apos;s voice</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
