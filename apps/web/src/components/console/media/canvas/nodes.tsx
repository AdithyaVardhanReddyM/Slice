"use client";

// What each node on the canvas shows: a poster or video drawn by the shared
// Stage (so it looks as it exports), a generated image with its brand check,
// a clip that plays on hover, a music track with its waveform, and the
// placeholder a generation holds while it runs (gen-field.tsx), which the new
// file grows out of when it lands. Badges are counter-scaled so they read the
// same at any zoom.

import { AlertTriangle, Film, Loader2, Music, Pause, Play, ShieldAlert, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { docDuration, isDesignJob, type MediaDoc, type MediaKit } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { FixedStage, usePlayback } from "../stage";
import { bars, useWaveform } from "../focus/waveform";
import { GenField, designPhase, jobSeconds, phaseAt, progressAt, revealStyle, seedAt, type FieldTone } from "../gen-field";
import { useCanvas } from "./context";
import type { BoardNode } from "./model";

const FRAME = "size-full overflow-hidden rounded-[4px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-14px_rgba(0,0,0,0.28)]";

/** A badge pinned to a node corner, the same size on screen at any zoom. */
export function Pin({ zoom, at, children, className }: { zoom: number; at: "tl" | "tr" | "bl" | "br" | "c"; children: ReactNode; className?: string }) {
  const s = 1 / zoom;
  const pos = { tl: { left: 0, top: 0 }, tr: { right: 0, top: 0 }, bl: { left: 0, bottom: 0 }, br: { right: 0, bottom: 0 }, c: { left: "50%", top: "50%" } }[at];
  const origin = { tl: "0 0", tr: "100% 0", bl: "0 100%", br: "100% 100%", c: "50% 50%" }[at];
  return (
    <div className={cn("pointer-events-none absolute z-10 p-2", className)} style={{ ...pos, transform: `${at === "c" ? "translate(-50%, -50%) " : ""}scale(${s})`, transformOrigin: origin }}>
      {children}
    </div>
  );
}

const chip = "flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm [&_svg]:size-3";

function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export interface NodeViewProps {
  node: BoardNode;
  kit: MediaKit | undefined;
  zoom: number;
  hovered: boolean;
  /** The video node playing inline. */
  playing: boolean;
  onPlay: (on: boolean) => void;
}

export function NodeView(props: NodeViewProps) {
  const { node } = props;
  switch (node.kind) {
    case "poster":
      return <PosterNode {...props} />;
    case "video":
      return <VideoNode {...props} />;
    case "image":
      return <ImageNode {...props} />;
    case "clip":
      return <ClipNode {...props} />;
    case "audio":
      return <AudioNode {...props} />;
    default:
      return <PendingNode {...props} />;
  }
}

function Running({ node, zoom }: { node: BoardNode; zoom: number }) {
  const rendering = node.creative?.status === "rendering";
  if (!node.running && !rendering) return null;
  return (
    <Pin zoom={zoom} at="tr">
      <span className={chip}>
        <Loader2 className="animate-spin" /> {rendering ? "Rendering" : `${node.running} generating`}
      </span>
    </Pin>
  );
}

function PosterNode({ node, kit, zoom }: NodeViewProps) {
  const doc = node.creative!.doc as MediaDoc;
  const reveal = useReveal(node, zoom);
  return (
    <div className={cn(FRAME, "relative", reveal.on && "bg-[#fffbf3]")}>
      {reveal.field}
      <div {...reveal.media}>
        <FixedStage doc={doc} kit={kit} width={node.w} stillOnly settled showPending={false} />
      </div>
      <Running node={node} zoom={zoom} />
    </div>
  );
}

function VideoNode({ node, kit, zoom, hovered, playing, onPlay }: NodeViewProps) {
  const doc = node.creative!.doc as MediaDoc;
  const big = node.w * zoom > 140;
  const reveal = useReveal(node, zoom, "dark");
  return (
    <div className={cn(FRAME, "relative", reveal.on ? "bg-[#17130f]" : "bg-neutral-900")}>
      {reveal.field}
      <div {...reveal.media}>
        {playing ? <PlayingStage doc={doc} kit={kit} width={node.w} onEnd={() => onPlay(false)} /> : <FixedStage doc={doc} kit={kit} width={node.w} stillOnly frameAt={coverTime(doc)} showPending={false} />}
      </div>
      {big && (
        <Pin zoom={zoom} at="bl">
          <span className={chip}>
            <Film /> {Math.round(docDuration(doc))}s
          </span>
        </Pin>
      )}
      <Running node={node} zoom={zoom} />
      {big && (hovered || playing) && (
        <Pin zoom={zoom} at="br" className="pointer-events-auto">
          <button
            type="button"
            data-board-ui
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause" : "Play here"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPlay(!playing)}
            className={cn("flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/75", playing && !hovered && "opacity-0")}
          >
            {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
          </button>
        </Pin>
      )}
    </div>
  );
}

/** The frame a video shows on the canvas: its hook, once the opening text has settled. */
export const coverTime = (doc: MediaDoc) => Math.min(1.6, docDuration(doc) * 0.2);

function PlayingStage({ doc, kit, width, onEnd }: { doc: MediaDoc; kit: MediaKit | undefined; width: number; onEnd: () => void }) {
  const duration = docDuration(doc);
  const pb = usePlayback(duration);
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      pb.play();
    }
  });
  // usePlayback loops; one pass is enough on the canvas.
  const last = useRef(0);
  useEffect(() => {
    if (pb.time < last.current - 0.5) onEnd();
    last.current = pb.time;
  }, [pb.time, onEnd]);
  return (
    <div className="relative">
      <FixedStage doc={doc} kit={kit} width={width} time={pb.time} playing={pb.playing} showPending={false} />
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
        <div className="h-full bg-white" style={{ width: `${(pb.time / Math.max(0.1, duration)) * 100}%` }} />
      </div>
    </div>
  );
}

export function CheckBadge({ review, compact }: { review: unknown; compact?: boolean }) {
  const r = review as { score?: number; total?: number; passed?: boolean; notes?: string[] } | undefined;
  if (!r || !r.total) return null;
  const title = r.passed ? `On brand: ${r.score} of ${r.total} guideline checks pass` : `Off brand in places (${r.score}/${r.total}): ${(r.notes ?? []).join("; ")}`;
  return (
    <span title={title} className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm [&_svg]:size-3", r.passed ? "bg-white/90 text-emerald-700" : "bg-white/90 text-amber-700")}>
      {r.passed ? <ShieldCheck /> : <ShieldAlert />}
      {!compact && (r.passed ? "On brand" : `${r.score}/${r.total}`)}
    </span>
  );
}

/**
 * A generated file or a new creative that has only just landed grows out of
 * the dots its placeholder showed (a file once it has loaded); the field (same
 * seed, same spot) carries on underneath until it has.
 */
function useReveal(node: BoardNode, zoom: number, tone: FieldTone = "light") {
  const made = node.asset ? (node.asset.source === "generated" ? node.asset.createdAt : 0) : (node.creative?.createdAt ?? 0);
  const [stage, setStage] = useState<"off" | "load" | "run">(() => (Date.now() - made < 20_000 ? (node.asset ? "load" : "run") : "off"));
  const on = stage !== "off";
  return {
    on,
    field: on ? <GenField tone={tone} seed={seedAt(node.x, node.y)} level={1} /> : null,
    media: {
      className: cn("relative", stage === "load" && "opacity-0", stage === "run" && "media-reveal"),
      style: on ? revealStyle(node.w, node.h, zoom) : undefined,
      // Only its own animation: a poster's layers may run theirs.
      onAnimationEnd: (e: AnimationEvent<HTMLElement>) => e.target === e.currentTarget && setStage("off"),
      onError: () => setStage("off"),
    },
    loaded: () => setStage((s) => (s === "load" ? "run" : s)),
  };
}

function ImageNode({ node, zoom }: NodeViewProps) {
  const a = node.asset!;
  const reveal = useReveal(node, zoom);
  return (
    <div className={cn(FRAME, "relative", reveal.on ? "bg-[#fffbf3]" : "bg-neutral-100")}>
      {reveal.field}
      {/* Generated and uploaded files live on Convex storage and brand hosts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.url} alt="" draggable={false} loading="lazy" decoding="async" {...reveal.media} onLoad={reveal.loaded} className={cn("size-full object-cover", reveal.media.className)} />
      {node.w * zoom > 130 && a.review ? (
        <Pin zoom={zoom} at="tl">
          <CheckBadge review={a.review} />
        </Pin>
      ) : null}
    </div>
  );
}

function ClipNode({ node, zoom, hovered }: NodeViewProps) {
  const a = node.asset!;
  const ref = useRef<HTMLVideoElement>(null);
  const [soundOn, setSound] = useState(false);
  // Sound only while the pointer is on it.
  const sound = soundOn && hovered;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hovered) void el.play().catch(() => {});
    else el.pause();
  }, [hovered]);
  const big = node.w * zoom > 130;
  const reveal = useReveal(node, zoom);
  return (
    <div className={cn(FRAME, "relative", reveal.on ? "bg-[#fffbf3]" : "bg-neutral-900")}>
      {reveal.field}
      <video ref={ref} src={a.url} muted={!sound} loop playsInline preload={reveal.on ? "auto" : "metadata"} {...reveal.media} onLoadedData={reveal.loaded} className={cn("size-full object-cover", reveal.media.className)} />
      {big && (
        <Pin zoom={zoom} at="bl">
          <span className={chip}>
            <Film /> {a.duration ? `${Math.round(a.duration)}s` : "Clip"}
          </span>
        </Pin>
      )}
      {big && hovered && (
        <Pin zoom={zoom} at="br" className="pointer-events-auto">
          <button type="button" data-board-ui onPointerDown={(e) => e.stopPropagation()} onClick={() => setSound((s) => !s)} aria-label={sound ? "Mute" : "Sound on"} className="flex size-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/75 [&_svg]:size-3.5">
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
        </Pin>
      )}
    </div>
  );
}

function AudioNode({ node }: NodeViewProps) {
  const a = node.asset!;
  const peaks = useWaveform(a.url);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const dur = a.duration || 30;
  const n = 64;
  return (
    <div className={cn(FRAME, "flex flex-col justify-between bg-white p-4")}>
      <audio ref={ref} src={a.url} preload="none" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-board-ui
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800"
        >
          {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{node.name}</p>
          <p className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex shrink-0 items-center gap-1">
              <Music className="size-3" /> {Math.floor(dur / 60)}:{String(Math.round(dur % 60)).padStart(2, "0")}
            </span>
            <span className="truncate">{node.meta.split(", ")[0]}</span>
          </p>
        </div>
      </div>
      <div className="flex h-9 items-center gap-[2px]">
        {(peaks ? bars(peaks, n) : Array.from({ length: n }, () => 0.15)).map((p, i) => (
          <span key={i} className={cn("flex-1 rounded-full transition-colors", i / n < t / dur ? "bg-neutral-900" : "bg-neutral-300")} style={{ height: `${Math.max(8, p * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

const PENDING_NOUN: Record<string, string> = { image: "Generating image", video: "Shooting clip", edit: "Editing clip", extend: "Extending clip", music: "Composing music", voice: "Recording voice", design: "Designing", "design-video": "Planning the video ad" };

const pill = "block rounded-full bg-white/85 px-2.5 py-1 text-[11px] leading-4 font-medium text-neutral-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] backdrop-blur-md";

function PendingNode({ node, zoom }: NodeViewProps) {
  const { jobs, agent } = useCanvas();
  const j = node.job!;
  const failed = j.status === "failed";
  const now = useNow(!failed);
  if (failed)
    return (
      <div className={cn(FRAME, "relative bg-red-50 ring-1 ring-red-200")}>
        <Pin zoom={zoom} at="c">
          <div className="flex w-56 flex-col items-center gap-1.5 text-center">
            <AlertTriangle className="size-5 text-red-600" />
            <p className="text-sm font-medium text-red-700">Generation failed</p>
            <p className="line-clamp-3 text-xs text-red-700/80">{j.error || "The model returned nothing."}</p>
          </div>
        </Pin>
      </div>
    );
  const expected = jobSeconds(j, jobs);
  // A design says what the agent is really doing, while this window runs its turn.
  const design = isDesignJob(j.kind);
  const phase = (design && agent.busy && agent.live && designPhase(agent.live.steps)) || phaseAt(j, expected, now);
  const dark = j.kind === "design-video";
  const big = node.w * zoom > 150;
  return (
    <div className={cn(FRAME, "relative", dark ? "bg-[#17130f]" : "bg-[#fffbf3]")} title={[PENDING_NOUN[j.kind] ?? "Generating", node.meta].filter(Boolean).join(" with ")}>
      <GenField tone={dark ? "dark" : "light"} seed={seedAt(node.x, node.y)} startedAt={j.createdAt} expected={expected} />
      {big && (
        <>
          <Pin zoom={zoom} at="bl">
            <span key={phase} className={cn(pill, "duration-500 animate-in fade-in-0 slide-in-from-bottom-1")}>
              <span className="pg-shimmer">{phase}</span>
            </span>
          </Pin>
          <Pin zoom={zoom} at="br">
            <span className={cn(pill, "tabular-nums")}>{Math.round(progressAt(j.createdAt, expected, now) * 100)}%</span>
          </Pin>
        </>
      )}
    </div>
  );
}
