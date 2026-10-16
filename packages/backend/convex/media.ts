import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { cleanMessage } from "./emailCampaigns";
import { cleanDoc, FORMATS, isFormat, isTier, resizeDoc, safeUrl, type FormatPreset, type MediaDoc } from "./mediaTypes";

// Media campaigns: posters and short videos per audience × format. The
// console creates and edits here (owner-checked); the agent writes through
// /media/* HTTP routes (http.ts) into the internal functions below.

async function ownCampaign(ctx: QueryCtx, id: Id<"mediaCampaigns">): Promise<Doc<"mediaCampaigns">> {
  const campaign = await ctx.db.get(id);
  const identity = await ctx.auth.getUserIdentity();
  if (!campaign || identity?.subject !== campaign.owner) throw new Error("Unknown campaign");
  return campaign;
}

async function ownCreative(ctx: QueryCtx, id: Id<"mediaCreatives">) {
  const creative = await ctx.db.get(id);
  if (!creative) throw new Error("Unknown creative");
  const campaign = await ownCampaign(ctx, creative.campaignId);
  return { creative, campaign };
}

const MAX_BUDGET = 500;

/* Console: reads ----------------------------------------------------------- */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", identity.subject)).order("desc").collect();
    return Promise.all(
      campaigns.map(async (c) => {
        const creatives = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect();
        const cover = creatives.find((x) => x.export?.mime.startsWith("image/"))?.export?.url ?? firstImage(creatives.map((x) => x.doc as MediaDoc));
        return {
          _id: c._id,
          name: c.name,
          kind: c.kind,
          tier: c.tier,
          status: c.status,
          spend: c.spend,
          budget: c.budget,
          formats: c.formats,
          audiences: c.audiences.length,
          creatives: creatives.length,
          videos: creatives.filter((x) => x.kind === "video").length,
          cover: cover ?? null,
          kit: c.kit,
          updatedAt: c.updatedAt,
        };
      }),
    );
  },
});

function firstImage(docs: MediaDoc[]): string | undefined {
  for (const d of docs) {
    const img = d?.layers?.find((l) => l.type === "image");
    if (img && img.type === "image") return img.src;
    const poster = d?.video?.find((c) => c.poster)?.poster;
    if (poster) return poster;
  }
  return undefined;
}

/** Everything the studio shows, live. */
export const get = query({
  args: { id: v.id("mediaCampaigns") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    const campaign = await ctx.db.get(id);
    if (!campaign || identity?.subject !== campaign.owner) return null;
    const [creatives, assets, jobs, chat] = await Promise.all([
      ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect(),
      ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").collect(),
      ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(80),
      ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique(),
    ]);
    return { campaign, creatives, assets, jobs, messages: chat?.messages ?? [] };
  },
});

export const versions = query({
  args: { creativeId: v.id("mediaCreatives") },
  handler: async (ctx, { creativeId }) => {
    try {
      await ownCreative(ctx, creativeId);
    } catch {
      return [];
    }
    const rows = await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", creativeId)).order("desc").take(30);
    return rows.map((r) => ({ _id: r._id, version: r.version, by: r.by, note: r.note, createdAt: r.createdAt, doc: r.doc as MediaDoc }));
  },
});

/** Exported posters and videos across the merchant's campaigns, for the Email and Pages image pickers. */
export const exports = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", identity.subject)).order("desc").take(30);
    const out: { url: string; mime: string; name: string; campaign: string; format: string; w: number; h: number; at: number }[] = [];
    for (const c of campaigns) {
      const creatives = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect();
      for (const x of creatives) {
        if (!x.export) continue;
        const spec = FORMATS[(x.format as FormatPreset) ?? "story"] ?? FORMATS.story;
        out.push({ url: x.export.url, mime: x.export.mime, name: x.name, campaign: c.name, format: x.format, w: spec.w, h: spec.h, at: x.export.at });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

/* Console: writes ---------------------------------------------------------- */

const sourceValidator = v.object({
  kind: v.union(v.literal("pages"), v.literal("email"), v.literal("url"), v.literal("manual")),
  pagesBrandId: v.optional(v.id("pagesBrands")),
  emailBrandId: v.optional(v.id("emailBrands")),
  url: v.optional(v.string()),
});

const assetInput = v.object({
  url: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  kind: v.string(),
  source: v.string(),
  mime: v.optional(v.string()),
  name: v.optional(v.string()),
  w: v.optional(v.number()),
  h: v.optional(v.number()),
  duration: v.optional(v.number()),
});

async function insertAsset(ctx: MutationCtx, campaignId: Id<"mediaCampaigns">, a: { url?: string; storageId?: Id<"_storage">; kind: string; source: string; mime?: string; name?: string; w?: number; h?: number; duration?: number; prompt?: string; model?: string; parentId?: Id<"mediaAssets">; cost?: number; credit?: string }) {
  const url = a.storageId ? await ctx.storage.getUrl(a.storageId) : safeUrl(a.url);
  if (!url) throw new Error("Unknown file: expected a storageId or an https url");
  const kind = ["image", "video", "audio"].includes(a.kind) ? a.kind : "image";
  const id = await ctx.db.insert("mediaAssets", {
    campaignId,
    kind,
    source: a.source.slice(0, 20),
    url,
    ...(a.storageId ? { storageId: a.storageId } : {}),
    ...(a.mime ? { mime: a.mime.slice(0, 100) } : {}),
    ...(a.name ? { name: a.name.slice(0, 200) } : {}),
    ...(a.w ? { w: a.w } : {}),
    ...(a.h ? { h: a.h } : {}),
    ...(a.duration ? { duration: a.duration } : {}),
    ...(a.prompt ? { prompt: a.prompt.slice(0, 4000) } : {}),
    ...(a.model ? { model: a.model.slice(0, 80) } : {}),
    ...(a.parentId ? { parentId: a.parentId } : {}),
    ...(a.cost !== undefined ? { cost: a.cost } : {}),
    ...(a.credit ? { credit: a.credit.slice(0, 200) } : {}),
    createdAt: Date.now(),
  });
  return { id, url };
}

export const create = mutation({
  args: {
    name: v.string(),
    kind: v.string(),
    source: sourceValidator,
    kit: v.any(),
    brief: v.any(),
    products: v.array(v.any()),
    audiences: v.array(v.any()),
    formats: v.array(v.string()),
    tier: v.string(),
    budget: v.number(),
    assets: v.optional(v.array(assetInput)),
  },
  returns: v.id("mediaCampaigns"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to create a campaign");
    if (args.source.pagesBrandId) {
      const b = await ctx.db.get(args.source.pagesBrandId);
      if (!b || b.owner !== identity.subject) throw new Error("Unknown brand");
    }
    if (args.source.emailBrandId) {
      const b = await ctx.db.get(args.source.emailBrandId);
      if (!b || b.owner !== identity.subject) throw new Error("Unknown brand");
    }
    const formats = args.formats.filter(isFormat);
    if (!formats.length) throw new Error("Pick at least one format");
    const now = Date.now();
    const id = await ctx.db.insert("mediaCampaigns", {
      name: args.name.trim().slice(0, 120) || "Untitled campaign",
      owner: identity.subject,
      kind: ["poster", "video", "both"].includes(args.kind) ? args.kind : "poster",
      source: args.source,
      kit: args.kit,
      brief: args.brief,
      products: args.products.slice(0, 24),
      audiences: args.audiences.slice(0, 6),
      formats,
      tier: isTier(args.tier) ? args.tier : "smart",
      budget: Math.min(MAX_BUDGET, Math.max(0.5, args.budget)),
      spend: 0,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
    let logo: string | undefined;
    for (const a of args.assets ?? []) {
      const { url } = await insertAsset(ctx, id, a);
      if (a.source === "logo" && !logo) logo = url;
    }
    // A logo uploaded in the wizard becomes the kit's logo.
    if (logo) await ctx.db.patch(id, { kit: { ...(args.kit ?? {}), logo: { src: logo, alt: `${args.name.trim() || "Brand"} logo` } } });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("mediaCampaigns"),
    name: v.optional(v.string()),
    kit: v.optional(v.any()),
    brief: v.optional(v.any()),
    tier: v.optional(v.string()),
    budget: v.optional(v.number()),
    formats: v.optional(v.array(v.string())),
    audiences: v.optional(v.array(v.any())),
    products: v.optional(v.array(v.any())),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    await ownCampaign(ctx, id);
    const update: Partial<Doc<"mediaCampaigns">> = { updatedAt: Date.now() };
    if (patch.name?.trim()) update.name = patch.name.trim().slice(0, 120);
    if (patch.kit !== undefined) update.kit = patch.kit;
    if (patch.brief !== undefined) update.brief = patch.brief;
    if (patch.tier !== undefined && isTier(patch.tier)) update.tier = patch.tier;
    if (patch.budget !== undefined) update.budget = Math.min(MAX_BUDGET, Math.max(0.5, patch.budget));
    if (patch.formats) update.formats = patch.formats.filter(isFormat);
    if (patch.audiences) update.audiences = patch.audiences.slice(0, 6);
    if (patch.products) update.products = patch.products.slice(0, 24);
    await ctx.db.patch(id, update);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("mediaCampaigns") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ownCampaign(ctx, id);
    const creatives = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect();
    for (const c of creatives) {
      const vs = await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", c._id)).collect();
      for (const x of vs) await ctx.db.delete(x._id);
      if (c.export?.storageId) await ctx.storage.delete(c.export.storageId).catch(() => {});
      await ctx.db.delete(c._id);
    }
    for (const a of await ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) {
      if (a.storageId) await ctx.storage.delete(a.storageId).catch(() => {});
      await ctx.db.delete(a._id);
    }
    for (const j of await ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(j._id);
    const chat = await ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique();
    if (chat) await ctx.db.delete(chat._id);
    for (const i of await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(i._id);
    await ctx.db.delete(id);
    return null;
  },
});

/** Pre-tests or taste maps for a campaign, newest first. */
export const insights = query({
  args: { id: v.id("mediaCampaigns"), kind: v.union(v.literal("pretest"), v.literal("map")) },
  handler: async (ctx, { id, kind }) => {
    const identity = await ctx.auth.getUserIdentity();
    const campaign = await ctx.db.get(id);
    if (!campaign || identity?.subject !== campaign.owner) return [];
    const rows = await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", id).eq("kind", kind)).collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ _id: r._id, key: r.key, data: r.data as unknown, createdAt: r.createdAt }));
  },
});

export const uploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in to upload files");
    return ctx.storage.generateUploadUrl();
  },
});

export const addAsset = mutation({
  args: { campaignId: v.id("mediaCampaigns"), asset: assetInput },
  handler: async (ctx, { campaignId, asset }) => {
    await ownCampaign(ctx, campaignId);
    return insertAsset(ctx, campaignId, asset);
  },
});

export const removeAsset = mutation({
  args: { id: v.id("mediaAssets") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const asset = await ctx.db.get(id);
    if (!asset) return null;
    await ownCampaign(ctx, asset.campaignId);
    // Docs may still point at the URL; keep the file, drop it from the library.
    await ctx.db.delete(id);
    return null;
  },
});

/** Merchant edits from the studio. A history entry is kept per minute of editing. */
export const saveDoc = mutation({
  args: { id: v.id("mediaCreatives"), doc: v.any(), note: v.optional(v.string()) },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, { id, doc, note }) => {
    const { creative } = await ownCreative(ctx, id);
    const clean = cleanDoc(keepLanded(cleanDoc(doc), creative.doc as MediaDoc));
    return { version: await writeVersion(ctx, creative, clean, "merchant", note) };
  },
});

/** Shots that finished while the merchant was editing an older copy keep their result. */
function keepLanded(next: MediaDoc, current: MediaDoc): MediaDoc {
  const landed = new Map([...(current.video ?? []), ...(current.audio ?? [])].filter((c) => c.status !== "pending").map((c) => [c.id, c]));
  const merge = <T extends { id: string; status: string }>(c: T): T => {
    const done = landed.get(c.id);
    if (c.status !== "pending" || !done || ("jobId" in c && "jobId" in done && c.jobId && done.jobId && c.jobId !== done.jobId)) return c;
    const { src, status, error, assetId } = done as { src?: string; status: string; error?: string; assetId?: string };
    const extra = "poster" in done ? { poster: (done as { poster?: string }).poster, model: (done as { model?: string }).model } : {};
    return { ...c, src, status, error, assetId, ...extra };
  };
  return { ...next, ...(next.video ? { video: next.video.map(merge) } : {}), ...(next.audio ? { audio: next.audio.map(merge) } : {}) };
}

export const restore = mutation({
  args: { id: v.id("mediaCreatives"), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, version }) => {
    const { creative } = await ownCreative(ctx, id);
    const row = await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", id).eq("version", version)).first();
    if (!row) throw new Error("Unknown version");
    await writeVersion(ctx, creative, cleanDoc(row.doc), "merchant", `Restored v${version}`, true);
    return null;
  },
});

export const renameCreative = mutation({
  args: { id: v.id("mediaCreatives"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    await ownCreative(ctx, id);
    if (name.trim()) await ctx.db.patch(id, { name: name.trim().slice(0, 120), updatedAt: Date.now() });
    return null;
  },
});

export const removeCreative = mutation({
  args: { id: v.id("mediaCreatives") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { creative } = await ownCreative(ctx, id);
    for (const x of await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", id)).collect()) await ctx.db.delete(x._id);
    const pretest = await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", creative.campaignId).eq("kind", "pretest").eq("key", id)).unique();
    if (pretest) await ctx.db.delete(pretest._id);
    await ctx.db.delete(id);
    return null;
  },
});

/** Copies a creative into other formats (layout adapted, no generation). */
export const resize = mutation({
  args: { id: v.id("mediaCreatives"), formats: v.array(v.string()) },
  returns: v.array(v.id("mediaCreatives")),
  handler: async (ctx, { id, formats }) => {
    const { creative, campaign } = await ownCreative(ctx, id);
    const ids: Id<"mediaCreatives">[] = [];
    for (const f of formats.filter(isFormat)) {
      if (f === creative.format) continue;
      const doc = cleanDoc(resizeDoc(creative.doc as MediaDoc, f));
      ids.push(await insertCreative(ctx, campaign._id, { name: `${creative.name.replace(/ · [^·]+$/, "")} · ${FORMATS[f].label}`, audienceKey: creative.audienceKey, format: f, kind: doc.kind, doc, why: creative.why }, "merchant"));
    }
    return ids;
  },
});

export const duplicate = mutation({
  args: { id: v.id("mediaCreatives") },
  returns: v.id("mediaCreatives"),
  handler: async (ctx, { id }) => {
    const { creative, campaign } = await ownCreative(ctx, id);
    return insertCreative(ctx, campaign._id, { name: `${creative.name} copy`, audienceKey: creative.audienceKey, format: creative.format, kind: creative.kind, doc: creative.doc, why: creative.why }, "merchant");
  },
});

/* Shared writes ------------------------------------------------------------ */

async function writeVersion(ctx: MutationCtx, creative: Doc<"mediaCreatives">, doc: MediaDoc, by: "agent" | "merchant", note?: string, force = false): Promise<number> {
  const now = Date.now();
  const version = creative.version + 1;
  const last = await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", creative._id)).order("desc").first();
  // History holds docs as written: every agent write, and the merchant's latest state per minute of editing.
  if (!force && by === "merchant" && last?.by === "merchant" && now - last.createdAt < 60_000) {
    await ctx.db.patch(last._id, { doc, version });
  } else {
    await ctx.db.insert("mediaVersions", { creativeId: creative._id, version, doc, by, ...(note ? { note: note.slice(0, 200) } : {}), createdAt: now });
  }
  await ctx.db.patch(creative._id, { doc, version, kind: doc.kind, format: doc.format, updatedAt: now });
  await ctx.db.patch(creative.campaignId, { updatedAt: now });
  return version;
}

async function insertCreative(
  ctx: MutationCtx,
  campaignId: Id<"mediaCampaigns">,
  c: { name: string; audienceKey: string; format: string; kind: string; doc: unknown; why?: { text: string; evidence: string }[] },
  by: "agent" | "merchant",
): Promise<Id<"mediaCreatives">> {
  const doc = cleanDoc(c.doc);
  const now = Date.now();
  const id = await ctx.db.insert("mediaCreatives", {
    campaignId,
    name: c.name.slice(0, 120) || "Creative",
    audienceKey: c.audienceKey.slice(0, 60) || "all",
    format: doc.format,
    kind: doc.kind,
    doc,
    version: 1,
    status: "draft",
    ...(c.why?.length ? { why: c.why.slice(0, 8).map((w) => ({ text: String(w.text).slice(0, 400), evidence: String(w.evidence).slice(0, 400) })) } : {}),
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("mediaVersions", { creativeId: id, version: 1, doc, by, note: "Created", createdAt: now });
  return id;
}

/* Agent (via http.ts) ------------------------------------------------------ */

export const readForAgent = internalQuery({
  args: { id: v.id("mediaCampaigns") },
  handler: async (ctx, { id }) => {
    const campaign = await ctx.db.get(id);
    if (!campaign) return null;
    const [creatives, assets, jobs] = await Promise.all([
      ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect(),
      ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(120),
      ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(60),
    ]);
    // Pages audiences are read live: their brief and Qloo profile may have been recompiled since.
    const audiences = await Promise.all(
      (campaign.audiences as { id: string; pagesAudienceId?: string }[]).map(async (a) => {
        if (!a.pagesAudienceId) return a;
        const row = await ctx.db.get(a.pagesAudienceId as Id<"pagesAudiences">).catch(() => null);
        return row ? { ...a, brief: row.brief, profile: row.profile, sources: row.sources, status: row.status } : a;
      }),
    );
    let brand: unknown = null;
    if (campaign.source.pagesBrandId) {
      const b = await ctx.db.get(campaign.source.pagesBrandId);
      if (b) brand = { kind: "pages", id: b._id, name: b.name, url: b.url, brief: b.brief, qloo: b.qloo ? { ...b.qloo, demographics: undefined } : undefined, images: b.site?.images?.slice(0, 24) ?? [] };
    } else if (campaign.source.emailBrandId) {
      const b = await ctx.db.get(campaign.source.emailBrandId);
      if (b) brand = { kind: "email", id: b._id, name: b.name, url: b.url, about: b.about };
    }
    const committed = jobs.filter((j) => j.status === "queued" || j.status === "running").reduce((s, j) => s + j.estimate, 0);
    return { campaign: { ...campaign, audiences }, brand, creatives, assets, jobs, committed };
  },
});

/** The latest pre-test or taste map for a creative or audience replaces the one before. */
export const putInsight = internalMutation({
  args: { campaignId: v.id("mediaCampaigns"), kind: v.union(v.literal("pretest"), v.literal("map")), key: v.string(), data: v.any() },
  returns: v.null(),
  handler: async (ctx, { campaignId, kind, key, data }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    const old = await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId).eq("kind", kind).eq("key", key)).unique();
    if (old) await ctx.db.delete(old._id);
    await ctx.db.insert("mediaInsights", { campaignId, kind, key: key.slice(0, 80), data, createdAt: Date.now() });
    return null;
  },
});

export const patchCampaign = internalMutation({
  args: { id: v.id("mediaCampaigns"), patch: v.any() },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    if (!(await ctx.db.get(id))) throw new Error("Unknown campaign");
    const p = (patch ?? {}) as Record<string, unknown>;
    const update: Partial<Doc<"mediaCampaigns">> = { updatedAt: Date.now() };
    if (typeof p.name === "string" && p.name.trim()) update.name = p.name.trim().slice(0, 120);
    if (p.kit && typeof p.kit === "object") update.kit = p.kit;
    if (p.brief && typeof p.brief === "object") update.brief = p.brief;
    if (typeof p.status === "string") update.status = p.status;
    if (Array.isArray(p.concepts)) update.concepts = p.concepts.slice(0, 12);
    if (Array.isArray(p.audiences)) update.audiences = p.audiences.slice(0, 6);
    await ctx.db.patch(id, update);
    return null;
  },
});

export const writeCreative = internalMutation({
  args: {
    campaignId: v.id("mediaCampaigns"),
    creativeId: v.optional(v.id("mediaCreatives")),
    name: v.optional(v.string()),
    audienceKey: v.optional(v.string()),
    doc: v.any(),
    why: v.optional(v.array(v.object({ text: v.string(), evidence: v.string() }))),
    note: v.optional(v.string()),
  },
  returns: v.object({ id: v.id("mediaCreatives"), version: v.number() }),
  handler: async (ctx, a) => {
    if (!(await ctx.db.get(a.campaignId))) throw new Error("Unknown campaign");
    if (a.creativeId) {
      const creative = await ctx.db.get(a.creativeId);
      if (!creative || creative.campaignId !== a.campaignId) throw new Error("Unknown creative");
      const version = await writeVersion(ctx, creative, cleanDoc(a.doc), "agent", a.note);
      const extra: Partial<Doc<"mediaCreatives">> = {};
      if (a.name) extra.name = a.name.slice(0, 120);
      if (a.why?.length) extra.why = a.why.slice(0, 8);
      if (Object.keys(extra).length) await ctx.db.patch(creative._id, extra);
      return { id: creative._id, version };
    }
    const doc = cleanDoc(a.doc);
    const id = await insertCreative(ctx, a.campaignId, { name: a.name ?? FORMATS[doc.format].label, audienceKey: a.audienceKey ?? "all", format: doc.format, kind: doc.kind, doc, why: a.why }, "agent");
    return { id, version: 1 };
  },
});

/** A finished (or failed) shot or audio clip lands in its doc without the agent rewriting it. */
export const setClip = internalMutation({
  args: { creativeId: v.id("mediaCreatives"), clipId: v.string(), patch: v.any() },
  returns: v.object({ found: v.boolean() }),
  handler: async (ctx, { creativeId, clipId, patch }) => {
    const creative = await ctx.db.get(creativeId);
    if (!creative) throw new Error("Unknown creative");
    const found = await patchClip(ctx, creative, clipId, patch);
    if (found) await shareClip(ctx, creative, clipId, patch);
    return { found };
  },
});

const openClip = (doc: MediaDoc, clipId: string) => [...(doc.video ?? []), ...(doc.audio ?? [])].some((c) => c.id === clipId && c.status !== "ready");

/** Resized copies keep their source's shot and audio ids; a clip that lands (or fails) fills the copies still waiting on it. */
async function shareClip(ctx: MutationCtx, source: Doc<"mediaCreatives">, clipId: string, patch: unknown) {
  const others = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", source.campaignId)).take(200);
  for (const other of others) {
    if (other._id !== source._id && openClip(other.doc as MediaDoc, clipId)) await patchClip(ctx, other, clipId, patch);
  }
}

/** Fills copies whose clips are still open from a ready clip with the same id elsewhere in the campaign. */
export const syncCopies = internalMutation({
  args: { campaignId: v.id("mediaCampaigns") },
  returns: v.object({ filled: v.number() }),
  handler: async (ctx, { campaignId }) => {
    const creatives = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).take(200);
    const ready = new Map<string, unknown>();
    for (const c of creatives) for (const clip of [...((c.doc as MediaDoc).video ?? []), ...((c.doc as MediaDoc).audio ?? [])]) if (clip.status === "ready") ready.set(clip.id, clip);
    let filled = 0;
    for (const c of creatives) {
      let fresh = c;
      for (const clip of [...((c.doc as MediaDoc).video ?? []), ...((c.doc as MediaDoc).audio ?? [])]) {
        const src = clip.status !== "ready" ? ready.get(clip.id) : undefined;
        if (!src || !(await patchClip(ctx, fresh, clip.id, src))) continue;
        filled++;
        fresh = (await ctx.db.get(c._id))!;
      }
    }
    return { filled };
  },
});

async function patchClip(ctx: MutationCtx, creative: Doc<"mediaCreatives">, clipId: string, patch: unknown) {
  const doc = structuredClone(creative.doc as MediaDoc);
  const p = (patch ?? {}) as Record<string, unknown>;
  let found = false;
  doc.video = (doc.video ?? []).map((c) => (c.id === clipId ? ((found = true), { ...c, ...p }) : c));
  doc.audio = (doc.audio ?? []).map((c) => (c.id === clipId ? ((found = true), { ...c, ...p }) : c));
  doc.layers = doc.layers.map((l) => (l.id === clipId ? ((found = true), { ...l, ...p }) as typeof l : l));
  if (!found) return false;
  await ctx.db.patch(creative._id, { doc: cleanDoc(doc), version: creative.version + 1, updatedAt: Date.now() });
  return true;
}

/** Jobs run inside the agent process, so when it starts, any job still open was cut off by a restart. */
export const interruptJobs = internalMutation({
  args: {},
  returns: v.object({ count: v.number() }),
  handler: async (ctx) => {
    const error = "Interrupted when the agent restarted. Regenerate it.";
    const open = [
      ...(await ctx.db.query("mediaJobs").withIndex("by_status", (q) => q.eq("status", "running")).take(200)),
      ...(await ctx.db.query("mediaJobs").withIndex("by_status", (q) => q.eq("status", "queued")).take(200)),
    ];
    for (const job of open) {
      await ctx.db.patch(job._id, { status: "failed", error, cost: 0, updatedAt: Date.now() });
      const creative = job.creativeId && job.targetId ? await ctx.db.get(job.creativeId) : null;
      if (creative && job.targetId && (await patchClip(ctx, creative, job.targetId, { status: "failed", error }))) await shareClip(ctx, creative, job.targetId, { status: "failed", error });
    }
    return { count: open.length };
  },
});

export const addAssetInternal = internalMutation({
  args: {
    campaignId: v.id("mediaCampaigns"),
    asset: v.object({
      url: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      kind: v.string(),
      source: v.string(),
      mime: v.optional(v.string()),
      name: v.optional(v.string()),
      w: v.optional(v.number()),
      h: v.optional(v.number()),
      duration: v.optional(v.number()),
      prompt: v.optional(v.string()),
      model: v.optional(v.string()),
      parentId: v.optional(v.id("mediaAssets")),
      cost: v.optional(v.number()),
      credit: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { campaignId, asset }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    return insertAsset(ctx, campaignId, asset);
  },
});

/** Creates a job (no jobId) or moves one along; a job that finishes adds its cost to the campaign's spend. */
export const upsertJob = internalMutation({
  args: {
    jobId: v.optional(v.id("mediaJobs")),
    campaignId: v.id("mediaCampaigns"),
    creativeId: v.optional(v.id("mediaCreatives")),
    targetId: v.optional(v.string()),
    kind: v.optional(v.string()),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    status: v.optional(v.string()),
    estimate: v.optional(v.number()),
    cost: v.optional(v.number()),
    assetId: v.optional(v.id("mediaAssets")),
    error: v.optional(v.string()),
  },
  returns: v.object({ id: v.id("mediaJobs") }),
  handler: async (ctx, a) => {
    const campaign = await ctx.db.get(a.campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    const now = Date.now();
    const status = a.status && ["queued", "running", "done", "failed"].includes(a.status) ? a.status : undefined;
    if (!a.jobId) {
      const id = await ctx.db.insert("mediaJobs", {
        campaignId: a.campaignId,
        ...(a.creativeId ? { creativeId: a.creativeId } : {}),
        ...(a.targetId ? { targetId: a.targetId.slice(0, 60) } : {}),
        kind: (a.kind ?? "video").slice(0, 20),
        model: (a.model ?? "").slice(0, 80),
        ...(a.prompt ? { prompt: a.prompt.slice(0, 2000) } : {}),
        status: status ?? "running",
        estimate: Math.max(0, a.estimate ?? 0),
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(a.campaignId, { status: "working", updatedAt: now });
      return { id };
    }
    const job = await ctx.db.get(a.jobId);
    if (!job || job.campaignId !== a.campaignId) throw new Error("Unknown job");
    const finishing = status === "done" && job.status !== "done";
    await ctx.db.patch(job._id, {
      ...(status ? { status } : {}),
      ...(a.cost !== undefined ? { cost: a.cost } : {}),
      ...(a.assetId ? { assetId: a.assetId } : {}),
      ...(a.error ? { error: a.error.slice(0, 500) } : {}),
      updatedAt: now,
    });
    if (finishing) await ctx.db.patch(a.campaignId, { spend: Math.round((campaign.spend + (a.cost ?? job.estimate)) * 1000) / 1000, updatedAt: now });
    return { id: job._id };
  },
});

export const setExport = internalMutation({
  args: { creativeId: v.id("mediaCreatives"), url: v.string(), storageId: v.optional(v.id("_storage")), mime: v.string(), version: v.number(), status: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, a) => {
    const creative = await ctx.db.get(a.creativeId);
    if (!creative) throw new Error("Unknown creative");
    if (creative.export?.storageId && creative.export.storageId !== a.storageId) await ctx.storage.delete(creative.export.storageId).catch(() => {});
    await ctx.db.patch(a.creativeId, { export: { url: a.url, ...(a.storageId ? { storageId: a.storageId } : {}), mime: a.mime, version: a.version, at: Date.now() }, status: a.status ?? "ready", updatedAt: Date.now() });
    return null;
  },
});

export const setCreativeStatus = internalMutation({
  args: { creativeId: v.id("mediaCreatives"), status: v.string() },
  returns: v.null(),
  handler: async (ctx, { creativeId, status }) => {
    if (await ctx.db.get(creativeId)) await ctx.db.patch(creativeId, { status: status.slice(0, 20), updatedAt: Date.now() });
    return null;
  },
});

export const appendChat = internalMutation({
  args: { id: v.id("mediaCampaigns"), messages: v.array(v.any()) },
  returns: v.null(),
  handler: async (ctx, { id, messages }) => {
    if (!(await ctx.db.get(id))) throw new Error("Unknown campaign");
    const now = Date.now();
    const incoming = messages.map((m) => cleanMessage(m, now)).filter((m): m is NonNullable<ReturnType<typeof cleanMessage>> => m !== null);
    const existing = await ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique();
    const merged = [...(existing?.messages ?? [])];
    for (const m of incoming) {
      const at = merged.findIndex((x) => x.id === m.id);
      if (at >= 0) merged[at] = m;
      else merged.push(m);
    }
    const kept = merged.slice(-120);
    if (existing) await ctx.db.patch(existing._id, { messages: kept, updatedAt: now });
    else await ctx.db.insert("mediaChats", { campaignId: id, messages: kept, updatedAt: now });
    return null;
  },
});

export const storageUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});
