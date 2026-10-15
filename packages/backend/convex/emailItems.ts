import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { tagKey } from "./catalog";
import { editableBrand } from "./emailBrands";
import type { AudienceProfile, EmailItem } from "./emailTypes";
import { interleave } from "./pagesAudiences";
import { plausible } from "./pagesUploads";
import { norm, paced, soft } from "./pagesUtil";
import { cachedQlooGet } from "./qloo";
import { rankWeight, searchEntity, searchEntityBest, type Span } from "./qlooApi";
import { spanValidator } from "./schema";

// What a brand sells or offers. Items blocks show them; `rank` orders them by
// a person's (or a group's) taste: Qloo insights restricted to the catalog,
// blended with tag overlap so popularity-heavy domains (books) stay personal.

const qlooValidator = v.object({ id: v.string(), name: v.string(), type: v.string(), tags: v.optional(v.array(v.string())) });

const itemFields = {
  name: v.string(),
  subtitle: v.optional(v.string()),
  kind: v.string(),
  description: v.string(),
  price: v.optional(v.string()),
  image: v.optional(v.string()),
  url: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  qloo: v.optional(qlooValidator),
};

type ItemInput = {
  name: string;
  subtitle?: string;
  kind: string;
  description: string;
  price?: string;
  image?: string;
  url?: string;
  tags?: string[];
  qloo?: Doc<"emailItems">["qloo"];
};

/** The renderer's and the agent's shape for an item row. */
export function toEmailItem(d: Doc<"emailItems">): EmailItem {
  return {
    id: d._id,
    name: d.name,
    ...(d.subtitle ? { subtitle: d.subtitle } : {}),
    kind: d.kind,
    description: d.description,
    ...(d.price ? { price: d.price } : {}),
    ...(d.image ? { image: d.image } : {}),
    ...(d.url ? { url: d.url } : {}),
    tags: d.tags,
    ...(d.qloo ? { qloo: d.qloo } : {}),
  };
}

export const list = query({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

export const listInternal = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

/** What the brand's readers love most, across all its contacts: the baseline a person's picks are lifted against. */
export const readerSignalsInternal = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const counts = new Map<string, { id: string; name: string; type: string; n: number }>();
    for (const c of contacts)
      for (const e of c.entities) {
        const cur = counts.get(e.id);
        if (cur) cur.n++;
        else counts.set(e.id, { id: e.id, name: e.name, type: e.type, n: 1 });
      }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 60);
  },
});

const httpUrl = (u: unknown): string | undefined => (typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : undefined);
const text = (u: unknown, max: number): string | undefined => {
  if (typeof u === "number") return String(u);
  return typeof u === "string" && u.trim() ? u.trim().slice(0, max) : undefined;
};

/** A loosely typed item (agent JSON, a CSV row) in the stored shape, or null without a name. */
function cleanItem(input: unknown): ItemInput | null {
  const r = (input ?? {}) as Record<string, unknown>;
  const name = text(r.name, 200);
  if (!name) return null;
  const tags = Array.isArray(r.tags) ? [...new Set(r.tags.map((t) => text(t, 60)).filter((t): t is string => !!t))].slice(0, 20) : [];
  const q = r.qloo as Record<string, unknown> | undefined;
  const qloo =
    q && typeof q.id === "string" && typeof q.name === "string" && typeof q.type === "string"
      ? { id: q.id, name: q.name, type: q.type, ...(Array.isArray(q.tags) ? { tags: q.tags.filter((t): t is string => typeof t === "string").slice(0, 30) } : {}) }
      : undefined;
  return {
    name,
    subtitle: text(r.subtitle, 200),
    kind: text(r.kind, 30)?.toLowerCase() ?? "product",
    description: text(r.description, 1000) ?? "",
    price: text(r.price, 40),
    image: httpUrl(r.image),
    url: httpUrl(r.url),
    tags,
    qloo,
  };
}

const strip = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;

/**
 * Appends items in order, skipping names the brand already has. Returns an id
 * per input: the new row, the existing row of the same name, or null when the
 * input had no name.
 */
async function appendItems(ctx: MutationCtx, brandId: Id<"emailBrands">, inputs: unknown[]): Promise<(Id<"emailItems"> | null)[]> {
  if (inputs.length > 200) throw new Error("Send at most 200 items per call");
  const existing = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
  const byName = new Map(existing.map((i) => [norm(i.name), i._id]));
  let order = existing.reduce((m, i) => Math.max(m, i.order), -1) + 1;
  const now = Date.now();
  const ids: (Id<"emailItems"> | null)[] = [];
  for (const input of inputs) {
    const item = cleanItem(input);
    if (!item) {
      ids.push(null);
      continue;
    }
    const known = byName.get(norm(item.name));
    if (known) {
      ids.push(known);
      continue;
    }
    const id = await ctx.db.insert("emailItems", strip({ brandId, ...item, tags: item.tags ?? [], order: order++, createdAt: now }));
    byName.set(norm(item.name), id);
    ids.push(id);
  }
  return ids;
}

export const create = mutation({
  args: { brandId: v.id("emailBrands"), ...itemFields },
  returns: v.id("emailItems"),
  handler: async (ctx, { brandId, ...fields }) => {
    await editableBrand(ctx, brandId);
    const existing = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const order = existing.reduce((m, i) => Math.max(m, i.order), -1) + 1;
    const item = cleanItem(fields);
    if (!item) throw new Error("An item needs a name");
    return ctx.db.insert("emailItems", strip({ brandId, ...item, tags: item.tags ?? [], order, createdAt: Date.now() }));
  },
});

export const update = mutation({
  args: {
    id: v.id("emailItems"),
    name: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    kind: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.string()),
    image: v.optional(v.string()),
    url: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    /** null clears the Qloo match (resolve finds a new one). */
    qloo: v.optional(v.union(v.null(), qlooValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, qloo, ...fields }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new Error("Unknown item");
    await editableBrand(ctx, item.brandId);
    const update: Partial<Doc<"emailItems">> = {};
    if (fields.name?.trim()) update.name = fields.name.trim();
    if (fields.kind?.trim()) update.kind = fields.kind.trim().toLowerCase();
    if (fields.description !== undefined) update.description = fields.description.trim();
    if (fields.tags !== undefined) update.tags = [...new Set(fields.tags.map((t) => t.trim()).filter(Boolean))];
    // Empty strings clear the optional fields.
    for (const k of ["subtitle", "price", "image", "url"] as const) {
      if (fields[k] !== undefined) update[k] = fields[k]!.trim() || undefined;
    }
    if (qloo === null) update.qloo = undefined;
    else if (qloo) update.qloo = qloo;
    // A renamed item may be a different thing in Qloo; resolve matches it again.
    else if ((fields.name && fields.name.trim() !== item.name) || (fields.kind && fields.kind !== item.kind)) update.qloo = undefined;
    await ctx.db.patch(id, update);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("emailItems") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) return null;
    await editableBrand(ctx, item.brandId);
    await ctx.db.delete(id);
    return null;
  },
});

export const reorder = mutation({
  args: { brandId: v.id("emailBrands"), ids: v.array(v.id("emailItems")) },
  returns: v.null(),
  handler: async (ctx, { brandId, ids }) => {
    await editableBrand(ctx, brandId);
    for (const [order, id] of ids.entries()) {
      const item = await ctx.db.get(id);
      if (item?.brandId === brandId) await ctx.db.patch(id, { order });
    }
    return null;
  },
});

/** Many items at once (the console's catalog CSV). Names the brand already has are skipped. */
export const bulkCreate = mutation({
  args: { brandId: v.id("emailBrands"), items: v.array(v.object(itemFields)) },
  returns: v.array(v.union(v.id("emailItems"), v.null())),
  handler: async (ctx, { brandId, items }) => {
    await editableBrand(ctx, brandId);
    return appendItems(ctx, brandId, items);
  },
});

/** The setup agent's items (HTTP /email/items). */
export const append = internalMutation({
  args: { brandId: v.id("emailBrands"), items: v.array(v.any()) },
  returns: v.array(v.union(v.id("emailItems"), v.null())),
  handler: async (ctx, { brandId, items }) => {
    if (!(await ctx.db.get(brandId))) throw new Error("Unknown brand");
    return appendItems(ctx, brandId, items);
  },
});

export const setQloo = internalMutation({
  args: { updates: v.array(v.object({ id: v.id("emailItems"), qloo: qlooValidator })) },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) if (await ctx.db.get(u.id)) await ctx.db.patch(u.id, { qloo: u.qloo });
    return null;
  },
});

/* Qloo matching ------------------------------------------------------------------- */

type Json = Record<string, unknown>;

/** The tag names on a search hit (genres, keywords, styles), "null" placeholders dropped. */
async function hitTags(ctx: Parameters<typeof cachedQlooGet>[0], params: Record<string, string>, entityId: string): Promise<string[]> {
  // Same params as the search the hit came from: a cache hit.
  const { body } = await cachedQlooGet(ctx, "/search", params);
  const hit = ((JSON.parse(body) as { results?: Json[] }).results ?? []).find((e) => String(e.entity_id ?? e.id) === entityId);
  const tags = ((hit?.tags as Json[] | undefined) ?? [])
    .map((t) => String(t.name ?? "").trim())
    .filter((n) => n && !/^(null|none|n\/a)$/i.test(n));
  return [...new Set(tags)].slice(0, 30);
}

/**
 * A Qloo entity for every item that has none: books by title as books,
 * anything else by its best exact match. Events and offers rarely exist in
 * Qloo and simply stay unmatched (tags still rank them).
 */
export const resolve = action({
  args: { brandId: v.id("emailBrands") },
  returns: v.object({ resolved: v.number(), total: v.number(), trace: v.array(spanValidator) }),
  handler: async (ctx, { brandId }): Promise<{ resolved: number; total: number; trace: Span[] }> => {
    const items: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
    const todo = items.filter((i) => !i.qloo && i.kind !== "offer");
    const trace: Span[] = [];
    const local: Span[] = [];
    const updates: { id: Id<"emailItems">; qloo: NonNullable<Doc<"emailItems">["qloo"]> }[] = [];
    for (const item of todo) {
      const book = item.kind === "book";
      try {
        const hit = await paced(local, () => (book ? searchEntity(ctx, local, item.name, "book", "catalog") : searchEntityBest(ctx, local, item.name, "catalog")), 120);
        // Book titles are loose ("The Overstory: A Novel"); other names must agree.
        if (!hit || !(book ? plausible(item.name, hit.name) : norm(item.name) === norm(hit.name))) continue;
        const tags = await hitTags(ctx, book ? { query: item.name, types: "urn:entity:book" } : { query: item.name }, hit.id);
        updates.push({ id: item._id, qloo: { id: hit.id, name: hit.name, type: hit.type, tags } });
      } catch (err) {
        local.push({ kind: "qloo", name: `Resolve "${item.name}"`, ms: 0, result: `failed: ${String(err).slice(0, 80)}` });
      }
    }
    if (updates.length) await ctx.runMutation(internal.emailItems.setQloo, { updates });
    trace.push({
      kind: "qloo",
      name: "Find the catalog in Qloo",
      path: "/search",
      params: { query: `${todo.length} items` },
      cache: local.some((s) => s.cache && s.cache !== "hit") ? "miss" : "hit",
      ms: local.reduce((s, x) => s + x.ms, 0),
      result: `${updates.length} of ${todo.length} matched`,
    });
    return { resolved: updates.length, total: todo.length, trace };
  },
});

/* Taste ranking --------------------------------------------------------------------- */

/** Merchant words and Qloo tag names meet on the stemmed slug ("Literary Fiction" ↔ urn:tag:…:literary_fiction). */
const wordKey = (name: string) => tagKey(name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""));

const kindLabel = (type: string) => type.replace("urn:entity:", "").replace("_", " ");

/** "A, B and C". */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Ranked = { id: Id<"emailItems">; score: number; evidence: string };

type QlooRank = Map<string, { score: number; because: string[] }>;

/** Qloo's ranking of the candidates' entities for `signals`, per entity type, ≤ 20 ids a call. */
async function qlooRanks(
  ctx: Parameters<typeof cachedQlooGet>[0],
  trace: Span[],
  signals: { id: string; name: string }[],
  candidates: Doc<"emailItems">[],
  who: string,
): Promise<QlooRank> {
  const out: QlooRank = new Map();
  if (!signals.length) return out;
  const signalName = new Map(signals.map((s) => [s.id, s.name]));
  const byType = new Map<string, string[]>();
  for (const i of candidates) if (i.qloo) byType.set(i.qloo.type, [...(byType.get(i.qloo.type) ?? []), i.qloo.id]);
  const signalIds = signals.map((s) => s.id).join(",");
  for (const [type, ids] of byType) {
    const sorted = [...new Set(ids)].sort();
    for (let start = 0; start < sorted.length; start += 20) {
      const batch = sorted.slice(start, start + 20);
      const params = {
        "filter.type": type,
        "signal.interests.entities": signalIds,
        "filter.results.entities": batch.join(","),
        "feature.explainability": true,
        take: batch.length,
      };
      const t0 = Date.now();
      const res = await soft(
        trace,
        `Rank the catalog's ${kindLabel(type)}s ${who}`,
        async () => {
          const { body, status } = await cachedQlooGet(ctx, "/v2/insights", params);
          trace.push({
            kind: "qloo",
            name: `Rank ${batch.length} of the catalog's ${kindLabel(type)}s ${who}`,
            path: "/v2/insights",
            params: { "filter.type": type, "signal.interests.entities": `${signals.length} ids`, "filter.results.entities": `${batch.length} ids` },
            cache: status,
            ms: Date.now() - t0,
            result: "",
          });
          return (JSON.parse(body) as { results?: { entities?: Json[] } }).results?.entities ?? [];
        },
        [] as Json[],
      );
      const span = trace[trace.length - 1];
      res.forEach((e, rank) => {
        const query = (e.query ?? {}) as Json;
        const affinity = Number(query.affinity ?? 0);
        const explain = ((query.explainability as Json | undefined)?.["signal.interests.entities"] ?? []) as Json[];
        const because = (Array.isArray(explain) ? explain : [])
          .map((x) => ({ id: String(x.entity_id), score: Number(x.score ?? 0) }))
          .sort((a, b) => b.score - a.score)
          .map((x) => signalName.get(x.id))
          .filter((n): n is string => !!n)
          .slice(0, 2);
        // Affinity saturates near 1 at the top; the rank inside the batch carries the rest.
        out.set(String(e.entity_id), { score: 0.5 * Math.min(1, affinity) + 0.5 * rankWeight(rank, res.length), because });
      });
      if (span && span.result === "") span.result = res.slice(0, 4).map((e) => String(e.name)).join(", ") || "none ranked";
    }
  }
  return out;
}

/**
 * Orders the brand's items for one person (`contactId`), an audience
 * (`audienceId`) or a given profile, best first, each with the evidence in
 * plain words. Signals are the profile's top entities (≤ 10, kinds
 * interleaved); Qloo ranks the catalog's entities for them in batches of ≤ 20
 * (`filter.results.entities` 400s past that); tag overlap with the profile
 * and a favourite author or maker lift items further; what the person already
 * listed is left out.
 */
export const rank = action({
  args: {
    brandId: v.id("emailBrands"),
    audienceId: v.optional(v.id("emailAudiences")),
    contactId: v.optional(v.id("emailContacts")),
    profile: v.optional(v.any()),
    take: v.optional(v.number()),
    /** Item ids to leave out (already in the email). */
    exclude: v.optional(v.array(v.string())),
  },
  returns: v.object({
    items: v.array(v.object({ id: v.id("emailItems"), score: v.number(), evidence: v.string() })),
    trace: v.array(spanValidator),
  }),
  handler: async (ctx, { brandId, audienceId, contactId, profile: given, take = 6, exclude = [] }): Promise<{ items: Ranked[]; trace: Span[] }> => {
    const trace: Span[] = [];
    const items: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
    if (!items.length) return { items: [], trace };

    let profile = given as AudienceProfile | undefined;
    // What they told us they love: never recommended back to them.
    const listed: { id: string; name: string; type: string }[] = [];
    const listedWords: string[] = [];
    if (contactId) {
      const contact: Doc<"emailContacts"> | null = await ctx.runQuery(internal.emailContacts.getInternal, { id: contactId });
      if (!contact) throw new Error("Unknown contact");
      listed.push(...contact.entities);
      listedWords.push(...contact.interests);
      profile ??= (contact.profile as AudienceProfile | undefined) ?? {
        entities: contact.entities.map((e) => ({ ...e, source: "csv", count: 1 })),
        tags: [],
        brands: [],
        geo: [],
        culture: { artists: [], films: [], places: [], books: [] },
      };
    } else if (audienceId) {
      const audience: Doc<"emailAudiences"> | null = await ctx.runQuery(internal.emailAudiences.getInternal, { id: audienceId });
      if (!audience) throw new Error("Unknown audience");
      profile ??= audience.profile as AudienceProfile | undefined;
    }
    if (!profile) throw new Error("No taste profile to rank for yet");
    if (!contactId) listed.push(...profile.entities.filter((e) => e.source === "csv" || e.source === "interest"));

    const listedIds = new Set(listed.map((e) => e.id));
    const listedNames = new Set([...listed.map((e) => norm(e.name)), ...listedWords.map(norm)]);
    const skip = new Set(exclude);
    const candidates = items.filter((i) => !skip.has(i._id) && !(i.qloo && listedIds.has(i.qloo.id)) && !listedNames.has(norm(i.name)));
    const left = items.length - candidates.length - items.filter((i) => skip.has(i._id)).length;
    if (left > 0) trace.push({ kind: "slice", name: "Leave out what they already love", ms: 0, result: `${left} item${left === 1 ? "" : "s"} they listed themselves` });

    // Signals: their top entities, one kind after another so books don't drown out music.
    const byKind = new Map<string, { id: string; name: string }[]>();
    const pool = profile.entities.length
      ? [...profile.entities].sort((a, b) => (b.count ?? 1) - (a.count ?? 1))
      : [...profile.culture.books, ...profile.culture.artists, ...profile.culture.films, ...profile.culture.places];
    for (const e of pool) byKind.set(e.type, [...(byKind.get(e.type) ?? []), { id: e.id, name: e.name }]);
    const signals = interleave([...byKind.values()], 10);

    /* Qloo: the catalog ranked for this taste, and for the brand's readers as a whole. Popular
       titles rank near the top for everyone (books especially), so a pick is scored on how much
       higher it ranks for this person than for the shop's readers overall. */
    const qlooScore = await qlooRanks(ctx, trace, signals, candidates, "for this taste");
    const readers: { id: string; name: string; type: string }[] = await ctx.runQuery(internal.emailItems.readerSignalsInternal, { brandId });
    const readerKinds = new Map<string, { id: string; name: string }[]>();
    for (const e of readers) readerKinds.set(e.type, [...(readerKinds.get(e.type) ?? []), { id: e.id, name: e.name }]);
    const baselineSignals = interleave([...readerKinds.values()], 10);
    const sameAsBaseline = baselineSignals.map((s) => s.id).join(",") === signals.map((s) => s.id).join(",");
    const baseline = readers.length >= 3 && !sameAsBaseline ? await qlooRanks(ctx, trace, baselineSignals, candidates, "for the shop's readers overall") : new Map();
    const lifted = (id: string) => {
      const q = qlooScore.get(id);
      if (!q) return undefined;
      const base = baseline.get(id)?.score;
      return base === undefined ? q.score : Math.max(0, Math.min(1, 0.75 * q.score - 0.5 * base + 0.4));
    };

    /* Tags: the item's words and Qloo tags against the profile's tags and the words they used themselves. */
    const profileTags = new Map<string, { name: string; affinity: number }>();
    for (const t of profile.tags) {
      const k = tagKey(t.id);
      const cur = profileTags.get(k);
      if (!cur || cur.affinity < t.affinity) profileTags.set(k, { name: t.name.toLowerCase(), affinity: t.affinity });
    }
    // "poetry" in their favourites is a genre they named, the strongest kind of tag.
    const entityNames = new Set(listed.map((e) => norm(e.name)));
    for (const w of listedWords) if (!entityNames.has(norm(w))) profileTags.set(wordKey(w), { name: w.toLowerCase(), affinity: 1 });
    // A tag most of the catalog carries ("Fiction", "Contemporary") says little about one item.
    const itemKeys = new Map(items.map((i) => [i._id, new Set([...i.tags, ...(i.qloo?.tags ?? [])].map(wordKey))]));
    const df = new Map<string, number>();
    for (const keys of itemKeys.values()) for (const k of keys) df.set(k, (df.get(k) ?? 0) + 1);
    const idf = (k: string) => Math.log((items.length + 1) / ((df.get(k) ?? 0) + 1)) / Math.log(items.length + 1);
    const favouriteNames = [...new Set(listed.map((e) => e.name))].filter((n) => norm(n).length >= 4);

    const scored = candidates.map((item) => {
      const q = item.qloo ? qlooScore.get(item.qloo.id) : undefined;
      const qs = item.qloo ? lifted(item.qloo.id) : undefined;
      const matched = new Map<string, number>();
      for (const k of itemKeys.get(item._id) ?? []) {
        const hit = profileTags.get(k);
        if (hit && !matched.has(hit.name)) matched.set(hit.name, hit.affinity * idf(k));
      }
      const tagNames = [...matched.entries()].filter(([, w]) => w > 0.15).sort((a, b) => b[1] - a[1]).map(([n]) => n);
      const tagScore = Math.min(1, [...matched.values()].reduce((s, x) => s + x, 0) / 1.2);
      // A new book by an author they named is about the strongest signal there is.
      const sub = norm(item.subtitle ?? "");
      const maker = sub ? favouriteNames.find((n) => sub === norm(n) || sub.includes(norm(n))) : undefined;
      const score = (qs !== undefined ? 0.6 * qs + 0.35 * tagScore : 0.6 * tagScore) + (maker ? 0.35 : 0);
      const reasons: string[] = [];
      if (maker) reasons.push(`by ${maker}, one of their favourites`);
      if (q?.because.length) reasons.push(`Qloo links it to their love of ${andList(q.because)}`);
      else if (qs !== undefined && qs > 0.5) reasons.push("Qloo ranks it high for their taste");
      if (tagNames.length) reasons.push(`fits their taste for ${andList(tagNames.slice(0, 3))}`);
      const evidence = reasons.length ? reasons.join("; ").replace(/^./, (c) => c.toUpperCase()) : "No strong taste signal; from the catalog";
      return { id: item._id, score: Math.round(Math.min(1, score) * 1000) / 1000, evidence, order: item.order };
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    const out = scored.slice(0, Math.max(1, Math.min(take, 24))).map(({ order: _o, ...r }) => r);
    trace.push({
      kind: "slice",
      name: "Blend Qloo's ranking with tag overlap",
      ms: 0,
      result: out.slice(0, 4).map((r) => `${items.find((i) => i._id === r.id)?.name} ${Math.round(r.score * 100)}`).join(", ") || "nothing to rank",
    });
    return { items: out, trace };
  },
});
