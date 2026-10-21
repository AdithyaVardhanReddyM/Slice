"use client";

// The bar over the video when a shot or a sound track is selected: its place
// in the cut, then a popover per job, with the buttons that call the models
// directly (regenerate on a cheaper or better model, change a finished shot
// with Omni instead of remaking it, continue it, add a shot after it, compose
// music, record a voiceover). Each shows what it would cost before it runs.

import { ChevronLeft, ChevronRight, FastForward, Film, Loader2, Mic, Music, PenLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { EXTRAS, timeline, type AudioClip, type Clip, type KenBurns, type ShotRole } from "@slice/backend/convex/mediaTypes";
import { usd } from "../prompt/options";
import { cn } from "@/lib/utils";
import { Select } from "@/components/console/form";
import { useStudio } from "./context";
import { BarSep, ctl, ImagePreview, Num, Pop, Row, Seg, SmallButton, Toggle } from "./controls";
import { omniEstimate, shotEstimate, type Quality } from "./costs";

const QUALITIES: { value: Quality; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Picked by the shot's role: hero shots get the better model" },
  { value: "veo-3.1-lite-generate-001", label: "Lite", title: "Veo 3.1 Lite: cheapest" },
  { value: "veo-3.1-fast-generate-001", label: "Fast", title: "Veo 3.1 Fast" },
  { value: "veo-3.1-generate-001", label: "Veo 3.1", title: "Veo 3.1: best, 1080p" },
];

const ROLES: { value: ShotRole; label: string }[] = [
  { value: "hero", label: "Hero (opening, the money shot)" },
  { value: "product", label: "Product close-up" },
  { value: "broll", label: "B-roll (mood, cheaper)" },
  { value: "talent", label: "Person on camera (can speak)" },
];

/** What a shot is for, as the bar says it. */
const ROLE_LABEL: Record<ShotRole, string> = { hero: "Opening shot", product: "Product shot", broll: "Mood shot", still: "Still picture", talent: "Person on camera" };

/** Veo fits about 2.5 spoken words a second; one shot is at most 8 s. */
const MAX_WORDS = 18;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Seconds a spoken shot takes: room for the line, rounded up to a whole Veo length. */
const spokenSeconds = (s: string, min: number) => [4, 6, 8].find((v) => v >= Math.min(8, Math.max(min, wordCount(s) / 2.5 + 1))) ?? 8;

const box = "w-full resize-none rounded-md bg-neutral-100/80 px-2 py-1.5 text-xs leading-5 outline-none focus:bg-white focus:ring-1 focus:ring-sky-500";

function SaysField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = wordCount(value);
  return (
    <div className="space-y-1">
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={'Says (optional): "Honestly, this is the comfiest seat in the house."'} className={box} />
      <p className={cn("text-[11px] leading-4", n > MAX_WORDS ? "text-destructive" : "text-muted-foreground")}>
        {n > 0 ? `${n} of ${MAX_WORDS} words. ` : ""}Spoken on camera with lip-synced sound. Describe the person in the prompt; it is AI-generated, so label it where the platform asks.
      </p>
    </div>
  );
}

const VOICES = [
  ["Kore", "firm, warm"],
  ["Puck", "upbeat"],
  ["Charon", "deep, calm"],
  ["Aoede", "breezy"],
  ["Leda", "youthful"],
  ["Orus", "firm"],
  ["Zephyr", "bright"],
  ["Fenrir", "excited"],
  ["Sulafat", "warm"],
  ["Achird", "friendly"],
] as const;

function Cost({ usd: n, model }: { usd: number; model?: string }) {
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {n === 0 ? "Free" : `≈ ${usd(n)}`}
      {model ? ` with ${model}` : ""}
    </span>
  );
}

/** Pictures the merchant can start a shot from: the library and the products. */
function usePictures() {
  const { assets, campaign } = useStudio();
  const seen = new Set<string>();
  const out: { url: string; name: string }[] = [];
  const add = (url: string, name: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, name });
  };
  for (const a of assets) if (a.kind === "image") add(a.url, a.name || a.prompt?.slice(0, 40) || a.source);
  for (const p of campaign.products as { name: string; image?: string }[]) if (p.image) add(p.image, p.name);
  return out;
}

function useShot(id: string) {
  const { doc, editor, jobs } = useStudio();
  const clips = doc.video ?? [];
  const i = clips.findIndex((c) => c.id === id);
  const clip = clips[i] as Clip | undefined;
  const job = jobs.find((j) => j.targetId === id && (j.status === "queued" || j.status === "running"));
  const setClip = (p: Partial<Clip>) => editor.update((d) => ({ ...d, video: (d.video ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  return { clips, i, clip, job, busy: clip?.status === "pending" || !!job, setClip };
}

/* Shot ------------------------------------------------------------------------------ */

export function ShotBar({ id }: { id: string }) {
  const { doc, editor, select, playback } = useStudio();
  const { clips, i, clip, job, busy } = useShot(id);
  if (!clip) return <span className="text-[13px] text-muted-foreground">This shot is gone.</span>;
  const start = timeline(doc)[i]?.start ?? 0;
  const len = Math.max(0, clip.out - clip.in);
  const move = (dir: -1 | 1) =>
    editor.update((d) => {
      const video = [...(d.video ?? [])];
      const j = i + dir;
      if (j < 0 || j >= video.length) return d;
      [video[i], video[j]] = [video[j], video[i]];
      return { ...d, video };
    });
  const remove = () => {
    editor.update((d) => ({ ...d, video: (d.video ?? []).filter((c) => c.id !== id) }));
    select({ kind: "none" });
  };
  const finished = clip.kind === "motion" && clip.status === "ready" && !!clip.src;
  return (
    <>
      {/* Which shot, what it is for and where it sits; clicking it plays from its start. */}
      <button type="button" onClick={() => playback.seek(start + 0.01)} title="Play from the start of this shot" className="flex shrink-0 items-center gap-2.5 rounded-md py-1 pr-2 pl-1 text-left hover:bg-neutral-100">
        <span className="flex h-8 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-neutral-200 ring-1 ring-black/10">
          {clip.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clip.poster} alt="" className="size-full object-cover" />
          ) : (
            <Film className="size-3.5 text-neutral-500" />
          )}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-medium">
            Shot {i + 1} <span className="font-normal text-neutral-400">of {clips.length}</span>
          </span>
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {clip.kind === "still" ? ROLE_LABEL.still : ROLE_LABEL[clip.role ?? "broll"]}, {start.toFixed(1)}–{(start + len).toFixed(1)} s
          </span>
        </span>
      </button>
      {clips.length > 1 && (
        <span className="ml-1 flex shrink-0 items-center rounded-md bg-neutral-100 p-0.5" role="group" aria-label="Move this shot">
          <span className="pr-1 pl-2 text-xs text-neutral-500">Move</span>
          <button type="button" onClick={() => move(-1)} disabled={i === 0} title="Move this shot earlier in the video" className="flex h-7 items-center gap-1 rounded-[5px] px-2 text-xs font-medium text-neutral-700 hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5">
            <ChevronLeft /> Earlier
          </button>
          <button type="button" onClick={() => move(1)} disabled={i === clips.length - 1} title="Move this shot later in the video" className="flex h-7 items-center gap-1 rounded-[5px] px-2 text-xs font-medium text-neutral-700 hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5">
            Later <ChevronRight />
          </button>
        </span>
      )}
      <BarSep />
      <Pop key={`regen:${id}`} trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><RefreshCw className="!size-3.5" /> Regenerate</span>} title="Regenerate this shot" className="w-80">
        <ShotRegenerate id={id} />
      </Pop>
      {finished && (
        <>
          <Pop key={`edit:${id}`} trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><PenLine className="!size-3.5" /> Change</span>} title="Change it with Omni Flash" className="w-80">
            <ShotChange id={id} />
          </Pop>
          <Pop key={`extend:${id}`} trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><FastForward className="!size-3.5" /> Continue</span>} title="Continue it" className="w-72">
            <ShotContinue id={id} />
          </Pop>
        </>
      )}
      <Pop key={`timing:${id}`} trigger={<span className="text-xs font-medium">Timing and look</span>} title="Timing and look" className="w-72">
        <ShotTiming id={id} />
      </Pop>
      <Pop key={`add:${id}`} trigger={<span className="flex items-center gap-1.5 text-xs font-medium"><Plus className="!size-3.5" /> Shot after</span>} title="Add a shot after this one" className="w-80">
        <ShotAdd id={id} />
      </Pop>
      <span className="ml-auto" />
      {busy && (
        <span className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Generating{job ? ` with ${job.model}` : ""}
        </span>
      )}
      {clip.status === "failed" && (
        <span className="shrink-0 px-2 text-xs text-destructive" title={clip.error}>
          Failed
        </span>
      )}
      <button type="button" className={cn(ctl, "w-8 hover:bg-red-50 hover:text-red-600")} title="Delete shot" onClick={remove}>
        <Trash2 />
      </button>
    </>
  );
}

function ShotRegenerate({ id }: { id: string }) {
  const { campaign, creative, act, pending } = useStudio();
  const pictures = usePictures();
  const { clip, busy } = useShot(id);
  const [prompt, setPrompt] = useState(clip?.prompt ?? "");
  const [quality, setQuality] = useState<Quality>("auto");
  const [sound, setSound] = useState(false);
  const [says, setSays] = useState(clip?.says ?? "");
  const [image, setImage] = useState("");
  if (!clip) return null;
  const speaks = clip.kind === "motion" && !!says.trim();
  const regen = shotEstimate(campaign.tier, speaks ? { ...clip, role: "talent", in: 0, out: spokenSeconds(says, clip.out - clip.in) } : clip, quality, sound || speaks);
  const free = clip.kind === "still" && !!image;
  return (
    <>
      {clip.status === "failed" && <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">{clip.error || "This shot failed. Try again, maybe with a simpler prompt."}</p>}
      {clip.status === "ready" && clip.model && <p className="text-[11px] text-muted-foreground">Made with {clip.model}</p>}
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="What happens in the shot: subject, action, camera, light" className={box} />
      <Row label="Model">
        <Seg value={quality} onChange={setQuality} options={QUALITIES} />
      </Row>
      <Row label={clip.kind === "still" ? "Picture" : "First frame"}>
        <Select value={image} onChange={(e) => setImage(e.target.value)} className="h-7 text-xs">
          <option value="">{clip.kind === "still" ? "Generate one" : "From the prompt"}</option>
          {pictures.map((p) => (
            <option key={p.url} value={p.url}>
              {p.name}
            </option>
          ))}
        </Select>
      </Row>
      {clip.kind === "motion" && (clip.role === "talent" || !!clip.says) && <SaysField value={says} onChange={setSays} />}
      {clip.kind === "motion" && (
        <Row label="Sound">
          {speaks ? (
            <span className="text-[11px] text-muted-foreground">On (the person speaks)</span>
          ) : (
            <Toggle on={sound} onChange={setSound} title="Veo's own sound (costs more; music and voice are separate tracks)">
              {sound ? "Native sound" : "Silent"}
            </Toggle>
          )}
        </Row>
      )}
      <div className="flex items-center justify-between gap-2">
        <Cost usd={free ? 0 : regen.usd} model={free ? undefined : regen.model} />
        <SmallButton
          tone="primary"
          disabled={busy || pending.includes("regen") || wordCount(says) > MAX_WORDS}
          onClick={() => void act("regenerate_shot", { creative_id: creative._id, shot_id: clip.id, prompt: prompt.trim() !== (clip.prompt ?? "") ? prompt.trim() : "", quality, image, sound, ...(says.trim() !== (clip.says ?? "") ? { says: says.trim() } : {}) }, "regen")}
        >
          {pending.includes("regen") ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
        </SmallButton>
      </div>
    </>
  );
}

function ShotChange({ id }: { id: string }) {
  const { creative, act, pending } = useStudio();
  const { clip, busy } = useShot(id);
  const [instruction, setInstruction] = useState("");
  if (!clip) return null;
  return (
    <>
      <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="Make it golden hour, swap the mug for our bottle, add light rain" className={box} />
      <p className="text-[11px] leading-4 text-muted-foreground">Keeps the rest of the shot. Usually cheaper and truer than regenerating when it is mostly right.</p>
      <div className="flex items-center justify-between gap-2">
        <Cost usd={omniEstimate(clip)} />
        <SmallButton tone="primary" disabled={busy || !instruction.trim() || pending.includes("edit")} onClick={() => void act("edit_shot", { creative_id: creative._id, shot_id: clip.id, instruction: instruction.trim() }, "edit").then((ok) => ok && setInstruction(""))}>
          {pending.includes("edit") ? <Loader2 className="animate-spin" /> : <PenLine />} Change
        </SmallButton>
      </div>
    </>
  );
}

function ShotContinue({ id }: { id: string }) {
  const { campaign, creative, act, pending } = useStudio();
  const { clip, busy } = useShot(id);
  const [extend, setExtend] = useState({ seconds: 4, prompt: "" });
  if (!clip) return null;
  const est = shotEstimate(campaign.tier, { kind: "motion", role: clip.role ?? "broll", in: 0, out: extend.seconds }, "auto");
  return (
    <>
      <input value={extend.prompt} onChange={(e) => setExtend({ ...extend, prompt: e.target.value })} placeholder="What happens next (empty: the same move carries on)" className={cn(box, "h-7 py-0")} />
      <Row label="Length">
        <Num value={extend.seconds} min={2} max={8} step={1} suffix="s" onChange={(seconds) => setExtend({ ...extend, seconds })} />
      </Row>
      <div className="flex items-center justify-between gap-2">
        <Cost usd={est.usd} model={est.model} />
        <SmallButton disabled={busy || pending.includes("extend")} onClick={() => void act("extend_shot", { creative_id: creative._id, shot_id: clip.id, seconds: extend.seconds, prompt: extend.prompt.trim() }, "extend")}>
          {pending.includes("extend") ? <Loader2 className="animate-spin" /> : <FastForward />} Continue
        </SmallButton>
      </div>
    </>
  );
}

function ShotTiming({ id }: { id: string }) {
  const { assets } = useStudio();
  const { clip, setClip } = useShot(id);
  if (!clip) return null;
  const len = Math.max(0, clip.out - clip.in);
  const source = clip.kind === "motion" ? (assets.find((a) => a.url === clip.src)?.duration ?? 8) : 30;
  return (
    <>
      {clip.kind === "motion" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Num label="In" value={clip.in} min={0} max={Math.max(0, clip.out - 0.5)} step={0.1} suffix="s" onChange={(v) => setClip({ in: v })} />
          <Num label="Out" value={clip.out} min={clip.in + 0.5} max={source} step={0.1} suffix="s" onChange={(v) => setClip({ out: v })} />
        </div>
      ) : (
        <Row label="Length">
          <Num value={len} min={0.5} max={30} step={0.1} suffix="s" onChange={(v) => setClip({ in: 0, out: v })} />
        </Row>
      )}
      <Row label="Into it">
        <Seg value={clip.transition ?? "cut"} onChange={(transition) => setClip({ transition })} options={[{ value: "cut", label: "Cut" }, { value: "fade", label: "Fade" }]} />
      </Row>
      {clip.kind === "still" && (
        <Row label="Move">
          <Seg
            value={clip.kenburns ?? "in"}
            onChange={(kenburns: KenBurns) => setClip({ kenburns })}
            options={[
              { value: "none", label: "None" },
              { value: "in", label: "In" },
              { value: "out", label: "Out" },
              { value: "left", label: "←" },
              { value: "right", label: "→" },
            ]}
          />
        </Row>
      )}
      {clip.kind === "motion" && (
        <Row label="Its sound">
          <Toggle on={!clip.muted} onChange={(on) => setClip({ muted: on ? undefined : true })}>
            {clip.muted ? "Muted" : "On"}
          </Toggle>
          {!clip.muted && <Num value={Math.round((clip.volume ?? 1) * 100)} min={0} max={200} suffix="%" onChange={(v) => setClip({ volume: v === 100 ? undefined : v / 100 })} />}
        </Row>
      )}
      {clip.poster && (
        <>
          <ImagePreview src={clip.poster} focal={clip.focal} onFocal={(focal) => setClip({ focal })} />
          <p className="text-[11px] leading-4 text-muted-foreground">Click the picture to set the focal point: it stays in view when the shot crops to this format.</p>
        </>
      )}
    </>
  );
}

function ShotAdd({ id }: { id: string }) {
  const { campaign, creative, act, pending } = useStudio();
  const [add, setAdd] = useState<{ kind: "motion" | "still"; role: ShotRole; seconds: number; prompt: string; says: string }>({ kind: "motion", role: "broll", seconds: 4, prompt: "", says: "" });
  const says = add.kind === "motion" && add.role === "talent" ? add.says.trim() : "";
  const secs = says ? spokenSeconds(says, add.seconds) : add.seconds;
  const est = shotEstimate(campaign.tier, { kind: add.kind, role: add.kind === "still" ? "still" : add.role, in: 0, out: secs }, "auto", !!says);
  return (
    <>
      <Row label="Kind">
        <Seg
          value={add.kind}
          onChange={(kind) => setAdd({ ...add, kind })}
          options={[
            { value: "motion", label: "Motion" },
            { value: "still", label: "Still (cheap)" },
          ]}
        />
      </Row>
      {add.kind === "motion" && (
        <Row label="Role">
          <Select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as ShotRole })} className="h-7 text-xs">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Row>
      )}
      <Row label="Length">
        <Num value={add.seconds} min={1} max={8} step={0.5} suffix="s" onChange={(seconds) => setAdd({ ...add, seconds })} />
      </Row>
      <textarea value={add.prompt} onChange={(e) => setAdd({ ...add, prompt: e.target.value })} rows={3} placeholder={add.kind === "motion" && add.role === "talent" ? "Who and where: a woman in her 30s in a linen shirt, sitting on the sofa, medium close-up, soft window light" : "Describe the shot"} className={box} />
      {add.kind === "motion" && add.role === "talent" && <SaysField value={add.says} onChange={(v) => setAdd({ ...add, says: v })} />}
      <div className="flex items-center justify-between gap-2">
        <Cost usd={est.usd} model={est.model} />
        <SmallButton
          disabled={!add.prompt.trim() || pending.includes("add") || wordCount(says) > MAX_WORDS}
          onClick={() =>
            void act("add_shots", { creative_id: creative._id, after: id, shots: [{ kind: add.kind, role: add.kind === "still" ? "still" : add.role, prompt: add.prompt.trim(), seconds: secs, transition: "cut", ...(says ? { says } : {}) }] }, "add").then((ok) => ok && setAdd({ ...add, prompt: "", says: "" }))
          }
        >
          {pending.includes("add") ? <Loader2 className="animate-spin" /> : <Plus />} Add shot
        </SmallButton>
      </div>
    </>
  );
}

/* Sound -------------------------------------------------------------------------- */

export function AudioBar({ id }: { id: string }) {
  const { doc, editor, select } = useStudio();
  const fresh = id === "new:music" ? "music" : id === "new:voice" ? "voice" : null;
  const track = (doc.audio ?? []).find((a) => a.id === id);
  const kind: AudioClip["kind"] = fresh ?? track?.kind ?? "music";
  if (!fresh && !track) return <span className="text-[13px] text-muted-foreground">This track is gone.</span>;
  const total = (doc.video ?? []).reduce((s, c) => s + Math.max(0, c.out - c.in), 0);
  const setTrack = (p: Partial<AudioClip>) => editor.update((d) => ({ ...d, audio: (d.audio ?? []).map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  const label = kind === "music" ? "Music" : "Voiceover";
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5 pr-1 text-[13px] font-medium [&_svg]:size-4 [&_svg]:text-neutral-500">
        {kind === "music" ? <Music /> : <Mic />} {label}
      </span>
      {track && (
        <>
          <span className="flex w-40 shrink-0 items-center gap-2 px-1" title="Volume">
            <input type="range" min={0} max={1} step={0.05} value={track.volume} onChange={(e) => setTrack({ volume: Number(e.target.value) })} className="w-full accent-neutral-900" aria-label="Volume" />
            <span className="w-8 text-right text-xs text-neutral-500 tabular-nums">{Math.round(track.volume * 100)}%</span>
          </span>
          <Pop key={`timing:${id}`} trigger={<span className="text-xs font-medium">Timing</span>} title="When it plays">
            <div className="grid grid-cols-2 gap-1.5">
              <Num label="From" value={track.start} min={0} max={total} step={0.1} suffix="s" onChange={(start) => setTrack({ start })} />
              <Num label="Length" value={track.duration} min={0.5} max={total} step={0.1} suffix="s" onChange={(duration) => setTrack({ duration })} />
            </div>
          </Pop>
          <BarSep />
        </>
      )}
      <Pop key={`compose:${id}`} defaultOpen={!!fresh} trigger={<span className="flex items-center gap-1.5 text-xs font-medium">{kind === "music" ? <Music className="!size-3.5" /> : <Mic className="!size-3.5" />} {track ? (kind === "music" ? "New music" : "New take") : kind === "music" ? "Compose" : "Record"}</span>} title={kind === "music" ? "Music with Lyria 3" : "Voiceover with Gemini TTS"} className="w-80">
        <AudioCompose kind={kind} track={track} />
      </Pop>
      <span className="ml-auto" />
      {track?.status === "pending" && (
        <span className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {kind === "music" ? "Composing" : "Recording"}
        </span>
      )}
      {track?.status === "failed" && (
        <span className="shrink-0 px-2 text-xs text-destructive" title={track.error}>
          Failed
        </span>
      )}
      {track && (
        <button
          type="button"
          className={cn(ctl, "w-8 hover:bg-red-50 hover:text-red-600")}
          title="Remove track"
          onClick={() => {
            editor.update((d) => ({ ...d, audio: (d.audio ?? []).filter((a) => a.id !== id) }));
            select({ kind: "none" });
          }}
        >
          <Trash2 />
        </button>
      )}
    </>
  );
}

function AudioCompose({ kind, track }: { kind: AudioClip["kind"]; track?: AudioClip }) {
  const { doc, creative, act, pending, select, campaign } = useStudio();
  const brief = campaign.brief as { goal?: string } | undefined;
  const [prompt, setPrompt] = useState(kind === "music" ? (track?.prompt ?? "") : "");
  const [volume, setVolume] = useState(track?.volume ?? 0.5);
  const [script, setScript] = useState(track?.text ?? "");
  const [voice, setVoice] = useState(() => {
    const v = track?.prompt?.split(":")[0];
    return VOICES.some(([n]) => n === v) ? (v as string) : "Kore";
  });
  const [style, setStyle] = useState(() => track?.prompt?.split(":").slice(1).join(":").trim() ?? "");
  const total = (doc.video ?? []).reduce((s, c) => s + Math.max(0, c.out - c.in), 0);
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const target = Math.round(total * 2.3);
  const done = (ok: boolean) => {
    if (ok && !track) select({ kind: "none" });
  };
  if (kind === "music")
    return (
      <>
        {!track && <p className="text-[11px] leading-4 text-muted-foreground">An instrumental score for the whole video, fitted and faded to its length.</p>}
        {track?.status === "ready" && track.src && <audio key={track.src} src={track.src} controls className="h-8 w-full" />}
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={`Genre, mood, tempo, instruments${brief?.goal ? ` for “${brief.goal.slice(0, 40)}”` : ""}, e.g. warm lo-fi house, 112 BPM, soft Rhodes, builds at 8 s`} className={box} />
        {!track && (
          <Row label="Volume">
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-neutral-900" />
          </Row>
        )}
        <div className="flex items-center justify-between gap-2">
          <Cost usd={EXTRAS.music.price} />
          <SmallButton tone="primary" disabled={!prompt.trim() || pending.includes("music")} onClick={() => void act("add_music", { creative_id: creative._id, prompt: prompt.trim(), volume: track?.volume ?? volume }, "music").then(done)}>
            {pending.includes("music") ? <Loader2 className="animate-spin" /> : <Music />} {track ? "Replace music" : "Add music"}
          </SmallButton>
        </div>
      </>
    );
  return (
    <>
      {track?.status === "ready" && track.src && <audio key={track.src} src={track.src} controls className="h-8 w-full" />}
      <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} placeholder="The words, in your brand's voice" className={box} />
      <p className={cn("text-[11px] tabular-nums", words > total * 2.6 ? "text-amber-700" : "text-muted-foreground")}>
        {words} words, about {target} fit {Math.round(total)} s
      </p>
      <Row label="Voice">
        <Select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-7 text-xs">
          {VOICES.map(([n, d]) => (
            <option key={n} value={n}>
              {n} ({d})
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Delivery">
        <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Say warmly and unhurried" className={cn(box, "h-7 py-0")} />
      </Row>
      <div className="flex items-center justify-between gap-2">
        <Cost usd={EXTRAS.voice.price} />
        <SmallButton tone="primary" disabled={!script.trim() || pending.includes("voice")} onClick={() => void act("add_voiceover", { creative_id: creative._id, script: script.trim(), voice, style: style.trim(), start: track?.start ?? 0.3 }, "voice").then(done)}>
          {pending.includes("voice") ? <Loader2 className="animate-spin" /> : <Mic />} {track ? "Record again" : "Record"}
        </SmallButton>
      </div>
    </>
  );
}
