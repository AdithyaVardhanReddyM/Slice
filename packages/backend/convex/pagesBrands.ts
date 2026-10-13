import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  AESTHETIC_TAG_GROUPS,
  demographicInsights,
  ENTITY,
  searchEntity,
  tagInsightsByGroup,
  type Span,
} from "./qlooApi";
import { cachedQlooGet } from "./qloo";
import { spanValidator } from "./schema";
import { nameMatches, paced, resolveNames, slugify, soft, toProfileTag } from "./pagesUtil";
import type { BrandBrief, ProfileTag } from "./pagesTypes";

// A Pages client is a brand: its kit, its brief, and what Qloo knows about it.
// The intake agent fills kit/brief over HTTP (/pages/brand); `qlooLookup`
// runs here so the Qloo key stays in Convex.

const progressValidator = v.object({ value: v.number(), label: v.string() });

export const list = query({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("pagesBrands").order("desc").collect();
    return brands.map(({ trace: _t, ...b }) => ({ ...b, trace: [] as Doc<"pagesBrands">["trace"] }));
  },
});

export const get = query({
  args: { id: v.id("pagesBrands") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    ctx.db
      .query("pagesBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

export const getInternal = internalQuery({
  args: { id: v.id("pagesBrands") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

async function uniqueSlug(ctx: MutationCtx, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("pagesBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

export const create = mutation({
  args: { name: v.string(), url: v.string(), slug: v.optional(v.string()), nameFromSite: v.optional(v.boolean()) },
  returns: v.object({ id: v.id("pagesBrands"), slug: v.string() }),
  handler: async (ctx, { name, url, slug: wanted, nameFromSite }) => {
    const now = Date.now();
    const slug = await uniqueSlug(ctx, slugify(wanted ?? name));
    const id = await ctx.db.insert("pagesBrands", {
      slug,
      name: name.trim(),
      ...(nameFromSite ? { nameFromSite: true } : {}),
      url: url.trim(),
      status: "extracting",
      progress: { value: 0, label: "Starting" },
      crawled: [],
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    return { id, slug };
  },
});

export const updateKit = mutation({
  args: { id: v.id("pagesBrands"), kit: v.any() },
  returns: v.null(),
  handler: async (ctx, { id, kit }) => {
    await ctx.db.patch(id, { kit, updatedAt: Date.now() });
    return null;
  },
});

export const updateBrief = mutation({
  args: { id: v.id("pagesBrands"), brief: v.any() },
  returns: v.null(),
  handler: async (ctx, { id, brief }) => {
    await ctx.db.patch(id, { brief, updatedAt: Date.now() });
    return null;
  },
});

/** The merchant accepted the kit and brief in the review step. */
export const markReady = mutation({
  args: { id: v.id("pagesBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await ctx.db.get(id);
    if (!brand) return null;
    if (brand.status === "review" || brand.status === "extracting") {
      await ctx.db.patch(id, { status: "ready", progress: undefined, updatedAt: Date.now() });
    }
    return null;
  },
});

export const rename = mutation({
  args: { id: v.id("pagesBrands"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name: name.trim(), nameFromSite: undefined, updatedAt: Date.now() });
    return null;
  },
});

export const setStatus = internalMutation({
  args: { id: v.id("pagesBrands"), status: v.string(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, status, error }) => {
    await ctx.db.patch(id, { status, error, updatedAt: Date.now() });
    return null;
  },
});

export const setProgress = internalMutation({
  args: { id: v.id("pagesBrands"), value: v.number(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, value, label }) => {
    await ctx.db.patch(id, { progress: { value, label }, updatedAt: Date.now() });
    return null;
  },
});

/** Partial update from the intake agent (HTTP /pages/brand). Spans are appended, fields replaced. */
export const patch = internalMutation({
  args: {
    id: v.id("pagesBrands"),
    patch: v.object({
      /** Applied only while the current name is a placeholder (`nameFromSite`). */
      name: v.optional(v.string()),
      status: v.optional(v.string()),
      progress: v.optional(progressValidator),
      kit: v.optional(v.any()),
      brief: v.optional(v.any()),
      qloo: v.optional(v.any()),
      screenshot: v.optional(v.string()),
      site: v.optional(v.any()),
      crawled: v.optional(v.array(v.string())),
      error: v.optional(v.string()),
      spans: v.optional(v.array(spanValidator)),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const brand = await ctx.db.get(id);
    if (!brand) throw new Error("Unknown brand");
    const { spans, name, ...fields } = patch;
    const update: Partial<Doc<"pagesBrands">> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) (update as Record<string, unknown>)[k] = val;
    }
    if (name?.trim() && brand.nameFromSite) {
      update.name = name.trim();
      update.nameFromSite = undefined;
    }
    if (spans?.length) update.trace = [...brand.trace, ...spans];
    await ctx.db.patch(id, update);
    return null;
  },
});

/* Cascade delete ---------------------------------------------------------- */

const PURGE_BATCH = 1000;

type Row = { _id: Id<any> };

/**
 * Deletes a slice of everything under a brand and reports whether more remain.
 * PURGE_BATCH is one budget for the whole call, not per table: Convex caps a
 * mutation at 4096 reads, and a brand with a few trafficked pages has more
 * event rows than that. The pages and the brand go last, once nothing is left.
 * `remove` schedules it until done; `pagesSeed.reset` loops it synchronously.
 */
export const purgeChunk = internalMutation({
  args: { brandId: v.id("pagesBrands"), pageIds: v.array(v.id("pages")), reschedule: v.boolean() },
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx, { brandId, pageIds, reschedule }) => {
    const sources: ((n: number) => Promise<Row[]>)[] = [
      ...pageIds.flatMap((pageId) => [
        (n: number) => ctx.db.query("pagesEvents").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesStats").withIndex("by_page_day", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesForms").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesSessions").withIndex("by_page_visitor", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", pageId)).take(n),
        (n: number) => ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", pageId)).take(n),
      ]),
      (n) => ctx.db.query("pagesMembers").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("pagesUploads").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("pagesAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
    ];
    let budget = PURGE_BATCH;
    for (const source of sources) {
      const docs = await source(budget);
      for (const d of docs) await ctx.db.delete(d._id);
      budget -= docs.length;
      if (budget <= 0) break;
    }
    const deleted = PURGE_BATCH - budget;
    // A source that filled the budget may still have rows; the next call checks.
    const more = budget <= 0;
    if (!more) {
      for (const pageId of pageIds) if (await ctx.db.get(pageId)) await ctx.db.delete(pageId);
      if (await ctx.db.get(brandId)) await ctx.db.delete(brandId);
    }
    if (more && reschedule) {
      await ctx.scheduler.runAfter(0, internal.pagesBrands.purgeChunk, { brandId, pageIds, reschedule: true });
    }
    return { deleted, more };
  },
});

export const pageIdsOf = internalQuery({
  args: { brandId: v.id("pagesBrands") },
  returns: v.array(v.id("pages")),
  handler: async (ctx, { brandId }) =>
    (await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()).map((p) => p._id),
});

/** Removes the brand and everything under it. Large tables are purged in scheduled batches. */
export const remove = mutation({
  args: { id: v.id("pagesBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await ctx.db.get(id);
    if (!brand) return null;
    const pageIds = (await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", id)).collect()).map((p) => p._id);
    // Hide it immediately; the purge finishes in the background.
    await ctx.db.patch(id, { status: "deleting", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.pagesBrands.purgeChunk, { brandId: id, pageIds, reschedule: true });
    return null;
  },
});

/* Qloo view of the brand --------------------------------------------------- */

/** Brand-domain tag types worth keeping from a brand entity's own tags. */
const BRAND_TAG_TYPES =
  /^urn:tag:(personal_style|aesthetic_property|lifestyle|emotional_tone|core_values?|customer_identity|customer_segment|cultural_relevance|consumption_context|keyword):/;

type Json = Record<string, unknown>;

/** Brands Qloo links to these ids (used both as "similar brands" and as the proxies' neighbours). */
async function similarBrands(ctx: Parameters<typeof cachedQlooGet>[0], trace: Span[], ids: string[], exclude: Set<string>, take = 8) {
  const t0 = Date.now();
  const params = { "filter.type": ENTITY.brand, "signal.interests.entities": ids.join(","), take: take + exclude.size + 4 };
  const { body, status } = await cachedQlooGet(ctx, "/v2/insights", params);
  const entities = ((JSON.parse(body) as { results?: { entities?: Json[] } }).results?.entities ?? []).filter(
    (e) => !exclude.has(String(e.entity_id)),
  );
  const out = entities.slice(0, take).map((e) => ({
    id: String(e.entity_id),
    name: String(e.name),
    image: ((e.properties as Json | undefined)?.image as Json | undefined)?.url as string | undefined,
  }));
  trace.push({
    kind: "qloo",
    name: "Brands with the same audience",
    path: "/v2/insights",
    params: { "filter.type": ENTITY.brand, "signal.interests.entities": `${ids.length} ids` },
    cache: status,
    ms: Date.now() - t0,
    result: out.slice(0, 5).map((b) => b.name).join(", ") || "none",
  });
  return out;
}

/**
 * What Qloo knows about the brand. Matched brands contribute their own tags
 * and demographics; unmatched brands (most small ones) borrow from up to five
 * related brands named in the brief, which become `proxies`.
 */
export const qlooLookup = action({
  args: { id: v.id("pagesBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await ctx.runQuery(internal.pagesBrands.getInternal, { id });
    if (!brand) throw new Error("Unknown brand");
    const trace: Span[] = [];
    const progress = (value: number, label: string) => ctx.runMutation(internal.pagesBrands.setProgress, { id, value, label });
    await progress(0.9, "Asking Qloo about the brand");

    const brief = brand.brief as BrandBrief | undefined;
    const hit = await soft(trace, `Resolve "${brand.name}"`, () => searchEntity(ctx, trace, brand.name, "brand", "brand"), null);
    const matched = !!hit && nameMatches(brand.name, hit.name);

    let tags: ProfileTag[] = [];
    let proxies: { id: string; name: string; image?: string }[] = [];
    let similar: { id: string; name: string; image?: string }[] = [];
    let demographics: unknown = undefined;
    let entityId: string | undefined;
    let entityName: string | undefined;

    if (matched && hit) {
      entityId = hit.id;
      entityName = hit.name;
      // The search hit carries the entity's own tags; keep the brand-domain ones.
      const raw = await paced(trace, () => cachedQlooGet(ctx, "/search", { query: brand.name, types: ENTITY.brand }));
      const first = (JSON.parse(raw.body) as { results?: Json[] }).results?.[0];
      const own = ((first?.tags as Json[] | undefined) ?? [])
        .filter((t) => BRAND_TAG_TYPES.test(String(t.type ?? t.tag_id ?? "")))
        .map((t, i, all) => ({
          id: String(t.tag_id),
          name: String(t.name).trim(),
          type: String(t.type ?? "urn:tag"),
          affinity: Math.round((1 - 0.5 * (i / Math.max(1, all.length - 1))) * 1000) / 1000,
        }));
      tags = own;
      trace.push({ kind: "slice", name: "Read the brand's own Qloo tags", ms: 0, result: `${own.length} brand-domain tags` });
      await progress(0.93, "Reading who buys from brands like this");
      similar = await soft(trace, "Brands with the same audience", () => similarBrands(ctx, trace, [hit.id], new Set([hit.id])), []);
      demographics = await soft(trace, "Who else shares these signals", () => demographicInsights(ctx, trace, [hit.id]), null);
    } else {
      // Comparable brands (same customer, well known) anchor better than the
      // suppliers and stockists a site happens to mention.
      const names = [...(brief?.comparableBrands ?? []), ...(brief?.relatedBrands ?? [])]
        .filter((n) => n && n.trim())
        .filter((n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
        .slice(0, 8);
      if (names.length) {
        await progress(0.92, `Looking up ${names.length} comparable brands`);
        const found = await resolveNames(ctx, trace, names, "brand", "brand", { label: "Find comparable brands in Qloo" });
        proxies = [...found.values()].map((e) => ({ id: e.id, name: e.name, image: e.image }));
      }
      if (proxies.length) {
        const ids = proxies.map((p) => p.id);
        await progress(0.94, "Reading the taste around those brands");
        tags = (await soft(trace, "Tags for the related brands", () => tagInsightsByGroup(ctx, trace, ids, AESTHETIC_TAG_GROUPS), [])).map(toProfileTag);
        similar = await soft(trace, "Brands with the same audience", () => similarBrands(ctx, trace, ids, new Set(ids)), []);
        demographics = await soft(trace, "Who else shares these signals", () => demographicInsights(ctx, trace, ids), null);
      } else {
        trace.push({
          kind: "slice",
          name: "Qloo view of the brand",
          ms: 0,
          result: "Not a Qloo entity and no related brands in the brief; the default audience will be empty until one is added.",
        });
      }
    }
    await ctx.runMutation(internal.pagesBrands.patch, {
      id,
      patch: {
        qloo: { entityId, entityName, matched, proxies, tags, similarBrands: similar, demographics: demographics ?? undefined },
        progress: { value: 1, label: "Done" },
        spans: trace,
      },
    });
    return null;
  },
});
