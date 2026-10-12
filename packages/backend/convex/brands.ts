import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  clip,
  currentOwner,
  normalizeSiteUrl,
  requireOwner,
  safeColor,
  safeFont,
  safeImage,
} from "./pageUtil";
import { brandKitValidator, brandTasteValidator, spanValidator } from "./schema";

// A merchant's brand, read from their website by the agent
// (apps/agent/slice_agent/pages/brand.py): logo, colours, fonts and voice from
// the site, and Qloo's read of who the brand's audience is.

type Kit = NonNullable<Doc<"brands">["kit"]>;

/** Clamp everything the agent extracted before it can reach a page. */
function sanitizeKit(kit: Kit): Kit {
  return {
    name: clip(kit.name, 80) || "Untitled brand",
    tagline: clip(kit.tagline, 160),
    description: clip(kit.description, 600),
    vertical: clip(kit.vertical, 60),
    audience: clip(kit.audience, 300),
    offer: clip(kit.offer, 300),
    valueProps: kit.valueProps.map((s) => clip(s, 160)).filter(Boolean).slice(0, 6),
    voice: {
      tone: kit.voice.tone.map((s) => clip(s, 30)).filter(Boolean).slice(0, 5),
      summary: clip(kit.voice.summary, 300),
    },
    logo: safeImage(kit.logo),
    icon: safeImage(kit.icon),
    images: kit.images.map((s) => safeImage(s)).filter((s): s is string => !!s).slice(0, 12),
    colors: {
      primary: safeColor(kit.colors.primary, "#111827"),
      accent: safeColor(kit.colors.accent, "#ea580c"),
      background: safeColor(kit.colors.background, "#ffffff"),
      text: safeColor(kit.colors.text, "#111827"),
      palette: kit.colors.palette
        .map((c) => safeColor(c, ""))
        .filter(Boolean)
        .slice(0, 10),
    },
    fonts: { heading: safeFont(kit.fonts.heading), body: safeFont(kit.fonts.body) },
  };
}

export const create = mutation({
  args: { url: v.string() },
  returns: v.id("brands"),
  handler: async (ctx, { url }) => {
    const ownerId = await requireOwner(ctx);
    const site = normalizeSiteUrl(url);
    const now = Date.now();
    return ctx.db.insert("brands", {
      ownerId,
      url: site.toString(),
      domain: site.hostname.replace(/^www\./, ""),
      status: "extracting",
      progress: "Queued",
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentOwner(ctx);
    if (!ownerId) return [];
    return ctx.db
      .query("brands")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("brands") },
  handler: async (ctx, { id }) => {
    const ownerId = await currentOwner(ctx);
    const brand = await ctx.db.get(id);
    return brand && brand.ownerId === ownerId ? brand : null;
  },
});

/** Re-run extraction: the web app calls the agent right after. */
export const restart = mutation({
  args: { id: v.id("brands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const brand = await ctx.db.get(id);
    if (!brand || brand.ownerId !== ownerId) throw new ConvexError("Brand not found.");
    await ctx.db.patch(id, {
      status: "extracting",
      progress: "Queued",
      error: undefined,
      trace: [],
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** The merchant's corrections to what was extracted. */
export const updateKit = mutation({
  args: { id: v.id("brands"), kit: brandKitValidator },
  returns: v.null(),
  handler: async (ctx, { id, kit }) => {
    const ownerId = await requireOwner(ctx);
    const brand = await ctx.db.get(id);
    if (!brand || brand.ownerId !== ownerId) throw new ConvexError("Brand not found.");
    await ctx.db.patch(id, { kit: sanitizeKit(kit), updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("brands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const brand = await ctx.db.get(id);
    if (!brand || brand.ownerId !== ownerId) throw new ConvexError("Brand not found.");
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    if (pages.some((p) => p.brandId === id)) {
      throw new ConvexError("Delete this brand's pages first.");
    }
    await ctx.db.delete(id);
    return null;
  },
});

// --- Agent side (http.ts, behind QLOO_PROXY_SECRET) -------------------------

export const agentLoad = internalQuery({
  args: { id: v.id("brands") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const agentPatch = internalMutation({
  args: {
    id: v.id("brands"),
    status: v.optional(v.union(v.literal("extracting"), v.literal("ready"), v.literal("failed"))),
    progress: v.optional(v.string()),
    error: v.optional(v.string()),
    kit: v.optional(brandKitValidator),
    taste: v.optional(brandTasteValidator),
    trace: v.optional(v.array(spanValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, kit, error, progress, ...rest }) => {
    if (!(await ctx.db.get(id))) return null;
    await ctx.db.patch(id, {
      ...rest,
      ...(progress !== undefined ? { progress: clip(progress, 120) } : {}),
      ...(error !== undefined ? { error: clip(error, 300) } : {}),
      ...(kit ? { kit: sanitizeKit(kit) } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
