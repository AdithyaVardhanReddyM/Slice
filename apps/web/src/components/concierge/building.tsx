"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Span } from "./types";
import { Trace } from "./trace";

const STAGES = [
  "Sending your signals to Qloo",
  "Reading the aesthetic and cultural tags they share",
  "Finding brand affinities",
  "Checking who else shares these signals",
  "Matching it to the store's own styles",
  "Writing your taste brief for this store",
];

/** Shown while taste.build runs. Stages tick on a timer; the real trace replaces them when it lands. */
export function Building({ spans, error }: { spans: Span[] | null; error: string | null }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (spans) return;
    const id = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 900);
    return () => clearInterval(id);
  }, [spans]);

  return (
    <div className="flex h-full flex-col px-6 pt-10">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--mute)]">Building your profile</p>
      <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
        {spans ? "Done. Here's what happened." : "Reading your taste…"}
      </h2>
      {error ? (
        <p className="mt-4 rounded-xl bg-[var(--qloo-soft)] p-3 text-[13px] text-[var(--qloo)]">{error}</p>
      ) : spans ? (
        <div className="mt-5">
          <Trace spans={spans} />
        </div>
      ) : (
        <ol className="mt-6 space-y-3">
          {STAGES.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 text-[13.5px] transition-opacity",
                i > stage ? "opacity-30" : "opacity-100",
              )}
            >
              <span className="grid size-5 place-items-center">
                {i < stage ? (
                  <Check className="size-4 text-[var(--catalog)]" />
                ) : i === stage ? (
                  <Loader2 className="size-4 animate-spin text-[var(--qloo)]" />
                ) : (
                  <i className="size-1.5 rounded-full bg-[var(--line)]" />
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
