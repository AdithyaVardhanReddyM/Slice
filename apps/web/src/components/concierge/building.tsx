"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SliceMark } from "./ui";

const STAGES = [
  "Sending your answers to Qloo",
  "Reading the tastes they share",
  "Finding brand affinities",
  "Matching them to the store's styles",
  "Writing your taste brief",
];

/**
 * Shown while the profile builds. The first stages tick on a timer and hold on
 * the last build step until the brief starts; the full trace is available later
 * under "Your taste", so nothing is shown here but progress.
 */
export function Building({
  briefing,
  storeName,
  error,
}: {
  /** True once the profile exists and the taste brief is being written. */
  briefing: boolean;
  storeName: string;
  error: string | null;
}) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (briefing) return;
    const id = setInterval(() => setStage((s) => Math.min(STAGES.length - 2, s + 1)), 1100);
    return () => clearInterval(id);
  }, [briefing]);
  const current = briefing ? STAGES.length - 1 : stage;

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--sun), transparent 70%)" }}
      />
      <div className="relative w-full max-w-[320px]">
        <div className="rise flex justify-center">
          <span className="grid size-14 place-items-center rounded-full bg-white shadow-[0_1px_2px_rgb(23_21_15/0.06),0_10px_28px_rgb(23_21_15/0.1)]">
            {error ? <SliceMark size={26} /> : <Loader2 className="size-6 animate-spin text-[var(--tang)]" />}
          </span>
        </div>
        <h2 className="rise mt-5 text-center text-[22px] font-semibold leading-tight tracking-[-0.02em]">
          {error ? "That didn't work." : "Reading your taste…"}
        </h2>
        <p className="rise mt-1.5 text-center text-[13px] leading-relaxed text-[var(--ink-2)]">
          {error
            ? error
            : `Qloo is turning your answers into a profile for ${storeName}. About ten seconds.`}
        </p>

        {!error && (
          <ol className="rise mt-6 space-y-2.5 rounded-2xl bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgb(23_21_15/0.05)]">
            {STAGES.map((label, i) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-3 text-[13.5px] transition-opacity duration-300",
                  i > current ? "opacity-35" : "opacity-100",
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center">
                  {i < current ? (
                    <Check className="size-4 text-[var(--catalog)]" strokeWidth={2.5} />
                  ) : i === current ? (
                    <Loader2 className="size-4 animate-spin text-[var(--tang)]" />
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
    </div>
  );
}
