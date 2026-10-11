import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { spanValidator } from "./schema";
import { DEFAULT_ROUTING, validateDoc, type AudienceProfile, type QuizConfig, type RoutingRules } from "./pagesTypes";
import { slugify } from "./pagesUtil";

// Pages, their variants (one per audience plus a default) and the builder
// chat. `bySlug` + `resolveVariant` are what the public renderer calls.

const pageBriefValidator = v.object({
  goal: v.string(),
  prompt: v.string(),
  offer: v.optional(v.string()),
  cta: v.object({ label: v.string(), href: v.string() }),
  itemIds: v.array(v.string()),
  facts: v.array(v.string()),
  references: v.array(v.string()),
  inspiration: v.array(v.string()),
  imageMode: v.string(),
});

const strip = <T extends { trace?: unknown }>(doc: T): Omit<T, "trace"> => {
  const { trace: _t, ...rest } = doc;
  return rest;
};

async function uniquePageSlug(ctx: MutationCtx, brandId: Id<"pagesBrands">, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("pages")
      .withIndex("by_brand_slug", (q) => q.eq("brandId", brandId).eq("slug", slug))
      .unique();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

const variantsOf = (ctx: QueryCtx | MutationCtx, pageId: Id<"pages">) =>
  ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", pageId)).collect();

async function audiencesOf(ctx: QueryCtx | MutationCtx, ids: Id<"pagesAudiences">[]) {
  const out: Doc<"pagesAudiences">[] = [];
  for (const id of ids) {
    const a = await ctx.db.get(id);
    if (a) out.push(a);
  }
  return out;
}

export const list = query({
  args: { brandId: v.id("pagesBrands") },
  handler: async (ctx, { brandId }) => {
    const pages = await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect();
    return Promise.all(
      pages.map(async (page) => {
        const variants = await variantsOf(ctx, page._id);
        return {
          ...page,
          variantCount: variants.length,
          readyCount: variants.filter((x) => x.status === "ready").length,
          variants: variants.map((x) => ({ _id: x._id, name: x.name, status: x.status, audienceId: x.audienceId, version: x.version })),
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    const variants = await variantsOf(ctx, id);
    const audiences = await audiencesOf(ctx, page.audienceIds);
    return { page, variants, audiences };
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    const variants = await variantsOf(ctx, id);
    const audiences = await audiencesOf(ctx, page.audienceIds);
    return { page, variants, audiences };
  },
});

/** Everything the renderer needs: brand kit, page, variants with docs, audiences (traces stripped). */
export const bySlug = query({
  args: { brandSlug: v.string(), pageSlug: v.string() },
  handler: async (ctx, { brandSlug, pageSlug }) => {
    const brand = await ctx.db.query("pagesBrands").withIndex("by_slug", (q) => q.eq("slug", brandSlug)).unique();
    if (!brand) return null;
    const page = await ctx.db
      .query("pages")
      .withIndex("by_brand_slug", (q) => q.eq("brandId", brand._id).eq("slug", pageSlug))
      .unique();
    if (!page) return null;
    const variants = (await variantsOf(ctx, page._id)).map(strip);
    const audiences = (await audiencesOf(ctx, page.audienceIds)).map(strip);
    return { brand: strip(brand), page, variants, audiences };
  },
});

/** Published pages of a brand, for the subdomain index. */
export const publishedBySlug = query({
  args: { brandSlug: v.string() },
  handler: async (ctx, { brandSlug }) => {
    const brand = await ctx.db.query("pagesBrands").withIndex("by_slug", (q) => q.eq("slug", brandSlug)).unique();
    if (!brand) return null;
    const pages = await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    return { brand: strip(brand), pages: pages.filter((p) => p.status === "published") };
  },
});

async function insertVariant(ctx: MutationCtx, page: { _id: Id<"pages">; brandId: Id<"pagesBrands"> }, audience: Doc<"pagesAudiences"> | null) {
  const now = Date.now();
  return ctx.db.insert("pagesVariants", {
    pageId: page._id,
    brandId: page.brandId,
    audienceId: audience?._id,
    name: audience?.name ?? "Default",
    status: "building",
    trace: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export const create = mutation({
  args: {
    brandId: v.id("pagesBrands"),
    title: v.string(),
    slug: v.optional(v.string()),
    brief: pageBriefValidator,
    audienceIds: v.array(v.id("pagesAudiences")),
  },
  returns: v.object({ id: v.id("pages") }),
  handler: async (ctx, { brandId, title, slug: wanted, brief, audienceIds }) => {
    const now = Date.now();
    const slug = await uniquePageSlug(ctx, brandId, slugify(wanted ?? title));
    const id = await ctx.db.insert("pages", {
      brandId,
      slug,
      title: title.trim(),
      brief,
      audienceIds,
      status: "draft",
      routing: DEFAULT_ROUTING,
      createdAt: now,
      updatedAt: now,
    });
    const page = { _id: id, brandId };
    const defaultVariantId = await insertVariant(ctx, page, null);
    for (const a of await audiencesOf(ctx, audienceIds)) await insertVariant(ctx, page, a);
    await ctx.db.patch(id, { defaultVariantId });
    return { id };
  },
});

export const updateBrief = mutation({
  args: { id: v.id("pages"), brief: pageBriefValidator, title: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, brief, title }) => {
    await ctx.db.patch(id, { brief, ...(title ? { title: title.trim() } : {}), updatedAt: Date.now() });
    return null;
  },
});

/** Adds and removes variants so there is exactly one per audience plus the default. */
export const setAudiences = mutation({
  args: { id: v.id("pages"), audienceIds: v.array(v.id("pagesAudiences")) },
  returns: v.null(),
  handler: async (ctx, { id, audienceIds }) => {
    const page = await ctx.db.get(id);
    if (!page) throw new Error("Unknown page");
    const variants = await variantsOf(ctx, id);
    const wanted = new Set(audienceIds);
    for (const vnt of variants) {
      if (vnt.audienceId && !wanted.has(vnt.audienceId)) await ctx.db.delete(vnt._id);
    }
    const have = new Set(variants.map((x) => x.audienceId).filter(Boolean));
    for (const a of await audiencesOf(ctx, audienceIds)) {
      if (!have.has(a._id)) await insertVariant(ctx, page, a);
    }
    await ctx.db.patch(id, { audienceIds, updatedAt: Date.now() });
    return null;
  },
});

export const setRouting = mutation({
  args: { id: v.id("pages"), routing: v.any() },
  returns: v.null(),
  handler: async (ctx, { id, routing }) => {
    await ctx.db.patch(id, { routing: { ...DEFAULT_ROUTING, ...(routing as Partial<RoutingRules>) }, updatedAt: Date.now() });
    return null;
  },
});

/** Three taste questions whose options each vote for one audience. */
export function buildQuiz(audiences: Doc<"pagesAudiences">[]): QuizConfig | undefined {
  type Option = { name: string; image?: string };
  const specs: { id: string; prompt: string; candidates: (p: AudienceProfile) => Option[] }[] = [
    {
      id: "music",
      prompt: "What's on repeat?",
      candidates: (p) => [...(p.culture?.artists ?? []), ...(p.entities ?? []).filter((x) => x.type.includes("artist"))],
    },
    {
      id: "place",
      prompt: "A place you'd book",
      candidates: (p) => [
        ...(p.culture?.places ?? []),
        ...(p.entities ?? []).filter((x) => /place|destination/.test(x.type)),
        ...(p.geo ?? []).map((g) => ({ name: g.name })),
      ],
    },
    { id: "brand", prompt: "A brand you trust", candidates: (p) => p.brands ?? [] },
  ];
  const questions: QuizConfig["questions"] = [];
  for (const spec of specs) {
    const options: QuizConfig["questions"][number]["options"] = [];
    const used = new Set<string>();
    for (const a of audiences) {
      const profile = a.profile as AudienceProfile | undefined;
      if (!profile) continue;
      // Skip an option another audience already claimed so answers stay informative.
      const pick = spec.candidates(profile).find((c) => c.name && !used.has(c.name.toLowerCase()));
      if (!pick) continue;
      used.add(pick.name.toLowerCase());
      options.push({ label: pick.name, image: pick.image, votes: { [a._id]: 1 } });
    }
    if (options.length >= 2) questions.push({ id: spec.id, prompt: spec.prompt, options });
  }
  return questions.length ? { questions } : undefined;
}

export const publish = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) throw new Error("Unknown page");
    const audiences = await audiencesOf(ctx, page.audienceIds);
    const quiz = buildQuiz(audiences);
    await ctx.db.patch(id, { status: "published", publishedAt: Date.now(), quiz, updatedAt: Date.now() });
    return null;
  },
});

export const unpublish = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "draft", updatedAt: Date.now() });
    return null;
  },
});

/* Variants ---------------------------------------------------------------- */

export const variant = query({
  args: { id: v.id("pagesVariants") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

async function applyVariantPatch(
  ctx: MutationCtx,
  id: Id<"pagesVariants">,
  patch: { doc?: unknown; trace?: Doc<"pagesVariants">["trace"]; appendTrace?: boolean; status?: string; error?: string; name?: string; screenshot?: string },
) {
  const vnt = await ctx.db.get(id);
  if (!vnt) throw new Error("Unknown variant");
  const update: Partial<Doc<"pagesVariants">> = { updatedAt: Date.now() };
  if (patch.doc !== undefined) {
    const problems = validateDoc(patch.doc);
    if (problems.length) throw new Error(`Invalid doc: ${problems.join("; ")}`);
    update.doc = patch.doc;
    update.version = vnt.version + 1;
    update.error = undefined;
  }
  if (patch.trace) update.trace = patch.appendTrace ? [...vnt.trace, ...patch.trace] : patch.trace;
  if (patch.status) update.status = patch.status;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.name) update.name = patch.name;
  if (patch.screenshot) update.screenshot = patch.screenshot;
  if (patch.doc !== undefined && !patch.status && vnt.status !== "ready") update.status = "ready";
  await ctx.db.patch(id, update);
  return { version: update.version ?? vnt.version };
}

/** Saves a doc (validated with `validateDoc`; rejects with the problem list) and bumps `version`. */
export const saveVariant = mutation({
  args: {
    id: v.id("pagesVariants"),
    doc: v.any(),
    trace: v.optional(v.array(spanValidator)),
    status: v.optional(v.string()),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { id, doc, trace, status }) => applyVariantPatch(ctx, id, { doc, trace, status }),
});

/** HTTP /pages/variant: the agent's writes. Spans are appended to the variant's trace. */
export const patchVariant = internalMutation({
  args: {
    id: v.id("pagesVariants"),
    patch: v.object({
      doc: v.optional(v.any()),
      status: v.optional(v.string()),
      error: v.optional(v.string()),
      name: v.optional(v.string()),
      screenshot: v.optional(v.string()),
      spans: v.optional(v.array(spanValidator)),
      /** Replace the trace instead of appending (a fresh generation). */
      replaceTrace: v.optional(v.boolean()),
    }),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { id, patch }) =>
    applyVariantPatch(ctx, id, {
      doc: patch.doc,
      status: patch.status,
      error: patch.error,
      name: patch.name,
      screenshot: patch.screenshot,
      trace: patch.spans,
      appendTrace: !patch.replaceTrace,
    }),
});

export const resetVariant = mutation({
  args: { id: v.id("pagesVariants") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "building", error: undefined, updatedAt: Date.now() });
    return null;
  },
});

/* Builder chat --------------------------------------------------------------- */

const buildMessageValidator = v.object({
  id: v.string(),
  role: v.string(),
  at: v.number(),
  text: v.string(),
  variantId: v.optional(v.id("pagesVariants")),
  trace: v.optional(v.array(spanValidator)),
});

export const build = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, { pageId }) => ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique(),
});

export const appendBuild = internalMutation({
  args: { pageId: v.id("pages"), messages: v.array(buildMessageValidator) },
  returns: v.null(),
  handler: async (ctx, { pageId, messages }) => {
    const now = Date.now();
    const existing = await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (existing) await ctx.db.patch(existing._id, { messages: [...existing.messages, ...messages], updatedAt: now });
    else await ctx.db.insert("pagesBuilds", { pageId, messages, createdAt: now, updatedAt: now });
    return null;
  },
});

/* Delete ------------------------------------------------------------------- */

/** Removes the page, its variants and chat now; events/stats/forms/sessions are purged in scheduled batches. */
export const remove = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    for (const vnt of await variantsOf(ctx, id)) await ctx.db.delete(vnt._id);
    const build = await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", id)).unique();
    if (build) await ctx.db.delete(build._id);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.pages.purgePageData, { pageId: id });
    return null;
  },
});

export const purgePageData = internalMutation({
  args: { pageId: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { pageId }) => {
    const batch = 400;
    let more = false;
    const wipe = async (docs: { _id: Id<any> }[]) => {
      for (const d of docs) await ctx.db.delete(d._id);
      if (docs.length >= batch) more = true;
    };
    await wipe(await ctx.db.query("pagesEvents").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(batch));
    await wipe(await ctx.db.query("pagesStats").withIndex("by_page_day", (q) => q.eq("pageId", pageId)).take(batch));
    await wipe(await ctx.db.query("pagesForms").withIndex("by_page_at", (q) => q.eq("pageId", pageId)).take(batch));
    await wipe(await ctx.db.query("pagesSessions").withIndex("by_page_visitor", (q) => q.eq("pageId", pageId)).take(batch));
    if (more) await ctx.scheduler.runAfter(0, internal.pages.purgePageData, { pageId });
    return null;
  },
});

/* Routing ------------------------------------------------------------------- */

const lower = (s?: string) => (s ?? "").trim().toLowerCase();

/**
 * Which variant a visitor gets. Order: param → lead → utm → quiz → cookie →
 * geo → default. Only `ready` variants are eligible; anything else falls
 * through. Returns null when the page does not exist.
 */
export const resolveVariant = query({
  args: {
    brandSlug: v.string(),
    pageSlug: v.string(),
    param: v.optional(v.string()),
    lead: v.optional(v.string()),
    utm: v.optional(v.record(v.string(), v.string())),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    cookieAudienceId: v.optional(v.string()),
    quizAudienceId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({ variantId: v.id("pagesVariants"), audienceId: v.optional(v.id("pagesAudiences")), resolvedBy: v.string() }),
  ),
  handler: async (ctx, args) => {
    const brand = await ctx.db.query("pagesBrands").withIndex("by_slug", (q) => q.eq("slug", args.brandSlug)).unique();
    if (!brand) return null;
    const page = await ctx.db
      .query("pages")
      .withIndex("by_brand_slug", (q) => q.eq("brandId", brand._id).eq("slug", args.pageSlug))
      .unique();
    if (!page) return null;
    const routing = { ...DEFAULT_ROUTING, ...((page.routing ?? {}) as Partial<RoutingRules>) };
    const variants = await variantsOf(ctx, page._id);
    const audiences = await audiencesOf(ctx, page.audienceIds);
    const ready = (audienceId: Id<"pagesAudiences">) => variants.find((x) => x.audienceId === audienceId && x.status === "ready");
    const byRef = (ref?: string) => {
      const key = lower(ref);
      if (!key) return undefined;
      return audiences.find((a) => lower(a._id) === key || lower(a.slug) === key);
    };
    const resolve = (audience: Doc<"pagesAudiences"> | undefined, resolvedBy: string) => {
      if (!audience) return null;
      const vnt = ready(audience._id);
      return vnt ? { variantId: vnt._id, audienceId: audience._id, resolvedBy } : null;
    };

    // 1. ?a=<audience id or slug>
    const byParam = resolve(byRef(args.param), "param");
    if (byParam) return byParam;

    // 2. ?g=<member id>: the member's own lead audience, else their cluster's audience.
    if (args.lead) {
      const memberId = ctx.db.normalizeId("pagesMembers", args.lead);
      const member = memberId ? await ctx.db.get(memberId) : null;
      if (member) {
        const own = member.leadAudienceId ? audiences.find((a) => a._id === member.leadAudienceId) : undefined;
        const viaLead = resolve(own, "lead");
        if (viaLead) return viaLead;
        const cluster = audiences.find(
          (a) => a.kind === "csv" && a.sources.uploadId === member.uploadId && a.sources.cluster === member.cluster,
        );
        const viaCluster = resolve(cluster, "lead");
        if (viaCluster) return viaCluster;
      }
    }

    // 3. UTM rules.
    if (args.utm && routing.utm?.length) {
      const utm: Record<string, string> = {};
      for (const [k, val] of Object.entries(args.utm)) utm[lower(k).replace(/^utm_/, "")] = lower(val);
      for (const rule of routing.utm) {
        const key = lower(rule.param).replace(/^utm_/, "");
        if (utm[key] !== undefined && utm[key] === lower(rule.value)) {
          const hit = resolve(byRef(rule.audienceId), "utm");
          if (hit) return hit;
        }
      }
    }

    // 4. Quiz result, 5. cookie from a previous visit.
    const byQuiz = resolve(byRef(args.quizAudienceId), "quiz");
    if (byQuiz) return byQuiz;
    const byCookie = resolve(byRef(args.cookieAudienceId), "cookie");
    if (byCookie) return byCookie;

    // 6. Geo: city first, then country, against this page's location audiences.
    if (routing.geo && (args.city || args.country)) {
      const locations = audiences.filter((a) => a.kind === "location" && a.sources.location);
      const city = lower(args.city);
      const country = lower(args.country);
      const byCity = city ? locations.find((a) => lower(a.sources.location!.city) === city || lower(a.sources.location!.city).startsWith(city + ",")) : undefined;
      const geoHit = resolve(byCity, "geo");
      if (geoHit) return geoHit;
      if (country) {
        const byCountry = locations.find((a) => lower(a.sources.location!.country) === country);
        const countryHit = resolve(byCountry, "geo");
        if (countryHit) return countryHit;
      }
    }

    // 7. Default.
    const def = (page.defaultVariantId && variants.find((x) => x._id === page.defaultVariantId)) || variants.find((x) => !x.audienceId);
    if (!def) return null;
    return { variantId: def._id, audienceId: undefined, resolvedBy: "default" };
  },
});
