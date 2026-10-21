"use client";

// The prompt bar's pickers, as pills: what to make, its aspect ratio, and its
// settings (model, takes and brand check) in one panel, summarised on the
// pill. Who it is for sits in the bar's top strip (audience.tsx).

import { Check, ChevronDown, Film, Image as ImageIcon, Layers, LayoutTemplate } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ASPECTS, IMAGE_MODELS, MUSIC_MODELS, OUTPUTS, VIDEO_MODELS, imageModel, videoModel, type Aspect, type MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { usd, type PromptPicks } from "./options";

export const OUTPUT_ICON: Record<MediaOutput, ReactNode> = {
  auto: <Layers />,
  image: <ImageIcon />,
  poster: <LayoutTemplate />,
  video: <Film />,
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
                if (o === "video" && !ASPECTS.find((a) => a.value === picks.aspect)?.video) patch.aspect = "9:16";
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

/** The shape, a pill of its own. */
export function AspectMenu({ picks, set }: { picks: PromptPicks; set: (p: Partial<PromptPicks>) => void }) {
  const [open, setOpen] = useState(false);
  const videoOnly = picks.output === "video";
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
  if (p.output === "image") return [imageModel(p.imageModel).label, p.count > 1 ? `${p.count} takes` : ""].filter(Boolean).join(", ");
  if (p.output === "poster") return imageModel(p.imageModel).label;
  if (p.output === "video") return videoModel(p.videoModel).label;
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
  const o = picks.output;
  const showImage = o === "auto" || o === "image" || o === "poster";
  const showVideo = o === "auto" || o === "video";
  const showMusic = o === "auto" || o === "video";
  return (
    <Popover>
      <PopoverTrigger className={cn(chipClass, "shrink")} title="Model">
        <GeminiMark className="size-3.5! text-neutral-900!" />
        <span className="truncate">{summary(picks)}</span>
        <Chevron />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-[340px] gap-0 overflow-hidden p-0">
        <div className="max-h-[min(70vh,600px)] overflow-y-auto overscroll-contain">
          {showImage && <Models title={o === "auto" ? "Image model" : "Model"} list={IMAGE_MODELS} value={picks.imageModel} onPick={(id) => set({ imageModel: id })} price={(m) => `${usd(m.price)} / image`} />}
          {showVideo && <Models title={o === "auto" || o === "video" ? "Video model" : "Model"} list={VIDEO_MODELS} value={picks.videoModel} onPick={(id) => set({ videoModel: id })} price={(m) => `${usd(m.perSecond)} / s`} />}
          {showMusic && <Models title="Music" list={MUSIC_MODELS} value={picks.musicModel} onPick={(id) => set({ musicModel: id })} price={(m) => usd(m.price)} />}

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
        </div>
      </PopoverContent>
    </Popover>
  );
}
