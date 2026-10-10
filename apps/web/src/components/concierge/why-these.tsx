"use client";

import { useState } from "react";
import type { Span } from "./types";
import { Trace } from "./trace";

// "How I chose these", for shoppers. Every tool call the agent made is turned
// into one plain sentence; the raw trace stays one tap away for anyone curious.

interface Step {
  kind: string;
  title: string;
  detail?: string;
}

const KIND_COLOR: Record<string, string> = {
  qloo: "var(--qloo)",
  catalog: "var(--catalog)",
  llm: "var(--llm)",
  slice: "var(--slice)",
};

const tidyAsk = (ask: string) =>
  ask
    .split(", ")
    .map((kv) => kv.replace(/^(\w+)=/, (_, k: string) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} `))
    .join(", ");

export function explainSpans(
  spans: Span[],
  storeName: string,
  styleLabels: Record<string, string>,
): Step[] {
  const steps: Step[] = [];
  let qlooCalls = 0;

  for (const s of spans) {
    let m: RegExpMatchArray | null;

    if ((m = s.name.match(/^Rank (\d+) of (\d+) products by (.+)$/))) {
      const [, pool, size, by] = m;
      const how = by.startsWith("likeness to")
        ? `by ${by}`
        : by.startsWith("the ask only")
          ? "by your ask alone, since there is no taste profile yet"
          : by.startsWith("what you've looked at")
            ? "by what you've looked at this visit"
            : by.includes("this visit")
              ? "against your taste and what you've looked at this visit"
              : "against your taste profile";
      const title =
        pool === size
          ? `Scored all ${size} products in ${storeName} ${how}`
          : `Scored ${pool} of ${size} products in ${storeName} ${how}`;
      const details: string[] = [];
      const ask = s.result.split(";")[0]?.trim();
      if (ask && ask !== "whole store") details.push(`Narrowed to ${tidyAsk(ask)}`);
      const styles = s.params?.styles
        ?.split(", ")
        .map((p) => p.split(":")[0])
        .filter(Boolean)
        .slice(0, 2)
        .map((id) => styleLabels[id] ?? id);
      if (styles?.length) details.push(`Leaning ${styles.join(" and ")}`);
      steps.push({ kind: s.kind, title, detail: details.join(" · ") || undefined });
      continue;
    }

    if ((m = s.name.match(/^Search catalog for "(.+)"$/))) {
      const n = s.result.match(/^(\d+) matches/)?.[1];
      steps.push({
        kind: s.kind,
        title: `Searched ${storeName} for “${m[1]}”`,
        detail: n ? `${n} ${n === "1" ? "match" : "matches"}` : undefined,
      });
      continue;
    }

    if ((m = s.name.match(/^Look up (.+)$/))) {
      steps.push({ kind: s.kind, title: `Looked up ${m[1]}`, detail: s.result === "not found" ? "Not found" : s.result });
      continue;
    }

    if ((m = s.name.match(/^Resolve "(.+)"$/))) {
      steps.push(
        s.result === "no match"
          ? { kind: s.kind, title: `Qloo didn't recognise “${m[1]}”` }
          : { kind: s.kind, title: `Added “${m[1]}” to your taste`, detail: `Qloo knows it as ${s.result}` },
      );
      continue;
    }

    if (s.name.startsWith("Translate Qloo taste")) {
      steps.push({ kind: s.kind, title: `Translated your Qloo profile into ${storeName}'s styles` });
      continue;
    }

    if (s.name === "Save taste brief") continue;

    if (s.name === "Show picks") {
      const names = s.result.split(", ").filter(Boolean);
      steps.push({
        kind: s.kind,
        title: `Chose ${names.length === 1 ? "the one" : `the ${names.length}`} that fit best`,
        detail: names.join(", "),
      });
      continue;
    }

    if (s.kind === "qloo") {
      qlooCalls += 1;
      continue;
    }

    steps.push({ kind: s.kind, title: s.name, detail: s.result || undefined });
  }

  if (qlooCalls > 0) {
    steps.unshift({
      kind: "qloo",
      title: "Re-read your taste with Qloo",
      detail: `${qlooCalls} ${qlooCalls === 1 ? "call" : "calls"} for tags, brand affinities and who else shares them`,
    });
  }
  return steps;
}

export function WhyThese({
  spans,
  totalMs,
  storeName,
  styleLabels,
}: {
  spans: Span[];
  totalMs?: number;
  storeName: string;
  styleLabels: Record<string, string>;
}) {
  const [raw, setRaw] = useState(false);
  const steps = explainSpans(spans, storeName, styleLabels);
  return (
    <div className="rounded-xl bg-[var(--cream)] px-4 py-3">
      <ol className="space-y-2.5">
        {steps.map((st, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="mt-[7px] size-1.5 shrink-0 rounded-full"
              style={{ background: KIND_COLOR[st.kind] ?? "var(--mute)" }}
            />
            <div className="min-w-0">
              <p className="text-[13px] leading-snug">{st.title}</p>
              {st.detail && <p className="mt-0.5 text-[12px] leading-snug text-[var(--mute)]">{st.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-3 text-[11.5px] text-[var(--mute)]">
        {totalMs ? <span>Took {(totalMs / 1000).toFixed(1)}s</span> : null}
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          aria-expanded={raw}
          className="cursor-pointer underline underline-offset-2 hover:text-[var(--ink)]"
        >
          {raw ? "Hide" : "Show"} the technical steps
        </button>
      </p>
      {raw && (
        <div className="rise mt-3 border-t border-[var(--line)] pt-3">
          <Trace spans={spans} totalMs={totalMs} compact />
        </div>
      )}
    </div>
  );
}
