"use client";

// Focus mode: one thing from the canvas, full screen, with every control it
// has. Posters open in a Canva-style editor, videos in the timeline editor,
// and images, clips and music in a viewer with their AI edits. "Ask Slice" in
// the top bar edits what is open (and what is selected in it) without leaving.

import { useMutation } from "convex/react";
import {
  ArrowLeft,
  ArrowUp,
  Clapperboard,
  Download,
  FastForward,
  History as HistoryIcon,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  Music,
  Pause,
  Play,
  Redo2,
  Shapes,
  Square,
  Undo2,
  MessageSquareText,
  PenLine,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import { IMAGE_MODELS, MUSIC_MODELS, VIDEO_MODELS, creativeName, docDuration, imageModel, modelLabel, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCanvas } from "../canvas/context";
import type { BoardNode } from "../canvas/model";
import { CheckBadge } from "../canvas/nodes";
import { WhyButton } from "../canvas/why";
import { usd, usePromptPicks } from "../prompt/options";
import { usePlayback } from "../stage";
import { FocusContext, useStudio, type FocusEnv, type Selection } from "./context";
import { ContextBar } from "./context-bar";
import { Inspector } from "./inspector";
import { ElementsPanel, HistoryPanel, LayersPanel, MediaPanel } from "./panels";
import { PosterCanvas } from "./poster-canvas";
import { useCreativeDoc } from "./use-doc";
import { VideoEditor } from "./video-editor";
import { useLayerKeys, useStageZoom, ZoomPill } from "./hooks";
import { bars, useWaveform } from "./waveform";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']");

export function FocusEditor({ node, onClose }: { node: BoardNode; onClose: () => void }) {
  if (node.creative) return node.kind === "video" ? <CreativeFocus key={node.key} creative={node.creative} node={node} onClose={onClose} video /> : <CreativeFocus key={node.key} creative={node.creative} node={node} onClose={onClose} />;
  if (node.asset) return <AssetFocus key={node.key} node={node} onClose={onClose} />;
  return null;
}

/* Shell ------------------------------------------------------------------------------ */

export function FocusShell({ title, meta, onClose, left, center, right, children }: { title: ReactNode; meta?: ReactNode; onClose: () => void; left?: ReactNode; center?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white duration-200 animate-in fade-in-0 zoom-in-[0.985]" role="dialog" aria-modal="true" aria-label="Editor">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] px-2.5">
        <button type="button" onClick={onClose} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950" title="Back to the canvas (Esc)">
          <ArrowLeft className="size-4" /> Canvas
        </button>
        <span className="text-neutral-300">/</span>
        <div className="flex min-w-0 items-center gap-2">
          {title}
          {meta && <span className="shrink-0 text-xs text-neutral-400">{meta}</span>}
        </div>
        {left}
        <div className="flex min-w-0 flex-1 justify-center px-4">{center}</div>
        <div className="flex shrink-0 items-center gap-1">{right}</div>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}

function NameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      value={draft ?? value}
      aria-label="Name"
      onFocus={(e) => {
        setDraft(value);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft?.trim() && draft.trim() !== value) onSave(draft.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="h-8 w-56 min-w-0 truncate rounded-lg px-2 text-[13px] font-semibold outline-none hover:bg-neutral-50 focus:ring-2 focus:ring-blue-500/40"
    />
  );
}

/** Ask the agent to change what is open; it edits the same doc, live. */
function AskBar({ selection, creative, time, inputRef }: { selection: Selection; creative: Doc<"mediaCreatives">; time: number; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { agent, notify } = useCanvas();
  const [text, setText] = useState("");
  const live = agent.live;
  const busy = agent.busy;
  const target = selection.kind === "layers" ? `${selection.ids.length} selected` : selection.kind === "clip" ? "this shot" : selection.kind === "audio" ? "this track" : null;
  const lastText = useRef<string | null>(null);
  useEffect(() => {
    if (live && live.status === null && !live.error && live.text && live.text !== lastText.current) {
      lastText.current = live.text;
      notify(live.text.slice(0, 220));
    }
    if (live?.error) notify(live.error, "bad");
  }, [live, notify]);
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    void agent.send(t, [], { creativeId: creative._id, ...(selection.kind === "layers" ? { layerIds: selection.ids } : {}), ...(selection.kind === "clip" ? { clipId: selection.id } : {}), ...((creative.doc as MediaDoc).kind === "video" ? { time: Math.round(time * 10) / 10 } : {}) });
    setText("");
  };
  return (
    <div className="flex h-9 w-full max-w-[34rem] items-center gap-2 rounded-full bg-neutral-100/80 pr-1 pl-3.5 ring-1 ring-transparent focus-within:bg-white focus-within:ring-blue-500/40">
      <MessageSquareText className="size-4 shrink-0 text-neutral-400" />
      {busy ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] text-neutral-600">
          <Loader2 className="size-3.5 shrink-0 animate-spin" /> {live?.status || "Working"}
        </span>
      ) : (
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") send();
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          placeholder={target ? `Ask Slice to change ${target}` : "Ask Slice to change anything here"}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-400"
        />
      )}
      {target && !busy && <span className="shrink-0 rounded-md bg-blue-600/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">{target}</span>}
      {busy ? (
        <button type="button" onClick={agent.stop} aria-label="Stop" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
          <Square className="size-3 fill-current" />
        </button>
      ) : (
        <button type="button" onClick={send} disabled={!text.trim()} aria-label="Send" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:bg-transparent disabled:text-neutral-300">
          <ArrowUp className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* Creatives -------------------------------------------------------------------------- */

function useFocusEnv(creative: Doc<"mediaCreatives">, askRef: React.RefObject<HTMLInputElement | null>) {
  const canvas = useCanvas();
  const editor = useCreativeDoc(creative);
  const doc = editor.doc as MediaDoc;
  const playback = usePlayback(doc.kind === "video" ? docDuration(doc) : 0);
  const [selection, select] = useState<Selection>({ kind: "none" });
  const env: FocusEnv = {
    campaignId: canvas.campaignId,
    campaign: canvas.campaign,
    kit: canvas.kit,
    creatives: canvas.creatives,
    assets: canvas.assets,
    jobs: canvas.jobs,
    creative,
    doc,
    editor,
    selection,
    select,
    playback,
    act: async (action, args, label) => {
      await editor.flush();
      return canvas.act(action, args, label);
    },
    pending: canvas.pending,
    ask: () => {
      askRef.current?.focus();
    },
  };
  return env;
}

function SaveState({ editor, version }: { editor: ReturnType<typeof useCreativeDoc>; version: number }) {
  return <span className={cn("hidden text-xs lg:inline", editor.error ? "text-destructive" : "text-neutral-400")}>{editor.error ? `Not saved: ${editor.error}` : editor.saving || editor.dirty ? "Saving…" : `Saved as v${version}`}</span>;
}

const RAIL = [
  { id: "elements", label: "Elements", icon: <Shapes /> },
  { id: "media", label: "Media", icon: <ImageIcon /> },
  { id: "layers", label: "Layers", icon: <Layers /> },
  { id: "history", label: "History", icon: <HistoryIcon /> },
] as const;

function CreativeFocus({ creative, node, onClose, video }: { creative: Doc<"mediaCreatives">; node: BoardNode; onClose: () => void; video?: boolean }) {
  const { download } = useCanvas();
  const rename = useMutation(api.media.renameCreative);
  const askRef = useRef<HTMLInputElement>(null);
  const env = useFocusEnv(creative, askRef);
  const [downloading, setDownloading] = useState(false);
  const close = useCallback(() => {
    void env.editor.flush();
    onClose();
  }, [env.editor, onClose]);

  const shell = (children: ReactNode) => (
    <FocusShell
      title={<NameInput value={creativeName(creative.name)} onSave={(name) => void rename({ id: creative._id, name })} />}
      meta={node.meta}
      onClose={close}
      left={
        <div className="ml-2 flex items-center gap-0.5">
          <button type="button" title="Undo (⌘Z)" disabled={!env.editor.canUndo} onClick={env.editor.undo} className="flex size-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-35">
            <Undo2 className="size-4" />
          </button>
          <button type="button" title="Redo (⇧⌘Z)" disabled={!env.editor.canRedo} onClick={env.editor.redo} className="flex size-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-35">
            <Redo2 className="size-4" />
          </button>
          <SaveState editor={env.editor} version={creative.version} />
        </div>
      }
      center={<AskBar selection={env.selection} creative={creative} time={env.playback.time} inputRef={askRef} />}
      right={
        <>
          <WhyButton creative={creative} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 data-popup-open:bg-neutral-100 [&_svg]:size-4" />
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            disabled={downloading || creative.status === "rendering"}
            onClick={async () => {
              setDownloading(true);
              try {
                await env.editor.flush();
                await download(node);
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading || creative.status === "rendering" ? <Loader2 className="animate-spin" /> : <Download />}
            {video ? "Export MP4" : "Download"}
          </Button>
        </>
      }
    >
      {children}
    </FocusShell>
  );

  return <FocusContext.Provider value={env}>{shell(video ? <VideoEditor onClose={close} /> : <PosterEditor onClose={close} />)}</FocusContext.Provider>;
}

function PosterEditor({ onClose }: { onClose: () => void }) {
  const env = useStudio();
  const { doc, kit, editor, selection, select } = env;
  const [panel, setPanel] = useState<(typeof RAIL)[number]["id"] | null>("elements");
  const box = useRef<HTMLDivElement>(null);
  const { scale, setZoom } = useStageZoom(box, doc.w, doc.h);
  useLayerKeys(env, { onEscape: onClose });
  const selectedLayers = selection.kind === "layers" ? selection.ids.filter((id) => doc.layers.some((l) => l.id === id)) : [];

  return (
    <>
      <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-black/[0.06] py-2">
        {RAIL.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setPanel((p) => (p === r.id ? null : r.id))}
            className={cn("flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 [&_svg]:size-5", panel === r.id && "bg-neutral-100 text-neutral-950")}
          >
            {r.icon}
            {r.label}
          </button>
        ))}
      </nav>
      {panel && (
        <aside className="scrollbar-thin w-[280px] shrink-0 overflow-y-auto border-r border-black/[0.06]">
          {panel === "elements" && <ElementsPanel />}
          {panel === "media" && <MediaPanel />}
          {panel === "layers" && <LayersPanel />}
          {panel === "history" && <HistoryPanel />}
        </aside>
      )}
      <main className="relative flex min-w-0 flex-1 flex-col bg-[#f4f4f3]">
        <ContextBar />
        <div ref={box} className="relative min-h-0 flex-1 overflow-auto" onPointerDown={(e) => e.target === e.currentTarget && select({ kind: "none" })}>
          {scale > 0 && (
            <div className="flex min-h-full min-w-full items-center justify-center p-16" onPointerDown={(e) => e.target === e.currentTarget && select({ kind: "none" })}>
              <PosterCanvas doc={doc} kit={kit} scale={scale} selected={selectedLayers} onSelect={(ids) => select(ids.length ? { kind: "layers", ids } : { kind: "none" })} editor={editor} />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute right-4 bottom-4">
          <div className="pointer-events-auto">
            <ZoomPill scale={scale} onZoom={(z) => setZoom(Math.min(4, Math.max(0.05, z)))} onFit={() => setZoom(null)} />
          </div>
        </div>
      </main>
      <aside className="scrollbar-thin w-[300px] shrink-0 overflow-y-auto border-l border-black/[0.06]">
        <Inspector />
      </aside>
    </>
  );
}

/* Assets: images, clips, music -------------------------------------------------------- */

const IMAGE_EDITS = ["Warmer, golden-hour light", "Make it evening, candlelit", "Remove the people", "A cleaner, simpler background", "Closer crop on the subject"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function AssetFocus({ node, onClose }: { node: BoardNode; onClose: () => void }) {
  const { act, pending, download, sendPrompt, remove } = useCanvas();
  const [picks] = usePromptPicks();
  const a = node.asset!;
  const [instruction, setInstruction] = useState("");
  const [motion, setMotion] = useState("");
  const [videoId, setVideoId] = useState(picks.videoModel);
  const [imageId, setImageId] = useState(IMAGE_MODELS.some((m) => m.id === a.model) ? a.model! : picks.imageModel);
  const [musicPrompt, setMusicPrompt] = useState(a.prompt ?? "");
  const [musicId, setMusicId] = useState(MUSIC_MODELS.some((m) => m.id === a.model) ? a.model! : picks.musicModel);
  const [extend, setExtend] = useState({ seconds: 6, prompt: "" });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !typing(e.target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const aspect = (() => {
    const r = (a.w ?? 1) / (a.h ?? 1);
    return r < 0.7 ? "9:16" : r < 0.9 ? "4:5" : r < 1.2 ? "1:1" : "16:9";
  })();
  const busy = (k: string) => pending.includes(`${k}:${a._id}`);
  const vm = VIDEO_MODELS.find((m) => m.id === videoId) ?? VIDEO_MODELS[1];

  return (
    <FocusShell
      title={<span className="max-w-72 truncate text-[13px] font-semibold">{node.name}</span>}
      meta={node.meta}
      onClose={onClose}
      right={
        <>
          <Button variant="ghost" size="sm" className="h-8 rounded-lg text-neutral-600" onClick={() => (remove([node.key]), onClose())}>
            <X /> Take off canvas
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                await download(node);
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />} Download
          </Button>
        </>
      }
    >
      <main className="relative flex min-w-0 flex-1 items-center justify-center bg-[#f4f4f3] p-10">
        {node.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt="" className="max-h-full max-w-full rounded-md object-contain shadow-[0_1px_3px_rgba(0,0,0,0.08),0_20px_50px_-20px_rgba(0,0,0,0.3)]" />
        )}
        {node.kind === "clip" && <video src={a.url} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-md bg-black shadow-xl" />}
        {node.kind === "audio" && <AudioPlayer url={a.url} duration={a.duration ?? 30} name={node.name} />}
      </main>
      <aside className="scrollbar-thin w-[360px] shrink-0 space-y-6 overflow-y-auto border-l border-black/[0.06] p-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Details</h3>
            {a.review ? <CheckBadge review={a.review} /> : null}
          </div>
          {a.prompt && <p className="text-[13px] leading-relaxed text-neutral-700">{a.prompt}</p>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-neutral-500">Made with</dt>
            <dd className="text-right font-medium">{a.source === "generated" ? modelLabel(a.model) : "Uploaded"}</dd>
            {a.cost !== undefined && (
              <>
                <dt className="text-neutral-500">Cost</dt>
                <dd className="text-right font-medium tabular-nums">{usd(a.cost)}</dd>
              </>
            )}
            {a.w && a.h && (
              <>
                <dt className="text-neutral-500">Size</dt>
                <dd className="text-right font-medium tabular-nums">
                  {a.w}×{a.h}
                </dd>
              </>
            )}
            {a.duration && (
              <>
                <dt className="text-neutral-500">Length</dt>
                <dd className="text-right font-medium tabular-nums">{a.duration.toFixed(1)}s</dd>
              </>
            )}
          </dl>
          {(a.review as { notes?: string[] } | undefined)?.notes?.length ? (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
              {((a.review as { notes: string[] }).notes ?? []).map((n) => (
                <li key={n}>{n.replace(/^[a-z]+: /, "")}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {node.kind === "image" && (
          <>
            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Change it</h3>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="Warmer light, swap the glass for our bottle, remove the sign…" className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
              <div className="flex flex-wrap gap-1.5">
                {IMAGE_EDITS.map((s) => (
                  <button key={s} type="button" onClick={() => setInstruction(s)} className="rounded-full bg-white px-2.5 py-1 text-xs text-neutral-600 ring-1 ring-black/[0.08] hover:bg-neutral-50 hover:text-neutral-950">
                    {s}
                  </button>
                ))}
              </div>
              <Field label="Model">
                <select value={imageId} onChange={(e) => setImageId(e.target.value)} className="h-9 w-full rounded-lg bg-neutral-50 px-2.5 text-sm ring-1 ring-black/[0.08] outline-none">
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({usd(m.price)})
                    </option>
                  ))}
                </select>
              </Field>
              <Button className="w-full" disabled={!instruction.trim() || busy("edit")} onClick={() => void act("edit_image", { asset_id: a._id, instruction: instruction.trim(), model: imageId }, `edit:${a._id}`).then((ok) => ok && setInstruction(""))}>
                {busy("edit") ? <Loader2 className="animate-spin" /> : <PenLine />} Make the change ({usd(imageModel(imageId).price)})
              </Button>
              <p className="text-[11px] text-neutral-500">The new image lands next to this one; this one stays.</p>
            </section>
            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Animate it</h3>
              <textarea value={motion} onChange={(e) => setMotion(e.target.value)} rows={2} placeholder="What moves: a slow push-in, steam rising, people walking past" className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
              <select value={videoId} onChange={(e) => setVideoId(e.target.value)} className="h-9 w-full rounded-lg bg-neutral-50 px-2.5 text-sm ring-1 ring-black/[0.08] outline-none">
                {VIDEO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({usd(m.perSecond)}/s)
                  </option>
                ))}
              </select>
              <Button variant="outline" className="w-full" disabled={busy("animate")} onClick={() => void act("make_clip", { prompt: motion.trim() || "Bring the picture to life with a slow, natural camera move; keep everything in it true.", aspect: aspect === "16:9" ? "16:9" : "9:16", seconds: vm.hd ? 8 : 6, image: a.url, model: videoId, near: a._id }, `animate:${a._id}`)}>
                {busy("animate") ? <Loader2 className="animate-spin" /> : <Clapperboard />} Make a {vm.hd ? 8 : 6}s clip ({usd(vm.perSecond * (vm.hd ? 8 : 6))})
              </Button>
            </section>
            <section className="space-y-2 border-t pt-5">
              <Button variant="outline" className="w-full" onClick={() => (sendPrompt("Design a poster around this image, in our brand.", { output: "poster" }), onClose())}>
                <LayoutTemplate /> Design a poster with it
              </Button>
            </section>
          </>
        )}

        {node.kind === "clip" && (
          <>
            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Change it</h3>
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="Make it golden hour, add light rain, swap the mug for our bottle…" className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
              <Button className="w-full" disabled={!instruction.trim() || busy("omni")} onClick={() => void act("edit_clip", { asset_id: a._id, instruction: instruction.trim() }, `omni:${a._id}`).then((ok) => ok && setInstruction(""))}>
                {busy("omni") ? <Loader2 className="animate-spin" /> : <PenLine />} Change with Omni Flash ({usd(0.1 * Math.max(4, a.duration ?? 6))})
              </Button>
              <p className="text-[11px] text-neutral-500">Keeps the rest of the shot. The new clip lands next to this one.</p>
            </section>
            <section className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Continue it</h3>
              <input value={extend.prompt} onChange={(e) => setExtend({ ...extend, prompt: e.target.value })} placeholder="What happens next (empty: the move carries on)" className="h-9 w-full rounded-lg bg-neutral-50 px-3 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
              <div className="flex items-center gap-2">
                <select value={videoId} onChange={(e) => setVideoId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg bg-neutral-50 px-2.5 text-sm ring-1 ring-black/[0.08] outline-none">
                  {VIDEO_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="flex rounded-md bg-neutral-100 p-0.5">
                  {[4, 6, 8].map((s) => (
                    <button key={s} type="button" onClick={() => setExtend({ ...extend, seconds: s })} className={cn("h-8 w-9 rounded-[5px] text-xs font-medium text-neutral-600", extend.seconds === s && "bg-white text-neutral-950 shadow-sm")}>
                      {s}s
                    </button>
                  ))}
                </span>
              </div>
              <Button variant="outline" className="w-full" disabled={busy("extend")} onClick={() => void act("extend_clip", { asset_id: a._id, seconds: extend.seconds, prompt: extend.prompt.trim(), model: videoId }, `extend:${a._id}`)}>
                {busy("extend") ? <Loader2 className="animate-spin" /> : <FastForward />} Continue ({usd(vm.perSecond * (vm.hd ? 8 : extend.seconds))})
              </Button>
            </section>
            <section className="space-y-2 border-t pt-5">
              <Button variant="outline" className="w-full" onClick={() => (sendPrompt("Edit a short video ad that opens with this clip, with our offer, an end card and music.", { output: "video" }), onClose())}>
                <Clapperboard /> Build a video ad from it
              </Button>
            </section>
          </>
        )}

        {node.kind === "audio" && (
          <section className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-semibold">Make another version</h3>
            <textarea value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} rows={3} className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
            <select value={musicId} onChange={(e) => setMusicId(e.target.value)} className="h-9 w-full rounded-lg bg-neutral-50 px-2.5 text-sm ring-1 ring-black/[0.08] outline-none">
              {MUSIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({usd(m.price)})
                </option>
              ))}
            </select>
            <Button className="w-full" disabled={!musicPrompt.trim() || busy("music")} onClick={() => void act("make_music", { prompt: musicPrompt.trim(), model: musicId, near: a._id }, `music:${a._id}`)}>
              {busy("music") ? <Loader2 className="animate-spin" /> : <Music />} Compose
            </Button>
            <p className="text-[11px] text-neutral-500">To use it in a video ad, open the video and add it from the Media panel.</p>
          </section>
        )}
      </aside>
    </FocusShell>
  );
}

function AudioPlayer({ url, duration, name }: { url: string; duration: number; name: string }) {
  const peaks = useWaveform(url);
  const ref = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = 140;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_20px_50px_-20px_rgba(0,0,0,0.3)]">
      <audio ref={ref} src={url} preload="auto" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
      <div className="mb-5 flex items-center gap-4">
        <button type="button" onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())} className="flex size-12 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </button>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {fmt(t)} / {fmt(duration)}
          </p>
        </div>
      </div>
      <div
        className="flex h-24 cursor-pointer items-center gap-[2px]"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (ref.current) ref.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
        }}
      >
        {(peaks ? bars(peaks, n) : Array.from({ length: n }, () => 0.1)).map((p, i) => (
          <span key={i} className={cn("flex-1 rounded-full", i / n < t / duration ? "bg-neutral-900" : "bg-neutral-300")} style={{ height: `${Math.max(6, p * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

