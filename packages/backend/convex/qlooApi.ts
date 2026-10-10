import { QlooError, type QlooParams } from "@slice/qloo";
import type { ActionCtx } from "./_generated/server";
import { cachedQlooGet } from "./qloo";

// Typed, traced wrappers over the Qloo endpoints Slice uses. Every call goes
// through the Convex cache (qloo.ts) and appends a span to `trace`, which is
// what the shopper sees under "how I chose these" and the merchant sees in
// the console.

export interface Span {
  kind: "qloo" | "catalog" | "slice" | "llm";
  name: string;
  path?: string;
  params?: Record<string, string>;
  cache?: string;
  ms: number;
  result: string;
}

export interface EntityRef {
  id: string;
  name: string;
  type: string;
  image?: string;
  subtitle?: string;
  source: string;
}

export interface TasteTag {
  id: string;
  name: string;
  type: string;
  affinity: number;
}

export interface TasteBrand {
  id: string;
  name: string;
  affinity: number;
  image?: string;
  personalStyle: string[];
  lifestyle: string[];
  keywords: string[];
  emotionalTone: string[];
  industries: string[];
  explain: { entityId: string; score: number }[];
  inStore: boolean;
}

export const ENTITY = {
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  book: "urn:entity:book",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
  brand: "urn:entity:brand",
  podcast: "urn:entity:podcast",
  person: "urn:entity:person",
  videogame: "urn:entity:videogame",
} as const;

export type EntityKind = keyof typeof ENTITY;

/** Brand-domain tags: how Qloo describes the aesthetics of what people buy. */
export const AESTHETIC_TAG_TYPES = [
  "urn:tag:personal_style:qloo",
  "urn:tag:lifestyle:qloo",
  "urn:tag:emotional_tone:qloo",
  "urn:tag:core_values:qloo",
  "urn:tag:customer_identity:qloo",
];

/** Cultural tags: the mood of the media and music they chose. */
export const CULTURAL_TAG_TYPES = [
  "urn:tag:style:qloo",
  "urn:tag:audience:qloo",
  "urn:tag:keyword:media",
];

type Json = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Qloo sometimes lists the literal string "null". */
const clean = (values: string[]) => values.filter((v) => !/^(null|none|n\/a)$/i.test(v.trim()));

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

function stringParams(params: QlooParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(params)) {
    if (val === undefined) continue;
    out[k] = Array.isArray(val) ? val.join(",") : String(val);
  }
  return out;
}

async function traced<T>(
  ctx: ActionCtx,
  trace: Span[],
  name: string,
  path: string,
  params: QlooParams,
  summarize: (body: T) => string,
): Promise<T> {
  const t0 = Date.now();
  const { body, status } = await cachedQlooGet(ctx, path, params);
  const parsed = JSON.parse(body) as T;
  trace.push({
    kind: "qloo",
    name,
    path,
    params: stringParams(params),
    cache: status,
    ms: Date.now() - t0,
    result: summarize(parsed),
  });
  return parsed;
}

function entityFromSearch(e: Json, source: string): EntityRef {
  const props = (e.properties ?? {}) as Json;
  const image = (props.image as Json | undefined)?.url;
  const types = strs(e.types);
  return {
    id: String(e.entity_id ?? e.id),
    name: String(e.name),
    type: types[0] ?? "urn:entity",
    image: str(image),
    subtitle: str(props.short_description) ?? str(e.disambiguation),
    source,
  };
}

function entityFromInsights(e: Json, source: string): EntityRef {
  const props = (e.properties ?? {}) as Json;
  const image = (props.image as Json | undefined)?.url;
  const subtitle =
    str(props.short_description) ??
    str((props.geocode as Json | undefined)?.name) ??
    (props.release_year ? String(props.release_year) : undefined) ??
    str(props.known_for);
  const name = String(e.name);
  const country = str((props.geocode as Json | undefined)?.country);
  const sub =
    subtitle && subtitle.toLowerCase() === name.toLowerCase() ? country : subtitle;
  return {
    id: String(e.entity_id),
    name,
    type: str(e.subtype) ?? "urn:entity",
    image: str(image),
    subtitle: sub && sub.length > 90 ? sub.slice(0, 87) + "…" : sub,
    source,
  };
}

/** Resolve a name to a Qloo entity. `kind` narrows the search; omit to search everything. */
export async function searchEntity(
  ctx: ActionCtx,
  trace: Span[],
  query: string,
  kind?: EntityKind,
  source = "free_text",
): Promise<EntityRef | null> {
  const params: QlooParams = { query };
  if (kind) params.types = ENTITY[kind];
  const body = await traced<{ results?: Json[] }>(
    ctx,
    trace,
    `Resolve "${query}"`,
    "/search",
    params,
    (b) => {
      const first = b.results?.[0];
      return first ? `${first.name} (${strs(first.types)[0] ?? "?"})` : "no match";
    },
  );
  const first = body.results?.[0];
  return first ? entityFromSearch(first, source) : null;
}

/** What a city is into: top entities of a kind for shoppers there. */
export async function entitiesForCity(
  ctx: ActionCtx,
  trace: Span[],
  kind: EntityKind,
  city: string,
  take = 10,
  extra: QlooParams = {},
): Promise<EntityRef[]> {
  const params: QlooParams = {
    "filter.type": ENTITY[kind],
    "signal.location.query": city,
    // Well-known rather than merely trending, so the options are recognizable.
    "filter.popularity.min": 0.97,
    take: Math.max(take * 3, 20),
    ...extra,
  };
  // bias.trends is only accepted for some types; Qloo 400s on the others.
  if (kind === "artist") params["bias.trends"] = "low";
  const body = await traced<{ results?: { entities?: Json[] } }>(
    ctx,
    trace,
    `Top ${kind.replace("_", " ")}s in ${city}`,
    "/v2/insights",
    params,
    (b) => `${b.results?.entities?.length ?? 0} results`,
  );
  return diversify(body.results?.entities ?? [], take).map((e) =>
    entityFromInsights(e, "location"),
  );
}

/**
 * Greedy pick of `take` entities whose tags overlap least, so a music question
 * doesn't offer six R&B singers. Keeps Qloo's affinity order as the tiebreak.
 */
function diversify(all: Json[], take: number): Json[] {
  // Untagged entities (self-help books, novelty acts) can't be placed; skip them when there's choice.
  const tagged = all.filter((e) => ((e.tags as Json[] | undefined)?.length ?? 0) >= 2);
  const entities = tagged.length >= take ? tagged : all;
  const tagSets = entities.map(
    (e) => new Set(strs((e.tags as Json[] | undefined)?.map((t) => String(t.tag_id ?? t.name)))),
  );
  const picked: number[] = [];
  const seenNames = new Set<string>();
  while (picked.length < take && picked.length < entities.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < entities.length; i++) {
      if (picked.includes(i)) continue;
      const name = String(entities[i].name).toLowerCase();
      if (seenNames.has(name)) continue;
      let overlap = 0;
      for (const j of picked) {
        let shared = 0;
        for (const t of tagSets[i]) if (tagSets[j].has(t)) shared++;
        overlap += shared / Math.max(1, Math.min(tagSets[i].size, tagSets[j].size));
      }
      // Earlier (higher affinity) wins ties; overlap costs more than rank.
      const score = -overlap * 10 - i * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) break;
    picked.push(best);
    seenNames.add(String(entities[best].name).toLowerCase());
  }
  return picked.map((i) => entities[i]);
}

/** Places (restaurants, bars, cafés) in the city itself. */
export async function placesInCity(
  ctx: ActionCtx,
  trace: Span[],
  city: string,
  take = 10,
): Promise<EntityRef[]> {
  const params: QlooParams = {
    "filter.type": ENTITY.place,
    "filter.location.query": city,
    "filter.tags": "urn:tag:genre:place:restaurant",
    "filter.popularity.min": 0.9,
    take,
  };
  const body = await traced<{ results?: { entities?: Json[] } }>(
    ctx,
    trace,
    `Places to eat in ${city}`,
    "/v2/insights",
    params,
    (b) => `${b.results?.entities?.length ?? 0} results`,
  );
  return (body.results?.entities ?? []).map((e) => {
    const ref = entityFromInsights(e, "location");
    const props = (e.properties ?? {}) as Json;
    const images = props.images as Json[] | undefined;
    if (!ref.image && images?.[0]) ref.image = str(images[0].url);
    const geo = (props.geocode ?? {}) as Json;
    ref.subtitle = str(geo.name) ?? str(geo.city);
    return ref;
  });
}

/** Entities of `kind` recommended from the shopper's signals (used for adaptive questions). */
export async function entitiesFromSignals(
  ctx: ActionCtx,
  trace: Span[],
  kind: EntityKind,
  entityIds: string[],
  city?: string,
  take = 10,
): Promise<EntityRef[]> {
  const params: QlooParams = {
    "filter.type": ENTITY[kind],
    "signal.interests.entities": entityIds.join(","),
    take,
  };
  if (city) params["signal.location.query"] = city;
  const body = await traced<{ results?: { entities?: Json[] } }>(
    ctx,
    trace,
    `${kind.replace("_", " ")}s for these signals`,
    "/v2/insights",
    params,
    (b) => `${b.results?.entities?.length ?? 0} results`,
  );
  return (body.results?.entities ?? []).map((e) => entityFromInsights(e, "qloo"));
}

export async function tagInsights(
  ctx: ActionCtx,
  trace: Span[],
  entityIds: string[],
  tagTypes: string[],
  label: string,
  take = 30,
): Promise<TasteTag[]> {
  const params: QlooParams = {
    "filter.type": "urn:tag",
    "filter.tag.types": tagTypes.join(","),
    "signal.interests.entities": entityIds.join(","),
    take,
  };
  const body = await traced<{ results?: { tags?: Json[] } }>(
    ctx,
    trace,
    label,
    "/v2/insights",
    params,
    (b) =>
      (b.results?.tags ?? [])
        .slice(0, 6)
        .map((t) => String(t.name).trim())
        .join(", ") || "no tags",
  );
  const tags = (body.results?.tags ?? []).filter((t) => !/^(null|none)$/i.test(String(t.name).trim()));
  return tags.map((t, rank) => ({
    id: String(t.tag_id),
    name: String(t.name).trim(),
    type: str(t.subtype) ?? "urn:tag",
    affinity: round3(Number((t.query as Json | undefined)?.affinity ?? 0) * rankWeight(rank, tags.length)),
  }));
}

/** Industries that sell the kind of thing a store of this vertical sells. */
const RELEVANT_INDUSTRIES: Record<string, RegExp> = {
  fashion:
    /fashion|apparel|footwear|outdoor|beauty|grooming|cosmetic|jewel|eyewear|luggage|sport|textile|lifestyle|streetwear|denim/i,
  home: /home|furniture|kitchen|cookware|interior|lighting|textile|decor|art & design|bedding|garden|tableware/i,
  retail:
    /retail|fashion|apparel|footwear|home|furniture|kitchen|beauty|outdoor|consumer goods|lifestyle|jewel|sport|textile|art & design/i,
};
const EXCLUDED_INDUSTRIES =
  /grocery|restaurant|dining|media|publishing|government|transportation|airline|software|technology|telecom|finance|bank|insurance|automotive|pharma|hospital|streaming|broadcast|news|beverage|meal kit|delivery|marketplace|travel/i;

export function brandIsRelevant(industries: string[], vertical: string): boolean {
  const key = /fashion|apparel|cloth/i.test(vertical)
    ? "fashion"
    : /home|living|furnit|decor/i.test(vertical)
      ? "home"
      : "retail";
  const re = RELEVANT_INDUSTRIES[key];
  const joined = industries.join(" / ");
  if (!industries.length) return false;
  if (re.test(joined)) return true;
  return false;
}

/** Qloo's affinity saturates near 1.0 across the top results; rank carries the signal. */
export const rankWeight = (rank: number, n: number): number => 1 - 0.6 * (rank / Math.max(1, n - 1));

export async function brandInsights(
  ctx: ActionCtx,
  trace: Span[],
  entityIds: string[],
  city: string | undefined,
  storeBrands: Set<string>,
  vertical: string,
  take = 20,
): Promise<TasteBrand[]> {
  const params: QlooParams = {
    "filter.type": ENTITY.brand,
    "signal.interests.entities": entityIds.join(","),
    "feature.explainability": true,
    // 50 with explainability can exceed Convex's 1 MiB cache document.
    take: 35,
  };
  if (city) params["signal.location.query"] = city;
  const body = await traced<{ results?: { entities?: Json[] } }>(
    ctx,
    trace,
    city ? `Brand affinities, weighted for ${city}` : "Brand affinities",
    "/v2/insights",
    params,
    (b) =>
      (b.results?.entities ?? [])
        .filter((e) => brandIsRelevant(strs((e.properties as Json | undefined)?.industries), vertical))
        .slice(0, 6)
        .map((e) => String(e.name))
        .join(", ") || "no brands",
  );
  const relevant = (body.results?.entities ?? [])
    .filter((e) => {
      const industries = strs((e.properties as Json | undefined)?.industries);
      return brandIsRelevant(industries, vertical) && !EXCLUDED_INDUSTRIES.test(industries.join(" / ")) ||
        (brandIsRelevant(industries, vertical) && /retail/i.test(industries.join(" / ")));
    })
    .slice(0, take);
  return relevant.map((e, rank) => {
    const props = (e.properties ?? {}) as Json;
    const query = (e.query ?? {}) as Json;
    const explainRaw = (query.explainability as Json | undefined)?.[
      "signal.interests.entities"
    ];
    const explain: TasteBrand["explain"] = [];
    if (Array.isArray(explainRaw)) {
      for (const row of explainRaw as Json[]) {
        if (row.entity_id) {
          explain.push({ entityId: String(row.entity_id), score: Number(row.score ?? 0) });
        }
      }
    } else if (explainRaw && typeof explainRaw === "object") {
      for (const [entityId, score] of Object.entries(explainRaw as Json)) {
        explain.push({ entityId, score: Number(score ?? 0) });
      }
    }
    const name = String(e.name);
    return {
      id: String(e.entity_id),
      name,
      affinity: round3(Number(query.affinity ?? 0) * rankWeight(rank, relevant.length)),
      image: str((props.image as Json | undefined)?.url),
      personalStyle: clean(strs(props.personal_style)),
      lifestyle: clean(strs(props.lifestyle)),
      keywords: clean(strs(props.keywords)),
      emotionalTone: clean(strs(props.emotional_tone)),
      industries: strs(props.industries),
      explain,
      inStore: storeBrands.has(name.toLowerCase()),
    };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Qloo affinity for the brands this store carries. Resolves each brand name
 * (cached for a month) and asks for affinity restricted to those ids, so a
 * multi-brand store learns "of what we stock, this shopper leans Patagonia".
 */
export async function storeBrandAffinities(
  ctx: ActionCtx,
  trace: Span[],
  entityIds: string[],
  brandNames: string[],
): Promise<TasteBrand[]> {
  const resolved = new Map<string, string>();
  const failures: string[] = [];
  for (const name of brandNames) {
    // Cache misses are paced and retried once: the hackathon key rate-limits bursts.
    let found: EntityRef | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = trace.length;
      try {
        found = await searchEntity(ctx, trace, name, "brand", "store");
        if (trace[before]?.cache !== "hit") await sleep(120);
        break;
      } catch (err) {
        if (err instanceof QlooError && err.status === 429 && attempt === 0) {
          await sleep(1500);
          continue;
        }
        failures.push(`${name}: ${String(err).slice(0, 60)}`);
      }
    }
    if (!found) continue;
    const a = norm(found.name);
    const b = norm(name);
    // "Carhartt WIP" → "Carhartt" is fine; "Kapital" → "Kapital Bank" is not.
    if (a === b || b.startsWith(a + " ")) resolved.set(found.id, name);
  }
  // Collapse the per-brand lookups into one line so the trace stays readable.
  let lookups = 0;
  let lookupMs = 0;
  for (let i = trace.length - 1; i >= 0; i--) {
    const t = trace[i];
    if (t.path === "/search" && t.params?.types === ENTITY.brand && t.params?.query && brandNames.includes(t.params.query)) {
      lookups++;
      lookupMs += t.ms;
      trace.splice(i, 1);
    }
  }
  trace.push({
    kind: "qloo",
    name: `Find the store's brands in Qloo`,
    path: "/search",
    params: { types: ENTITY.brand, query: `${lookups} brand names` },
    cache: "hit",
    ms: lookupMs,
    result:
      `${resolved.size} of ${brandNames.length} are Qloo entities` +
      (failures.length ? ` (${failures.length} lookups failed: ${failures[0]})` : ""),
  });
  if (resolved.size === 0) return [];
  const ids = [...resolved.keys()];
  const params: QlooParams = {
    "filter.type": ENTITY.brand,
    "signal.interests.entities": entityIds.join(","),
    "filter.results.entities": ids.join(","),
    "feature.explainability": true,
    take: Math.min(50, ids.length),
  };
  const body = await traced<{ results?: { entities?: Json[] } }>(
    ctx,
    trace,
    `Of the ${brandNames.length} brands this store carries, which fit`,
    "/v2/insights",
    params,
    (b) =>
      (b.results?.entities ?? [])
        .slice(0, 5)
        .map((e) => `${resolved.get(String(e.entity_id)) ?? e.name} ${Math.round(Number((e.query as Json)?.affinity ?? 0) * 100)}%`)
        .join(", ") || "none matched",
  );
  const entities = body.results?.entities ?? [];
  return entities.map((e, rank) => {
    const props = (e.properties ?? {}) as Json;
    const query = (e.query ?? {}) as Json;
    return {
      id: String(e.entity_id),
      name: resolved.get(String(e.entity_id)) ?? String(e.name),
      affinity: round3(Number(query.affinity ?? 0) * rankWeight(rank, entities.length)),
      image: str((props.image as Json | undefined)?.url),
      personalStyle: clean(strs(props.personal_style)),
      lifestyle: clean(strs(props.lifestyle)),
      keywords: clean(strs(props.keywords)),
      emotionalTone: clean(strs(props.emotional_tone)),
      industries: strs(props.industries),
      explain: parseExplain(query),
      inStore: true,
    };
  });
}

function parseExplain(query: Json): TasteBrand["explain"] {
  const explainRaw = (query.explainability as Json | undefined)?.["signal.interests.entities"];
  const explain: TasteBrand["explain"] = [];
  if (Array.isArray(explainRaw)) {
    for (const row of explainRaw as Json[]) {
      if (row.entity_id) explain.push({ entityId: String(row.entity_id), score: Number(row.score ?? 0) });
    }
  } else if (explainRaw && typeof explainRaw === "object") {
    for (const [entityId, score] of Object.entries(explainRaw as Json)) {
      explain.push({ entityId, score: Number(score ?? 0) });
    }
  }
  return explain;
}

export interface Demographics {
  age: Record<string, number>;
  gender: Record<string, number>;
}

export async function demographicInsights(
  ctx: ActionCtx,
  trace: Span[],
  entityIds: string[],
): Promise<Demographics | null> {
  const params: QlooParams = {
    "filter.type": "urn:demographics",
    "signal.interests.entities": entityIds.join(","),
  };
  const body = await traced<{ results?: { demographics?: Json[] } }>(
    ctx,
    trace,
    "Who else shares these signals",
    "/v2/insights",
    params,
    (b) => {
      const d = summarizeDemographics(b.results?.demographics);
      return d ? `skews ${d}` : "no data";
    },
  );
  return aggregateDemographics(body.results?.demographics);
}

/** Qloo returns one row per input entity; average them. */
function aggregateDemographics(rows: Json[] | undefined): Demographics | null {
  if (!rows?.length) return null;
  const age: Record<string, number> = {};
  const gender: Record<string, number> = {};
  for (const row of rows) {
    const q = (row.query ?? {}) as Json;
    for (const [k, val] of Object.entries((q.age ?? {}) as Record<string, number>)) {
      age[k] = (age[k] ?? 0) + val / rows.length;
    }
    for (const [k, val] of Object.entries((q.gender ?? {}) as Record<string, number>)) {
      gender[k] = (gender[k] ?? 0) + val / rows.length;
    }
  }
  return { age, gender };
}

function summarizeDemographics(rows: Json[] | undefined): string | null {
  const d = aggregateDemographics(rows);
  if (!d) return null;
  const topAge = Object.entries(d.age).sort((a, b) => b[1] - a[1])[0];
  const topGender = Object.entries(d.gender).sort((a, b) => b[1] - a[1])[0];
  return [topAge?.[0]?.replace(/_/g, " "), topGender?.[0]].filter(Boolean).join(", ");
}
