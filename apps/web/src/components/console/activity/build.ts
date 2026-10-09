import type { Conversation, SpanKind } from "@/lib/mock/types";
import { NOW } from "@/lib/mock/random";

// Flattens every trace span into one log, plus the aggregates the header and
// charts need. Server-side only; the client gets plain rows.

export interface LogRow {
  id: string;
  /** Epoch ms. */
  t: number;
  kind: SpanKind;
  name: string;
  endpoint: string;
  /** One-line params summary for the table. */
  summary: string;
  params: [string, string][];
  cache: "hit" | "miss" | "stale" | null;
  ms: number;
  result: string;
  traceId: string;
  conversationId: string;
  tokens: { input: number; output: number } | null;
}

const INTERNAL: Record<string, string> = {
  "Load session taste profile": "session.profile",
  "Map taste tags → catalog styles": "taste.map",
  "Filter catalog": "catalog.filter",
  "Score candidates": "catalog.score",
  Guardrails: "guardrails.check",
};

const nf = new Intl.NumberFormat("en-US");

function summarize(
  kind: SpanKind,
  path: string | undefined,
  params: Record<string, string>,
  tokens?: { input: number; output: number },
) {
  if (kind === "qloo" && path === "/search") {
    return `"${params.query}" · ${params.types?.replace("urn:entity:", "")}`;
  }
  if (kind === "qloo") {
    const n = params["signal.interests.entities"]?.split(",").length ?? 0;
    return `${params["filter.type"]} · ${n} entities · take ${params.take}`;
  }
  if (kind === "llm" && tokens)
    return `${nf.format(tokens.input)} → ${nf.format(tokens.output)} tok`;
  return "";
}

export function buildLog(convs: Conversation[]): LogRow[] {
  const rows: LogRow[] = [];
  for (const c of convs) {
    const at = new Map(c.messages.map((m) => [m.id, Date.parse(m.at)]));
    for (const trace of c.traces) {
      const replyAt = at.get(trace.messageId) ?? Date.parse(c.startedAt);
      const turnStart = replyAt - trace.totalMs;
      for (const s of trace.spans) {
        const params: [string, string][] = Object.entries(s.params ?? {});
        if (s.kind === "llm") {
          if (s.model) params.push(["model", s.model]);
          if (s.tokens) {
            params.push(["tokens.input", String(s.tokens.input)]);
            params.push(["tokens.output", String(s.tokens.output)]);
          }
        }
        rows.push({
          id: s.id,
          t: turnStart + s.start,
          kind: s.kind,
          name: s.name,
          endpoint:
            s.kind === "qloo"
              ? `${s.method ?? "GET"} ${s.path}`
              : s.kind === "llm"
                ? (s.model ?? "llm")
                : (INTERNAL[s.name] ??
                  s.name.toLowerCase().replace(/\s+/g, ".")),
          summary: summarize(s.kind, s.path, s.params ?? {}, s.tokens),
          params,
          cache: s.cache ?? null,
          ms: s.duration,
          result: s.result,
          traceId: trace.id,
          conversationId: c.id,
          tokens: s.tokens ?? null,
        });
      }
    }
  }
  return rows.sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(q * sorted.length) - 1),
  );
  return sorted[i];
}

export interface LogStats {
  calls: number;
  byKind: Record<SpanKind, number>;
  qloo: {
    calls: number;
    hits: number;
    misses: number;
    stale: number;
    p50: number;
    p95: number;
  };
  tokens: { input: number; output: number };
}

export function logStats(rows: LogRow[], windowMs = 86_400_000): LogStats {
  const recent = rows.filter((r) => r.t >= NOW - windowMs);
  const byKind: Record<SpanKind, number> = {
    qloo: 0,
    llm: 0,
    catalog: 0,
    slice: 0,
  };
  for (const r of recent) byKind[r.kind] += 1;
  const qloo = recent.filter((r) => r.kind === "qloo");
  const lat = qloo.map((r) => r.ms).sort((a, b) => a - b);
  return {
    calls: recent.length,
    byKind,
    qloo: {
      calls: qloo.length,
      hits: qloo.filter((r) => r.cache === "hit").length,
      misses: qloo.filter((r) => r.cache === "miss").length,
      stale: qloo.filter((r) => r.cache === "stale").length,
      p50: quantile(lat, 0.5),
      p95: quantile(lat, 0.95),
    },
    tokens: recent.reduce(
      (acc, r) => ({
        input: acc.input + (r.tokens?.input ?? 0),
        output: acc.output + (r.tokens?.output ?? 0),
      }),
      { input: 0, output: 0 },
    ),
  };
}

export interface HourBucket {
  /** Epoch ms of the hour start. */
  start: number;
  total: number;
  byKind: Record<SpanKind, number>;
}

/** Calls per hour for the last 24 hours, oldest first. */
export function hourly(rows: LogRow[]): HourBucket[] {
  const end = Math.ceil(NOW / 3_600_000) * 3_600_000;
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({
    start: end - (24 - i) * 3_600_000,
    total: 0,
    byKind: { qloo: 0, llm: 0, catalog: 0, slice: 0 },
  }));
  for (const r of rows) {
    const i = Math.floor((r.t - buckets[0].start) / 3_600_000);
    if (i < 0 || i >= 24) continue;
    buckets[i].total += 1;
    buckets[i].byKind[r.kind] += 1;
  }
  return buckets;
}

export interface LatencyBucket {
  label: string;
  from: number;
  to: number | null;
  count: number;
  hits: number;
}

const EDGES = [0, 10, 25, 50, 100, 200, 400, 800];

/** Qloo latency distribution on log-spaced buckets. */
export function latencyHistogram(rows: LogRow[]): LatencyBucket[] {
  const qloo = rows.filter((r) => r.kind === "qloo");
  return EDGES.map((from, i) => {
    const to = EDGES[i + 1] ?? null;
    const inBucket = qloo.filter(
      (r) => r.ms >= from && (to === null || r.ms < to),
    );
    return {
      label: to === null ? `${from}+` : i === 0 ? `<${to}` : `${from}–${to}`,
      from,
      to,
      count: inBucket.length,
      hits: inBucket.filter((r) => r.cache === "hit").length,
    };
  });
}
