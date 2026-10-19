"use client";

// Settings for one shot or sound track of a video, with the buttons that call
// the models directly: regenerate (pick a cheaper or better model), change a
// finished shot with Omni instead of remaking it, continue it, add shots,
// music and a voiceover. Each shows what it would cost before it runs.

import { ArrowLeft, ArrowRight, Loader2, Music, Plus, RefreshCw, Trash2, PenLine, Mic, FastForward } from "lucide-react";
import { useState } from "react";
import { EXTRAS, timeline, type AudioClip, type Clip, type KenBurns, type ShotRole } from "@slice/backend/convex/mediaTypes";
import { usd } from "../prompt/options";
import { cn } from "@/lib/utils";
import { Select } from "@/components/console/form";
import { Badge } from "@/components/console/primitives";
import { useStudio } from "./context";
import { ImagePreview, Num, Row, Section, Seg, SmallButton, Toggle } from "./controls";
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

const ROLE_LABEL: Record<ShotRole, string> = { hero: "Hero", product: "Product", broll: "B-roll", still: "Still", talent: "Person" };

/** Veo fits about 2.5 spoken words a second; one shot is at most 8 s. */
const MAX_WORDS = 18;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Seconds a spoken shot takes: room for the line, rounded up to a whole Veo length. */
const spokenSeconds = (s: string, min: number) => [4, 6, 8].find((v) => v >= Math.min(8, Math.max(min, wordCount(s) / 2.5 + 1))) ?? 8;

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

const box = "w-full resize-none rounded-md bg-neutral-100/80 px-2 py-1.5 text-xs leading-5 outline-none focus:bg-white focus:ring-1 focus:ring-sky-500";

function Cost({ usd: n, model }: { usd: number; model?: string }) {
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {n === 0 ? "Free" : `≈ ${usd(n)}`}
      {model ? ` · ${model}` : ""}
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

export function ShotPanel({ id }: { id: string }) {
  const { doc, editor, campaign, creative, act, pending, assets, jobs, select, playback } = useStudio();
  const pictures = usePictures();
  const clips = doc?.video ?? [];
  const i = clips.findIndex((c) => c.id === id);
  const clip = clips[i];
  const [prompt, setPrompt] = useState(clip?.prompt ?? "");
  const [quality, setQuality] = useState<Quality>("auto");
  const [sound, setSound] = useState(false);
  const [says, setSays] = useState(clip?.says ?? "");
  const [image, setImage] = useState("");
  const [instruction, setInstruction] = useState("");
  const [extend, setExtend] = useState({ seconds: 4, prompt: "" });
  const [add, setAdd] = useState<{ kind: "motion" | "still"; role: ShotRole; seconds: number; prompt: string; says: string }>({ kind: "motion", role: "broll", seconds: 4, prompt: "", says: "" });
  if (!doc || !creative || !clip) return <p className="p-4 text-sm text-muted-foreground">This shot is gone.</p>;

  const start = timeline(doc)[i]?.start ?? 0;
  const len = Math.max(0, clip.out - clip.in);
  const job = jobs.find((j) => j.targetId === clip.id && (j.status === "queued" || j.status === "running"));
  const busy = clip.status === "pending" || !!job;
  const source = clip.kind === "motion" ? (assets.find((a) => a.url === clip.src)?.duration ?? 8) : 30;
  const setClip = (p: Partial<Clip>) => editor.update((d) => ({ ...d, video: (d.video ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) }));
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
  const cid = creative._id;
  const speaks = clip.kind === "motion" && !!says.trim();
  const regen = shotEstimate(campaign.tier, speaks ? { ...clip, role: "talent", in: 0, out: spokenSeconds(says, clip.out - clip.in) } : clip, quality, sound || speaks);
  const regenFree = clip.kind === "still" && !!image;
  const ext = shotEstimate(campaign.tier, { kind: "motion", role: clip.role ?? "broll", in: 0, out: extend.seconds }, "auto");
  const addSays = add.kind === "motion" && add.role === "talent" ? add.says.trim() : "";
  const addSecs = addSays ? spokenSeconds(addSays, add.seconds) : add.seconds;
  const addEst = shotEstimate(campaign.tier, { kind: add.kind, role: add.kind === "still" ? "still" : add.role, in: 0, out: addSecs }, "auto", !!addSays);
  const running = (label: string) => pending.includes(label);

  return (
    <div>
      <Section
        title={
          <span className="flex items-center gap-2 text-foreground">
            Shot {i + 1}
            <Badge tone="outline">{clip.kind === "still" ? "Still" : ROLE_LABEL[clip.role ?? "broll"]}</Badge>
          </span>
        }
        aside={
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {start.toFixed(1)}–{(start + len).toFixed(1)} s
          </span>
        }
      >
        {clip.kind === "motion" && clip.src && clip.status === "ready" ? (
          <video key={clip.src} src={clip.src} poster={clip.poster} controls muted loop playsInline className="max-h-56 w-full rounded-md bg-black object-contain" />
        ) : (
          <ImagePreview src={clip.poster} focal={clip.focal} onFocal={(focal) => setClip({ focal })} />
        )}
        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Generating{job ? ` with ${job.model}` : ""}. It lands here by itself.
          </p>
        )}
        {clip.status === "failed" && <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">{clip.error || "This shot failed. Try again, maybe with a simpler prompt."}</p>}
        {clip.status === "ready" && clip.model && <p className="text-[11px] text-muted-foreground">Made with {clip.model}</p>}
        <div className="flex flex-wrap gap-1.5">
          <SmallButton onClick={() => playback.seek(start + 0.01)}>Jump here</SmallButton>
          <SmallButton onClick={() => move(-1)} disabled={i === 0} title="Earlier">
            <ArrowLeft />
          </SmallButton>
          <SmallButton onClick={() => move(1)} disabled={i === clips.length - 1} title="Later">
            <ArrowRight />
          </SmallButton>
          <SmallButton tone="danger" onClick={remove} title="Delete shot">
            <Trash2 />
          </SmallButton>
        </div>
      </Section>

      <Section title="Regenerate">
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
          <Cost usd={regenFree ? 0 : regen.usd} model={regenFree ? undefined : regen.model} />
          <SmallButton
            tone="primary"
            disabled={busy || running("regen") || wordCount(says) > MAX_WORDS}
            onClick={() => void act("regenerate_shot", { creative_id: cid, shot_id: clip.id, prompt: prompt.trim() !== (clip.prompt ?? "") ? prompt.trim() : "", quality, image, sound, ...(says.trim() !== (clip.says ?? "") ? { says: says.trim() } : {}) }, "regen")}
          >
            {running("regen") ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
          </SmallButton>
        </div>
      </Section>

      {clip.kind === "motion" && clip.status === "ready" && clip.src && (
        <>
          <Section title="Change it" aside={<span className="text-[11px] text-muted-foreground">Omni Flash</span>}>
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} placeholder="Make it golden hour · swap the mug for our bottle · add light rain" className={box} />
            <p className="text-[11px] leading-4 text-muted-foreground">Keeps the rest of the shot. Usually cheaper and truer than regenerating when it is mostly right.</p>
            <div className="flex items-center justify-between gap-2">
              <Cost usd={omniEstimate(clip)} />
              <SmallButton tone="primary" disabled={busy || !instruction.trim() || running("edit")} onClick={() => void act("edit_shot", { creative_id: cid, shot_id: clip.id, instruction: instruction.trim() }, "edit").then((ok) => ok && setInstruction(""))}>
                {running("edit") ? <Loader2 className="animate-spin" /> : <PenLine />} Change
              </SmallButton>
            </div>
          </Section>
          <Section title="Continue it">
            <input value={extend.prompt} onChange={(e) => setExtend({ ...extend, prompt: e.target.value })} placeholder="What happens next (empty: the same move carries on)" className={cn(box, "h-7 py-0")} />
            <Row label="Length">
              <Num value={extend.seconds} min={2} max={8} step={1} suffix="s" onChange={(seconds) => setExtend({ ...extend, seconds })} />
            </Row>
            <div className="flex items-center justify-between gap-2">
              <Cost usd={ext.usd} model={ext.model} />
              <SmallButton disabled={busy || running("extend")} onClick={() => void act("extend_shot", { creative_id: cid, shot_id: clip.id, seconds: extend.seconds, prompt: extend.prompt.trim() }, "extend")}>
                {running("extend") ? <Loader2 className="animate-spin" /> : <FastForward />} Continue
              </SmallButton>
            </div>
          </Section>
        </>
      )}

      <Section title="Timing and look">
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
        <p className="text-[11px] leading-4 text-muted-foreground">Click the picture to set the focal point: it stays in view when the shot crops to this format.</p>
      </Section>

      <Section title="Add a shot after this one">
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
        {add.kind === "motion" && add.role === "talent" && <SaysField value={add.says} onChange={(says) => setAdd({ ...add, says })} />}
        <div className="flex items-center justify-between gap-2">
          <Cost usd={addEst.usd} model={addEst.model} />
          <SmallButton
            disabled={!add.prompt.trim() || running("add") || wordCount(addSays) > MAX_WORDS}
            onClick={() =>
              void act("add_shots", { creative_id: cid, after: clip.id, shots: [{ kind: add.kind, role: add.kind === "still" ? "still" : add.role, prompt: add.prompt.trim(), seconds: addSecs, transition: "cut", ...(addSays ? { says: addSays } : {}) }] }, "add").then((ok) => ok && setAdd({ ...add, prompt: "", says: "" }))
            }
          >
            {running("add") ? <Loader2 className="animate-spin" /> : <Plus />} Add shot
          </SmallButton>
        </div>
      </Section>
    </div>
  );
}

/* Sound -------------------------------------------------------------------------- */

export function AudioPanel({ id }: { id: string }) {
  const { doc, editor, creative, act, pending, select, campaign } = useStudio();
  const brief = campaign.brief as { goal?: string } | undefined;
  const fresh = id === "new:music" ? "music" : id === "new:voice" ? "voice" : null;
  const track = (doc?.audio ?? []).find((a) => a.id === id);
  const kind: AudioClip["kind"] = fresh ?? track?.kind ?? "music";
  const [prompt, setPrompt] = useState(kind === "music" ? (track?.prompt ?? "") : "");
  const [volume, setVolume] = useState(track?.volume ?? 0.5);
  const [script, setScript] = useState(track?.text ?? "");
  const [voice, setVoice] = useState(() => {
    const v = track?.prompt?.split(":")[0];
    return VOICES.some(([n]) => n === v) ? (v as string) : "Kore";
  });
  const [style, setStyle] = useState(() => track?.prompt?.split(":").slice(1).join(":").trim() ?? "");
  if (!doc || !creative) return null;
  if (!fresh && !track) return <p className="p-4 text-sm text-muted-foreground">This track is gone.</p>;
  const total = (doc.video ?? []).reduce((s, c) => s + Math.max(0, c.out - c.in), 0);
  const setTrack = (p: Partial<AudioClip>) => editor.update((d) => ({ ...d, audio: (d.audio ?? []).map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const target = Math.round(total * 2.3);
  const running = (label: string) => pending.includes(label);

  return (
    <div>
      <Section
        title={
          <span className="flex items-center gap-1.5 text-foreground [&_svg]:size-3.5">
            {kind === "music" ? <Music /> : <Mic />} {kind === "music" ? "Music" : "Voiceover"}
          </span>
        }
      >
        {track ? (
          <>
            {track.status === "ready" && track.src && <audio key={track.src} src={track.src} controls className="h-8 w-full" />}
            {track.status === "pending" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {kind === "music" ? "Composing with Lyria 3" : "Recording with Gemini TTS"}
              </p>
            )}
            {track.status === "failed" && <p className="rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">{track.error || "This track failed."}</p>}
            <div className="grid grid-cols-2 gap-1.5">
              <Num label="From" value={track.start} min={0} max={total} step={0.1} suffix="s" onChange={(start) => setTrack({ start })} />
              <Num label="Length" value={track.duration} min={0.5} max={total} step={0.1} suffix="s" onChange={(duration) => setTrack({ duration })} />
            </div>
            <Row label="Volume">
              <input type="range" min={0} max={1} step={0.05} value={track.volume} onChange={(e) => setTrack({ volume: Number(e.target.value) })} className="w-full accent-neutral-900" />
              <span className="w-9 text-right text-xs tabular-nums">{Math.round(track.volume * 100)}%</span>
            </Row>
            <SmallButton
              tone="danger"
              onClick={() => {
                editor.update((d) => ({ ...d, audio: (d.audio ?? []).filter((a) => a.id !== id) }));
                select({ kind: "none" });
              }}
            >
              <Trash2 /> Remove track
            </SmallButton>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{kind === "music" ? "An instrumental score for the whole video, fitted and faded to its length." : `A voice reading your script over the video. About ${target} words fit ${Math.round(total)} s.`}</p>
        )}
      </Section>
      {kind === "music" ? (
        <Section title={track ? "New music" : "Compose"} aside={<span className="text-[11px] text-muted-foreground">Lyria 3</span>}>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={`Genre, mood, tempo, instruments${brief?.goal ? ` for “${brief.goal.slice(0, 40)}”` : ""}, e.g. warm lo-fi house, 112 BPM, soft Rhodes, builds at 8 s`} className={box} />
          {!track && (
            <Row label="Volume">
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full accent-neutral-900" />
            </Row>
          )}
          <div className="flex items-center justify-between gap-2">
            <Cost usd={EXTRAS.music.price} />
            <SmallButton
              tone="primary"
              disabled={!prompt.trim() || running("music")}
              onClick={() =>
                void act("add_music", { creative_id: creative._id, prompt: prompt.trim(), volume: track?.volume ?? volume }, "music").then((ok) => {
                  if (ok && fresh) select({ kind: "none" });
                })
              }
            >
              {running("music") ? <Loader2 className="animate-spin" /> : <Music />} {track ? "Replace music" : "Add music"}
            </SmallButton>
          </div>
        </Section>
      ) : (
        <Section title={track ? "New take" : "Record"} aside={<span className="text-[11px] text-muted-foreground">Gemini TTS</span>}>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} placeholder="The words, in your brand's voice" className={box} />
          <p className={cn("text-[11px] tabular-nums", words > total * 2.6 ? "text-amber-700" : "text-muted-foreground")}>
            {words} words · about {target} fit
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
            <SmallButton
              tone="primary"
              disabled={!script.trim() || running("voice")}
              onClick={() =>
                void act("add_voiceover", { creative_id: creative._id, script: script.trim(), voice, style: style.trim(), start: track?.start ?? 0.3 }, "voice").then((ok) => {
                  if (ok && fresh) select({ kind: "none" });
                })
              }
            >
              {running("voice") ? <Loader2 className="animate-spin" /> : <Mic />} {track ? "Record again" : "Record"}
            </SmallButton>
          </div>
        </Section>
      )}
    </div>
  );
}
