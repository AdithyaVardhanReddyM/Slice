"use client";

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Pick } from "./types";
import { Chip, money } from "./ui";

const styleLabel = (id: string, labels?: Record<string, string>) =>
  labels?.[id] ?? id.replace(/-/g, " ");

type CardProps = {
  pick: Pick;
  styleLabels?: Record<string, string>;
  onOpen: (url: string) => void;
  /** Fit scores only mean something once a taste profile exists. */
  showFit?: boolean;
};

/** Picks laid out as a horizontal, snapping rail with a scroll track and step buttons. */
export function PicksRail({
  picks,
  ...card
}: Omit<CardProps, "pick"> & { picks: Pick[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    progress: 0,
    ratio: 1,
    atStart: true,
    atEnd: true,
  });
  const solo = picks.length === 1;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setPos({
      progress: max > 0 ? el.scrollLeft / max : 0,
      ratio:
        el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      atStart: el.scrollLeft <= 4,
      atEnd: el.scrollLeft >= max - 4,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, picks.length]);

  function step(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector("article");
    const w = first
      ? first.getBoundingClientRect().width + 12
      : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={ref}
        onScroll={measure}
        className="rail -mx-3 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-3 pt-1"
      >
        {picks.map((p, i) => (
          <ProductCard
            key={p.product.id}
            pick={p}
            index={i}
            solo={solo}
            {...card}
          />
        ))}
      </div>
      {!solo && pos.ratio < 1 && (
        <div className="flex items-center gap-3 px-1">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--line-2)]">
            <span
              className="absolute inset-y-0 rounded-full bg-[var(--ink)] transition-[left] duration-150 ease-out"
              style={{
                width: `${pos.ratio * 100}%`,
                left: `${pos.progress * (1 - pos.ratio) * 100}%`,
              }}
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={pos.atStart}
              aria-label="Previous picks"
              className="rail-step"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={pos.atEnd}
              aria-label="More picks"
              className="rail-step"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductCard({
  pick,
  styleLabels,
  onOpen,
  showFit = true,
  index = 0,
  solo = false,
}: CardProps & { index?: number; solo?: boolean }) {
  const [why, setWhy] = useState(false);
  const p = pick.product;
  const m = pick.matched ?? {};
  const open = () => p.url && onOpen(p.url);
  const fit =
    showFit && pick.fit !== undefined && pick.fit !== null
      ? Math.round(pick.fit * 100)
      : null;

  const evidence = [
    ...(m.styles ?? []).map((s) => ({
      tone: "sun" as const,
      text: styleLabel(s, styleLabels),
    })),
    ...(m.brand
      ? [{ tone: "qloo" as const, text: `${m.brand} affinity` }]
      : []),
    ...(m.terms ?? [])
      .slice(0, 2)
      .map((t) => ({ tone: "qloo" as const, text: t })),
    ...(m.materials ?? [])
      .slice(0, 1)
      .map((t) => ({ tone: "neutral" as const, text: t })),
    ...(m.palette ?? [])
      .slice(0, 1)
      .map((t) => ({ tone: "neutral" as const, text: t })),
  ].slice(0, 3);

  return (
    <article
      className={cn(
        "pick-card rise flex shrink-0 snap-start flex-col",
        solo ? "w-full max-w-[300px]" : "w-[232px]",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Image tile */}
      <div
        className="pick-tile relative isolate overflow-hidden rounded-[18px] bg-[var(--cream-2)]"
        style={{ aspectRatio: "1 / 1" }}
      >
        <button
          type="button"
          onClick={open}
          className="block size-full rounded-[inherit]"
          aria-label={`Open ${p.name}`}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image}
              alt=""
              loading="lazy"
              className="size-full rounded-[inherit] object-cover transition-transform duration-500 ease-out hover:scale-[1.03]"
            />
          ) : null}
        </button>

        {fit !== null && (
          <button
            type="button"
            onClick={() => setWhy((w) => !w)}
            aria-expanded={why}
            title="Why this fits your taste"
            className="pick-pill absolute left-2 top-2 z-10"
          >
            {why ? (
              <X className="size-3.5" />
            ) : (
              <Fingerprint className="size-3.5" />
            )}
            {fit}% match
          </button>
        )}

        {why && pick.breakdown && (
          <div className="absolute inset-0 flex flex-col justify-end rounded-[inherit] bg-white/90 p-3 backdrop-blur-md">
            <dl className="space-y-1.5 text-[11.5px] text-[var(--ink-2)]">
              {(
                [
                  ["Style", pick.breakdown.style],
                  ["Qloo taste terms", pick.breakdown.terms],
                  ["Palette & material", pick.breakdown.details],
                  ["Brand affinity", pick.breakdown.brand],
                  ["Your ask", pick.breakdown.intent],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex items-center gap-2">
                  <dt className="w-[104px] shrink-0 truncate">{label}</dt>
                  <dd className="flex flex-1 items-center gap-1.5">
                    <span className="bar h-1 flex-1">
                      <i style={{ width: `${Math.round(v * 100)}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">
                      {Math.round(v * 100)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-2 pb-2 pt-3">
        <p className="truncate text-[12px] font-medium text-[var(--tang-ink)]">
          {p.brand || p.subcategory}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em]">
          <button
            type="button"
            onClick={open}
            className="text-left hover:underline"
          >
            {p.name}
          </button>
        </h3>
        {pick.reason && (
          <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-[var(--ink-2)]">
            {pick.reason}
          </p>
        )}
        {evidence.length > 0 && (
          <div className="mt-2.5 flex max-h-[46px] flex-wrap gap-1 overflow-hidden">
            {evidence.map((e, i) => (
              <Chip key={i} tone={e.tone}>
                {e.text}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3.5">
          <div className="min-w-0 leading-tight">
            <p className="text-[17px] font-semibold tabular-nums tracking-[-0.01em]">
              {money(p.price)}
            </p>
            {p.compareAtPrice ? (
              <s className="text-[12px] tabular-nums text-[var(--mute)]">
                {money(p.compareAtPrice)}
              </s>
            ) : null}
          </div>
          {p.url && (
            <button
              type="button"
              onClick={open}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-[var(--ink)] pl-3.5 pr-3 text-[13px] font-medium text-white transition-colors hover:bg-black"
            >
              View <ArrowUpRight className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
