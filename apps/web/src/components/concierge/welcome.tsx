"use client";

import { ArrowRight, Eye, Minus, ShieldCheck, SlidersHorizontal, Timer } from "lucide-react";
import type { StoreInfo } from "./types";
import { Button, SliceMark } from "./ui";

// Copy here is additive on purpose: the concierge finds what fits the shopper,
// which includes the store's favorites. Never frame it against bestsellers.
const POINTS = [
  {
    icon: Timer,
    title: "About a minute",
    body: "Four quick questions, then your first picks.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "No account, no email, nothing personal stored.",
  },
  {
    icon: Eye,
    title: "Every pick explained",
    body: "See why each one fits you, step by step.",
  },
];

export function Welcome({
  store,
  onTune,
  onBrowse,
  onClose,
}: {
  store: StoreInfo | null;
  onTune: () => void;
  onBrowse: () => void;
  /** Minimizes the widget. Omitted when the embed is not inside slice.js. */
  onClose?: () => void;
}) {
  const name = store?.name ?? "this store";
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--sun), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-28 top-48 h-64 w-64 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #ffd1a8, transparent 70%)" }}
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="orb absolute right-4 top-4 z-10"
          >
            <Minus className="size-[18px]" />
          </button>
        )}

        <div className="relative flex flex-1 flex-col">
          <div className="rise flex items-center gap-3 pr-12">
            {store?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="size-9 shrink-0 object-contain" />
            ) : (
              <SliceMark size={30} />
            )}
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                Concierge for {name}
              </p>
              {store?.tagline && (
                <p className="mt-0.5 truncate text-[12.5px] text-[var(--mute)]">{store.tagline}</p>
              )}
            </div>
          </div>

          <h1
            className="rise mt-7 text-[34px] font-semibold leading-[1.05] tracking-[-0.025em]"
            style={{ fontOpticalSizing: "auto" }}
          >
            Picks that fit
            <br />
            your taste.
          </h1>
          <p className="rise mt-3 max-w-[32ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            Tell me a few things you love. The music, the shows, the places. Qloo&apos;s taste
            graph reads them, and I pick what fits you from {name}&apos;s shelves, from this
            season&apos;s favorites to pieces you&apos;d never find on your own.
          </p>

          <ul className="rise mt-auto space-y-1 pb-3 pt-6">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-center gap-3 py-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--sun-soft)] text-[var(--ink)]">
                  <p.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-tight">{p.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-2)]">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="px-4 pb-3 pt-1">
        <Button variant="ink" size="lg" className="w-full" onClick={onTune}>
          <SlidersHorizontal className="size-4" />
          Curate {name} for me
        </Button>
        <Button variant="ghost" size="md" className="mt-1 w-full" onClick={onBrowse}>
          Just ask a question
          <ArrowRight className="size-4" />
        </Button>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--mute)]">
          <SliceMark size={12} />
          Powered by Slice
        </p>
      </div>
    </div>
  );
}
