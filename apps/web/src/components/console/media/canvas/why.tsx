"use client";

// Why a creative looks the way it does, in a few lines: the idea, and two or
// three reasons, each with the taste signal (from Qloo) it rests on.

import { Lightbulb } from "lucide-react";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import type { MediaAudience, MediaConcept } from "@slice/backend/convex/mediaTypes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanvas } from "./context";

/** The first sentence, cut to a readable length (older reasons were long). */
const tidy = (s: string, max: number) => {
  const first = s.split(/(?<=[.!?])\s/)[0].trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
};

export function whyOf(creative: Doc<"mediaCreatives"> | undefined, campaign: Doc<"mediaCampaigns">) {
  if (!creative) return null;
  const concept = ((campaign.concepts ?? []) as MediaConcept[]).find((c) => c.audienceKey === creative.audienceKey);
  const reasons = (creative.why?.length ? creative.why : concept?.why ?? []).slice(0, 3);
  if (!concept && !reasons.length) return null;
  const audience = (campaign.audiences as MediaAudience[]).find((a) => a.id === creative.audienceKey);
  return { concept, reasons, audience };
}

export function WhyButton({ creative, className }: { creative: Doc<"mediaCreatives">; className?: string }) {
  const { campaign } = useCanvas();
  const why = whyOf(creative, campaign);
  if (!why) return null;
  return (
    <Popover>
      <PopoverTrigger className={className} title="Why this">
        <Lightbulb />
        <span>Why</span>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" sideOffset={8} className="w-80 gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{why.audience && why.audience.id !== "all" ? `For ${why.audience.name}` : "For everyone"}</p>
          {why.concept && <p className="mt-1 text-sm leading-snug font-semibold">{tidy(why.concept.hook || why.concept.title, 90)}</p>}
        </div>
        {why.reasons.length > 0 && (
          <ul className="space-y-2.5">
            {why.reasons.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-orange-500" />
                <span className="min-w-0">
                  {tidy(r.text, 110)}
                  {r.evidence && <span className="mt-1 block w-fit max-w-full truncate rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{tidy(r.evidence, 48)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
