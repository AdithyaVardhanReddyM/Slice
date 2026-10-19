"use client";

// The prompt bar's pickers: what to make, which model, the shape, and who it
// is for. Each is a chip that opens a menu; in the narrow docked bar the chips
// drop their words and keep their icons.

import { useMutation, useQuery } from "convex/react";
import { Check, ChevronDown, Clapperboard, Cpu, Film, Image as ImageIcon, Layers, LayoutTemplate, Music, Plus, ShieldCheck, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { ASPECTS, IMAGE_MODELS, MUSIC_MODELS, OUTPUTS, VIDEO_MODELS, imageModel, musicModel, videoModel, type Aspect, type MediaAudience, type MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

export const chipClass =
  "inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-neutral-700 ring-1 ring-black/[0.08] transition-colors hover:bg-neutral-50 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-neutral-100 [&_svg]:size-3.5 [&_svg]:shrink-0";

/** The chip's words, hidden when the bar is narrow (docked in the sidebar). */
const Words = ({ children }: { children: ReactNode }) => <span className="truncate @max-[520px]:hidden">{children}</span>;

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
        <Words>{OUTPUTS[picks.output].label}</Words>
        <ChevronDown className="text-neutral-400 @max-[520px]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
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

function ModelList<T extends { id: string; label: string; blurb: string }>({ title, list, value, onPick, price }: { title: string; list: T[]; value: string; onPick: (id: string) => void; price: (m: T) => string }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {list.map((m) => (
        <DropdownMenuItem key={m.id} closeOnClick={false} className="items-start gap-2.5 py-2" onClick={() => onPick(m.id)}>
          <Row title={m.label} hint={m.blurb} on={value === m.id} right={<span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">{price(m)}</span>} />
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

export function ModelMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  const o = picks.output;
  const showImage = o === "auto" || o === "image" || o === "poster";
  const showVideo = o === "auto" || o === "clip" || o === "video";
  const showMusic = o === "auto" || o === "music" || o === "video";
  const label = o === "image" || o === "poster" ? imageModel(picks.imageModel).label : o === "clip" || o === "video" ? videoModel(picks.videoModel).label : o === "music" ? musicModel(picks.musicModel).label : "Models";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chipClass} title="Models">
        <Cpu />
        <Words>
          {label}
          {o === "image" && picks.count > 1 ? ` × ${picks.count}` : ""}
        </Words>
        <ChevronDown className="text-neutral-400 @max-[520px]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-80">
        {showImage && <ModelList title="Image" list={IMAGE_MODELS} value={picks.imageModel} onPick={(id) => set({ imageModel: id })} price={(m) => `${usd(m.price)} / image`} />}
        {showImage && showVideo && <DropdownMenuSeparator />}
        {showVideo && <ModelList title="Video" list={VIDEO_MODELS} value={picks.videoModel} onPick={(id) => set({ videoModel: id })} price={(m) => `${usd(m.perSecond)} / s`} />}
        {showMusic && <DropdownMenuSeparator />}
        {showMusic && <ModelList title="Music" list={MUSIC_MODELS} value={picks.musicModel} onPick={(id) => set({ musicModel: id })} price={(m) => usd(m.price)} />}
        {(o === "image" || o === "auto" || o === "poster") && (
          <>
            <DropdownMenuSeparator />
            {o === "image" && (
              <div className="flex items-center justify-between gap-3 px-1.5 py-1.5">
                <span className="text-sm">Takes</span>
                <span className="flex rounded-md bg-neutral-100 p-0.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => set({ count: n })} className={cn("h-6 w-7 rounded-[5px] text-xs font-medium text-neutral-600", picks.count === n && "bg-white text-neutral-950 shadow-sm")}>
                      {n}
                    </button>
                  ))}
                </span>
              </div>
            )}
            <DropdownMenuItem closeOnClick={false} className="items-start gap-2.5 py-2" onClick={() => set({ check: !picks.check })}>
              <Row icon={<ShieldCheck />} title="Brand check" hint="Each image is checked against your guidelines and remade once if it misses" on={picks.check} />
            </DropdownMenuItem>
          </>
        )}
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

export function AspectMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  const videoOnly = picks.output === "clip" || picks.output === "video";
  const hidden = picks.output === "music";
  if (hidden) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chipClass} title="Shape">
        <AspectGlyph aspect={picks.aspect} />
        <Words>{picks.aspect}</Words>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Shape</DropdownMenuLabel>
          {ASPECTS.map((a) => (
            <DropdownMenuItem key={a.value} disabled={videoOnly && !a.video} className="gap-2.5" onClick={() => set({ aspect: a.value as Aspect })}>
              <AspectGlyph aspect={a.value} className="text-neutral-500" />
              <span className="flex-1 text-sm">
                {a.value} <span className="text-muted-foreground">{a.label}</span>
              </span>
              {picks.aspect === a.value && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {videoOnly && <p className="px-1.5 pt-1 pb-1.5 text-xs text-muted-foreground">Video models make 9:16 and 16:9.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const slug = (name: string, taken: Set<string>) => {
  const base = `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "audience"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
};

/** Who the next prompts are for: everyone, a Pages audience of the brand, or one described here (Qloo reads its taste). */
export function AudienceMenu() {
  const { campaign, campaignId, brand, audienceId, setAudienceId } = useCanvas();
  const update = useMutation(api.media.update);
  const pagesId = brand?.source.pagesBrandId;
  const pagesAudiences = useQuery(api.pagesAudiences.list, pagesId ? { brandId: pagesId } : "skip");
  const audiences = campaign.audiences as MediaAudience[];
  const current = audiences.find((a) => a.id === audienceId) ?? audiences.find((a) => a.kind === "everyone") ?? { id: "all", name: "Everyone", kind: "everyone" as const };
  const [describe, setDescribe] = useState(false);
  const [seed, setSeed] = useState({ name: "", city: "", interests: [] as string[] });
  const ready = (pagesAudiences ?? []).filter((a) => a.status === "ready" && !audiences.some((x) => x.pagesAudienceId === a._id));

  const add = async (a: Omit<MediaAudience, "id">) => {
    const id = slug(a.name, new Set(audiences.map((x) => x.id)));
    // Everyone stays first; past six, the oldest described audience makes room.
    const everyone: MediaAudience = audiences.find((x) => x.kind === "everyone") ?? { id: "all", name: "Everyone", kind: "everyone" };
    const rest = [...audiences.filter((x) => x.kind !== "everyone"), { ...a, id }].slice(-5);
    await update({ id: campaignId, audiences: [everyone, ...rest] });
    setAudienceId(id);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(chipClass, current.id !== "all" && "bg-orange-50 text-orange-800 ring-orange-200 hover:bg-orange-50")} title="Who it is for">
          <Users />
          <Words>{current.id === "all" ? "Everyone" : current.name}</Words>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>For</DropdownMenuLabel>
            {audiences.map((a) => (
              <DropdownMenuItem key={a.id} className="items-start gap-2.5 py-2" onClick={() => setAudienceId(a.id)}>
                <Row title={a.id === "all" ? "Everyone" : a.name} hint={a.kind === "everyone" ? "The brand's own taste" : a.kind === "pages" ? "Pages audience, Qloo taste" : a.seed?.interests?.join(", ")} on={current.id === a.id} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {ready.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>From Pages</DropdownMenuLabel>
                {ready.slice(0, 6).map((a) => (
                  <DropdownMenuItem key={a._id} onClick={() => void add({ name: a.name, kind: "pages", pagesAudienceId: a._id, ...(a.brief?.summary ? { summary: String(a.brief.summary).slice(0, 400) } : {}) })}>
                    <Plus className="text-neutral-400" /> {a.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDescribe(true)}>
            <Plus className="text-neutral-400" /> Describe an audience
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={describe} onOpenChange={setDescribe}>
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
            <Button variant="outline" onClick={() => setDescribe(false)}>
              Cancel
            </Button>
            <Button
              disabled={!seed.interests.length}
              onClick={() => {
                const name = seed.name.trim() || [seed.city.trim(), seed.interests.slice(0, 2).join(" & ")].filter(Boolean).join(" · ");
                void add({ name, kind: "seed", seed: { interests: seed.interests, ...(seed.city.trim() ? { city: seed.city.trim() } : {}) } });
                setSeed({ name: "", city: "", interests: [] });
                setDescribe(false);
              }}
            >
              Add audience
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
