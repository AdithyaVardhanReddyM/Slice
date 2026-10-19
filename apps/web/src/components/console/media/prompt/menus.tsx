"use client";

// The prompt bar's pickers, as pills: what to make, its aspect ratio, and its
// settings (model, takes, brand check and who it is for) in one panel,
// summarised on the pill. One more shows only when the prompts are for a
// chosen audience.

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Clapperboard, Film, Image as ImageIcon, Layers, LayoutTemplate, Music, Plus, Users, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { ASPECTS, IMAGE_MODELS, MUSIC_MODELS, OUTPUTS, VIDEO_MODELS, imageModel, musicModel, videoModel, type Aspect, type MediaAudience, type MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/console/form";
import { TokenInput } from "@/components/console/setup/atoms";
import { useCanvas } from "../canvas/context";
import { usd, type PromptPicks } from "./options";

export const OUTPUT_ICON: Record<MediaOutput, ReactNode> = {
  auto: <Layers />,
  image: <ImageIcon />,
  poster: <LayoutTemplate />,
  clip: <Clapperboard />,
  video: <Film />,
  music: <Music />,
};

/** A soft filled pill: the prompt bar's controls (a little tighter in the docked bar). */
export const chipClass =
  "inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 text-[13px] @max-[480px]:gap-1 @max-[480px]:px-2.5 font-medium text-neutral-800 transition-colors hover:bg-neutral-200/70 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-neutral-200/70 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-neutral-500";

const Chevron = () => <ChevronDown className="-mr-0.5 size-3.5! text-neutral-400 @max-[480px]:hidden" />;

function Row({ icon, title, hint, on, right }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; on?: boolean; right?: ReactNode }) {
  return (
    <>
      {icon && <span className="mt-0.5 text-neutral-500 [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {right}
      {on && <Check className="mt-0.5 size-4 shrink-0" />}
    </>
  );
}

export function OutputMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chipClass} title="What to make">
        {OUTPUT_ICON[picks.output]}
        <span className="truncate">{OUTPUTS[picks.output].label}</span>
        <Chevron />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Make</DropdownMenuLabel>
          {(Object.keys(OUTPUTS) as MediaOutput[]).map((o) => (
            <DropdownMenuItem
              key={o}
              className="items-start gap-2.5 py-2"
              onClick={() => {
                const patch: Partial<PromptPicks> = { output: o };
                // Video models make 9:16 and 16:9 only.
                if ((o === "clip" || o === "video") && !ASPECTS.find((a) => a.value === picks.aspect)?.video) patch.aspect = "9:16";
                set(patch);
              }}
            >
              <Row icon={OUTPUT_ICON[o]} title={OUTPUTS[o].label} hint={OUTPUTS[o].hint} on={picks.output === o} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AspectGlyph({ aspect, className }: { aspect: string; className?: string }) {
  const [a, b] = aspect.split(":").map(Number);
  const r = a / b;
  const w = r >= 1 ? 14 : 14 * r;
  const h = r >= 1 ? 14 / r : 14;
  return (
    <span className={cn("flex size-3.5 items-center justify-center", className)}>
      <span className="rounded-[2px] border-[1.5px] border-current" style={{ width: w, height: h }} />
    </span>
  );
}

/** The shape, a pill of its own; music has none. */
export function AspectMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  const [open, setOpen] = useState(false);
  if (picks.output === "music") return null;
  const videoOnly = picks.output === "clip" || picks.output === "video";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass} title="Aspect ratio">
        <AspectGlyph aspect={picks.aspect} />
        <span>{picks.aspect}</span>
        <Chevron />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-[300px] gap-2 p-3">
        <p className="px-1 text-xs font-medium text-muted-foreground">Aspect ratio</p>
        <div className="grid grid-cols-4 gap-1.5">
          {ASPECTS.map((a) => {
            const on = picks.aspect === a.value;
            return (
              <button
                key={a.value}
                type="button"
                disabled={videoOnly && !a.video}
                onClick={() => {
                  set({ aspect: a.value as Aspect });
                  setOpen(false);
                }}
                className={cn("flex h-[64px] flex-col items-center justify-center gap-1.5 rounded-lg text-neutral-600 ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-35", on && "bg-neutral-50 text-neutral-950 ring-2 ring-neutral-900")}
              >
                <AspectGlyph aspect={a.value} className="size-4" />
                <span className="text-xs leading-none font-medium">{a.value}</span>
                <span className="text-[11px] leading-none text-neutral-400">{a.label}</span>
              </button>
            );
          })}
        </div>
        {videoOnly && <p className="px-1 text-xs text-muted-foreground">Video models make 9:16 and 16:9.</p>}
      </PopoverContent>
    </Popover>
  );
}

/* Audiences ----------------------------------------------------------------- */

const slug = (name: string, taken: Set<string>) => {
  const base = `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "audience"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

/** Who the next prompts are for: everyone, a Pages audience of the brand, or one described here (Qloo reads its taste). */
function useAudiences() {
  const { campaign, campaignId, brand, audienceId, setAudienceId } = useCanvas();
  const update = useMutation(api.media.update);
  const pagesId = brand?.source.pagesBrandId;
  const pagesAudiences = useQuery(api.pagesAudiences.list, pagesId ? { brandId: pagesId } : "skip");
  const audiences = campaign.audiences as MediaAudience[];
  const current = audiences.find((a) => a.id === audienceId) ?? audiences.find((a) => a.kind === "everyone") ?? { id: "all", name: "Everyone", kind: "everyone" as const };
  const fromPages = (pagesAudiences ?? []).filter((a) => a.status === "ready" && !audiences.some((x) => x.pagesAudienceId === a._id));

  const add = async (a: Omit<MediaAudience, "id">) => {
    const id = slug(a.name, new Set(audiences.map((x) => x.id)));
    // Everyone stays first; past six, the oldest described audience makes room.
    const everyone: MediaAudience = audiences.find((x) => x.kind === "everyone") ?? { id: "all", name: "Everyone", kind: "everyone" };
    const rest = [...audiences.filter((x) => x.kind !== "everyone"), { ...a, id }].slice(-5);
    await update({ id: campaignId, audiences: [everyone, ...rest] });
    setAudienceId(id);
  };
  return { audiences, current, fromPages, add, choose: setAudienceId };
}

function DescribeAudience({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (a: Omit<MediaAudience, "id">) => void }) {
  const [seed, setSeed] = useState({ name: "", city: "", interests: [] as string[] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Describe an audience</DialogTitle>
          <DialogDescription>Slice reads their taste with Qloo and shapes what it makes for them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5">
          <Input value={seed.name} onChange={(e) => setSeed({ ...seed, name: e.target.value })} placeholder="Name, e.g. Weekend brunch crowd" />
          <Input value={seed.city} onChange={(e) => setSeed({ ...seed, city: e.target.value })} placeholder="City (optional)" />
          <TokenInput values={seed.interests} onChange={(interests) => setSeed({ ...seed, interests })} placeholder="What they're into: natural wine, jazz, Wes Anderson…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!seed.interests.length}
            onClick={() => {
              const name = seed.name.trim() || [seed.city.trim(), seed.interests.slice(0, 2).join(" & ")].filter(Boolean).join(" · ");
              onAdd({ name, kind: "seed", seed: { interests: seed.interests, ...(seed.city.trim() ? { city: seed.city.trim() } : {}) } });
              setSeed({ name: "", city: "", interests: [] });
              onOpenChange(false);
            }}
          >
            Add audience
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shown beside the settings while the prompts are for one audience; × goes back to everyone. */
export function AudiencePill() {
  const { current, choose } = useAudiences();
  if (current.id === "all") return null;
  return (
    <span className={cn(chipClass, "max-w-44 shrink gap-1 bg-orange-50 pr-1 text-orange-900 hover:bg-orange-50 [&_svg]:text-orange-700")} title={`For ${current.name}`}>
      <Users />
      <span className="truncate">{current.name}</span>
      <button type="button" aria-label="Make it for everyone" onClick={() => choose("all")} className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-orange-100">
        <X className="size-3.5!" />
      </button>
    </span>
  );
}

/* Settings ------------------------------------------------------------------ */

/** Google Gemini's mark, single colour (inherits the text colour): every model here is Google's. */
function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("shrink-0 fill-current", className)}>
      <path d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12" />
    </svg>
  );
}

/** The settings pill's words: the model it will use. */
function summary(p: PromptPicks) {
  if (p.output === "image") return [imageModel(p.imageModel).label, p.count > 1 ? `${p.count} takes` : ""].filter(Boolean).join(" · ");
  if (p.output === "poster") return imageModel(p.imageModel).label;
  if (p.output === "clip" || p.output === "video") return videoModel(p.videoModel).label;
  if (p.output === "music") return musicModel(p.musicModel).label;
  return "Settings";
}

function Section({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-neutral-100 p-3 first:border-t-0", className)}>
      {title && <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{title}</p>}
      {children}
    </div>
  );
}

const option = "flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-100";

function Models<T extends { id: string; label: string; blurb: string }>({ title, list, value, onPick, price }: { title: string; list: T[]; value: string; onPick: (id: string) => void; price: (m: T) => string }) {
  return (
    <Section title={title}>
      {list.map((m) => (
        <button key={m.id} type="button" className={option} onClick={() => onPick(m.id)}>
          <Row icon={<GeminiMark className="text-neutral-900" />} title={m.label} hint={m.blurb} on={value === m.id} right={<span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">{price(m)}</span>} />
        </button>
      ))}
    </Section>
  );
}

export function SettingsMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  const { audiences, current, fromPages, add, choose } = useAudiences();
  const [open, setOpen] = useState(false);
  const [describe, setDescribe] = useState(false);
  const o = picks.output;
  const showImage = o === "auto" || o === "image" || o === "poster";
  const showVideo = o === "auto" || o === "clip" || o === "video";
  const showMusic = o === "auto" || o === "music" || o === "video";
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={cn(chipClass, "shrink")} title="Model and audience">
          <GeminiMark className="size-3.5! text-neutral-900!" />
          <span className="truncate">{summary(picks)}</span>
          <Chevron />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={8} className="w-[340px] gap-0 overflow-hidden p-0">
          <div className="max-h-[min(70vh,600px)] overflow-y-auto overscroll-contain">
            {showImage && <Models title={o === "auto" ? "Image model" : "Model"} list={IMAGE_MODELS} value={picks.imageModel} onPick={(id) => set({ imageModel: id })} price={(m) => `${usd(m.price)} / image`} />}
            {showVideo && <Models title={o === "auto" || o === "video" ? "Video model" : "Model"} list={VIDEO_MODELS} value={picks.videoModel} onPick={(id) => set({ videoModel: id })} price={(m) => `${usd(m.perSecond)} / s`} />}
            {showMusic && <Models title={o === "music" ? "Model" : "Music"} list={MUSIC_MODELS} value={picks.musicModel} onPick={(id) => set({ musicModel: id })} price={(m) => usd(m.price)} />}

            {o === "image" && (
              <Section>
                <div className="flex items-center justify-between gap-3 px-1">
                  <span className="text-sm font-medium">Takes</span>
                  <span className="flex rounded-lg bg-neutral-100 p-0.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" onClick={() => set({ count: n })} className={cn("h-7 w-8 rounded-md text-xs font-medium text-neutral-600", picks.count === n && "bg-white text-neutral-950 shadow-sm")}>
                        {n}
                      </button>
                    ))}
                  </span>
                </div>
              </Section>
            )}

            {showImage && (
              <Section>
                <label className="flex cursor-pointer items-start gap-3 px-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Brand check</span>
                    <span className="block text-xs text-muted-foreground">Each image is checked against your guidelines and remade once if it misses</span>
                  </span>
                  <Switch checked={picks.check} onCheckedChange={(check) => set({ check })} className="mt-0.5" />
                </label>
              </Section>
            )}

            <Section title="For">
              {audiences.map((a) => (
                <button key={a.id} type="button" className={option} onClick={() => choose(a.id)}>
                  <Row title={a.id === "all" ? "Everyone" : a.name} hint={a.kind === "everyone" ? "The brand's own taste" : a.kind === "pages" ? "Pages audience, Qloo taste" : a.seed?.interests?.join(", ")} on={current.id === a.id} />
                </button>
              ))}
              {fromPages.slice(0, 6).map((a) => (
                <button key={a._id} type="button" className={cn(option, "items-center text-sm")} onClick={() => void add({ name: a.name, kind: "pages", pagesAudienceId: a._id, ...(a.brief?.summary ? { summary: String(a.brief.summary).slice(0, 400) } : {}) })}>
                  <Plus className="size-4 text-neutral-400" /> {a.name} <span className="ml-auto text-xs text-muted-foreground">From Pages</span>
                </button>
              ))}
              <button
                type="button"
                className={cn(option, "items-center text-sm text-neutral-700")}
                onClick={() => {
                  setOpen(false);
                  setDescribe(true);
                }}
              >
                <Plus className="size-4 text-neutral-400" /> Describe an audience
              </button>
            </Section>
          </div>
        </PopoverContent>
      </Popover>
      <DescribeAudience open={describe} onOpenChange={setDescribe} onAdd={(a) => void add(a)} />
    </>
  );
}
