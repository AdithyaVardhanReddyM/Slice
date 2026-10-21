"use client";

// Focus mode: one thing from the canvas, full screen. Posters open in a
// Canva-style editor, videos in the timeline editor, images and clips in a
// viewer with their versions, music in a player. The right side is Slice for
// this one thing (item-agent.tsx): its own conversation, changing only what is
// open. Manual settings live in the bar over the page (context-bar.tsx).

import { useMutation } from "convex/react";
import { ArrowLeft, ChevronRight, Download, History as HistoryIcon, Image as ImageIcon, Layers, Loader2, Mic, Music, Pause, Play, Redo2, Shapes, Undo2, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { MUSIC_MODELS, creativeName, docDuration, modelLabel, timeline, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanvas } from "../canvas/context";
import { keyOf, type BoardNode } from "../canvas/model";
import { CheckBadge } from "../canvas/nodes";
import { WhyButton } from "../canvas/why";
import { GenField, jobSeconds, seedOf } from "../gen-field";
import { usd, usePromptPicks } from "../prompt/options";
import { usePlayback } from "../stage";
import { FocusContext, useStudio, type FocusEnv, type Selection } from "./context";
import { ContextBar } from "./context-bar";
import { ItemAgentPanel, ITEM_AGENT_W, type ItemAgentHandle, type ItemNoun } from "./item-agent";
import { layerLabel } from "./layers";
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
  const { campaign } = useCanvas();
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white duration-200 animate-in fade-in-0 zoom-in-[0.985]" role="dialog" aria-modal="true" aria-label="Editor">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-black/[0.06] px-2.5">
        {/* Where this is: back to the campaign's canvas, then what is open and its shape. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" onClick={onClose} aria-label="Back to the canvas" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-100 hover:text-neutral-950">
                <ArrowLeft className="size-4" />
              </button>
            }
          />
          <TooltipContent side="bottom" sideOffset={8}>
            Back to the canvas (Esc)
          </TooltipContent>
        </Tooltip>
        <nav aria-label="Breadcrumb" className="ml-1.5 flex min-w-0 items-center gap-0.5">
          <button type="button" onClick={onClose} className="h-8 max-w-48 shrink-0 truncate rounded-lg px-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950">
            {campaign.name}
          </button>
          <ChevronRight className="size-3.5 shrink-0 text-neutral-300" />
          <div className="flex min-w-0 items-center gap-1.5">
            {title}
            {meta && <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 tabular-nums">{meta}</span>}
          </div>
        </nav>
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
      title="Rename"
      className="field-sizing-content h-8 max-w-72 min-w-12 truncate rounded-lg px-2 text-[13px] font-semibold text-neutral-950 outline-none hover:bg-neutral-100 focus:bg-white focus:ring-2 focus:ring-blue-500/40"
    />
  );
}

/* Creatives -------------------------------------------------------------------------- */

function useFocusEnv(creative: Doc<"mediaCreatives">, agentRef: React.RefObject<ItemAgentHandle | null>) {
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
    ask: () => agentRef.current?.focus(),
  };
  return env;
}

/** Slice for the open poster or video: the request points at what is selected in it. */
const CreativeAgent = forwardRef<ItemAgentHandle, { noun: ItemNoun }>(function CreativeAgent({ noun }, ref) {
  const { creative, doc, editor, selection, select, playback } = useStudio();
  const layers = selection.kind === "layers" ? doc.layers.filter((l) => selection.ids.includes(l.id)) : [];
  const shot = selection.kind === "clip" ? timeline(doc).findIndex((s) => s.clip.id === selection.id) : -1;
  const track = selection.kind === "audio" ? (doc.audio ?? []).find((a) => a.id === selection.id) : undefined;
  const label = layers.length === 1 ? layerLabel(layers[0]) : layers.length > 1 ? `${layers.length} layers` : shot >= 0 ? `Shot ${shot + 1}` : track ? (track.kind === "music" ? "The music" : "The voiceover") : null;
  const icon = track ? track.kind === "music" ? <Music /> : <Mic /> : null;
  return (
    <ItemAgentPanel
      ref={ref}
      noun={noun}
      item={{ kind: "creative", id: creative._id, thread: creative.thread ?? creative._id }}
      target={label ? { label, icon, onClear: () => select({ kind: "none" }) } : null}
      selection={{ creativeId: creative._id, ...(layers.length ? { layerIds: layers.map((l) => l.id) } : {}), ...(shot >= 0 && selection.kind === "clip" ? { clipId: selection.id } : {}), ...(doc.kind === "video" ? { time: Math.round(playback.time * 10) / 10 } : {}) }}
      beforeTurn={editor.flush}
    />
  );
});

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
  const agentRef = useRef<ItemAgentHandle>(null);
  const env = useFocusEnv(creative, agentRef);
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
        <div className="flex items-center gap-0.5">
          <span className="mx-2 h-5 w-px bg-neutral-200" />
          <button type="button" title="Undo (⌘Z)" disabled={!env.editor.canUndo} onClick={env.editor.undo} className="flex size-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-35">
            <Undo2 className="size-4" />
          </button>
          <button type="button" title="Redo (⇧⌘Z)" disabled={!env.editor.canRedo} onClick={env.editor.redo} className="flex size-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-35">
            <Redo2 className="size-4" />
          </button>
          <SaveState editor={env.editor} version={creative.version} />
        </div>
      }
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

  const agent = <CreativeAgent ref={agentRef} noun={video ? "video" : "poster"} />;
  return <FocusContext.Provider value={env}>{shell(video ? <VideoEditor onClose={close} agent={agent} /> : <PosterEditor onClose={close} agent={agent} />)}</FocusContext.Provider>;
}

function PosterEditor({ onClose, agent }: { onClose: () => void; agent: ReactNode }) {
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
      {agent}
    </>
  );
}

/* Assets: images, clips, music -------------------------------------------------------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

/** An image's or clip's versions, oldest first (the first and everything edited or remade from it), and the ones on their way. */
function useVersions(a: Doc<"mediaAssets">) {
  const { assets, jobs } = useCanvas();
  const byId = new Map(assets.map((x) => [x._id as string, x]));
  const rootOf = (x: Doc<"mediaAssets">) => {
    let cur = x;
    for (let hops = 0; cur.parentId && byId.has(cur.parentId) && hops < 50; hops++) cur = byId.get(cur.parentId)!;
    return cur;
  };
  const root = rootOf(a);
  const family = assets.filter((x) => x.kind === a.kind && rootOf(x)._id === root._id).sort((p, q) => p.createdAt - q.createdAt);
  const coming = jobs.filter((j) => (j.targetId === root._id || (!!root.thread && j.targetId === root.thread)) && !j.dismissed && (j.status === "queued" || j.status === "running" || j.status === "failed"));
  return { root, family, coming };
}

function AssetFocus({ node, onClose }: { node: BoardNode; onClose: () => void }) {
  const { download, remove, jobs } = useCanvas();
  const opened = node.asset!;
  const { root, family, coming } = useVersions(opened);
  const [viewId, setViewId] = useState<string>(opened._id);
  const [downloading, setDownloading] = useState(false);
  const agentRef = useRef<ItemAgentHandle>(null);
  const dismiss = useMutation(api.media.dismissJob);
  const v = family.find((x) => x._id === viewId) ?? opened;

  // A new version that lands while the editor is open is shown at once.
  const seen = useRef(new Set(family.map((x) => x._id as string)));
  useEffect(() => {
    const fresh = family.filter((x) => !seen.current.has(x._id));
    for (const x of family) seen.current.add(x._id);
    if (fresh.length) setViewId(fresh[fresh.length - 1]._id);
  }, [family]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !typing(e.target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (node.kind === "audio") return <MusicFocus node={node} onClose={onClose} />;
  const noun: ItemNoun = node.kind === "clip" ? "clip" : "image";
  const index = family.findIndex((x) => x._id === v._id);
  const review = v.review as { notes?: string[] } | undefined;

  return (
    <FocusShell
      title={<span className="max-w-72 truncate px-2 text-[13px] font-semibold text-neutral-950">{node.name}</span>}
      meta={family.length > 1 ? `${index <= 0 ? "Original" : `Version ${index + 1}`} of ${family.length}` : node.meta}
      onClose={onClose}
      right={
        <>
          {v.board && (
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-neutral-600" onClick={() => (remove([keyOf({ kind: "asset", id: v._id })]), v._id === opened._id && onClose())}>
              <X /> Take off canvas
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                await download({ ...node, asset: v });
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
      <main className="relative flex min-w-0 flex-1 flex-col bg-[#f4f4f3]">
        <div className="flex min-h-0 flex-1 items-center justify-center p-10">
          {node.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={v._id} src={v.url} alt="" className="max-h-full max-w-full rounded-md object-contain shadow-[0_1px_3px_rgba(0,0,0,0.08),0_20px_50px_-20px_rgba(0,0,0,0.3)] duration-300 animate-in fade-in-0" />
          ) : (
            <video key={v._id} src={v.url} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-md bg-black shadow-xl" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 border-t border-black/[0.06] bg-white px-4 py-2.5">
          {(family.length > 1 || coming.length > 0) && (
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none]">
              {family.map((x, i) => (
                <button
                  key={x._id}
                  type="button"
                  onClick={() => setViewId(x._id)}
                  title={i === 0 ? "Original" : x.prompt ? `Version ${i + 1}: ${x.prompt}` : `Version ${i + 1}`}
                  className={cn("relative h-14 shrink-0 overflow-hidden rounded-md bg-neutral-100 ring-1 ring-black/[0.08] transition-shadow", x._id === v._id ? "ring-2 ring-neutral-900 ring-offset-1" : "hover:ring-black/25")}
                  style={{ aspectRatio: `${x.w ?? 1} / ${x.h ?? 1}` }}
                >
                  {x.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.url} alt="" className="size-full object-cover" />
                  ) : (
                    <video src={x.url} muted preload="metadata" className="size-full object-cover" />
                  )}
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[10px] leading-4 font-medium text-white">{i === 0 ? "Original" : `v${i + 1}`}</span>
                </button>
              ))}
              {coming.map((j) =>
                j.status === "failed" ? (
                  <span key={j._id} title={j.error ?? "It failed"} className="relative flex h-14 shrink-0 items-center justify-center rounded-md bg-red-50 px-3 text-[11px] font-medium text-red-700 ring-1 ring-red-200" style={{ aspectRatio: j.aspect ? j.aspect.replace(":", " / ") : "1 / 1" }}>
                    Failed
                    <button type="button" aria-label="Dismiss" onClick={() => void dismiss({ id: j._id as Id<"mediaJobs"> })} className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full text-red-700/70 hover:bg-red-100">
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <span key={j._id} title={j.prompt ?? "On its way"} className="relative h-14 shrink-0 overflow-hidden rounded-md bg-[#fffbf3] ring-1 ring-black/[0.06]" style={{ aspectRatio: j.aspect ? j.aspect.replace(":", " / ") : "1 / 1" }}>
                    <GenField seed={seedOf(j._id)} startedAt={j.createdAt} expected={jobSeconds(j, jobs)} />
                  </span>
                ),
              )}
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-neutral-500">
            {v.review ? <CheckBadge review={v.review} /> : null}
            <span className="tabular-nums" title={review?.notes?.length ? review.notes.map((n) => n.replace(/^[a-z]+: /, "")).join("\n") : undefined}>
              {[v.source === "generated" ? modelLabel(v.model) : v.source === "upload" ? "Uploaded" : null, v.w && v.h ? `${v.w}×${v.h}` : null, v.duration ? `${v.duration.toFixed(1)} s` : null, v.cost !== undefined ? usd(v.cost) : null].filter(Boolean).join(", ")}
            </span>
          </div>
        </div>
      </main>
      <ItemAgentPanel ref={agentRef} noun={noun} item={{ kind: "asset", id: v._id, thread: root.thread ?? root._id }} />
    </FocusShell>
  );
}

/** Music: a player, what made it, and another version. */
function MusicFocus({ node, onClose }: { node: BoardNode; onClose: () => void }) {
  const { act, pending, download } = useCanvas();
  const [picks] = usePromptPicks();
  const a = node.asset!;
  const [musicPrompt, setMusicPrompt] = useState(a.prompt ?? "");
  const [musicId, setMusicId] = useState(MUSIC_MODELS.some((m) => m.id === a.model) ? a.model! : picks.musicModel);
  const [downloading, setDownloading] = useState(false);
  const busy = pending.includes(`music:${a._id}`);
  return (
    <FocusShell
      title={<span className="max-w-72 truncate px-2 text-[13px] font-semibold text-neutral-950">{node.name}</span>}
      meta={node.meta}
      onClose={onClose}
      right={
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
      }
    >
      <main className="relative flex min-w-0 flex-1 items-center justify-center bg-[#f4f4f3] p-10">
        <AudioPlayer url={a.url} duration={a.duration ?? 30} name={node.name} />
      </main>
      <aside className="scrollbar-thin shrink-0 space-y-6 overflow-y-auto border-l border-black/[0.06] p-5" style={{ width: ITEM_AGENT_W }}>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Details</h3>
          {a.prompt && <p className="text-[13px] leading-relaxed text-neutral-700">{a.prompt}</p>}
          <p className="text-xs text-neutral-500 tabular-nums">{[a.source === "generated" ? modelLabel(a.model) : "Uploaded", a.duration ? `${a.duration.toFixed(1)} s` : null, a.cost !== undefined ? usd(a.cost) : null].filter(Boolean).join(", ")}</p>
        </section>
        <section className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">Make another version</h3>
          <textarea value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} rows={3} className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500" />
          <Field label="Model">
            <select value={musicId} onChange={(e) => setMusicId(e.target.value)} className="h-9 w-full rounded-lg bg-neutral-50 px-2.5 text-sm ring-1 ring-black/[0.08] outline-none">
              {MUSIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({usd(m.price)})
                </option>
              ))}
            </select>
          </Field>
          <Button className="w-full" disabled={!musicPrompt.trim() || busy} onClick={() => void act("make_music", { prompt: musicPrompt.trim(), model: musicId, near: a._id }, `music:${a._id}`)}>
            {busy ? <Loader2 className="animate-spin" /> : <Music />} Compose
          </Button>
          <p className="text-[11px] text-neutral-500">To use it in a video ad, open the video and add it from the Media panel.</p>
        </section>
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

