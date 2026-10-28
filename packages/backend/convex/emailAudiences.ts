import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { editableBrand, owned, ownedBrand } from "./emailBrands";
import { locationOf, tasteTerms, type ContactLite } from "./emailContacts";
import type { AudienceProfile } from "./emailTypes";
import {
  countEntities,
  cultureFrom,
  demographicSignal,
  enrich,
  geoFromMembers,
  mergeProfiles,
  type Progress,
} from "./pagesAudiences";
import type { ProfileTag } from "./pagesTypes";
import { norm, paced, soft } from "./pagesUtil";
import { cachedQlooGet } from "./qloo";
import { locateCity, type EntityRef, type Span } from "./qlooApi";
import { spanValidator } from "./schema";

// An email audience is who one campaign goes to: a taste group (people whose
// tastes sit close together, from any upload; one email written for the
// group) or the brand's individual contacts ("people": each has a profile of
// their own, a campaign ticks who gets it and writes a version per person).
// Profiles reuse the Pages compile helpers; contacts carry their own
// resolved entities.

/* Queries ------------------------------------------------------------------------ */

/** The brand's audiences, newest first, each with its list's name and how many members opted out. */
export const list = query({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    if (!(await ownedBrand(ctx, brandId))) return [];
    const audiences = await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect();
    const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const optedOut = await unsubscribedEmails(ctx, brandId);
    return Promise.all(
      audiences.map(async (a) => {
        const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", a._id)).collect();
        return {
          ...a,
          listName: (a.listId && lists.find((l) => l._id === a.listId)?.name) || "",
          unsubscribed: members.filter((m) => optedOut.has(m.email)).length,
          /** Members with nothing bought yet (placed by age, gender and neighbourhood). */
          newcomers: members.filter((m) => !m.purchases?.length).length,
        };
      }),
    );
  },
});

/** Emails that opted out anywhere in the brand: one unsubscribe covers every list. */
export async function unsubscribedEmails(ctx: { db: QueryCtx["db"] }, brandId: Id<"emailBrands">): Promise<Set<string>> {
  const contacts = await ctx.db
    .query("emailContacts")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .filter((q) => q.eq(q.field("unsubscribed"), true))
    .collect();
  return new Set(contacts.map((c) => c.email));
}

/** The brand's audiences, newest first, as stored (the agent over /agent/read, and scripts). */
export const listInternal = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect(),
});

export const get = query({
  args: { id: v.id("emailAudiences") },
  handler: async (ctx, { id }) => {
    const audience = await owned(ctx, await ctx.db.get(id));
    if (!audience) return null;
    const list = audience.listId ? await ctx.db.get(audience.listId) : null;
    return { ...audience, listName: list?.name ?? "" };
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("emailAudiences") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/* Edits ----------------------------------------------------------------------------- */

export const rename = mutation({
  args: { id: v.id("emailAudiences"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const audience = await ctx.db.get(id);
    if (!audience) throw new Error("Unknown audience");
    await editableBrand(ctx, audience.brandId);
    if (!name.trim()) return null;
    await ctx.db.patch(id, { name: name.trim().slice(0, 80), updatedAt: Date.now() });
    return null;
  },
});

/** Draft campaigns that went to a removed group stop going to it, and its now meaningless version goes. */
async function detachCampaigns(ctx: MutationCtx, brandId: Id<"emailBrands">, audienceIds: Set<string>) {
  const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
  for (const c of campaigns) {
    if (c.status !== "draft" || !c.groupIds?.some((g) => audienceIds.has(g))) continue;
    for (const ver of await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
      if (ver.audienceId && audienceIds.has(ver.audienceId)) await ctx.db.delete(ver._id);
    }
    const groupIds = c.groupIds.filter((g) => !audienceIds.has(g));
    await ctx.db.patch(c._id, { groupIds: groupIds.length ? groupIds : undefined, updatedAt: Date.now() });
  }
}

/**
 * After people left a group: a group with no one left goes (and draft
 * campaigns aimed at it lose their audience); otherwise its size follows.
 */
export async function settleGroup(ctx: MutationCtx, id: Id<"emailAudiences">) {
  const group = await ctx.db.get(id);
  if (!group || group.kind !== "group") return;
  const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", id)).collect();
  if (!members.length) {
    await detachCampaigns(ctx, group.brandId, new Set([id]));
    await ctx.db.delete(id);
    return;
  }
  await ctx.db.patch(id, { size: members.length, updatedAt: Date.now() });
}

/**
 * An upload and the people it brought in. Groups other uploads also fill stay
 * (smaller); groups left empty go; the individual contacts shrink. Sent
 * campaigns keep their sends.
 */
export async function deleteListCascade(ctx: MutationCtx, listId: Id<"emailLists">) {
  const list = await ctx.db.get(listId);
  if (!list) return;
  const touched = new Set<Id<"emailAudiences">>();
  for (const a of await ctx.db.query("emailAudiences").withIndex("by_list", (q) => q.eq("listId", listId)).collect()) {
    touched.add(a._id);
    await ctx.db.patch(a._id, { listId: undefined });
  }
  for (const c of await ctx.db.query("emailContacts").withIndex("by_list", (q) => q.eq("listId", listId)).collect()) {
    if (c.audienceId) touched.add(c.audienceId);
    await ctx.db.delete(c._id);
  }
  await ctx.db.delete(listId);
  for (const id of touched) {
    const a = await ctx.db.get(id);
    if (a?.kind === "group") await settleGroup(ctx, id);
    else if (a) await refreshPeopleAudience(ctx, id);
  }
}

/** A taste group and the people in it. The individual contacts can't go as a whole; people leave one by one. */
export const remove = mutation({
  args: { id: v.id("emailAudiences") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await editableBrand(ctx, audience.brandId);
    if (audience.kind === "people") throw new Error("Remove individual contacts one at a time");
    await detachCampaigns(ctx, audience.brandId, new Set([id]));
    for (const c of await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", id)).collect()) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
    return null;
  },
});

/* The brand's individual contacts ------------------------------------------------------- */

export const INDIVIDUALS = "Individual contacts";

/** The brand's one audience of individual contacts, made on first use. */
export async function individualsAudience(ctx: MutationCtx, brandId: Id<"emailBrands">): Promise<Doc<"emailAudiences">> {
  const all = await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
  const found = all.filter((a) => a.kind === "people").sort((a, b) => a._creationTime - b._creationTime)[0];
  if (found) return found;
  const now = Date.now();
  const id = await ctx.db.insert("emailAudiences", {
    brandId,
    name: INDIVIDUALS,
    kind: "people",
    status: "ready",
    size: 0,
    topEntities: [],
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

/**
 * Who a campaign goes to: everyone in its taste group, or the individual
 * contacts ticked for it (still individuals of the brand).
 */
export async function membersFor(
  ctx: { db: QueryCtx["db"] },
  campaign: Pick<Doc<"emailCampaigns">, "brandId" | "contactIds">,
  audience: Doc<"emailAudiences"> | null,
): Promise<Doc<"emailContacts">[]> {
  if (!audience) return [];
  if (audience.kind === "group") return ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", audience._id)).collect();
  const out: Doc<"emailContacts">[] = [];
  for (const id of new Set(campaign.contactIds ?? [])) {
    const c = await ctx.db.get(id);
    if (c && c.brandId === campaign.brandId && c.audienceId === audience._id) out.push(c);
  }
  return out;
}

/* Fitting people into taste groups ------------------------------------------------------ */

/**
 * The fit a person needs to join a group rather than start a new one: their
 * favourites, each weighted by the share of the group who also love it,
 * summed. 0.75 is three of their favourites loved by a quarter of the group,
 * or one loved by most of it. On the demo subscribers a person scores at
 * least 3.5 with their own group and at most 1.1 with any other.
 */
export const MIN_FIT = 0.75;

export type GroupTaste = { id: Id<"emailAudiences">; size: number; counts: Record<string, number> };

/** How well someone with these favourites fits a group. */
export function fitOf(entityIds: Iterable<string>, group: GroupTaste): number {
  if (!group.size) return 0;
  let score = 0;
  for (const id of entityIds) score += (group.counts[id] ?? 0) / group.size;
  return score;
}

/** The group someone fits best, when they fit it well enough. */
export function bestGroup(entityIds: string[], groups: GroupTaste[], exclude?: string): GroupTaste | null {
  let best: GroupTaste | null = null;
  let bestFit = 0;
  for (const g of groups) {
    if (g.id === exclude) continue;
    const fit = fitOf(entityIds, g);
    if (fit > bestFit) {
      bestFit = fit;
      best = g;
    }
  }
  return best && bestFit >= MIN_FIT ? best : null;
}

/** The brand's taste groups, profiles included. */
export const groupsOf = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => (await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()).filter((a) => a.kind === "group"),
});

const AGE_WORDS: Record<string, string> = {
  "24_and_younger": "under 25s",
  "25_to_29": "25 to 29s",
  "30_to_34": "30 to 34s",
  "35_to_44": "35 to 44s",
  "45_to_54": "45 to 54s",
  "55_and_older": "over 55s",
};
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;

export type ProspectFit = { id: Id<"emailAudiences">; name: string; score: number; note: string };

type Point = { lat: number; lon: number };

/** A restaurant within this distance of someone's home is near them: a short walk or a few stops. */
const NEAR_KM = 3;
/** A neighbourhood Qloo finds further than this from the person's city is a namesake elsewhere. */
const SAME_CITY_KM = 40;

/** Great-circle distance in km. */
function km(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Where someone lives, as precisely as Qloo can place it: their neighbourhood
 * in their city ("Haggerston, London"), else the city. A neighbourhood found
 * far from the city is a namesake ("Holland Park, London" finds Belgium) and
 * gives way to the city.
 */
async function homeOf(ctx: ActionCtx, trace: Span[], person: { city?: string; neighborhood?: string }): Promise<(Point & { name: string }) | null> {
  const city = person.city ? await soft(trace, `Locate "${person.city}"`, () => locateCity(ctx, trace, person.city!), null) : null;
  const where = locationOf(person);
  if (person.neighborhood && where) {
    const spot = await soft(trace, `Locate "${where}"`, () => locateCity(ctx, trace, where), null);
    if (spot && (!city || km(spot, city) <= SAME_CITY_KM)) return { name: person.neighborhood, lat: spot.lat, lon: spot.lon };
  }
  return city ? { name: person.city!, lat: city.lat, lon: city.lon } : null;
}

/** Where Qloo puts each of these places (≤ 20 ids). */
async function placeSpots(ctx: ActionCtx, ids: string[]): Promise<Map<string, Point>> {
  const { body } = await paced([], () => cachedQlooGet(ctx, "/v2/insights", { "filter.type": "urn:entity:place", "filter.results.entities": ids.join(","), take: ids.length }), 120);
  const out = new Map<string, Point>();
  for (const e of (JSON.parse(body) as { results?: { entities?: Json[] } }).results?.entities ?? []) {
    const loc = (e.location ?? {}) as Json;
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.set(String(e.entity_id), { lat, lon });
  }
  return out;
}

/** What a group's favourites are called in a placement note. */
const NOUN: Record<string, string> = { "urn:entity:book": "titles", "urn:entity:place": "restaurants" };

/**
 * How someone with no purchases yet fits each taste group, from Qloo alone:
 * the group's demographic skew (Qloo's read of who loves its favourites, kept
 * in its profile) for their age and gender, plus where they live. For a group
 * of places (restaurants) that is how many of them are near their home, the
 * signal that matters when booking a table; for anything else, how many of
 * the group's favourites land with people like them in their city (insights
 * restricted to those favourites, with their location and demographics as
 * signals). Best first.
 */
export async function prospectFits(
  ctx: ActionCtx,
  trace: Span[],
  person: { age?: string; gender?: string; city?: string; neighborhood?: string },
  groups: Doc<"emailAudiences">[],
): Promise<ProspectFit[]> {
  const out: ProspectFit[] = [];
  const where = locationOf(person);
  // Located once, the first time a group of places needs it.
  let home: Promise<(Point & { name: string }) | null> | undefined;
  for (const g of groups) {
    const profile = g.profile as AudienceProfile | undefined;
    if (!profile) continue;
    const d = profile.demographics;
    const ageSkew = person.age ? (d?.age?.[person.age] ?? 0) : 0;
    const genderSkew = person.gender ? (d?.gender?.[person.gender] ?? 0) : 0;
    const top = profile.entities.slice(0, 20);
    const types = new Map<string, number>();
    for (const e of top) types.set(e.type, (types.get(e.type) ?? 0) + 1);
    const type = [...types].sort((a, b) => b[1] - a[1])[0]?.[0];
    const ids = top.filter((e) => e.type === type).map((e) => e.id);
    const noun = (type && NOUN[type]) ?? "favourites";
    let local = 0;
    let localNote = "";
    if (where && type === "urn:entity:place" && ids.length) {
      home ??= homeOf(ctx, trace, person);
      const at = await home;
      if (at) {
        const t0 = Date.now();
        const spots = await soft(trace, `Where ${g.name}'s restaurants are`, () => placeSpots(ctx, ids), new Map<string, Point>());
        const near = ids.filter((id) => {
          const spot = spots.get(id);
          return spot && km(spot, at) <= NEAR_KM;
        }).length;
        local = near / ids.length;
        localNote = `${near ? `${near} of its ${ids.length}` : `none of its ${ids.length}`} restaurants ${near === 1 ? "is" : "are"} within ${NEAR_KM} km of ${at.name}`;
        trace.push({ kind: "slice", name: `How close ${g.name} is to ${at.name}`, ms: Date.now() - t0, result: localNote });
      }
    } else if (where && type && ids.length) {
      const t0 = Date.now();
      try {
        const { body, status } = await paced(
          [],
          () =>
            cachedQlooGet(ctx, "/v2/insights", {
              "filter.type": type,
              "filter.results.entities": ids.join(","),
              "signal.location.query": where,
              ...demographicSignal({ age: person.age, gender: person.gender }),
              take: ids.length,
            }),
          120,
        );
        const rows = (JSON.parse(body) as { results?: { entities?: Json[] } }).results?.entities ?? [];
        local = rows.reduce((s, r) => s + Number(((r.query ?? {}) as Json).affinity ?? 0), 0) / ids.length;
        // No rows means Qloo has little data there, not that they'd dislike it: say nothing.
        if (rows.length) localNote = `${rows.length} of its ${ids.length} ${noun} ${rows.length === 1 ? "is" : "are"} popular with people like them in ${where}`;
        trace.push({ kind: "qloo", name: `How ${g.name} lands in ${where}`, path: "/v2/insights", cache: status, ms: Date.now() - t0, result: localNote || "no local data" });
      } catch {
        // No location read; the demographic skew decides.
      }
    }
    const skews = [
      person.age && d ? `${signed(ageSkew)} with ${AGE_WORDS[person.age] ?? person.age}` : "",
      person.gender && d ? `${signed(genderSkew)} with ${person.gender === "female" ? "women" : "men"}` : "",
    ].filter(Boolean);
    const note = [skews.length ? `Qloo finds this group's ${noun} skew ${skews.join(" and ")}` : "", localNote].filter(Boolean).join("; ");
    // A city where most groups' favourites land says less than who loves them: half weight. Being
    // near a group's restaurants is a share (0 to 1) and counts in full: people book near home.
    out.push({ id: g._id, name: g.name, score: ageSkew + genderSkew + (type === "urn:entity:place" ? local : 0.5 * local), note: note ? `${note}.` : "" });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Every taste group of the brand with how many of its members love each entity. */
export const groupTastes = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }): Promise<GroupTaste[]> => {
    const groups = (await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()).filter((a) => a.kind === "group");
    const out: GroupTaste[] = [];
    for (const g of groups) {
      const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", g._id)).collect();
      const counts: Record<string, number> = {};
      for (const m of members) for (const e of m.entities) counts[e.id] = (counts[e.id] ?? 0) + 1;
      out.push({ id: g._id, size: members.length, counts });
    }
    return out;
  },
});

/** The agent's read of the audience (HTTP /email/audience-brief), and optionally a better name. */
export const setBrief = internalMutation({
  args: { id: v.id("emailAudiences"), brief: v.any(), name: v.optional(v.string()), spans: v.optional(v.array(spanValidator)) },
  returns: v.null(),
  handler: async (ctx, { id, brief, name, spans }) => {
    const audience = await ctx.db.get(id);
    if (!audience) throw new Error("Unknown audience");
    const b = (brief ?? {}) as Record<string, unknown>;
    const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
    const hooks = Array.isArray(b.hooks)
      ? b.hooks
          .map((h) => (typeof h === "string" ? { text: h, evidence: "" } : { text: str((h as Record<string, unknown>)?.text), evidence: str((h as Record<string, unknown>)?.evidence) }))
          .filter((h) => h.text)
          .slice(0, 8)
      : [];
    await ctx.db.patch(id, {
      brief: { summary: str(b.summary), speakTo: str(b.speakTo), leadWith: str(b.leadWith), hooks },
      ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}),
      ...(spans?.length ? { trace: [...audience.trace.filter((s) => s.kind !== "llm"), ...spans] } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setProgress = internalMutation({
  args: { id: v.id("emailAudiences"), value: v.number(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, value, label }) => {
    if (await ctx.db.get(id)) await ctx.db.patch(id, { progress: { value, label }, updatedAt: Date.now() });
    return null;
  },
});

export const setStatus = internalMutation({
  args: {
    id: v.id("emailAudiences"),
    status: v.union(v.literal("compiling"), v.literal("ready"), v.literal("failed")),
    error: v.optional(v.string()),
    trace: v.optional(v.array(spanValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, error, trace }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await ctx.db.patch(id, {
      status,
      error,
      ...(status === "compiling" ? { progress: { value: 0, label: "Starting" } } : {}),
      ...(trace?.length ? { trace: [...audience.trace, ...trace].slice(-120) } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setProfile = internalMutation({
  args: { id: v.id("emailAudiences"), profile: v.any(), size: v.number(), topEntities: v.optional(v.array(v.string())), trace: v.array(spanValidator) },
  returns: v.null(),
  handler: async (ctx, { id, profile, size, topEntities, trace }) => {
    const audience = await ctx.db.get(id);
    if (!audience) return null;
    await ctx.db.patch(id, {
      profile,
      size,
      ...(topEntities ? { topEntities } : {}),
      status: "ready",
      error: undefined,
      progress: { value: 1, label: "Ready" },
      // A recompile replaces the Qloo spans but keeps the agent's brief span.
      trace: [...trace, ...audience.trace.filter((s) => s.kind === "llm")],
      updatedAt: Date.now(),
    });
    return null;
  },
});

/* Resolving taste terms -------------------------------------------------------------- */

type Json = Record<string, unknown>;

const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

/** Entity types a contact's favourites plausibly name. Albums and towns are mostly name clashes. */
const TERM_TYPES = ["artist", "author", "book", "movie", "tv_show", "brand", "podcast", "videogame", "place", "destination", "person"];

/**
 * A nudge per type on top of popularity, so close calls go to what people
 * name as favourites: "Chef's Table" the series over a restaurant of that
 * name; "Patagonia" the brand over a little-known film. A "person" only
 * when nothing else matches.
 */
const TYPE_NUDGE: Record<string, number> = { artist: 0.1, author: 0.1, book: 0.1, movie: 0.1, tv_show: 0.1, podcast: 0.08, videogame: 0.08, brand: 0.05, person: -0.5 };

const typeOf = (e: Json) => (strs(e.types)[0] ?? "").replace("urn:entity:", "");
const popularity = (e: Json) => Number(e.popularity ?? 0);
/** "The Hunger Games" and "Hunger Games" are one title. */
const title = (s: string) => norm(s).replace(/^(the|a|an) /, "");

/**
 * The entity a contact meant by a term, from an untyped search (the same
 * cached request Pages makes). Unlike `searchEntityBest` it accepts authors:
 * Qloo files writers as `urn:entity:author` ("Sally Rooney" is an author at
 * 0.98 popularity and a person at 0.18, verified 2026-10-15), and for a shop's
 * customers favourite writers are the strongest signal. Among exact matches
 * the most popular usable one wins, nudged by type (`TYPE_NUDGE`): "Normal
 * People" the book over the series. Lower-case single words ("poetry") are
 * interests, not names, unless a well-known brand claims them.
 */
export function pickHit(term: string, results: Json[]): Json | null {
  const t = title(term);
  if (!t) return null;
  const words = t.split(" ").length;
  const generic = term === term.toLowerCase();
  const usable = results.filter((e) => TERM_TYPES.includes(typeOf(e)) && popularity(e) >= 0.3);
  const exact = usable.filter((e) => title(String(e.name)) === t);
  // "Hunger Games" → "The Hunger Games: Catching Fire" is too far; "Hunger Games" → "The Hunger Games" is not.
  let pool = exact.length ? exact : usable.filter((e) => words >= 2 && popularity(e) >= 0.6 && title(String(e.name)).startsWith(`${t} `) && /[:(]/.test(String(e.name)));
  if (generic) pool = pool.filter((e) => (words === 1 ? typeOf(e) === "brand" && popularity(e) >= 0.5 : popularity(e) >= 0.9));
  const score = (e: Json) => popularity(e) + (TYPE_NUDGE[typeOf(e)] ?? 0);
  pool.sort((a, b) => score(b) - score(a));
  return pool[0] ?? null;
}

function refOf(e: Json): EntityRef & { tags: { id: string; name: string; type: string }[] } {
  const props = (e.properties ?? {}) as Json;
  const image = (props.image as Json | undefined)?.url;
  return {
    id: String(e.entity_id ?? e.id),
    name: String(e.name),
    type: strs(e.types)[0] ?? "urn:entity",
    ...(typeof image === "string" && image ? { image } : {}),
    source: "csv",
    tags: ((e.tags as Json[] | undefined) ?? [])
      .map((x) => ({ id: String(x.tag_id ?? x.id ?? ""), name: String(x.name ?? "").trim(), type: String(x.type ?? "") }))
      .filter((x) => x.id && x.name && !/^(null|none|n\/a)$/i.test(x.name)),
  };
}

export type ResolvedTerm = ReturnType<typeof refOf>;

/**
 * Taste terms → Qloo entities (keyed by the lower-cased term), one cached
 * search each, paced, collapsed into one span. Hits carry their own Qloo tags.
 */
export async function resolveTerms(
  ctx: ActionCtx,
  trace: Span[],
  terms: string[],
  options: { label?: string; onProgress?: (done: number, total: number) => unknown } = {},
): Promise<Map<string, ResolvedTerm>> {
  const local: Span[] = [];
  const out = new Map<string, ResolvedTerm>();
  let failures = 0;
  let misses = 0;
  const t0 = Date.now();
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    try {
      const { body, status } = await paced(
        local,
        async () => {
          const res = await cachedQlooGet(ctx, "/search", { query: term });
          local.push({ kind: "qloo", name: `Resolve "${term}"`, path: "/search", cache: res.status, ms: 0, result: "" });
          return res;
        },
        120,
      );
      if (status !== "hit") misses++;
      const hit = pickHit(term, (JSON.parse(body) as { results?: Json[] }).results ?? []);
      if (hit) out.set(term.toLowerCase(), refOf(hit));
    } catch {
      failures++;
    }
    if (options.onProgress && (i % 5 === 4 || i === terms.length - 1)) await options.onProgress(i + 1, terms.length);
  }
  trace.push({
    kind: "qloo",
    name: options.label ?? "Find the favourites in Qloo",
    path: "/search",
    params: { query: `${terms.length} terms` },
    cache: misses ? "miss" : "hit",
    ms: Date.now() - t0,
    result: `${out.size} of ${terms.length} resolved` + (failures ? ` (${failures} lookups failed)` : ""),
  });
  return out;
}

/* Profiles --------------------------------------------------------------------------- */

// Tags on nearly every book (or reader's shelf) say nothing about taste.
const BLAND_GENRES = /^(adult|adult fiction|fiction|novels?|audiobooks?|books?|literature|ebooks?|kindle unlimited|general|favou?rites|authors?|unfinished|owned|to read|default|book club)$/i;

/** Author hits name genres like "Historical:historical_fiction"; readers say "Historical fiction". */
function genreName(raw: string): string {
  const last = raw.split(":").pop() ?? raw;
  const words = last.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : raw;
}

/**
 * Genre tags of the things people listed (each search hit's own tags,
 * re-read from the cache), weighted by how many listed them. Book and author
 * signals barely move Qloo's tag insights (verified 2026-10-15: an author
 * returns no keyword or style tags and junk genres), so this is where a
 * reader's "literary fiction, Irish literature" comes from, and what items'
 * Qloo tags are matched against.
 */
async function listedGenres(ctx: ActionCtx, trace: Span[], terms: { term: string; weight: number }[], ids: Set<string>): Promise<ProfileTag[]> {
  const counts = new Map<string, { tag: { id: string; name: string; type: string }; w: number }>();
  const sub: Span[] = [];
  const top = terms.slice(0, 30);
  const found = await resolveTerms(ctx, sub, top.map((t) => t.term), { label: "Read the genres of what they listed" });
  for (const { term, weight } of top) {
    const hit = found.get(term.toLowerCase());
    if (!hit || !ids.has(hit.id)) continue;
    const seen = new Set<string>();
    for (const tag of hit.tags) {
      const name = genreName(tag.name);
      if (!tag.type.startsWith("urn:tag:genre") || BLAND_GENRES.test(name)) continue;
      // "Literary_fiction" on an author and "Literary Fiction" on a book are one genre.
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.w += weight;
      else counts.set(key, { tag: { ...tag, name }, w: weight });
    }
  }
  const ranked = [...counts.values()].sort((a, b) => b.w - a.w).slice(0, 24);
  const max = ranked[0]?.w ?? 1;
  trace.push({
    kind: "qloo",
    name: "Read the genres of what they listed",
    path: "/search",
    cache: sub[0]?.cache,
    ms: sub[0]?.ms ?? 0,
    result: ranked.slice(0, 6).map((r) => r.tag.name).join(", ") || "no genres",
  });
  return ranked.map((r) => ({
    id: r.tag.id,
    name: r.tag.name,
    type: r.tag.type || "urn:tag:genre",
    affinity: Math.round((0.45 + 0.5 * (r.w / max)) * 1000) / 1000,
  }));
}

const mergeTags = (a: ProfileTag[], b: ProfileTag[]) => {
  const seen = new Set(a.map((t) => t.id));
  return [...a, ...b.filter((t) => !seen.has(t.id))];
};

type PersonLike = {
  name?: string;
  interests: string[];
  entities: { id: string; name: string; type: string; image?: string }[];
  city?: string;
  age?: string;
  gender?: string;
};

/** One person's profile, like Pages' `compileLead`: their entities, culture topped up, tags, brands, their genres, their city. */
export async function compilePersonProfile(ctx: ActionCtx, trace: Span[], person: PersonLike, progress: Progress): Promise<AudienceProfile> {
  const entities = person.entities.map((e) => ({ ...e, source: "csv", count: 1 }));
  if (!entities.length) {
    throw new Error(person.interests.length ? "Nothing they bought or like matched anything in Qloo" : "No purchases or favourites to read their taste from");
  }
  const ids = entities.slice(0, 12).map((e) => e.id);
  await progress(0.1, "Reading their taste");
  const culture = await cultureFrom(ctx, trace, entities, ids, progress, 0.15);
  const extra = demographicSignal({ age: person.age, gender: person.gender });
  const enriched = await enrich(ctx, trace, ids, person.city, extra, progress, 0.45);
  const genres = await soft(trace, "Genres of what they listed", () => listedGenres(ctx, trace, person.interests.map((term) => ({ term, weight: 1 })), new Set(ids)), []);
  let geo: AudienceProfile["geo"] = [];
  if (person.city) {
    const located = await soft(trace, `Locate "${person.city}"`, () => locateCity(ctx, trace, person.city!), null);
    geo = [{ name: person.city, count: 1, lat: located?.lat, lon: located?.lon }];
  }
  return { entities, ...enriched, tags: mergeTags(enriched.tags, genres), geo, culture };
}

/** A taste group's profile, like Pages' `compileCsv`: what its members love most, then Qloo's read of it. */
export async function compileGroupProfile(ctx: ActionCtx, trace: Span[], members: PersonLike[], progress: Progress): Promise<AudienceProfile> {
  if (!members.length) throw new Error("The group has no members");
  await progress(0.05, `Counting what ${members.length} people love`);
  const ranked = countEntities(members);
  if (!ranked.length) throw new Error("Nothing this group bought or likes matched Qloo");
  const ids = ranked.slice(0, 12).map((e) => e.id);
  trace.push({ kind: "slice", name: "Rank the group's favourites", ms: 0, result: ranked.slice(0, 6).map((e) => `${e.name} ×${e.count}`).join(", ") });
  const culture = await cultureFrom(ctx, trace, ranked, ids, progress, 0.15);
  const enriched = await enrich(ctx, trace, ids, undefined, {}, progress, 0.4);
  const termCounts = new Map<string, { term: string; weight: number }>();
  for (const m of members) {
    for (const t of m.interests) {
      const cur = termCounts.get(t.toLowerCase());
      if (cur) cur.weight++;
      else termCounts.set(t.toLowerCase(), { term: t, weight: 1 });
    }
  }
  const terms = [...termCounts.values()].sort((a, b) => b.weight - a.weight);
  const genres = await soft(trace, "Genres of what they listed", () => listedGenres(ctx, trace, terms, new Set(ranked.slice(0, 40).map((e) => e.id))), []);
  const geo = await geoFromMembers(ctx, trace, members, progress, 0.9);
  return { entities: ranked.slice(0, 40), ...enriched, tags: mergeTags(enriched.tags, genres), geo, culture };
}

/** Compiles a group audience from its members now, recording progress and the outcome on it. */
export async function compileGroupAudience(ctx: ActionCtx, id: Id<"emailAudiences">, onProgress?: Progress): Promise<boolean> {
  const trace: Span[] = [];
  const progress: Progress = async (value, label) => {
    await ctx.runMutation(internal.emailAudiences.setProgress, { id, value, label });
    if (onProgress) await onProgress(value, label);
  };
  await ctx.runMutation(internal.emailAudiences.setStatus, { id, status: "compiling" });
  try {
    const members: ContactLite[] = await ctx.runQuery(internal.emailContacts.byAudienceInternal, { audienceId: id });
    // What they bought counts like what they listed when the profile reads genres.
    const profile = await compileGroupProfile(ctx, trace, members.map((m) => ({ ...m, city: locationOf(m), interests: tasteTerms(m) })), progress);
    await ctx.runMutation(internal.emailAudiences.setProfile, { id, profile, size: members.length, trace });
    return true;
  } catch (err) {
    // Recorded on the audience (its card shows why), not rethrown.
    await ctx.runMutation(internal.emailAudiences.setStatus, { id, status: "failed", error: String(err).replace(/^Error: /, "").slice(0, 300), trace });
    return false;
  }
}

/* People lists: one profile per person, chained ------------------------------------- */

/** People compiled per scheduled action; each takes ~10 s cold, so a step stays well inside the action limit. */
const PEOPLE_STEP = 8;

/**
 * Compiles the next few people of a people audience who still need a
 * profile, one after another (Qloo rate-limits bursts), then schedules
 * itself for the rest. The last step gathers everyone's profiles into the
 * audience's.
 */
export const compilePeopleStep = internalAction({
  args: { audienceId: v.id("emailAudiences") },
  returns: v.null(),
  handler: async (ctx, { audienceId }): Promise<null> => {
    const audience: Doc<"emailAudiences"> | null = await ctx.runQuery(internal.emailAudiences.getInternal, { id: audienceId });
    if (!audience) return null;
    const members: ContactLite[] = await ctx.runQuery(internal.emailContacts.byAudienceInternal, { audienceId });
    const total = members.length;
    const todo = members.filter((m) => !m.profileStatus || m.profileStatus === "pending");
    let done = total - todo.length;
    const trace: Span[] = [];
    for (const m of todo.slice(0, PEOPLE_STEP)) {
      if (!(await ctx.runMutation(internal.emailContacts.claim, { id: m._id }))) continue;
      await ctx.runMutation(internal.emailAudiences.setProgress, {
        id: audienceId,
        value: 0.3 + 0.68 * (done / Math.max(1, total)),
        label: `Reading ${m.name} (${done + 1} of ${total})`,
      });
      const t0 = Date.now();
      const local: Span[] = [];
      try {
        const profile = await compilePersonProfile(ctx, local, { ...m, city: locationOf(m), interests: tasteTerms(m) }, async () => {});
        await ctx.runMutation(internal.emailContacts.setProfile, { id: m._id, profile });
        trace.push({ kind: "slice", name: `Read ${m.name}`, ms: Date.now() - t0, result: `${profile.entities.length} favourites, ${profile.tags.length} tags, ${profile.brands.length} brands` });
      } catch (err) {
        const error = String(err).replace(/^Error: /, "").slice(0, 300);
        await ctx.runMutation(internal.emailContacts.setProfile, { id: m._id, error });
        trace.push({ kind: "slice", name: `Read ${m.name}`, ms: Date.now() - t0, result: `failed: ${error}` });
      }
      done++;
    }
    if (todo.length > PEOPLE_STEP) {
      if (trace.length) await ctx.runMutation(internal.emailAudiences.setStatus, { id: audienceId, status: "compiling", trace });
      await ctx.runMutation(internal.emailAudiences.setProgress, { id: audienceId, value: 0.3 + 0.68 * (done / Math.max(1, total)), label: `Read ${done} of ${total}` });
      await ctx.scheduler.runAfter(0, internal.emailAudiences.compilePeopleStep, { audienceId });
      return null;
    }
    await ctx.runMutation(internal.emailAudiences.refreshPeople, { id: audienceId, trace });
    return null;
  },
});

/**
 * Gathers a people audience's profiles into its own (for the cover and the
 * agent's read of the list as a whole). Once no one is waiting to be read,
 * the audience and its list are ready, or failed when no one could be read.
 */
export async function refreshPeopleAudience(ctx: MutationCtx, id: Id<"emailAudiences">, trace: Span[] = []) {
  const audience = await ctx.db.get(id);
  if (!audience) return;
  const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", id)).collect();
  const ready = members.filter((m) => m.profileStatus === "ready" && m.profile);
  const busy = members.some((m) => m.profileStatus === "pending" || m.profileStatus === "compiling");
  const ranked = countEntities(members);
  const now = Date.now();
  const update: Partial<Doc<"emailAudiences">> = {
    size: members.length,
    topEntities: ranked.slice(0, 6).map((e) => e.name),
    updatedAt: now,
    ...(trace.length ? { trace: [...audience.trace, ...trace].slice(-120) } : {}),
  };
  if (ready.length) update.profile = mergeProfiles(ready.map((m) => m.profile as AudienceProfile), ranked.slice(0, 40));
  if (!busy) {
    if (ready.length || !members.length) {
      update.status = "ready";
      update.error = undefined;
      update.progress = { value: 1, label: "Ready" };
    } else {
      update.status = "failed";
      update.error = "No one in the list could be read from Qloo. Check that their favourites are names (authors, artists, books, films).";
    }
    update.trace = [...(update.trace ?? audience.trace), { kind: "slice", name: "Gather the people's profiles", ms: 0, result: `${ready.length} of ${members.length} people read` }];
    // Uploads kept as individuals are done once no one is waiting.
    const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", audience.brandId)).collect();
    for (const list of lists) {
      if (list.mode !== "people" || list.status !== "profiling") continue;
      await ctx.db.patch(list._id, { status: "ready", progress: { value: 1, label: "Ready" }, updatedAt: now });
    }
  }
  await ctx.db.patch(id, update);
}

export const refreshPeople = internalMutation({
  args: { id: v.id("emailAudiences"), trace: v.optional(v.array(spanValidator)) },
  returns: v.null(),
  handler: async (ctx, { id, trace }) => {
    await refreshPeopleAudience(ctx, id, (trace ?? []) as Span[]);
    return null;
  },
});

/** Puts every person who has no profile (or whose read failed) back in the queue. */
export const requeuePeople = internalMutation({
  args: { id: v.id("emailAudiences"), all: v.optional(v.boolean()) },
  returns: v.number(),
  handler: async (ctx, { id, all }) => {
    const members = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", id)).collect();
    let n = 0;
    for (const m of members) {
      if (!all && m.profileStatus === "ready") continue;
      await ctx.db.patch(m._id, { profileStatus: "pending", profileError: undefined });
      n++;
    }
    await ctx.db.patch(id, { status: "compiling", error: undefined, progress: { value: 0.3, label: "Reading each person" }, updatedAt: Date.now() });
    return n;
  },
});

/**
 * Recompiles an audience. A group is read again from its members now; a
 * people audience reads everyone without a profile (`all`: everyone) in
 * scheduled steps and returns at once.
 */
export const compile = action({
  args: { id: v.id("emailAudiences"), all: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { id, all }): Promise<null> => {
    const audience: Doc<"emailAudiences"> | null = await ctx.runQuery(internal.emailAudiences.getInternal, { id });
    if (!audience) throw new Error("Unknown audience");
    if (audience.kind === "group") {
      await compileGroupAudience(ctx, id);
      return null;
    }
    await ctx.runMutation(internal.emailAudiences.requeuePeople, { id, all });
    await ctx.scheduler.runAfter(0, internal.emailAudiences.compilePeopleStep, { audienceId: id });
    return null;
  },
});
