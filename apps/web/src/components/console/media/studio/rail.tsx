"use client";

// The studio's left rail: every creative (by audience), the library (uploads,
// generated pictures, products; drag onto the canvas), why each creative was
// made (Qloo evidence), its version history, and the generation jobs with
// what each cost.

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, Clapperboard, Film, Image as ImageIcon, Loader2, Music, Plus, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import { FORMATS, docDuration, newId, type Clip, type Layer, type MediaConcept, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import { usd } from "@/lib/media/kit";
import { useMediaUpload } from "@/lib/media/upload";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/console/primitives";
import { ScaledStage } from "../stage";
import { LIBRARY_MIME } from "./canvas";
import { useStudio } from "./context";
import { Seg, SmallButton } from "./controls";
import { imageEstimate, type Quality } from "./costs";

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* Creatives ---------------------------------------------------------------------- */

export function CreativesTab() {
  const { campaign, creatives, creative, setCreative, kit, jobs } = useStudio();
  const audiences = campaign.audiences as { id: string; name: string }[];
  const groups = [...audiences.map((a) => ({ key: a.id, name: a.name })), ...Array.from(new Set(creatives.map((c) => c.audienceKey).filter((k) => !audiences.some((a) => a.id === k)))).map((k) => ({ key: k, name: k === "all" ? "Everyone" : k }))];
  if (!creatives.length) return <p className="p-4 text-sm text-muted-foreground">No creatives yet. Generate them, or ask in the chat.</p>;
  return (
    <div className="space-y-5 p-3">
      {groups.map((g) => {
        const list = creatives.filter((c) => c.audienceKey === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key} className="space-y-2">
            <h3 className="px-1 text-xs font-medium text-muted-foreground">{g.name}</h3>
            <div className="grid grid-cols-2 gap-2">
              {list.map((c) => {
                const doc = c.doc as MediaDoc;
                const pending = (doc.video ?? []).filter((x) => x.status === "pending").length + jobs.filter((j) => j.creativeId === c._id && (j.status === "queued" || j.status === "running") && j.kind !== "video").length;
                const exported = c.export && c.export.version === c.version;
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => setCreative(c._id)}
                    className={cn("group flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-neutral-100", creative?._id === c._id && "bg-sky-50 ring-1 ring-sky-500/50 hover:bg-sky-50")}
                  >
                    <div className="relative h-28 w-full overflow-hidden rounded-md bg-neutral-100">
                      <ScaledStage doc={doc} kit={kit} stillOnly settled showPending={false} className="size-full" />
                      <span className="absolute top-1 left-1 flex gap-1">
                        {doc.kind === "video" && (
                          <span className="flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                            <Film className="size-2.5" /> {Math.round(docDuration(doc))}s
                          </span>
                        )}
                      </span>
                      <span className="absolute top-1 right-1 flex gap-1">
                        {pending > 0 && (
                          <span className="flex items-center gap-0.5 rounded bg-white/90 px-1 text-[10px]">
                            <Loader2 className="size-2.5 animate-spin" /> {pending}
                          </span>
                        )}
                        {c.status === "rendering" && <Loader2 className="size-3.5 animate-spin rounded-full bg-white/90 p-0.5" />}
                        {exported && <Check className="size-3.5 rounded-full bg-emerald-500 p-0.5 text-white" strokeWidth={3} />}
                      </span>
                    </div>
                    <span className="truncate text-xs font-medium">{c.name}</span>
                    <span className="-mt-1 text-[11px] text-muted-foreground">{FORMATS[doc.format]?.label ?? doc.format}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Library ------------------------------------------------------------------------ */

type Item = { key: string; url: string; kind: "image" | "video" | "audio"; name: string; w?: number; h?: number; duration?: number; asset?: Doc<"mediaAssets"> };

export function LibraryTab() {
  const { campaignId, campaign, assets, doc, editor, select, selection, act, pending, kit } = useStudio();
  const upload = useMediaUpload(campaignId);
  const removeAsset = useMutation(api.media.removeAsset);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<{ open: boolean; prompt: string; quality: Quality; refs: string[] }>({ open: false, prompt: "", quality: "auto", refs: [] });

  const items: Item[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    if (seen.has(a.url) || a.source === "export") continue;
    seen.add(a.url);
    items.push({ key: a._id, url: a.url, kind: a.kind as Item["kind"], name: a.name || a.prompt?.slice(0, 60) || a.source, w: a.w, h: a.h, duration: a.duration, asset: a });
  }
  for (const p of campaign.products as { id: string; name: string; image?: string }[]) {
    if (!p.image || seen.has(p.image)) continue;
    seen.add(p.image);
    items.push({ key: `p_${p.id}`, url: p.image, kind: "image", name: p.name });
  }
  if (kit?.logo?.src && !seen.has(kit.logo.src)) items.push({ key: "logo", url: kit.logo.src, kind: "image", name: "Logo" });

  const files = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    await Promise.all(
      Array.from(list).map(async (f) => {
        setUploading((n) => n + 1);
        try {
          await upload(f);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const video = doc?.kind === "video";
  const total = doc ? docDuration(doc) : 0;
  const addLayer = (it: Item) => {
    if (!doc) return;
    const w = Math.round(doc.w * 0.5);
    const h = it.w && it.h ? Math.round((w * it.h) / it.w) : w;
    const l: Layer = { id: newId("l"), type: "image", src: it.url, x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, fit: "cover", role: "photo" };
    editor.update((d) => ({ ...d, layers: [...d.layers, l] }));
    select({ kind: "layers", ids: [l.id] });
  };
  const addShot = (it: Item) => {
    if (!doc) return;
    const clip: Clip =
      it.kind === "image"
        ? { id: newId("c"), kind: "still", poster: it.url, in: 0, out: 3, status: "ready", role: "still", kenburns: "in", transition: "fade" }
        : { id: newId("c"), kind: "motion", src: it.url, in: 0, out: Math.min(8, it.duration ?? 5), status: "ready", role: "broll", transition: "cut" };
    editor.update((d) => {
      const list = [...(d.video ?? [])];
      const at = selection.kind === "clip" ? list.findIndex((c) => c.id === selection.id) + 1 : list.length;
      list.splice(at || list.length, 0, clip);
      return { ...d, video: list };
    });
    select({ kind: "clip", id: clip.id });
  };
  const setMusic = (it: Item) => {
    if (!doc) return;
    const id = newId("a");
    editor.update((d) => ({ ...d, audio: [...(d.audio ?? []).filter((a) => a.kind !== "music"), { id, kind: "music", src: it.url, start: 0, duration: Math.max(1, Math.min(total, it.duration ?? total)), volume: 0.5, status: "ready" }] }));
    select({ kind: "audio", id });
  };

  const pictures = items.filter((i) => i.kind === "image");
  const est = imageEstimate(campaign.tier, gen.quality);

  return (
    <div
      className="space-y-3 p-3"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void files(e.dataTransfer.files);
      }}
    >
      <div className="flex gap-1.5">
        <SmallButton className="flex-1" onClick={() => input.current?.click()} disabled={uploading > 0}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload
        </SmallButton>
        <SmallButton className="flex-1" onClick={() => setGen((g) => ({ ...g, open: !g.open }))}>
          <Sparkles /> Generate
        </SmallButton>
        <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => {
            const el = e.currentTarget;
            void files(el.files).then(() => {
              el.value = "";
            });
          }} />
      </div>
      {error && <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">{error}</p>}
      {gen.open && (
        <div className="space-y-2 rounded-lg bg-neutral-50 p-2.5 ring-1 ring-black/5">
          <textarea value={gen.prompt} onChange={(e) => setGen({ ...gen, prompt: e.target.value })} rows={3} placeholder="The scene: subject, setting, light, mood. No text in it." className="w-full resize-none rounded-md bg-white px-2 py-1.5 text-xs leading-5 ring-1 ring-black/10 outline-none focus:ring-sky-500" />
          <Seg value={gen.quality} onChange={(quality) => setGen({ ...gen, quality })} options={[{ value: "auto", label: "Auto" }, { value: "draft", label: "Draft" }, { value: "premium", label: "Best" }]} />
          {pictures.length > 0 && (
            <div>
              <p className="pb-1 text-[11px] text-muted-foreground">Keep these in it (up to 4)</p>
              <div className="flex flex-wrap gap-1">
                {pictures.slice(0, 16).map((p) => {
                  const on = gen.refs.includes(p.url);
                  return (
                    <button key={p.key} type="button" title={p.name} onClick={() => setGen({ ...gen, refs: on ? gen.refs.filter((u) => u !== p.url) : [...gen.refs, p.url].slice(0, 4) })} className={cn("size-9 overflow-hidden rounded ring-1 ring-black/10", on && "ring-2 ring-sky-500")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="size-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              ≈ {usd(est.price)} · {est.label}
            </span>
            <SmallButton
              tone="primary"
              disabled={!gen.prompt.trim() || pending.includes("image")}
              onClick={() =>
                void act("generate_image", { prompt: gen.prompt.trim(), format: doc?.format ?? "story", reference_urls: gen.refs, quality: gen.quality === "fast" ? "standard" : gen.quality }, "image").then((ok) => ok && setGen({ ...gen, prompt: "", refs: [] }))
              }
            >
              {pending.includes("image") ? <Loader2 className="animate-spin" /> : <Sparkles />} Make it
            </SmallButton>
          </div>
        </div>
      )}
      {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Drop photos, clips or music here.</p>}
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.key} className="group relative overflow-hidden rounded-md bg-neutral-100 ring-1 ring-black/5">
            <div
              draggable={it.kind === "image"}
              onDragStart={(e) => {
                e.dataTransfer.setData(LIBRARY_MIME, JSON.stringify({ url: it.url, w: it.w, h: it.h }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="aspect-square cursor-grab active:cursor-grabbing"
              title={it.name}
            >
              {it.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" className="size-full object-cover" />
              ) : it.kind === "video" ? (
                <video src={it.url} muted preload="metadata" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Music className="size-5" />
                </div>
              )}
            </div>
            <span className="absolute top-1 left-1 flex gap-1">
              {it.asset?.source === "generated" && <Sparkles className="size-3.5 rounded bg-white/90 p-0.5" />}
              {it.kind === "video" && <Clapperboard className="size-3.5 rounded bg-white/90 p-0.5" />}
            </span>
            <div className="absolute inset-x-1 bottom-1 flex flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {it.kind === "image" && (
                <button type="button" onClick={() => addLayer(it)} className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-white">
                  <ImageIcon className="mr-0.5 inline size-2.5" /> Layer
                </button>
              )}
              {video && it.kind !== "audio" && (
                <button type="button" onClick={() => addShot(it)} className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-white">
                  <Plus className="mr-0.5 inline size-2.5" /> Shot
                </button>
              )}
              {video && it.kind === "audio" && (
                <button type="button" onClick={() => setMusic(it)} className="rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm hover:bg-white">
                  <Music className="mr-0.5 inline size-2.5" /> Music
                </button>
              )}
              {it.asset && (
                <button type="button" title="Remove from library" onClick={() => void removeAsset({ id: it.asset!._id })} className="ml-auto rounded bg-white/95 px-1 py-0.5 text-destructive shadow-sm hover:bg-white">
                  <Trash2 className="size-2.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">Drag a picture onto the canvas, or hover for more.</p>
    </div>
  );
}

/* Why ---------------------------------------------------------------------------- */

export function WhyTab() {
  const { campaign, creative } = useStudio();
  const concepts = ((campaign.concepts ?? []) as MediaConcept[]).filter((c) => !creative || c.audienceKey === creative.audienceKey);
  const why = creative?.why ?? [];
  if (!concepts.length && !why.length) return <p className="p-4 text-sm text-muted-foreground">The reasons behind each creative show here once the agent has made them, with the Qloo taste evidence it used.</p>;
  return (
    <div className="space-y-4 p-3">
      {why.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-xs font-medium text-muted-foreground">Why this creative</h3>
          {why.map((w, i) => (
            <div key={i} className="rounded-lg bg-neutral-50 p-2.5 ring-1 ring-black/5">
              <p className="text-sm leading-5">{w.text}</p>
              <p className="pt-1 text-[11px] leading-4 text-muted-foreground">{w.evidence}</p>
            </div>
          ))}
        </div>
      )}
      {concepts.map((c, i) => (
        <div key={i} className="space-y-1.5">
          <h3 className="px-1 text-xs font-medium text-muted-foreground">Concept · {c.title}</h3>
          <div className="space-y-1.5 rounded-lg p-2.5 ring-1 ring-black/5">
            <p className="text-sm font-medium">{c.hook}</p>
            <p className="text-xs leading-5 text-muted-foreground">{c.visual}</p>
            {c.why.map((w, j) => (
              <p key={j} className="text-xs leading-5">
                {w.text} <span className="text-muted-foreground">({w.evidence})</span>
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* History ------------------------------------------------------------------------ */

export function HistoryTab() {
  const { creative, kit, editor } = useStudio();
  const versions = useQuery(api.media.versions, creative ? { creativeId: creative._id } : "skip");
  const restore = useMutation(api.media.restore);
  const [busy, setBusy] = useState<number | null>(null);
  if (!creative) return null;
  if (!versions) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  return (
    <ul className="space-y-1 p-3">
      {versions.map((v) => {
        const current = v.version === creative.version;
        return (
          <li key={v._id} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-neutral-50">
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-neutral-100">
              <ScaledStage doc={v.doc} kit={kit} stillOnly settled showPending={false} className="size-full" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{v.note || (v.by === "agent" ? "Slice edited" : "Your edits")}</p>
              <p className="text-[11px] text-muted-foreground">
                v{v.version} · {v.by === "agent" ? "Slice" : "You"} · {ago(v.createdAt)}
              </p>
            </div>
            {current ? (
              <Badge tone="outline">Now</Badge>
            ) : (
              <SmallButton
                disabled={busy !== null}
                title="Restore this version"
                onClick={async () => {
                  setBusy(v.version);
                  try {
                    await editor.flush();
                    await restore({ id: creative._id, version: v.version });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === v.version ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              </SmallButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* Jobs --------------------------------------------------------------------------- */

const JOB_LABEL: Record<string, string> = { video: "Shot", edit: "Omni edit", extend: "Extension", image: "Image", music: "Music", voice: "Voiceover", export: "Export" };

export function JobsTab() {
  const { jobs, campaign } = useStudio();
  if (!jobs.length) return <p className="p-4 text-sm text-muted-foreground">Every model call shows here with its cost.</p>;
  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xs text-muted-foreground">
        {usd(campaign.spend)} spent of {usd(campaign.budget)}
      </p>
      <ul className="space-y-1">
        {jobs.map((j) => (
          <li key={j._id} className="rounded-lg p-2 ring-1 ring-black/5">
            <div className="flex items-center gap-2 text-xs">
              {j.status === "done" ? <Check className="size-3.5 text-emerald-600" /> : j.status === "failed" ? <AlertTriangle className="size-3.5 text-destructive" /> : <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              <span className="font-medium">{JOB_LABEL[j.kind] ?? j.kind}</span>
              <span className="truncate text-muted-foreground">{j.model}</span>
              <span className="ml-auto shrink-0 tabular-nums">{j.cost !== undefined ? usd(j.cost) : `≈ ${usd(j.estimate)}`}</span>
            </div>
            {j.prompt && <p className="line-clamp-2 pt-1 text-[11px] leading-4 text-muted-foreground">{j.prompt}</p>}
            {j.error && <p className="pt-1 text-[11px] leading-4 text-destructive">{j.error}</p>}
            <p className="pt-0.5 text-[10px] text-muted-foreground">{ago(j.createdAt)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
