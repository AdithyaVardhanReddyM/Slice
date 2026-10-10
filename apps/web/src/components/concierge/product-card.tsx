"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Pick } from "./types";
import { Chip, money } from "./ui";

const PRETTY: Record<string, string> = {};
const styleLabel = (id: string, labels?: Record<string, string>) => labels?.[id] ?? PRETTY[id] ?? id.replace(/-/g, " ");

export function ProductCard({
  pick,
  styleLabels,
  onOpen,
  showFit = true,
}: {
  pick: Pick;
  styleLabels?: Record<string, string>;
  onOpen: (url: string) => void;
  /** Fit scores only mean something once a taste profile exists. */
  showFit?: boolean;
}) {
  const [why, setWhy] = useState(false);
  const p = pick.product;
  const m = pick.matched ?? {};
  const evidence = [
    ...(m.styles ?? []).map((s) => ({ tone: "sun" as const, text: styleLabel(s, styleLabels) })),
    ...(m.brand ? [{ tone: "qloo" as const, text: `${m.brand} affinity` }] : []),
    ...(m.terms ?? []).slice(0, 3).map((t) => ({ tone: "qloo" as const, text: t })),
    ...(m.palette ?? []).slice(0, 2).map((t) => ({ tone: "neutral" as const, text: t })),
    ...(m.materials ?? []).slice(0, 2).map((t) => ({ tone: "neutral" as const, text: t })),
    ...(m.keywords ?? []).slice(0, 2).map((t) => ({ tone: "catalog" as const, text: `“${t}”` })),
  ].slice(0, 6);

  return (
    <article
      className="rise overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
    >
      <div className="flex gap-3 p-2.5">
        <button
          type="button"
          onClick={() => p.url && onOpen(p.url)}
          className="relative w-[104px] shrink-0 overflow-hidden rounded-xl bg-[var(--cream-2)]"
          style={{ aspectRatio: "4 / 5" }}
          aria-label={`Open ${p.name}`}
        >
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" className="size-full object-cover" loading="lazy" />
          ) : null}
          {showFit && pick.fit !== undefined && pick.fit !== null && (
            <span
              className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[var(--ink)] backdrop-blur"
              title="Fit with your taste, 0–100"
            >
              {Math.round(pick.fit * 100)} fit
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 py-0.5">
          {p.brand && <p className="truncate text-[11.5px] font-medium text-[var(--mute)]">{p.brand}</p>}
          <h3 className="text-[14px] font-semibold leading-tight">
            <button type="button" className="text-left hover:underline" onClick={() => p.url && onOpen(p.url)}>
              {p.name}
            </button>
          </h3>
          <p className="mt-0.5 text-[13px] tabular-nums">
            {money(p.price)}
            {p.compareAtPrice ? <s className="ml-1.5 text-[var(--mute)]">{money(p.compareAtPrice)}</s> : null}
            <span className="text-[var(--mute)]"> · {p.subcategory}</span>
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--ink-2)]">{pick.reason}</p>
        </div>
      </div>
      {(evidence.length > 0 || pick.breakdown) && (
        <div className="border-t border-[var(--line-2)] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {evidence.map((e, i) => (
              <Chip key={i} tone={e.tone}>
                {e.text}
              </Chip>
            ))}
            {showFit && pick.breakdown && (
              <button
                type="button"
                onClick={() => setWhy((w) => !w)}
                className="ml-auto inline-flex items-center gap-0.5 text-[11.5px] text-[var(--mute)] hover:text-[var(--ink)]"
                aria-expanded={why}
              >
                score <ChevronDown className={"size-3 transition-transform " + (why ? "rotate-180" : "")} />
              </button>
            )}
          </div>
          {showFit && why && pick.breakdown && (
            <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-[var(--ink-2)]">
              {[
                ["style match", pick.breakdown.style],
                ["Qloo terms", pick.breakdown.terms],
                ["palette & material", pick.breakdown.details],
                ["brand affinity", pick.breakdown.brand],
                ["your ask", pick.breakdown.intent],
                ["taste overall", pick.breakdown.taste],
              ].map(([label, v]) => (
                <div key={label as string}>
                  <dt className="text-[var(--mute)]">{label}</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5">
                    <span className="bar h-1 flex-1">
                      <i style={{ width: `${Math.round((v as number) * 100)}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{Math.round((v as number) * 100)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
      {p.url && (
        <button
          type="button"
          onClick={() => onOpen(p.url!)}
          className="flex w-full items-center justify-center gap-1 border-t border-[var(--line-2)] py-2 text-[12.5px] font-medium hover:bg-[var(--cream)]"
        >
          View {p.subcategory.toLowerCase().replace(/s$/, "")} <ArrowUpRight className="size-3.5" />
        </button>
      )}
    </article>
  );
}
