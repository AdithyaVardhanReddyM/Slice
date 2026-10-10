"use client";

import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { StoreInfo } from "./types";
import { Button, SliceMark } from "./ui";

export function Welcome({
  store,
  onTune,
  onBrowse,
}: {
  store: StoreInfo | null;
  onTune: () => void;
  onBrowse: () => void;
}) {
  const name = store?.name ?? "this store";
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden px-6 pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--sun), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-28 top-40 h-64 w-64 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #ffd1a8, transparent 70%)" }}
        />
        <div className="relative">
          <div className="rise flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink-2)]">
            <SliceMark size={16} />
            Concierge for {name}
          </div>
          <h1
            className="rise mt-5 text-[34px] font-semibold leading-[1.05] tracking-[-0.025em]"
            style={{ fontOpticalSizing: "auto" }}
          >
            Shop by taste,
            <br />
            not by trend.
          </h1>
          <p className="rise mt-4 max-w-[30ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            Tell me a few things you love. The music, the shows, the places. Qloo&apos;s taste
            graph reads them, and I pick from {name}&apos;s shelves what fits you, not what sells
            most.
          </p>
          <ul className="rise mt-6 space-y-2 text-[13px] text-[var(--ink-2)]">
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tang)]" />
              Four quick picks, about a minute
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tang)]" />
              No account, no history, nothing personal stored
            </li>
            <li className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tang)]" />
              Every pick shows why, step by step
            </li>
          </ul>
        </div>
      </div>
      <div className="space-y-2 border-t border-[var(--line)] p-4">
        <Button variant="ink" size="lg" className="w-full" onClick={onTune}>
          <SlidersHorizontal className="size-4" />
          Tune to my taste
        </Button>
        <Button variant="ghost" size="md" className="w-full" onClick={onBrowse}>
          Just ask a question
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
