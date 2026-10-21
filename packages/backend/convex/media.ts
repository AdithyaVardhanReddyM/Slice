import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { cleanMessage } from "./emailCampaigns";
import { AUDIO_NODE, BOARD_GAP, DEFAULT_KIT, aspectSize, boardWidth, cleanDoc, creativeName, FORMATS, isDesignJob, isFormat, isTier, resizeDoc, safeUrl, type BoardPos, type FormatPreset, type MediaDoc, type MediaKit } from "./mediaTypes";

// Media campaigns: one infinite canvas per campaign holding the posters and
// videos (creatives), the generated images, clips and tracks (assets) and the
// generations still running (jobs with a board spot). The console creates and
// edits here (owner-checked); the agent writes through /media/* HTTP routes
// (http.ts) into the internal functions below. New things land on the canvas
// on their own: next to what they came from, or after the last thing made.

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
    const rows = await Promise.all(
      campaigns.map(async (c) => {
        const [creatives, assets] = await Promise.all([
          ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect(),
          ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).order("desc").collect(),
        ]);
        const onBoard = assets.filter((a) => a.board);
        const latest = [...creatives].sort((a, b) => b.updatedAt - a.updatedAt);
        const cover = latest.find((x) => x.export?.mime.startsWith("image/"))?.export?.url ?? firstImage(latest.map((x) => x.doc as MediaDoc)) ?? onBoard.find((a) => a.kind === "image")?.url;
        return {
          _id: c._id,
          name: c.name,
          spend: c.spend,
          budget: c.budget,
          posters: creatives.filter((x) => x.kind === "poster").length,
          videos: creatives.filter((x) => x.kind === "video").length,
          images: onBoard.filter((a) => a.kind === "image").length,
          clips: onBoard.filter((a) => a.kind === "video").length,
          tracks: onBoard.filter((a) => a.kind === "audio").length,
          cover: cover ?? null,
          kit: c.kit as MediaKit | undefined,
          brandId: c.brandId ?? null,
          updatedAt: c.updatedAt,
        };
      }),
    );
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const [creatives, assets, jobs, shapes, chat, brand] = await Promise.all([
      ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect(),
      ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").collect(),
      ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(400),
      ctx.db.query("mediaShapes").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect(),
      ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique(),
      campaign.brandId ? ctx.db.get(campaign.brandId) : null,
    ]);
    return { campaign, brand, creatives, assets, jobs, shapes, messages: chat?.messages ?? [] };
  },
});

/** An editor's own conversation (mediaItemChats). */
export const itemChat = query({
  args: { campaignId: v.id("mediaCampaigns"), itemId: v.string() },
  handler: async (ctx, { campaignId, itemId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || identity?.subject !== campaign.owner) return [];
    const chat = await ctx.db.query("mediaItemChats").withIndex("by_item", (q) => q.eq("campaignId", campaignId).eq("itemId", itemId)).unique();
    return chat?.messages ?? [];
  },
});

/** The latest insight of a kind about one creative or asset ("why": its Why report), or null. */
export const insight = query({
  args: { campaignId: v.id("mediaCampaigns"), kind: v.string(), key: v.string() },
  handler: async (ctx, { campaignId, kind, key }) => {
    const identity = await ctx.auth.getUserIdentity();
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || identity?.subject !== campaign.owner) return null;
    const row = await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId).eq("kind", kind).eq("key", key)).first();
    return row ? { data: row.data as unknown, createdAt: row.createdAt } : null;
  },
});

async function dropInsights(ctx: MutationCtx, campaignId: Id<"mediaCampaigns">, key: string) {
  for (const i of await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect()) if (i.key === key) await ctx.db.delete(i._id);
}

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
        out.push({ url: x.export.url, mime: x.export.mime, name: creativeName(x.name), campaign: c.name, format: x.format, w: spec.w, h: spec.h, at: x.export.at });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

/* Console: writes ---------------------------------------------------------- */

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

const boardValidator = v.object({ x: v.number(), y: v.number(), w: v.number() });

async function insertAsset(ctx: MutationCtx, campaignId: Id<"mediaCampaigns">, a: { url?: string; storageId?: Id<"_storage">; kind: string; source: string; mime?: string; name?: string; w?: number; h?: number; duration?: number; prompt?: string; model?: string; parentId?: Id<"mediaAssets">; cost?: number; credit?: string; board?: BoardPos; review?: unknown; audienceKey?: string }) {
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
    ...(a.board ? { board: a.board } : {}),
    ...(a.review && typeof a.review === "object" ? { review: a.review } : {}),
    ...(a.audienceKey ? { audienceKey: a.audienceKey.slice(0, 80) } : {}),
    createdAt: Date.now(),
  });
  return { id, url };
}

/* The board ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
}

const ROW_MAX = 2600;
/** Room above every node for its name. */
const LABEL = 34;

const creativeRect = (c: Doc<"mediaCreatives">): Rect | null => {
  if (!c.board) return null;
  const d = c.doc as MediaDoc;
  return { ...c.board, h: (c.board.w * d.h) / d.w, at: c.createdAt };
};

const assetHeight = (a: { kind: string; w?: number; h?: number }, w: number) => (a.kind === "audio" ? AUDIO_NODE.h : a.w && a.h ? (w * a.h) / a.w : w);

const assetRect = (a: Doc<"mediaAssets">): Rect | null => (a.board ? { ...a.board, h: assetHeight(a, a.board.w), at: a.createdAt } : null);

const jobHeight = (j: { kind: string; aspect?: string }, w: number) => {
  if (j.kind === "music" || j.kind === "voice") return AUDIO_NODE.h;
  const s = aspectSize(j.aspect);
  return (w * s.h) / s.w;
};

const jobRect = (j: Doc<"mediaJobs">): Rect | null => (j.board && j.status !== "done" && !j.dismissed ? { ...j.board, h: jobHeight(j, j.board.w), at: j.createdAt } : null);

/** Frames, text and notes are in the way too, but never what something new lines up after (an arrow is not in the way). */
const shapeRect = (s: Doc<"mediaShapes">): Rect | null => (s.kind === "arrow" ? null : { x: s.x, y: s.y, w: s.w, h: s.h, at: 0 });

async function boardRects(ctx: QueryCtx, campaignId: Id<"mediaCampaigns">): Promise<Rect[]> {
  const [creatives, assets, jobs, shapes] = await Promise.all([
    ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect(),
    ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect(),
    ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).order("desc").take(200),
    ctx.db.query("mediaShapes").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).take(500),
  ]);
  return [...creatives.map(creativeRect), ...assets.map(assetRect), ...jobs.map(jobRect), ...shapes.map(shapeRect)].filter((r): r is Rect => !!r);
}

const overlaps = (a: Omit<Rect, "at">, b: Rect) =>
  a.x < b.x + b.w + BOARD_GAP / 2 && b.x < a.x + a.w + BOARD_GAP / 2 && a.y - LABEL < b.y + b.h + BOARD_GAP / 2 && b.y - LABEL < a.y + a.h + BOARD_GAP / 2;

/** A free spot for a w×h node: right of `near` (what it came from), else after the last thing made, wrapping to a new row. */
function freeSpot(rects: Rect[], size: { w: number; h: number }, near?: Omit<Rect, "at"> | null): { x: number; y: number } {
  if (!rects.length) return { x: 0, y: 0 };
  const left = Math.min(...rects.map((r) => r.x));
  let start: { x: number; y: number };
  if (near) start = { x: near.x + near.w + BOARD_GAP, y: near.y };
  else {
    const last = rects.reduce((a, b) => (b.at > a.at ? b : a));
    start = { x: last.x + last.w + BOARD_GAP, y: last.y };
    if (start.x - left > ROW_MAX) start = { x: left, y: Math.max(...rects.map((r) => r.y + r.h)) + BOARD_GAP + LABEL };
  }
  let p = { ...start };
  for (let i = 0; i < 80; i++) {
    const hit = rects.find((r) => overlaps({ ...p, ...size }, r));
    if (!hit) return { x: Math.round(p.x), y: Math.round(p.y) };
    p = { x: hit.x + hit.w + BOARD_GAP, y: p.y };
    if (p.x - start.x > ROW_MAX * 1.5) p = { x: start.x, y: p.y + size.h + BOARD_GAP + LABEL };
  }
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Where a new node of this shape goes; `nearId` is a creative, asset or job it came from. */
export async function placeOnBoard(ctx: QueryCtx, campaignId: Id<"mediaCampaigns">, shape: { w: number; h: number; audio?: boolean }, nearId?: string): Promise<BoardPos> {
  const rects = await boardRects(ctx, campaignId);
  const w = shape.audio ? AUDIO_NODE.w : boardWidth(shape.w, shape.h);
  const h = shape.audio ? AUDIO_NODE.h : (w * shape.h) / shape.w;
  let near: Omit<Rect, "at"> | null = null;
  if (nearId) {
    const id = ctx.db.normalizeId("mediaCreatives", nearId) ?? ctx.db.normalizeId("mediaAssets", nearId) ?? ctx.db.normalizeId("mediaJobs", nearId);
    const row = id ? await ctx.db.get(id) : null;
    const r = row && "doc" in row ? creativeRect(row as Doc<"mediaCreatives">) : row && "url" in row ? assetRect(row as Doc<"mediaAssets">) : row ? jobRect(row as Doc<"mediaJobs">) : null;
    if (r) near = r;
  }
  return { ...freeSpot(rects, { w, h }, near), w };
}

/** The spot a design placeholder held, for the creative replacing it: its corner, unless the creative came out a size that no longer fits there. */
async function heldSpot(ctx: QueryCtx, campaignId: Id<"mediaCampaigns">, held: BoardPos, doc: { w: number; h: number }): Promise<BoardPos | undefined> {
  const w = boardWidth(doc.w, doc.h);
  const box = { x: held.x, y: held.y, w, h: (w * doc.h) / doc.w };
  const rects = await boardRects(ctx, campaignId);
  return rects.some((r) => overlaps(box, r)) ? undefined : { x: held.x, y: held.y, w };
}

const DEFAULT_BUDGET = 10;

/** One-off (npx convex run media:migrateBoard): creatives made before the canvas get a spot, in rows by audience. */
export const migrateBoard = internalMutation({
  args: {},
  returns: v.object({ placed: v.number() }),
  handler: async (ctx) => {
    let placed = 0;
    for (const c of await ctx.db.query("mediaCampaigns").collect()) {
      const creatives = (await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()).filter((x) => !x.board);
      creatives.sort((a, b) => a.audienceKey.localeCompare(b.audienceKey) || a.kind.localeCompare(b.kind) || a.createdAt - b.createdAt);
      for (const x of creatives) {
        const d = x.doc as MediaDoc;
        await ctx.db.patch(x._id, { board: await placeOnBoard(ctx, c._id, { w: d.w, h: d.h }) });
        placed++;
      }
    }
    return { placed };
  },
});

/** A new, empty campaign: straight to its canvas. The brand defaults to the one used last. */
export const createBlank = mutation({
  args: { brandId: v.optional(v.id("mediaBrands")), name: v.optional(v.string()) },
  returns: v.id("mediaCampaigns"),
  handler: async (ctx, { brandId, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to create a campaign");
    let brand: Doc<"mediaBrands"> | null = null;
    if (brandId) {
      brand = await ctx.db.get(brandId);
      if (!brand || brand.owner !== identity.subject) throw new Error("Unknown brand");
    } else {
      const last = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", identity.subject)).order("desc").first();
      if (last?.brandId) brand = await ctx.db.get(last.brandId);
    }
    const now = Date.now();
    return ctx.db.insert("mediaCampaigns", {
      name: name?.trim().slice(0, 120) || "Untitled campaign",
      owner: identity.subject,
      ...(brand ? { brandId: brand._id } : {}),
      kind: "both",
      source: { kind: "manual" },
      kit: brand?.kit ?? DEFAULT_KIT("Your brand"),
      brief: { goal: "" },
      products: brand?.products ?? [],
      audiences: [{ id: "all", name: "Everyone", kind: "everyone" }],
      formats: ["story", "portrait"],
      tier: "smart",
      budget: DEFAULT_BUDGET,
      spend: 0,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Design for another brand from now on: the campaign takes its kit and products. */
export const setBrand = mutation({
  args: { id: v.id("mediaCampaigns"), brandId: v.id("mediaBrands") },
  returns: v.null(),
  handler: async (ctx, { id, brandId }) => {
    const campaign = await ownCampaign(ctx, id);
    const brand = await ctx.db.get(brandId);
    if (!brand || brand.owner !== campaign.owner) throw new Error("Unknown brand");
    await ctx.db.patch(id, { brandId, kit: brand.kit, products: brand.products, updatedAt: Date.now() });
    return null;
  },
});

const nodeRef = v.object({ kind: v.union(v.literal("creative"), v.literal("asset"), v.literal("job")), id: v.string(), x: v.number(), y: v.number(), w: v.optional(v.number()) });

/** Moves (and resizes) nodes on the canvas. */
export const moveNodes = mutation({
  args: { id: v.id("mediaCampaigns"), nodes: v.array(nodeRef) },
  returns: v.null(),
  handler: async (ctx, { id, nodes }) => {
    await ownCampaign(ctx, id);
    for (const n of nodes.slice(0, 200)) {
      const table = n.kind === "creative" ? "mediaCreatives" : n.kind === "asset" ? "mediaAssets" : "mediaJobs";
      const nid = ctx.db.normalizeId(table, n.id);
      const row = nid ? await ctx.db.get(nid) : null;
      if (!row || row.campaignId !== id) continue;
      const w = Math.max(80, Math.min(2400, n.w ?? row.board?.w ?? 320));
      await ctx.db.patch(nid!, { board: { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(w) } });
    }
    return null;
  },
});

/** A library file onto the canvas (dropped from the sidebar), or off it (still in the library). */
export const placeAsset = mutation({
  args: { id: v.id("mediaAssets"), board: v.optional(v.union(boardValidator, v.null())) },
  returns: v.null(),
  handler: async (ctx, { id, board }) => {
    const asset = await ctx.db.get(id);
    if (!asset) throw new Error("Unknown file");
    await ownCampaign(ctx, asset.campaignId);
    if (board === null) await ctx.db.patch(id, { board: undefined });
    else if (board) await ctx.db.patch(id, { board: { x: Math.round(board.x), y: Math.round(board.y), w: Math.round(board.w) } });
    else await ctx.db.patch(id, { board: await placeOnBoard(ctx, asset.campaignId, { w: asset.w ?? 1, h: asset.h ?? 1, audio: asset.kind === "audio" }) });
    return null;
  },
});

/** A failed generation off the canvas. */
export const dismissJob = mutation({
  args: { id: v.id("mediaJobs") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) return null;
    await ownCampaign(ctx, job.campaignId);
    await ctx.db.patch(id, { dismissed: true });
    return null;
  },
});

/* Shapes the merchant draws (frames, arrows, text, notes) ------------------- */

const shapeEnd = v.object({ x: v.number(), y: v.number(), node: v.optional(v.string()) });
const SHAPE_KINDS = new Set(["frame", "arrow", "text", "sticky"]);
const shapeLook = {
  text: v.optional(v.string()),
  color: v.optional(v.string()),
  size: v.optional(v.number()),
  dashed: v.optional(v.boolean()),
  from: v.optional(shapeEnd),
  to: v.optional(shapeEnd),
};

/** A shape's fields, kept in bounds. */
function cleanShape<T extends { x?: number; y?: number; w?: number; h?: number; text?: string; color?: string; size?: number }>(s: T): T {
  const out = { ...s };
  if (out.x !== undefined) out.x = Math.round(out.x);
  if (out.y !== undefined) out.y = Math.round(out.y);
  if (out.w !== undefined) out.w = Math.max(1, Math.min(20000, Math.round(out.w)));
  if (out.h !== undefined) out.h = Math.max(1, Math.min(20000, Math.round(out.h)));
  if (out.text !== undefined) out.text = out.text.slice(0, 4000);
  if (out.color !== undefined) out.color = out.color.slice(0, 24);
  if (out.size !== undefined) out.size = Math.max(8, Math.min(400, out.size));
  return out;
}

async function shapeBySid(ctx: QueryCtx, campaignId: Id<"mediaCampaigns">, sid: string) {
  return ctx.db.query("mediaShapes").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId).eq("sid", sid)).unique();
}

export const addShape = mutation({
  args: { campaignId: v.id("mediaCampaigns"), shape: v.object({ sid: v.string(), kind: v.string(), x: v.number(), y: v.number(), w: v.number(), h: v.number(), ...shapeLook }) },
  returns: v.null(),
  handler: async (ctx, { campaignId, shape }) => {
    await ownCampaign(ctx, campaignId);
    if (!SHAPE_KINDS.has(shape.kind)) throw new Error("Unknown shape");
    if (await shapeBySid(ctx, campaignId, shape.sid)) return null;
    const now = Date.now();
    await ctx.db.insert("mediaShapes", { ...cleanShape({ ...shape, sid: shape.sid.slice(0, 64) }), campaignId, createdAt: now, updatedAt: now });
    return null;
  },
});

/** Moves, resizes and restyles shapes, or changes their words (only the fields given). */
export const patchShapes = mutation({
  args: { campaignId: v.id("mediaCampaigns"), shapes: v.array(v.object({ sid: v.string(), x: v.optional(v.number()), y: v.optional(v.number()), w: v.optional(v.number()), h: v.optional(v.number()), ...shapeLook })) },
  returns: v.null(),
  handler: async (ctx, { campaignId, shapes }) => {
    await ownCampaign(ctx, campaignId);
    const now = Date.now();
    for (const { sid, ...patch } of shapes.slice(0, 500)) {
      const row = await shapeBySid(ctx, campaignId, sid);
      if (row) await ctx.db.patch(row._id, { ...cleanShape(patch), updatedAt: now });
    }
    return null;
  },
});

export const removeShapes = mutation({
  args: { campaignId: v.id("mediaCampaigns"), sids: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { campaignId, sids }) => {
    await ownCampaign(ctx, campaignId);
    for (const sid of sids.slice(0, 500)) {
      const row = await shapeBySid(ctx, campaignId, sid);
      if (row) await ctx.db.delete(row._id);
    }
    return null;
  },
});

export const setViewport = mutation({
  args: { id: v.id("mediaCampaigns"), viewport: v.object({ x: v.number(), y: v.number(), zoom: v.number() }) },
  returns: v.null(),
  handler: async (ctx, { id, viewport }) => {
    await ownCampaign(ctx, id);
    await ctx.db.patch(id, { viewport: { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Math.max(0.05, Math.min(8, viewport.zoom)) } });
    return null;
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
    for (const s of await ctx.db.query("mediaShapes").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(s._id);
    const chat = await ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).unique();
    if (chat) await ctx.db.delete(chat._id);
    for (const c of await ctx.db.query("mediaItemChats").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(c._id);
    for (const i of await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", id)).collect()) await ctx.db.delete(i._id);
    await ctx.db.delete(id);
    return null;
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

/** A file into the library; `place` puts it on the canvas too (at `board`, or the next free spot). */
export const addAsset = mutation({
  args: { campaignId: v.id("mediaCampaigns"), asset: assetInput, place: v.optional(v.boolean()), board: v.optional(boardValidator) },
  handler: async (ctx, { campaignId, asset, place, board }) => {
    await ownCampaign(ctx, campaignId);
    const spot = board ?? (place ? await placeOnBoard(ctx, campaignId, { w: asset.w ?? 1, h: asset.h ?? 1, audio: asset.kind === "audio" }) : undefined);
    return insertAsset(ctx, campaignId, { ...asset, ...(spot ? { board: spot } : {}) });
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
    await dropInsights(ctx, asset.campaignId, id);
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
    const clean = creativeName(name).slice(0, 120);
    if (clean) await ctx.db.patch(id, { name: clean, updatedAt: Date.now() });
    return null;
  },
});

export const removeCreative = mutation({
  args: { id: v.id("mediaCreatives") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { creative } = await ownCreative(ctx, id);
    for (const x of await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", id)).collect()) await ctx.db.delete(x._id);
    await dropInsights(ctx, creative.campaignId, id);
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
      ids.push(await insertCreative(ctx, campaign._id, { name: creative.name, audienceKey: creative.audienceKey, format: f, kind: doc.kind, doc, why: creative.why, nearId: ids[ids.length - 1] ?? creative._id }, "merchant"));
    }
    return ids;
  },
});

export const duplicate = mutation({
  args: { id: v.id("mediaCreatives") },
  returns: v.id("mediaCreatives"),
  handler: async (ctx, { id }) => {
    const { creative, campaign } = await ownCreative(ctx, id);
    return insertCreative(ctx, campaign._id, { name: `${creative.name} copy`, audienceKey: creative.audienceKey, format: creative.format, kind: creative.kind, doc: creative.doc, why: creative.why, nearId: creative._id }, "merchant");
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
  c: { name: string; audienceKey: string; format: string; kind: string; doc: unknown; why?: { text: string; evidence: string }[]; board?: BoardPos; nearId?: string; thread?: string },
  by: "agent" | "merchant",
): Promise<Id<"mediaCreatives">> {
  const doc = cleanDoc(c.doc);
  const now = Date.now();
  const board = c.board ?? (await placeOnBoard(ctx, campaignId, { w: doc.w, h: doc.h }, c.nearId));
  const id = await ctx.db.insert("mediaCreatives", {
    campaignId,
    name: creativeName(c.name).slice(0, 120) || "Creative",
    audienceKey: c.audienceKey.slice(0, 60) || "all",
    format: doc.format,
    kind: doc.kind,
    doc,
    version: 1,
    status: "draft",
    ...(c.why?.length ? { why: c.why.slice(0, 8).map((w) => ({ text: String(w.text).slice(0, 400), evidence: String(w.evidence).slice(0, 400) })) } : {}),
    board,
    ...(c.thread ? { thread: c.thread.slice(0, 60) } : {}),
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("mediaVersions", { creativeId: id, version: 1, doc, by, note: "Created", createdAt: now });
  await ctx.db.patch(campaignId, { updatedAt: now });
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
      ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(300),
      ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", id)).order("desc").take(60),
    ]);
    // Pages audiences and Email taste groups are read live: their brief and Qloo profile may have been recompiled since.
    const audiences = await Promise.all(
      (campaign.audiences as { id: string; pagesAudienceId?: string; emailAudienceId?: string }[]).map(async (a) => {
        if (a.pagesAudienceId) {
          const row = await ctx.db.get(a.pagesAudienceId as Id<"pagesAudiences">).catch(() => null);
          return row ? { ...a, name: row.name, brief: row.brief, profile: row.profile, sources: row.sources, status: row.status } : a;
        }
        if (a.emailAudienceId) {
          const row = await ctx.db.get(a.emailAudienceId as Id<"emailAudiences">).catch(() => null);
          return row ? { ...a, name: row.name, brief: row.brief, profile: row.profile, status: row.status } : a;
        }
        return a;
      }),
    );
    let brand: unknown = null;
    const media = campaign.brandId ? await ctx.db.get(campaign.brandId) : null;
    if (media) {
      brand = { kind: "media", id: media._id, name: media.name, url: media.url, about: media.about, images: media.images.map((src) => ({ src, alt: "" })) };
    } else if (campaign.source.pagesBrandId) {
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

/** The agent's latest insight about a creative or asset replaces the one before. */
export const putInsight = internalMutation({
  args: { campaignId: v.id("mediaCampaigns"), kind: v.string(), key: v.string(), data: v.any() },
  returns: v.null(),
  handler: async (ctx, { campaignId, kind, key, data }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    const old = await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId).eq("kind", kind).eq("key", key)).collect();
    for (const o of old) await ctx.db.delete(o._id);
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
    /** A creative, asset or job the new one is placed next to. */
    nearId: v.optional(v.string()),
    /** The design placeholder holding this creative's spot: it takes the spot and the placeholder ends. */
    designJobId: v.optional(v.id("mediaJobs")),
    /** The conversation it is made in (a toolbar maker's spot): selecting it opens that thread. */
    thread: v.optional(v.string()),
  },
  returns: v.object({ id: v.id("mediaCreatives"), version: v.number() }),
  handler: async (ctx, a) => {
    if (!(await ctx.db.get(a.campaignId))) throw new Error("Unknown campaign");
    if (a.creativeId) {
      const creative = await ctx.db.get(a.creativeId);
      if (!creative || creative.campaignId !== a.campaignId) throw new Error("Unknown creative");
      const version = await writeVersion(ctx, creative, cleanDoc(a.doc), "agent", a.note);
      const extra: Partial<Doc<"mediaCreatives">> = {};
      if (creativeName(a.name ?? "")) extra.name = creativeName(a.name ?? "").slice(0, 120);
      if (a.why?.length) extra.why = a.why.slice(0, 8);
      if (Object.keys(extra).length) await ctx.db.patch(creative._id, extra);
      return { id: creative._id, version };
    }
    const doc = cleanDoc(a.doc);
    // Ending the placeholder first frees its spot, so the creative lands where it was, in the same instant.
    const slot = a.designJobId ? await ctx.db.get(a.designJobId) : null;
    let board: BoardPos | undefined;
    if (slot && slot.campaignId === a.campaignId && isDesignJob(slot.kind) && slot.status !== "done") {
      await ctx.db.patch(slot._id, { status: "done", updatedAt: Date.now() });
      if (slot.board) board = await heldSpot(ctx, a.campaignId, slot.board, doc);
    }
    const id = await insertCreative(ctx, a.campaignId, { name: a.name ?? FORMATS[doc.format].label, audienceKey: a.audienceKey ?? "all", format: doc.format, kind: doc.kind, doc, why: a.why, board, nearId: a.nearId, thread: a.thread ?? slot?.thread }, "agent");
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
      // A design placeholder just goes (nothing to regenerate), or waits again when the merchant started it with its own conversation.
      if (isDesignJob(job.kind)) {
        if (job.thread) await ctx.db.patch(job._id, { status: "draft", updatedAt: Date.now() });
        else await ctx.db.delete(job._id);
        continue;
      }
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
      review: v.optional(v.any()),
      audienceKey: v.optional(v.string()),
    }),
    /** Put it on the canvas, next to `nearId` when given. */
    place: v.optional(v.boolean()),
    nearId: v.optional(v.string()),
  },
  handler: async (ctx, { campaignId, asset, place, nearId }) => {
    if (!(await ctx.db.get(campaignId))) throw new Error("Unknown campaign");
    const board = place ? await placeOnBoard(ctx, campaignId, { w: asset.w ?? 1, h: asset.h ?? 1, audio: asset.kind === "audio" }, nearId) : undefined;
    // A new version is for the same audience as the one it was made from.
    const audienceKey = asset.audienceKey ?? (asset.parentId ? (await ctx.db.get(asset.parentId))?.audienceKey : undefined);
    return insertAsset(ctx, campaignId, { ...asset, ...(audienceKey ? { audienceKey } : {}), ...(board ? { board } : {}) });
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
    /** A standalone generation: hold a spot on the canvas of this shape ("9:16", or "audio"), next to `nearId`. */
    place: v.optional(v.boolean()),
    aspect: v.optional(v.string()),
    nearId: v.optional(v.string()),
    /** Exactly this spot (one the merchant picked with a toolbar maker). */
    board: v.optional(v.object({ x: v.number(), y: v.number(), w: v.number() })),
    /** The conversation it belongs to; a design spot for a thread is reused, not doubled. */
    thread: v.optional(v.string()),
    /** Delete it: a design placeholder whose turn ended without a creative. */
    drop: v.optional(v.boolean()),
  },
  returns: v.object({ id: v.id("mediaJobs") }),
  handler: async (ctx, a) => {
    const campaign = await ctx.db.get(a.campaignId);
    if (!campaign) throw new Error("Unknown campaign");
    const now = Date.now();
    const status = a.status && ["queued", "running", "done", "failed", "draft"].includes(a.status) ? a.status : undefined;
    const thread = a.thread?.slice(0, 60);
    if (!a.jobId) {
      if (thread && isDesignJob(a.kind ?? "")) {
        const recent = await ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", a.campaignId)).order("desc").take(200);
        const held = recent.find((j) => j.thread === thread && isDesignJob(j.kind) && j.status !== "done" && !j.dismissed);
        if (held) {
          await ctx.db.patch(held._id, { status: status ?? "running", updatedAt: now });
          return { id: held._id };
        }
      }
      const audio = a.kind === "music" || a.kind === "voice";
      const shape = audio ? { w: 1, h: 1, audio: true } : aspectSize(a.aspect);
      const board = a.board ? { x: Math.round(a.board.x), y: Math.round(a.board.y), w: Math.round(a.board.w) } : a.place ? await placeOnBoard(ctx, a.campaignId, shape, a.nearId) : undefined;
      const id = await ctx.db.insert("mediaJobs", {
        campaignId: a.campaignId,
        ...(a.creativeId ? { creativeId: a.creativeId } : {}),
        ...(a.targetId ? { targetId: a.targetId.slice(0, 60) } : {}),
        kind: (a.kind ?? "video").slice(0, 20),
        model: (a.model ?? "").slice(0, 80),
        ...(a.prompt ? { prompt: a.prompt.slice(0, 2000) } : {}),
        status: status ?? "running",
        estimate: Math.max(0, a.estimate ?? 0),
        ...(board ? { board } : {}),
        ...(a.aspect ? { aspect: a.aspect.slice(0, 12) } : {}),
        ...(thread ? { thread } : {}),
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(a.campaignId, { status: "working", updatedAt: now });
      return { id };
    }
    const job = await ctx.db.get(a.jobId);
    if (!job || job.campaignId !== a.campaignId) throw new Error("Unknown job");
    if (a.drop) {
      if (isDesignJob(job.kind) && job.status !== "done") await ctx.db.delete(job._id);
      return { id: job._id };
    }
    const finishing = status === "done" && job.status !== "done";
    // A design spot can become the generation itself (an image made in a toolbar maker's spot): it takes the new kind and shape.
    const reshaped = a.aspect && job.board && a.aspect !== job.aspect ? { ...job.board, w: boardWidth(aspectSize(a.aspect).w, aspectSize(a.aspect).h) } : null;
    await ctx.db.patch(job._id, {
      ...(status ? { status } : {}),
      ...(a.cost !== undefined ? { cost: a.cost } : {}),
      ...(a.assetId ? { assetId: a.assetId } : {}),
      ...(a.error ? { error: a.error.slice(0, 500) } : {}),
      ...(a.kind ? { kind: a.kind.slice(0, 20) } : {}),
      ...(a.model !== undefined ? { model: a.model.slice(0, 80) } : {}),
      ...(a.prompt ? { prompt: a.prompt.slice(0, 2000) } : {}),
      ...(a.estimate !== undefined ? { estimate: Math.max(0, a.estimate) } : {}),
      ...(a.aspect ? { aspect: a.aspect.slice(0, 12) } : {}),
      ...(reshaped ? { board: reshaped } : {}),
      ...(thread && !job.thread ? { thread } : {}),
      updatedAt: now,
    });
    if (finishing) await ctx.db.patch(a.campaignId, { spend: Math.round((campaign.spend + (a.cost ?? job.estimate)) * 1000) / 1000, updatedAt: now });
    // A standalone generation's file takes the spot its placeholder held, and the conversation it was made in.
    if (finishing && a.assetId && (job.board || job.thread)) {
      const asset = await ctx.db.get(a.assetId);
      if (asset) await ctx.db.patch(a.assetId, { ...(job.board && !asset.board ? { board: reshaped ?? job.board } : {}), ...(job.thread ? { thread: job.thread } : {}) });
    }
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

export const appendItemChat = internalMutation({
  args: { id: v.id("mediaCampaigns"), itemId: v.string(), messages: v.array(v.any()) },
  returns: v.null(),
  handler: async (ctx, { id, itemId, messages }) => {
    if (!(await ctx.db.get(id))) throw new Error("Unknown campaign");
    const now = Date.now();
    const incoming = messages.map((m) => cleanMessage(m, now)).filter((m): m is NonNullable<ReturnType<typeof cleanMessage>> => m !== null);
    const key = itemId.slice(0, 60);
    const existing = await ctx.db.query("mediaItemChats").withIndex("by_item", (q) => q.eq("campaignId", id).eq("itemId", key)).unique();
    const merged = [...(existing?.messages ?? [])];
    for (const m of incoming) {
      const at = merged.findIndex((x) => x.id === m.id);
      if (at >= 0) merged[at] = m;
      else merged.push(m);
    }
    const kept = merged.slice(-80);
    if (existing) await ctx.db.patch(existing._id, { messages: kept, updatedAt: now });
    else await ctx.db.insert("mediaItemChats", { campaignId: id, itemId: key, messages: kept, updatedAt: now });
    return null;
  },
});

export const storageUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});
