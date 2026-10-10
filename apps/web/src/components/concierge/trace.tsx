"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Span } from "./types";
import { Chip } from "./ui";

const KIND: Record<string, { label: string; color: string; soft: string }> = {
  qloo: { label: "Qloo", color: "var(--qloo)", soft: "var(--qloo-soft)" },
  catalog: { label: "Catalog", color: "var(--catalog)", soft: "var(--catalog-soft)" },
  llm: { label: "Concierge", color: "var(--llm)", soft: "var(--llm-soft)" },
  slice: { label: "Slice", color: "var(--slice)", soft: "var(--slice-soft)" },
};

const PARAM_LABELS: Record<string, string> = {
  "filter.type": "asking for",
  "signal.interests.entities": "signals",
  "signal.location.query": "weighted for",
  "filter.tag.types": "tag types",
  "filter.results.entities": "restricted to",
  "feature.explainability": "explain",
  "filter.popularity.min": "min popularity",
  "bias.trends": "trend bias",
  query: "query",
  types: "type",
  take: "take",
};

const tidy = (v: string) =>
  v
    .replace(/urn:entity:/g, "")
    .replace(/urn:tag:/g, "")
    .replace(/:qloo/g, "")
    .replace(/,/g, ", ");

export function Trace({ spans, totalMs, compact }: { spans: Span[]; totalMs?: number; compact?: boolean }) {
  const counts = spans.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const cached = spans.filter((s) => s.cache === "hit").length;
  return (
    <div className="text-[12.5px]">
      {!compact && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--mute)]">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <i className="inline-block size-1.5 rounded-full" style={{ background: KIND[k]?.color ?? "var(--mute)" }} />
              {n} {KIND[k]?.label ?? k}
            </span>
          ))}
          {cached > 0 && <span>· {cached} from cache</span>}
          {totalMs !== undefined && <span>· {(totalMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
      <ol className="relative ml-1.5 border-l border-[var(--line)] pl-4">
        {spans.map((s, i) => (
          <SpanRow key={i} span={s} />
        ))}
      </ol>
    </div>
  );
}

function SpanRow({ span }: { span: Span }) {
  const [open, setOpen] = useState(false);
  const k = KIND[span.kind] ?? KIND.slice;
  const hasParams = span.params && Object.keys(span.params).length > 0;
  return (
    <li className="relative pb-3 last:pb-0">
      <i
        className="absolute -left-[21px] top-[5px] size-2.5 rounded-full border-2 border-white"
        style={{ background: k.color }}
      />
      <button
        type="button"
        className={cn("w-full text-left", hasParams && "cursor-pointer")}
        onClick={() => hasParams && setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="font-medium text-[var(--ink)]">{span.name}</span>
            <span className="mt-0.5 block text-[var(--ink-2)]">{span.result}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[11px] text-[var(--mute)]">
            {span.cache && (
              <Chip tone={span.cache === "hit" ? "neutral" : "qloo"} className="!px-1.5 !text-[10.5px]">
                {span.cache === "hit" ? "cached" : span.cache === "stale" ? "stale" : "live"}
              </Chip>
            )}
            <span className="tabular-nums">{span.ms < 1000 ? `${span.ms}ms` : `${(span.ms / 1000).toFixed(1)}s`}</span>
            {hasParams && <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />}
          </span>
        </div>
      </button>
      {open && hasParams && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-[var(--cream)] p-2.5 text-[11.5px]">
          {span.path && (
            <>
              <dt className="text-[var(--mute)]">endpoint</dt>
              <dd className="break-all font-mono text-[11px]">{span.path}</dd>
            </>
          )}
          {Object.entries(span.params!).map(([key, val]) => (
            <div key={key} className="contents">
              <dt className="text-[var(--mute)]">{PARAM_LABELS[key] ?? key}</dt>
              <dd className="break-words">{tidy(val)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
