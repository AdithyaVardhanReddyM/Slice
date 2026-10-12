import type { QlooParams } from "@slice/qloo";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  AESTHETIC_TAG_GROUPS,
  brandInsights,
  CULTURAL_TAG_TYPES,
  demographicInsights,
  entitiesForCity,
  entitiesFromSignals,
  locateCity,
  placesInCity,
  tagInsights,
  tagInsightsByGroup,
  type EntityKind,
  type EntityRef,
  type Span,
} from "./qlooApi";
import { cachedQlooGet } from "./qloo";
import { spanValidator } from "./schema";
import type { AudienceProfile, BrandBrief, ProfileBrand, ProfileEntity } from "./pagesTypes";
import {
  audienceLabel,
  cultureKind,
  dedupeById,
  estimateReach,
  resolveNames,
  slugify,
  soft,
  toProfileBrand,
  toProfileEntity,
  toProfileTag,
} from "./pagesUtil";

// An audience is a named group with a Qloo taste profile. `compile` turns the
// merchant's definition (a city, a demographic, names, a CSV cluster, one
// customer) into the same AudienceProfile shape, so a page variant is always
// page × audience whatever the source.

export const sourcesValidator = v.object({
  location: v.optional(v.object({ city: v.string(), country: v.optional(v.string()) })),
  demographics: v.optional(v.object({ age: v.optional(v.string()), gender: v.optional(v.string()) })),
  interests: v.optional(v.array(v.string())),
  interestEntities: v.optional(v.array(v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()) }))),
  uploadId: v.optional(v.id("pagesUploads")),
  cluster: v.optional(v.number()),
  memberId: v.optional(v.id("pagesMembers")),
});

const progressValidator = v.object({ value: v.number(), label: v.string() });

export const list = query({
  args: { brandId: v.id("pagesBrands") },
  handler: async (ctx, { brandId }) =>
    ctx.db
      .query("pagesAudiences")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .order("desc")
      .collect(),
});

export const get = query({
  args: { id: v.id("pagesAudiences") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("pagesAudiences") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export async function uniqueAudienceSlug(ctx: MutationCtx, brandId: Id<"pagesBrands">, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("pagesAudiences")
      .withIndex("by_brand_slug", (q) => q.eq("brandId", brandId).eq("slug", slug))
      .unique();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

export const create = mutation({
  args: {
    brandId: v.id("pagesBrands"),
    name: v.string(),
    kind: v.string(),
    sources: sourcesValidator,
  },
  returns: v.object({ id: v.id("pagesAudiences") }),
  handler: async (ctx, { brandId, name, kind, sources }) => {
    const now = Date.now();
    const slug = await uniqueAudienceSlug(ctx, brandId, slugify(name));
    const id = await ctx.db.insert("pagesAudiences", {
      brandId,
      name: name.trim(),
      slug,
      kind,
      sources,
      status: "compiling",
      progress: { value: 0, label: "Starting" },
      size: 0,
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

/** Re-names the versions of the brand's pages that target `id` (and drops it from them when `drop`). */
async function relabelPages(ctx: MutationCtx, brandId: Id<"pagesBrands">, id: Id<"pagesAudiences">, drop: boolean) {
  const pages = await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
  for (const page of pages) {
    if (!page.audienceIds.includes(id)) continue;
    const audienceIds = drop ? page.audienceIds.filter((a) => a !== id) : page.audienceIds;
    const audiences = (await Promise.all(audienceIds.map((a) => ctx.db.get(a)))).filter((a) => a !== null);
    if (drop) await ctx.db.patch(page._id, { audienceIds, updatedAt: Date.now() });
    const versions = await ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", page._id)).collect();
    for (const vnt of versions) {
      await ctx.db.patch(vnt._id, { name: audienceLabel(audiences), audienceId: audiences.length === 1 ? audiences[0]._id : undefined, updatedAt: Date.now() });
    }
  }
}

export const remove = mutation({
  args: { id: v.id("pagesAudiences") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    // Pages built for it keep their version and drop it from their audiences.
    await ctx.db.delete(id);
    await relabelPages(ctx, audience.brandId, id, true);
    return null;
  },
});

export const setProgress = internalMutation({
  args: { id: v.id("pagesAudiences"), value: v.number(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, value, label }) => {
    await ctx.db.patch(id, { progress: { value, label }, updatedAt: Date.now() });
    return null;
  },
});

export const setProfile = internalMutation({
  args: {
    id: v.id("pagesAudiences"),
    profile: v.any(),
    size: v.number(),
    trace: v.array(spanValidator),
    status: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, profile, size, trace, status = "ready" }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await ctx.db.patch(id, {
      profile,
      size,
      status,
      error: undefined,
      progress: { value: 1, label: "Ready" },
      // A recompile replaces the Qloo spans but keeps the agent's brief span.
      trace: [...trace, ...audience.trace.filter((s) => s.kind === "llm")],
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setStatus = internalMutation({
  args: { id: v.id("pagesAudiences"), status: v.string(), error: v.optional(v.string()), trace: v.optional(v.array(spanValidator)) },
  returns: v.null(),
  handler: async (ctx, { id, status, error, trace }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await ctx.db.patch(id, { status, error, trace: trace ? [...audience.trace, ...trace] : audience.trace, updatedAt: Date.now() });
    return null;
  },
});

/** The agent's brief (HTTP /pages/audience-brief). */
export const setBrief = internalMutation({
  args: { id: v.id("pagesAudiences"), brief: v.any(), spans: v.optional(v.array(spanValidator)) },
  returns: v.null(),
  handler: async (ctx, { id, brief, spans }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await ctx.db.patch(id, {
      brief,
      trace: spans?.length ? [...audience.trace.filter((s) => s.kind !== "llm"), ...spans] : audience.trace,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Partial update from the agent (HTTP /pages/audience). */
export const patch = internalMutation({
  args: {
    id: v.id("pagesAudiences"),
    patch: v.object({
      name: v.optional(v.string()),
      brief: v.optional(v.any()),
      status: v.optional(v.string()),
      progress: v.optional(progressValidator),
      error: v.optional(v.string()),
      spans: v.optional(v.array(spanValidator)),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const audience = await ctx.db.get(id);
    if (!audience) throw new Error("Unknown audience");
    const { spans, name, ...fields } = patch;
    const update: Partial<Doc<"pagesAudiences">> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) (update as Record<string, unknown>)[k] = val;
    if (name && name.trim() && name.trim() !== audience.name) {
      update.name = name.trim();
      update.slug = await uniqueAudienceSlug(ctx, audience.brandId, slugify(name));
    }
    if (spans?.length) update.trace = [...audience.trace, ...spans];
    await ctx.db.patch(id, update);
    // Page versions are named after their audiences.
    if (update.name) await relabelPages(ctx, audience.brandId, id, false);
    return null;
  },
});

/* Compiler ------------------------------------------------------------------ */

type Progress = (value: number, label: string) => Promise<unknown>;

const emptyCulture = (): AudienceProfile["culture"] => ({ artists: [], films: [], places: [], books: [] });

/** `signal.demographics.*` params. Qloo ignores them as the only signal; pair with a city or entities. */
function demographicSignal(d?: { age?: string; gender?: string }): QlooParams {
  const extra: QlooParams = {};
  if (d?.age) extra["signal.demographics.age"] = d.age;
  if (d?.gender) extra["signal.demographics.gender"] = d.gender;
  return extra;
}

/** Tags, brands and demographics for a set of signal ids, sequential and paced. */
async function enrich(
  ctx: ActionCtx,
  trace: Span[],
  ids: string[],
  city: string | undefined,
  extra: QlooParams,
  progress: Progress,
  from = 0.5,
): Promise<Pick<AudienceProfile, "tags" | "brands" | "demographics">> {
  if (ids.length === 0) return { tags: [], brands: [], demographics: null };
  await progress(from, "Reading aesthetic and lifestyle tags");
  const aesthetic = await soft(trace, "Aesthetic tags", () => tagInsightsByGroup(ctx, trace, ids, AESTHETIC_TAG_GROUPS, extra), []);
  const cultural = await soft(trace, "Cultural tags", () => tagInsights(ctx, trace, ids, CULTURAL_TAG_TYPES, "Cultural tags for these signals", 20, extra), []);
  await progress(from + 0.25, "Reading brand affinities");
  const brands = await soft(trace, "Brand affinities", () => brandInsights(ctx, trace, ids, city, new Set(), "retail", 14, extra), []);
  await progress(from + 0.4, "Reading the demographic skew");
  const demographics = await soft(trace, "Who else shares these signals", () => demographicInsights(ctx, trace, ids), null);
  return {
    tags: [...aesthetic, ...cultural].map(toProfileTag),
    brands: brands.map(toProfileBrand),
    demographics,
  };
}

/** Top ids to use as signals: interleave kinds so one domain does not dominate. */
function interleave<T>(lists: T[][], take: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < take; i++) {
    let any = false;
    for (const l of lists) {
      if (l[i] !== undefined) {
        out.push(l[i]);
        any = true;
        if (out.length >= take) break;
      }
    }
    if (!any) break;
  }
  return out;
}

const culturePick = (list: EntityRef[], source: string, take: number): ProfileEntity[] =>
  dedupeById(list.map((e) => toProfileEntity(e, source)), take);

async function compileLocation(ctx: ActionCtx, trace: Span[], audience: Doc<"pagesAudiences">, progress: Progress) {
  const city = audience.sources.location!.city;
  const extra = demographicSignal(audience.sources.demographics);
  await progress(0.05, `Finding what ${city} listens to`);
  const artists = await soft(trace, "Top artists", () => entitiesForCity(ctx, trace, "artist", city, 8, extra), []);
  await progress(0.15, `Finding what ${city} watches`);
  const movies = await soft(trace, "Top movies", () => entitiesForCity(ctx, trace, "movie", city, 6, extra), []);
  const tv = await soft(trace, "Top shows", () => entitiesForCity(ctx, trace, "tv_show", city, 4, extra), []);
  await progress(0.25, `Finding what ${city} reads`);
  const books = await soft(trace, "Top books", () => entitiesForCity(ctx, trace, "book", city, 4, extra), []);
  await progress(0.32, `Finding where ${city} eats`);
  const places = await soft(trace, "Places to eat", () => placesInCity(ctx, trace, city, 8), []);
  const culture = {
    artists: culturePick(artists, "location", 8),
    films: culturePick([...movies, ...tv], "location", 10),
    places: culturePick(places, "location", 8),
    books: culturePick(books, "location", 4),
  };
  const entities = dedupeById([...culture.artists, ...culture.films, ...culture.books, ...culture.places]);
  if (entities.length === 0) throw new Error(`Qloo returned nothing for "${city}". Try a bigger city nearby.`);
  const signalIds = interleave([artists, movies, tv, books, places], 12).map((e) => e.id);
  const enriched = await enrich(ctx, trace, signalIds, city, extra, progress, 0.45);
  await progress(0.92, "Locating the city");
  const located = await soft(trace, `Locate "${city}"`, () => locateCity(ctx, trace, city), null);
  const profile: AudienceProfile = {
    entities,
    ...enriched,
    geo: [{ name: city, count: 1, lat: located?.lat, lon: located?.lon }],
    culture,
  };
  const d = audience.sources.demographics;
  return { profile, size: estimateReach(`${city}|${d?.age ?? ""}|${d?.gender ?? ""}`) };
}

/**
 * The city in a street address: "Parque Tejo, Passeio do Tejo, 1990-096 Lisboa,
 * Portugal" → "Lisboa"; "2211 NE Alberta St, Portland, OR 97211" → "Portland";
 * "Austin, TX" → "Austin". Postcodes and state codes are dropped.
 */
function cityOfAddress(location: string): string {
  const POSTCODE = /\b\d[\d-]{2,}\b/g;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const clean = (p: string) => p.replace(POSTCODE, "").replace(/\s+[A-Z]{2}$/, "").trim();
  // A later part holding a postcode and a name is the city ("13007 Marseille",
  // "1990-096 Lisboa"); the first part is skipped, US street numbers live there.
  const withPostcode = parts.slice(1).reverse().find((p) => /\b\d[\d-]{2,}\b/.test(p) && /\p{L}{3,}/u.test(clean(p)));
  if (withPostcode) return clean(withPostcode);
  const pick = parts.length >= 3 ? parts[parts.length - 2] : (parts[0] ?? "");
  const city = clean(pick);
  // "Portland, OR 97211, USA" picks "OR 97211"; fall back to the first part.
  return /^[A-Z]{2}$/.test(city) || !city ? (parts[0] ?? "") : city;
}

/**
 * Demographic audiences need a base signal: Qloo returns the plain popularity
 * list when `signal.demographics.*` is the only signal (verified 2026-10-11:
 * identical results for 24_and_younger and 55_and_older alone; the same
 * params plus a city change the list completely). The brand's own Qloo entity
 * or its proxies anchor the read; failing that, the brand's first location.
 */
async function compileDemographic(ctx: ActionCtx, trace: Span[], audience: Doc<"pagesAudiences">, brand: Doc<"pagesBrands">, progress: Progress) {
  const extra = demographicSignal(audience.sources.demographics);
  const qloo = brand.qloo;
  const anchorIds = qloo?.entityId ? [qloo.entityId] : (qloo?.proxies ?? []).map((p) => p.id);
  const brief = brand.brief as BrandBrief | undefined;
  // Without a brand entity, anchor on the brand's own cities: the first one
  // Qloo knows wins, New York City last.
  const candidates = [...new Set([...(brief?.locations ?? []).map(cityOfAddress).filter(Boolean), "New York City"])];
  let city = candidates[0];
  const fetchKind = async (kind: EntityKind, take: number) =>
    anchorIds.length
      ? entitiesFromSignals(ctx, trace, kind, anchorIds, undefined, take, extra)
      : entitiesForCity(ctx, trace, kind, city, take, extra);
  await progress(0.05, anchorIds.length ? `Finding what people around brands like ${brand.name} listen to` : "Finding a city to anchor the read");
  let artists: Awaited<ReturnType<typeof fetchKind>> = [];
  if (anchorIds.length) {
    artists = await soft(trace, "Artists", () => fetchKind("artist", 8), []);
  } else {
    for (const c of candidates) {
      city = c;
      artists = await soft(trace, `Artists in ${c}`, () => fetchKind("artist", 8), []);
      if (artists.length) break;
    }
  }
  const label = anchorIds.length ? `people around brands like ${brand.name}` : `people in ${city}`;
  trace.push({
    kind: "slice",
    name: "Anchor the demographic read",
    ms: 0,
    result: anchorIds.length
      ? `Demographic signal applied to ${anchorIds.length} brand entit${anchorIds.length === 1 ? "y" : "ies"} (Qloo ignores a demographic signal on its own)`
      : `No Qloo brand entity; demographic signal applied to ${city}`,
  });
  await progress(0.15, `Finding what ${label} watch`);
  const movies = await soft(trace, "Movies", () => fetchKind("movie", 6), []);
  const tv = await soft(trace, "Shows", () => fetchKind("tv_show", 4), []);
  await progress(0.25, `Finding what ${label} read`);
  const books = await soft(trace, "Books", () => fetchKind("book", 4), []);
  await progress(0.32, `Finding where ${label} go`);
  const places = await soft(trace, "Places", () => fetchKind("place", 6), []);
  const culture = {
    artists: culturePick(artists, "demographic", 8),
    films: culturePick([...movies, ...tv], "demographic", 10),
    places: culturePick(places, "demographic", 6),
    books: culturePick(books, "demographic", 4),
  };
  const entities = dedupeById([...culture.artists, ...culture.films, ...culture.books, ...culture.places]);
  if (entities.length === 0) throw new Error(`Qloo returned nothing for this demographic around ${anchorIds.length ? brand.name : city}.`);
  const signalIds = interleave([artists, movies, tv, books, places], 12).map((e) => e.id);
  const enriched = await enrich(ctx, trace, signalIds, undefined, extra, progress, 0.45);
  const d = audience.sources.demographics;
  const profile: AudienceProfile = { entities, ...enriched, geo: [], culture };
  return { profile, size: estimateReach(`${brand.slug}|${d?.age ?? ""}|${d?.gender ?? ""}`) };
}

/** Culture lists from known entities, topped up from Qloo where a kind is thin. */
async function cultureFrom(
  ctx: ActionCtx,
  trace: Span[],
  entities: ProfileEntity[],
  signalIds: string[],
  progress: Progress,
  from: number,
  wanted: { artists: number; films: number; places: number; books: number } = { artists: 6, films: 6, places: 6, books: 4 },
): Promise<AudienceProfile["culture"]> {
  const culture = emptyCulture();
  for (const e of entities) {
    const k = cultureKind(e.type);
    if (k) culture[k].push(e);
  }
  const fill: [keyof typeof culture, EntityKind, string][] = [
    ["artists", "artist", "Artists for these signals"],
    ["films", "movie", "Films for these signals"],
    ["places", "place", "Places for these signals"],
    ["books", "book", "Books for these signals"],
  ];
  let step = 0;
  for (const [bucket, kind, label] of fill) {
    if (culture[bucket].length >= Math.min(3, wanted[bucket]) || signalIds.length === 0) continue;
    await progress(from + 0.05 * step++, label);
    const more = await soft(trace, label, () => entitiesFromSignals(ctx, trace, kind, signalIds, undefined, wanted[bucket]), []);
    culture[bucket] = dedupeById([...culture[bucket], ...more.map((e) => toProfileEntity(e, "qloo"))], wanted[bucket] + 2);
  }
  return culture;
}

async function compileInterests(ctx: ActionCtx, trace: Span[], audience: Doc<"pagesAudiences">, progress: Progress) {
  // Entities picked from suggestions are used as-is; only free-typed names are searched.
  const picked = audience.sources.interestEntities ?? [];
  const pickedNames = new Set(picked.map((e) => e.name.toLowerCase()));
  const names = (audience.sources.interests ?? []).map((s) => s.trim()).filter((s) => s && !pickedNames.has(s.toLowerCase()));
  if (!names.length && !picked.length) throw new Error("No interests to compile");
  if (picked.length) {
    trace.push({ kind: "slice", name: "Use the picked Qloo entities", ms: 0, result: picked.map((e) => `${e.name} (${e.type.replace("urn:entity:", "")})`).join(", ") });
  }
  let found = new Map<string, EntityRef>();
  if (names.length) {
    await progress(0.05, `Finding ${names.length} names in Qloo`);
    found = await resolveNames(ctx, trace, names, undefined, "interest", {
      strict: false,
      label: "Find the interests in Qloo",
      onProgress: (done, total) => progress(0.05 + 0.25 * (done / total), `Resolved ${done} of ${total}`),
    });
  }
  const entities = dedupeById([
    ...picked.map((e) => toProfileEntity({ ...e, source: "interest" }, "interest")),
    ...[...found.values()].map((e) => toProfileEntity(e, "interest")),
  ]);
  if (entities.length === 0) throw new Error(`Qloo has no match for ${names.map((n) => `"${n}"`).join(", ")}. Check the spelling or pick a suggestion.`);
  const ids = entities.slice(0, 12).map((e) => e.id);
  const culture = await cultureFrom(ctx, trace, entities, ids, progress, 0.32);
  const enriched = await enrich(ctx, trace, ids, undefined, {}, progress, 0.55);
  const profile: AudienceProfile = { entities, ...enriched, geo: [], culture };
  return { profile, size: estimateReach(names.join("|")) };
}

function countEntities(members: Doc<"pagesMembers">[]): ProfileEntity[] {
  const counts = new Map<string, ProfileEntity>();
  for (const m of members) {
    for (const e of m.entities) {
      const cur = counts.get(e.id);
      if (cur) cur.count = (cur.count ?? 0) + 1;
      else counts.set(e.id, { id: e.id, name: e.name, type: e.type, image: e.image, source: "csv", count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
}

async function geoFromMembers(ctx: ActionCtx, trace: Span[], members: Doc<"pagesMembers">[], progress: Progress, from: number) {
  const cities = new Map<string, number>();
  for (const m of members) if (m.city) cities.set(m.city, (cities.get(m.city) ?? 0) + 1);
  const geo: AudienceProfile["geo"] = [...cities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));
  for (let i = 0; i < Math.min(3, geo.length); i++) {
    await progress(from + 0.02 * i, `Locating ${geo[i].name}`);
    const located = await soft(trace, `Locate "${geo[i].name}"`, () => locateCity(ctx, trace, geo[i].name), null);
    if (located) {
      geo[i].lat = located.lat;
      geo[i].lon = located.lon;
    }
  }
  return geo;
}

async function compileCsv(ctx: ActionCtx, trace: Span[], audience: Doc<"pagesAudiences">, progress: Progress) {
  const { uploadId, cluster } = audience.sources;
  if (!uploadId || cluster === undefined) throw new Error("CSV audience needs uploadId and cluster");
  const members = await ctx.runQuery(internal.pagesUploads.membersInternal, { uploadId, cluster });
  if (!members.length) throw new Error("The cluster has no members");
  await progress(0.05, `Counting what ${members.length} members love`);
  const ranked = countEntities(members);
  const entities = ranked.slice(0, 40);
  const ids = ranked.slice(0, 12).map((e) => e.id);
  trace.push({
    kind: "slice",
    name: "Rank the cluster's entities",
    ms: 0,
    result: ranked.slice(0, 6).map((e) => `${e.name} ×${e.count}`).join(", ") || "no resolved entities",
  });
  const culture = await cultureFrom(ctx, trace, ranked, ids, progress, 0.15);
  const enriched = await enrich(ctx, trace, ids, undefined, {}, progress, 0.4);
  const geo = await geoFromMembers(ctx, trace, members, progress, 0.9);
  const profile: AudienceProfile = { entities, ...enriched, geo, culture };
  return { profile, size: members.length };
}

async function compileLead(ctx: ActionCtx, trace: Span[], audience: Doc<"pagesAudiences">, progress: Progress) {
  const memberId = audience.sources.memberId;
  if (!memberId) throw new Error("Lead audience needs memberId");
  const member = await ctx.runQuery(internal.pagesUploads.memberInternal, { id: memberId });
  if (!member) throw new Error("Unknown member");
  const entities = member.entities.map((e) => ({ ...e, source: "csv", count: 1 }) as ProfileEntity);
  if (!entities.length) throw new Error("This member has no resolved taste entities");
  const ids = entities.slice(0, 12).map((e) => e.id);
  await progress(0.1, "Reading this guest's taste");
  const culture = await cultureFrom(ctx, trace, entities, ids, progress, 0.15);
  const extra = demographicSignal({ age: member.age, gender: member.gender });
  const enriched = await enrich(ctx, trace, ids, member.city, extra, progress, 0.45);
  let geo: AudienceProfile["geo"] = [];
  if (member.city) {
    await progress(0.92, `Locating ${member.city}`);
    const located = await soft(trace, `Locate "${member.city}"`, () => locateCity(ctx, trace, member.city!), null);
    geo = [{ name: member.city, count: 1, lat: located?.lat, lon: located?.lon }];
  }
  const profile: AudienceProfile = { entities, ...enriched, geo, culture };
  return { profile, size: 1 };
}

function compileDefault(trace: Span[], brand: Doc<"pagesBrands">) {
  const q = brand.qloo;
  const anchors: ProfileEntity[] = q?.entityId
    ? [{ id: q.entityId, name: q.entityName ?? brand.name, type: "urn:entity:brand", source: "brand", count: 1 }]
    : (q?.proxies ?? []).map((p) => ({ id: p.id, name: p.name, type: "urn:entity:brand", image: p.image, source: "brand", count: 1 }));
  const brands: ProfileBrand[] = (q?.similarBrands ?? []).map((b, i, all) => ({
    id: b.id,
    name: b.name,
    affinity: Math.round((1 - 0.6 * (i / Math.max(1, all.length - 1))) * 1000) / 1000,
    image: b.image,
    personalStyle: [],
    lifestyle: [],
    emotionalTone: [],
    industries: [],
  }));
  trace.push({
    kind: "slice",
    name: "Profile from the brand's own Qloo read",
    ms: 0,
    result: q ? `${q.tags.length} tags, ${brands.length} similar brands${q.matched ? "" : ` via ${q.proxies.length} proxies`}` : "brand has no Qloo read yet",
  });
  const profile: AudienceProfile = {
    entities: anchors,
    tags: (q?.tags ?? []) as AudienceProfile["tags"],
    brands,
    demographics: (q?.demographics as AudienceProfile["demographics"]) ?? null,
    geo: [],
    culture: emptyCulture(),
  };
  return { profile, size: 0 };
}

// In the order a merchant most likely means them: "Patagonia" is the brand
// before the dozen restaurants and parks of the same name.
const SUGGEST_TYPES = ["brand", "artist", "movie", "tv_show", "book", "podcast", "person", "destination", "place"];

/** Name suggestions for the interests field: Qloo search, cached, typed entities only. */
export const suggestEntities = action({
  args: { query: v.string() },
  returns: v.array(v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()), subtitle: v.optional(v.string()) })),
  handler: async (ctx, { query }) => {
    const q = query.trim();
    if (q.length < 2) return [];
    const { body } = await cachedQlooGet(ctx, "/search", { query: q, take: 12 });
    const rank = (e: Record<string, unknown>) => {
      const i = SUGGEST_TYPES.indexOf(String((e.types as string[] | undefined)?.[0] ?? "").replace("urn:entity:", ""));
      return i === -1 ? 99 : i;
    };
    // Stable sort: type first, Qloo's relevance within a type.
    const results = ((JSON.parse(body) as { results?: Record<string, unknown>[] }).results ?? [])
      .map((e, i) => ({ e, i }))
      .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
      .map(({ e }) => e);
    const out: { id: string; name: string; type: string; image?: string; subtitle?: string }[] = [];
    for (const e of results) {
      const type = String((e.types as string[] | undefined)?.[0] ?? "");
      if (!SUGGEST_TYPES.includes(type.replace("urn:entity:", ""))) continue;
      const props = (e.properties ?? {}) as Record<string, unknown>;
      const image = ((props.image as Record<string, unknown> | undefined)?.url as string | undefined) ?? undefined;
      const subtitle = (props.short_description as string | undefined) ?? (e.disambiguation as string | undefined);
      out.push({
        id: String(e.entity_id ?? e.id),
        name: String(e.name),
        type,
        ...(image ? { image } : {}),
        ...(subtitle ? { subtitle: subtitle.length > 80 ? `${subtitle.slice(0, 77)}…` : subtitle } : {}),
      });
      if (out.length >= 6) break;
    }
    return out;
  },
});

export const compile = action({
  args: { id: v.id("pagesAudiences") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    const audience = await ctx.runQuery(internal.pagesAudiences.getInternal, { id });
    if (!audience) throw new Error("Unknown audience");
    const brand = await ctx.runQuery(internal.pagesBrands.getInternal, { id: audience.brandId });
    if (!brand) throw new Error("Unknown brand");
    const trace: Span[] = [];
    const progress: Progress = (value, label) => ctx.runMutation(internal.pagesAudiences.setProgress, { id, value, label });
    await ctx.runMutation(internal.pagesAudiences.setStatus, { id, status: "compiling" });
    try {
      let result: { profile: AudienceProfile; size: number };
      switch (audience.kind) {
        case "location":
          result = await compileLocation(ctx, trace, audience, progress);
          break;
        case "demographic":
          result = await compileDemographic(ctx, trace, audience, brand, progress);
          break;
        case "interests":
          result = await compileInterests(ctx, trace, audience, progress);
          break;
        case "csv":
          result = await compileCsv(ctx, trace, audience, progress);
          break;
        case "lead":
          result = await compileLead(ctx, trace, audience, progress);
          break;
        case "default":
          result = compileDefault(trace, brand);
          break;
        default:
          throw new Error(`Unknown audience kind "${audience.kind}"`);
      }
      await ctx.runMutation(internal.pagesAudiences.setProfile, { id, profile: result.profile, size: result.size, trace });
    } catch (err) {
      // Recorded on the audience (its card shows the reason); not rethrown, so
      // callers and the browser console are not handed a server error.
      await ctx.runMutation(internal.pagesAudiences.setStatus, { id, status: "failed", error: String(err).replace(/^Error: /, "").slice(0, 300), trace });
    }
    return null;
  },
});
