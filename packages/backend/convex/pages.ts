import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { spanValidator } from "./schema";
import { DEFAULT_ROUTING, isHtmlDoc, validateDoc, type HandEdits, type HtmlDoc, type RoutingRules } from "./pagesTypes";
import { audienceLabel, slugify } from "./pagesUtil";

// Pages and the builder chat. A page is one version built for its audiences:
// none (everyone), one, or several combined into one group. The version lives
// in `pagesVariants` (exactly one row per page, `defaultVariantId`) so events,
// stats and forms keep their variant keys. `bySlug` + `resolveVariant` are
// what the public renderer calls.

const pageBriefValidator = v.object({
  goal: v.string(),
  prompt: v.string(),
  offer: v.optional(v.string()),
  cta: v.object({ label: v.string(), href: v.string() }),
  itemIds: v.array(v.string()),
  facts: v.optional(v.array(v.string())),
  references: v.optional(v.array(v.string())),
  inspiration: v.optional(v.array(v.string())),
  imageMode: v.string(),
});

// Hub routes under /dashboard/pages/[brand]/ that a page slug must not shadow.
const RESERVED_SLUGS = new Set(["new", "audiences", "pages", "analytics", "kit", "settings"]);

const buildMessageValidator = v.object({
  id: v.string(),
  role: v.string(),
  at: v.number(),
  text: v.string(),
  variantId: v.optional(v.id("pagesVariants")),
  trace: v.optional(v.array(spanValidator)),
  steps: v.optional(v.array(v.any())),
  attachments: v.optional(v.array(v.object({ url: v.string(), name: v.string(), type: v.string() }))),
  elements: v.optional(v.array(v.object({ label: v.string(), tag: v.string(), section: v.string(), text: v.string() }))),
});

/* Attachments (images the merchant drops into the builder chat) -------------- */

export const attachmentUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const attachmentUrl = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});

const strip = <T extends { trace?: unknown }>(doc: T): Omit<T, "trace"> => {
  const { trace: _t, ...rest } = doc;
  return rest;
};

async function uniquePageSlug(ctx: MutationCtx, brandId: Id<"pagesBrands">, base: string, self?: Id<"pages">): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("pages")
      .withIndex("by_brand_slug", (q) => q.eq("brandId", brandId).eq("slug", slug))
      .unique();
    if (!RESERVED_SLUGS.has(slug) && (!taken || taken._id === self)) return slug;
    slug = `${base}-${n}`;
  }
}

const variantsOf = (ctx: QueryCtx | MutationCtx, pageId: Id<"pages">) =>
  ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", pageId)).collect();

/** The page's version: `defaultVariantId`, else its only row. */
async function versionOf(ctx: QueryCtx | MutationCtx, page: Doc<"pages">) {
  const byId = page.defaultVariantId ? await ctx.db.get(page.defaultVariantId) : null;
  return byId ?? (await variantsOf(ctx, page._id))[0] ?? null;
}

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
        const audiences = await audiencesOf(ctx, page.audienceIds);
        return {
          ...page,
          variantCount: variants.length,
          readyCount: variants.filter((x) => x.status === "ready").length,
          variants: variants.map((x) => ({ _id: x._id, name: x.name, status: x.status, audienceId: x.audienceId, version: x.version, screenshot: x.screenshot, updatedAt: x.updatedAt })),
          audiences: audiences.map((a) => ({ _id: a._id, name: a.name, kind: a.kind, profile: a.profile })),
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

/** The page's one version. `audienceId` is set only when the page targets exactly one audience. */
async function insertVariant(ctx: MutationCtx, page: { _id: Id<"pages">; brandId: Id<"pagesBrands"> }, audiences: Doc<"pagesAudiences">[]) {
  const now = Date.now();
  return ctx.db.insert("pagesVariants", {
    pageId: page._id,
    brandId: page.brandId,
    audienceId: audiences.length === 1 ? audiences[0]._id : undefined,
    name: audienceLabel(audiences),
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
    /** The opening of the builder chat (the merchant's first prompt and the plan reply). */
    messages: v.optional(v.array(buildMessageValidator)),
  },
  returns: v.object({ id: v.id("pages"), slug: v.string() }),
  handler: async (ctx, { brandId, title, slug: wanted, brief, audienceIds, messages }) => {
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
    const defaultVariantId = await insertVariant(ctx, { _id: id, brandId }, await audiencesOf(ctx, audienceIds));
    await ctx.db.patch(id, { defaultVariantId });
    if (messages?.length) await ctx.db.insert("pagesBuilds", { pageId: id, messages, createdAt: now, updatedAt: now });
    return { id, slug };
  },
});

/** The page settings panel: title, slug and the brief's goal, offer, CTA and image mode. Returns the (unique) slug. */
export const updateSettings = mutation({
  args: {
    id: v.id("pages"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    goal: v.optional(v.string()),
    /** Empty string clears the offer. */
    offer: v.optional(v.string()),
    cta: v.optional(v.object({ label: v.string(), href: v.string() })),
    imageMode: v.optional(v.string()),
  },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, { id, title, slug: wanted, goal, offer, cta, imageMode }) => {
    const page = await ctx.db.get(id);
    if (!page) throw new Error("Unknown page");
    const slug = wanted !== undefined && slugify(wanted) !== page.slug ? await uniquePageSlug(ctx, page.brandId, slugify(wanted), id) : page.slug;
    const brief = { ...page.brief };
    if (goal) brief.goal = goal;
    if (offer !== undefined) brief.offer = offer.trim() || undefined;
    if (cta) brief.cta = { label: cta.label.trim(), href: cta.href.trim() };
    if (imageMode) brief.imageMode = imageMode;
    await ctx.db.patch(id, { brief, slug, ...(title?.trim() ? { title: title.trim() } : {}), updatedAt: Date.now() });
    return { slug };
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

/** Retargets the page: its audiences (combined) and its version's name. The page keeps its doc until it is rebuilt. */
export const setAudiences = mutation({
  args: { id: v.id("pages"), audienceIds: v.array(v.id("pagesAudiences")) },
  returns: v.null(),
  handler: async (ctx, { id, audienceIds }) => {
    const page = await ctx.db.get(id);
    if (!page) throw new Error("Unknown page");
    const audiences = await audiencesOf(ctx, audienceIds);
    const vnt = await versionOf(ctx, page);
    if (vnt) await ctx.db.patch(vnt._id, { name: audienceLabel(audiences), audienceId: audiences.length === 1 ? audiences[0]._id : undefined, updatedAt: Date.now() });
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

export const publish = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) throw new Error("Unknown page");
    // One version per page: nothing for a quiz to choose between.
    await ctx.db.patch(id, { status: "published", publishedAt: Date.now(), quiz: undefined, updatedAt: Date.now() });
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
  patch: { doc?: unknown; trace?: Doc<"pagesVariants">["trace"]; appendTrace?: boolean; status?: string; error?: string; name?: string; screenshot?: string; insights?: unknown },
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
  if (patch.insights !== undefined) update.insights = patch.insights;
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
      insights: v.optional(v.any()),
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
      insights: patch.insights,
      trace: patch.spans,
      appendTrace: !patch.replaceTrace,
    }),
});

/**
 * The visual editor's save: the page's markup and hand-edit layer as the
 * merchant left them, plus a chat entry listing what they changed, which is
 * how the builder learns about it on its next turn. Rejects when the page
 * moved on since the editor opened it (`baseVersion`).
 */
export const saveHandEdits = mutation({
  args: {
    variantId: v.id("pagesVariants"),
    baseVersion: v.number(),
    html: v.string(),
    hand: v.any(),
    /** One line per change, in plain words, for the chat and the builder. */
    changes: v.array(v.string()),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { variantId, baseVersion, html, hand, changes }) => {
    const vnt = await ctx.db.get(variantId);
    if (!vnt) throw new ConvexError("This page no longer exists.");
    if (vnt.version !== baseVersion) throw new ConvexError("The page changed while you were editing it. Reload the editor to pick up the new version.");
    const doc = vnt.doc as HtmlDoc | undefined;
    if (!isHtmlDoc(doc)) throw new ConvexError("Only pages written as HTML can be edited by hand.");
    // Sections follow the markup: a removed section drops out, a duplicated one gets an entry.
    const ids = [...html.matchAll(/data-section\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    const known = new Map(doc.sections.map((s) => [s.id, s]));
    const sections = ids.map((id) => known.get(id) ?? { id, label: id.replace(/[-_]+/g, " "), evidence: "Added by the merchant in the visual editor." });
    const version = vnt.version + 1;
    const next: HtmlDoc = { ...doc, html, sections, hand: { ...(hand as HandEdits), version } };
    const problems = validateDoc(next);
    if (problems.length) throw new ConvexError(`The page would not be valid: ${problems.join("; ")}`);
    // The explanation still describes this page; carry it to the new revision.
    const insights = vnt.insights as { version?: number } | undefined;
    await ctx.db.patch(variantId, {
      doc: next,
      version,
      error: undefined,
      status: "ready",
      updatedAt: Date.now(),
      ...(insights && insights.version === vnt.version ? { insights: { ...insights, version } } : {}),
    });
    if (changes.length) {
      const now = Date.now();
      const message = { id: `edit-${now.toString(36)}`, role: "edit", at: now, text: changes.join("\n"), variantId };
      const build = await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", vnt.pageId)).unique();
      if (build) await ctx.db.patch(build._id, { messages: [...build.messages, message], updatedAt: now });
      else await ctx.db.insert("pagesBuilds", { pageId: vnt.pageId, messages: [message], createdAt: now, updatedAt: now });
    }
    return { version };
  },
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

/** Replaces the page's whole chat (demo tooling: a page rewritten outside the builder gets a chat that matches it). */
export const setBuildMessages = internalMutation({
  args: { pageId: v.id("pages"), messages: v.array(buildMessageValidator) },
  returns: v.null(),
  handler: async (ctx, { pageId, messages }) => {
    const now = Date.now();
    const existing = await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (existing) await ctx.db.patch(existing._id, { messages, updatedAt: now });
    else await ctx.db.insert("pagesBuilds", { pageId, messages, createdAt: now, updatedAt: now });
    return null;
  },
});

/* Memory (what the builder keeps across sessions) ---------------------------- */

const ruleValidator = v.object({ id: v.string(), text: v.string(), at: v.number() });

/** Everything the builder remembers about a page (the agent reads this at the start of a turn). */
export const memory = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, { pageId }) => ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique(),
});

/** Just the merchant's standing instructions, for the console. */
export const rules = query({
  args: { pageId: v.id("pages") },
  returns: v.array(ruleValidator),
  handler: async (ctx, { pageId }) => (await ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique())?.rules ?? [],
});

/** The agent's upsert: any of rules, review, seen. */
export const patchMemory = internalMutation({
  args: { pageId: v.id("pages"), patch: v.object({ rules: v.optional(v.array(ruleValidator)), review: v.optional(v.any()), seen: v.optional(v.array(v.any())) }) },
  returns: v.null(),
  handler: async (ctx, { pageId, patch }) => {
    const now = Date.now();
    const existing = await ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (existing) await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    else await ctx.db.insert("pagesMemory", { pageId, rules: [], ...patch, updatedAt: now });
    return null;
  },
});

/** The merchant drops a standing instruction from the console. */
export const forgetRule = mutation({
  args: { pageId: v.id("pages"), id: v.string() },
  returns: v.null(),
  handler: async (ctx, { pageId, id }) => {
    const existing = await ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", pageId)).unique();
    if (existing) await ctx.db.patch(existing._id, { rules: existing.rules.filter((r) => r.id !== id), updatedAt: Date.now() });
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
    const memory = await ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", id)).unique();
    if (memory) await ctx.db.delete(memory._id);
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

/**
 * Which variant a visitor gets. A page has one version, so this is that
 * version once it is ready; the args are kept for the renderer's call shape.
 * Returns null when the page does not exist or is not built.
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
    const vnt = await versionOf(ctx, page);
    if (!vnt) return null;
    return { variantId: vnt._id, audienceId: vnt.audienceId, resolvedBy: "default" };
  },
});

/* Migration: pages built with one version per audience ---------------------------- */

/**
 * Splits every page that still has several versions into one page per
 * version: the default stays on the original page (for everyone), each
 * audience version becomes its own page ("<title> for <audience>", slug
 * "<slug>-<audience>") and takes its events, stats, forms, sessions and the
 * chat messages about it. One page per run; it schedules itself for the
 * next. Idempotent. Run with `npx convex run pages:splitVersions`.
 */
export const splitVersions = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const out: string[] = [];
    for (const page of await ctx.db.query("pages").collect()) {
      const variants = await variantsOf(ctx, page._id);
      if (variants.length <= 1) continue;
      if (out.length) {
        await ctx.scheduler.runAfter(0, internal.pages.splitVersions, {});
        break;
      }
      const def = variants.find((x) => x._id === page.defaultVariantId) ?? variants.find((x) => !x.audienceId) ?? variants[0];
      const build = await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", page._id)).unique();
      let remaining = build?.messages ?? [];
      for (const vnt of variants) {
        if (vnt._id === def._id) continue;
        const audience = vnt.audienceId ? await ctx.db.get(vnt.audienceId) : null;
        const name = audience?.name ?? vnt.name;
        const now = Date.now();
        const slug = await uniquePageSlug(ctx, page.brandId, slugify(`${page.slug}-${audience?.slug ?? name}`));
        const id = await ctx.db.insert("pages", {
          brandId: page.brandId,
          slug,
          title: `${page.title} for ${name}`,
          brief: page.brief,
          audienceIds: audience ? [audience._id] : [],
          status: page.status,
          defaultVariantId: vnt._id,
          routing: DEFAULT_ROUTING,
          ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
          createdAt: page.createdAt,
          updatedAt: now,
        });
        await ctx.db.patch(vnt._id, { pageId: id, name: audience ? audienceLabel([audience]) : vnt.name });
        // Events, stats, forms and sessions follow in batches (demo brands have a lot of them).
        await ctx.scheduler.runAfter(0, internal.pages.moveVersionData, { variantId: vnt._id, from: page._id, to: id, table: "pagesEvents" });
        // The chat turns about this version move with it (a merchant message is kept with the agent turn after it).
        const mine = remaining.filter((m) => m.variantId === vnt._id);
        if (mine.length) await ctx.db.insert("pagesBuilds", { pageId: id, messages: mine, createdAt: now, updatedAt: now });
        remaining = remaining.filter((m) => m.variantId !== vnt._id);
        out.push(`${page.slug} → ${slug}`);
      }
      if (build) await ctx.db.patch(build._id, { messages: remaining });
      await ctx.db.patch(def._id, { name: "Everyone", audienceId: undefined });
      await ctx.db.patch(page._id, { audienceIds: [], defaultVariantId: def._id, quiz: undefined, updatedAt: Date.now() });
      out.push(`${page.slug}: kept for everyone`);
    }
    return out;
  },
});

const MOVE_TABLES = ["pagesEvents", "pagesStats", "pagesForms", "pagesSessions"] as const;

/** splitVersions' second half: re-points one version's analytics rows at its new page, 400 at a time. */
export const moveVersionData = internalMutation({
  args: {
    variantId: v.id("pagesVariants"),
    from: v.id("pages"),
    to: v.id("pages"),
    table: v.union(...MOVE_TABLES.map((t) => v.literal(t))),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { variantId, from, to, table, cursor }) => {
    const opts = { cursor: cursor ?? null, numItems: 400 };
    const res =
      table === "pagesEvents"
        ? await ctx.db.query("pagesEvents").withIndex("by_variant_at", (q) => q.eq("variantId", variantId)).paginate(opts)
        : table === "pagesStats"
          ? await ctx.db.query("pagesStats").withIndex("by_variant_day_hour", (q) => q.eq("variantId", variantId)).paginate(opts)
          : table === "pagesForms"
            ? await ctx.db.query("pagesForms").withIndex("by_page_at", (q) => q.eq("pageId", from)).paginate(opts)
            : await ctx.db.query("pagesSessions").withIndex("by_page_visitor", (q) => q.eq("pageId", from)).paginate(opts);
    for (const row of res.page) if (row.variantId === variantId && row.pageId !== to) await ctx.db.patch(row._id, { pageId: to });
    const next = res.isDone ? MOVE_TABLES[MOVE_TABLES.indexOf(table) + 1] : table;
    if (next) await ctx.scheduler.runAfter(0, internal.pages.moveVersionData, { variantId, from, to, table: next, ...(res.isDone ? {} : { cursor: res.continueCursor }) });
    return null;
  },
});
