"use client";
/* eslint-disable @next/next/no-img-element -- pictures come from Convex storage and Qloo, sized by their boxes */

// Small shared pieces of the Why modal: what each kind of choice is called,
// the Qloo signal chips, and the two colour scales (orange for how strongly a
// taste shows, orange against sky for which way it leans).

import { Armchair, BookMarked, Box, Clapperboard, Eye, LayoutTemplate, MessageSquareText, Mic, MousePointerClick, Music, Palette, Sun, Type, UserStar, CaseSensitive } from "lucide-react";
import type { ReactNode } from "react";
import type { WhyChoice, WhyChoiceKind, WhySignal, WhySignalKind } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const ORANGE = "#ea580c";
export const SKY = "#0369a1";
const MID = "#e7e5e4";

/** 0..1 to the single-hue orange ramp (light to dark). */
export const heat = (t: number) => `color-mix(in oklab, ${ORANGE} ${Math.round(14 + 86 * Math.max(0, Math.min(1, t)))}%, #fff7ed)`;

/** -1..1 to the diverging scale: orange one way, sky the other, warm grey in the middle. */
export const leanColour = (v: number) => `color-mix(in oklab, ${v >= 0 ? ORANGE : SKY} ${Math.round(Math.min(1, Math.abs(v)) * 100)}%, ${MID})`;

/** Ink that reads on a heat fill. */
export const inkOn = (t: number) => (t > 0.55 ? "#ffffff" : "#431407");

export const score = (a: number) => Math.round(a * 100);

export const KIND: Record<WhyChoiceKind, { label: string; icon: ReactNode }> = {
  subject: { label: "Subject", icon: <Eye /> },
  product: { label: "Product", icon: <Box /> },
  setting: { label: "Setting", icon: <Armchair /> },
  light: { label: "Light", icon: <Sun /> },
  colour: { label: "Colour", icon: <Palette /> },
  words: { label: "Words", icon: <Type /> },
  type: { label: "Type", icon: <CaseSensitive /> },
  layout: { label: "Layout", icon: <LayoutTemplate /> },
  music: { label: "Music", icon: <Music /> },
  voice: { label: "Voice", icon: <Mic /> },
  motion: { label: "Motion", icon: <Clapperboard /> },
  cta: { label: "Call to action", icon: <MousePointerClick /> },
};

export const FROM: Record<WhyChoice["from"], { label: string; icon: ReactNode; tone: string }> = {
  taste: { label: "Their taste", icon: <UserStar />, tone: "bg-orange-50 text-orange-800" },
  brand: { label: "Your brand guidelines", icon: <BookMarked />, tone: "bg-neutral-100 text-neutral-700" },
  brief: { label: "Your request", icon: <MessageSquareText />, tone: "bg-neutral-100 text-neutral-700" },
};

const NOUN: Record<WhySignalKind, string> = {
  love: "one of the loves this audience was built from",
  trait: "a trait",
  brand: "a brand",
  artist: "an artist",
  film: "a film",
  tv: "a show",
  book: "a book",
  place: "a place",
  podcast: "a podcast",
  game: "a game",
};

/** `who` is the people the profile describes: "people who love Metallica and Ghost". */
export function signalHint(s: WhySignal, who: string) {
  if (s.kind === "love") return `${s.name} is ${NOUN.love}.`;
  if (s.kind === "trait" && s.affinity !== undefined) return `Qloo: ${who} lean ${s.name.toLowerCase()}, ${score(s.affinity)} out of 100.`;
  if (s.affinity !== undefined) return `Qloo: ${who} over-index on ${s.name}, ${score(s.affinity)} out of 100.`;
  return `Qloo: ${NOUN[s.kind]} ${who} over-index on.`;
}

/** A Qloo signal: a picture for things, a small meter for traits. */
export function SignalChip({ s, who, active, onHover, className }: { s: WhySignal; who: string; active?: boolean; onHover?: (on: boolean) => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            onMouseEnter={() => onHover?.(true)}
            onMouseLeave={() => onHover?.(false)}
            className={cn("inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-white pr-2.5 text-[12.5px] text-neutral-800 ring-1 ring-black/[0.08] transition-colors", s.image ? "pl-1" : "pl-2.5", active && "bg-orange-50 ring-orange-300", className)}
          >
            {s.image ? <img src={s.image} alt="" className="size-5 shrink-0 rounded-full bg-neutral-100 object-cover" /> : null}
            <span className="truncate">{s.name}</span>
            {s.affinity !== undefined && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500 tabular-nums">
                <span className="relative h-1 w-4 overflow-hidden rounded-full bg-neutral-200">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score(s.affinity)}%`, background: ORANGE }} />
                </span>
                {score(s.affinity)}
              </span>
            )}
          </span>
        }
      />
      <TooltipContent className="max-w-64">{signalHint(s, who)}</TooltipContent>
    </Tooltip>
  );
}

export function Section({ id, title, hint, children, aside }: { id?: string; title: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} data-why-section={id} className="scroll-mt-16 border-t border-neutral-100 px-8 py-7">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-neutral-950">{title}</h3>
          {hint && <p className="mt-1 text-[13px] leading-5 text-neutral-500">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "Metallica, Iron Maiden and Black Sabbath". */
export function listNames(names: string[], max = 3) {
  const n = names.slice(0, max);
  const more = names.length - n.length;
  if (more > 0) return `${n.join(", ")} and ${more} more`;
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : (n[0] ?? "");
}
