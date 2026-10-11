// Small helpers shared by the Pages backend modules.

import { QlooError } from "@slice/qloo";
import type { ActionCtx } from "./_generated/server";
import type { EntityRef, Span, TasteBrand, TasteTag } from "./qlooApi";
import { searchEntity, searchEntityBest, type EntityKind } from "./qlooApi";
import type { ProfileBrand, ProfileEntity, ProfileTag } from "./pagesTypes";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "item";
}

/** Deterministic 32-bit hash (FNV-1a) for seeds and size estimates. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** "YYYY-MM-DD" in UTC. */
export function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export const hourOf = (at: number): number => new Date(at).getUTCHours();

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Accept a search hit only when the names agree ("Kapital" must not become "Kapital Bank"). */
export function nameMatches(query: string, found: string): boolean {
  const a = norm(found);
  const b = norm(query);
  return a === b || b.startsWith(a + " ") || a.startsWith(b + " ");
}

/**
 * Pace live Qloo calls: wait after a cache miss, retry once on 429. The
 * hackathon key rate-limits bursts, and two calls in flight is the ceiling.
 */
export async function paced<T>(trace: Span[], fn: () => Promise<T>, gapMs = 130): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = trace.length;
    try {
      const out = await fn();
      const added = trace.slice(before);
      if (added.some((s) => s.cache && s.cache !== "hit")) await sleep(gapMs);
      return out;
    } catch (err) {
      if (attempt === 0 && err instanceof QlooError && (err.status === 429 || err.status >= 500)) {
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

/** Like `paced` but a failure yields `fallback` and a trace line instead of throwing. */
export async function soft<T>(trace: Span[], name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await paced(trace, fn);
  } catch (err) {
    trace.push({ kind: "qloo", name, ms: 0, result: `failed: ${String(err).slice(0, 90)}` });
    return fallback;
  }
}

/** Resolve names to entities, paced, keeping only name matches. Collapses the lookups into one span. */
export async function resolveNames(
  ctx: ActionCtx,
  trace: Span[],
  names: string[],
  kind: EntityKind | undefined,
  source: string,
  options: { strict?: boolean; label?: string; onProgress?: (done: number, total: number) => unknown } = {},
): Promise<Map<string, EntityRef>> {
  const { strict = true, label = "Find these in Qloo", onProgress } = options;
  const local: Span[] = [];
  const out = new Map<string, EntityRef>();
  let failures = 0;
  let ms = 0;
  let misses = 0;
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    try {
      const before = local.length;
      const found = await paced(
        local,
        () => (kind ? searchEntity(ctx, local, name, kind, source) : searchEntityBest(ctx, local, name, source)),
        120,
      );
      const span = local[before];
      if (span) {
        ms += span.ms;
        if (span.cache !== "hit") misses++;
      }
      if (found && (!strict || nameMatches(name, found.name))) out.set(name, found);
    } catch {
      failures++;
    }
    if (onProgress && (i % 5 === 4 || i === names.length - 1)) await onProgress(i + 1, names.length);
  }
  trace.push({
    kind: "qloo",
    name: label,
    path: "/search",
    params: { query: `${names.length} names`, ...(kind ? { types: `urn:entity:${kind}` } : {}) },
    cache: misses ? "miss" : "hit",
    ms,
    result:
      `${out.size} of ${names.length} resolved` + (failures ? ` (${failures} lookups failed)` : ""),
  });
  return out;
}

export function toProfileEntity(e: EntityRef, source: string, count = 1): ProfileEntity {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    image: e.image,
    subtitle: e.subtitle,
    lat: e.lat,
    lon: e.lon,
    source,
    count,
  };
}

export function toProfileBrand(b: TasteBrand): ProfileBrand {
  return {
    id: b.id,
    name: b.name,
    affinity: b.affinity,
    image: b.image,
    personalStyle: b.personalStyle,
    lifestyle: b.lifestyle,
    emotionalTone: b.emotionalTone,
    industries: b.industries,
  };
}

export const toProfileTag = (t: TasteTag): ProfileTag => ({ id: t.id, name: t.name, type: t.type, affinity: t.affinity });

export function dedupeById<T extends { id: string }>(items: T[], take?: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
    if (take && out.length >= take) break;
  }
  return out;
}

/** Convex field names: non-empty ASCII, no control chars, not starting with "$" or "_". */
export function safeKey(key: string): string {
  const cleaned = key.replace(/[^\x20-\x7e]/g, "").replace(/^[$_]+/, "").trim();
  return cleaned || "unknown";
}

export function safeRecord(input: Record<string, unknown> | undefined | null): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(input)) {
    if (val === undefined || val === null) continue;
    out[safeKey(k)] = typeof val === "string" ? val.slice(0, 500) : String(val);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Qloo entity subtype → culture bucket. */
export function cultureKind(type: string): "artists" | "films" | "places" | "books" | null {
  if (type.includes("artist")) return "artists";
  if (type.includes("movie") || type.includes("tv_show")) return "films";
  if (type.includes("place") || type.includes("destination") || type.includes("locality")) return "places";
  if (type.includes("book")) return "books";
  return null;
}

/** A rough reach estimate for audiences without members, labelled as such in the UI. */
export const estimateReach = (key: string) => Math.round(40000 + (hash32(key) % 60000));
