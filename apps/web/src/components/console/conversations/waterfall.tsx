"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Span, SpanKind } from "@/lib/mock/types";
import { CacheBadge, SpanChip, spanMeta } from "../primitives";

/** Timeline of every step in one concierge reply. Rows expand to show request details. */
export function Waterfall({
  spans,
  totalMs,
  compact,
}: {
  spans: Span[];
  totalMs: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ticks = niceTicks(totalMs, compact);
  const cols = compact
    ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_56px]"
    : "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_64px]";

  return (
    <div className="text-sm">
      <div
        className={cn(
          "grid items-end gap-3 border-b pb-2 text-xs text-muted-foreground",
          cols,
        )}
      >
        <span>Step</span>
        <div className="relative h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute bottom-0 -translate-x-1/2 tabular-nums"
              style={{ left: `${(t / totalMs) * 100}%` }}
            >
              {fmt.ms(t)}
            </span>
          ))}
        </div>
        <span className="text-right">Time</span>
      </div>
      <ul>
        {spans.map((s) => {
          const isOpen = open === s.id;
          return (
            <Fragment key={s.id}>
              <li>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  className={cn(
                    "grid h-10 w-full items-center gap-3 border-b text-left transition-colors hover:bg-muted/50",
                    cols,
                    isOpen && "bg-muted/50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRight
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: spanMeta[s.kind].color }}
                    />
                    <span className="truncate">{s.name}</span>
                    {s.cache === "hit" && !compact && (
                      <CacheBadge cache="hit" />
                    )}
                  </span>
                  <span className="relative h-full">
                    {ticks.map((t) => (
                      <span
                        key={t}
                        className="absolute top-0 bottom-0 w-px bg-border"
                        style={{ left: `${(t / totalMs) * 100}%` }}
                      />
                    ))}
                    <span
                      className="absolute top-1/2 h-2 min-w-1 -translate-y-1/2 rounded-sm"
                      style={{
                        left: `${(s.start / totalMs) * 100}%`,
                        width: `${(s.duration / totalMs) * 100}%`,
                        background: spanMeta[s.kind].color,
                        opacity: s.cache === "hit" ? 0.5 : 1,
                      }}
                    />
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {fmt.ms(s.duration)}
                  </span>
                </button>
              </li>
              {isOpen && (
                <li className="border-b bg-muted/30 px-4 py-3">
                  <SpanDetail span={s} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
        {(Object.keys(spanMeta) as SpanKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: spanMeta[k].color }}
            />
            {spanMeta[k].label}
          </span>
        ))}
        <span>Faded bars were served from cache</span>
      </div>
    </div>
  );
}

export function SpanDetail({ span }: { span: Span }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SpanChip kind={span.kind} />
        {span.cache && <CacheBadge cache={span.cache} />}
        {span.path && (
          <span>
            {span.method} {span.path}
          </span>
        )}
        {span.model && <span>{span.model}</span>}
        <span className="text-muted-foreground tabular-nums">
          started at {fmt.ms(span.start)}, took {fmt.ms(span.duration)}
        </span>
      </div>
      {span.params && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-background p-3 text-sm">
          {Object.entries(span.params).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {span.tokens && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {fmt.int(span.tokens.input)} input tokens ·{" "}
          {fmt.int(span.tokens.output)} output tokens
        </p>
      )}
      <p className="text-sm">
        <span className="text-muted-foreground">Result: </span>
        {span.result}
      </p>
    </div>
  );
}

function niceTicks(total: number, compact?: boolean): number[] {
  const step = compact
    ? total > 1500
      ? 1000
      : 500
    : total > 2500
      ? 1000
      : total > 1200
        ? 500
        : 250;
  const out: number[] = [];
  for (let t = step; t < total * 0.95; t += step) out.push(t);
  return out;
}
