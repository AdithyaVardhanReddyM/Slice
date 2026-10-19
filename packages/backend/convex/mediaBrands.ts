import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { EmailAbout, EmailKit } from "./emailTypes";
import { DEFAULT_KIT, kitFromEmail, kitFromPages, safeUrl, type MediaAbout, type MediaKit, type MediaProduct } from "./mediaTypes";
import type { BrandBrief, BrandKit } from "./pagesTypes";

// Media brands: who the agent designs for. Each holds its guidelines (logo,
// colours, fonts, voice, imagery, what it does), its products and photos. A
// brand starts from a website (the agent reads it over /media/brand), from a
// Pages or Email brand (copied once), or by hand. Campaigns keep a copy of
// the kit the renderer reads; editing the brand refreshes those copies.

async function ownBrand(ctx: QueryCtx, id: Id<"mediaBrands">): Promise<Doc<"mediaBrands">> {
  const brand = await ctx.db.get(id);
  const identity = await ctx.auth.getUserIdentity();
  if (!brand || identity?.subject !== brand.owner) throw new Error("Unknown brand");
  return brand;
}

const MAX_PRODUCTS = 24;
const MAX_IMAGES = 24;

const cleanProducts = (raw: unknown): MediaProduct[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string")
    .slice(0, MAX_PRODUCTS)
    .map((p, i) => ({
      id: String(p.id ?? `p${i + 1}`).slice(0, 60),
      name: String(p.name).slice(0, 120),
      ...(safeUrl(p.image) ? { image: safeUrl(p.image) } : {}),
      ...(typeof p.price === "string" && p.price ? { price: p.price.slice(0, 40) } : {}),
      ...(safeUrl(p.url) ? { url: safeUrl(p.url) } : {}),
      ...(typeof p.description === "string" && p.description ? { description: p.description.slice(0, 300) } : {}),
    }));

const cleanImages = (raw: unknown): string[] => [...new Set((Array.isArray(raw) ? raw : []).map((x) => safeUrl(typeof x === "string" ? x : (x as { src?: unknown })?.src)).filter((x): x is string => !!x))].slice(0, MAX_IMAGES);

function cleanAbout(raw: unknown): MediaAbout | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 1200) : "";
  if (!summary) return undefined;
  return {
    summary,
    ...(typeof r.audience === "string" && r.audience.trim() ? { audience: r.audience.trim().slice(0, 400) } : {}),
    ...(Array.isArray(r.categories) ? { categories: r.categories.map(String).filter(Boolean).slice(0, 8) } : {}),
    ...(typeof r.location === "string" && r.location.trim() ? { location: r.location.trim().slice(0, 120) } : {}),
  };
}

/** The kit with the brand's own name and site on it. */
const named = (kit: MediaKit | undefined, name: string, url?: string): MediaKit => ({ ...(kit ?? DEFAULT_KIT(name)), name, ...(url ? { url } : {}) });

/** Campaigns that design for this brand get its new kit and products. */
async function refreshCampaigns(ctx: MutationCtx, brand: Doc<"mediaBrands">) {
  const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", brand.owner)).collect();
  for (const c of campaigns) if (c.brandId === brand._id) await ctx.db.patch(c._id, { kit: brand.kit, products: brand.products, updatedAt: Date.now() });
}

/* Reads ---------------------------------------------------------------------- */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db.query("mediaBrands").withIndex("by_owner", (q) => q.eq("owner", identity.subject)).collect();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const get = query({
  args: { id: v.id("mediaBrands") },
  handler: async (ctx, { id }) => {
    try {
      return await ownBrand(ctx, id);
    } catch {
      return null;
    }
  },
});

/* Writes --------------------------------------------------------------------- */

async function insertBrand(ctx: MutationCtx, owner: string, b: { name: string; url?: string; about?: MediaAbout; kit: MediaKit; products?: MediaProduct[]; images?: string[]; source: Doc<"mediaBrands">["source"]; status?: string; progress?: { value: number; label: string } }) {
  const now = Date.now();
  return ctx.db.insert("mediaBrands", {
    owner,
    name: b.name.trim().slice(0, 80) || "Untitled brand",
    ...(b.url ? { url: b.url } : {}),
    ...(b.about ? { about: b.about } : {}),
    kit: b.kit,
    products: b.products ?? [],
    images: b.images ?? [],
    source: b.source,
    status: b.status ?? "ready",
    ...(b.progress ? { progress: b.progress } : {}),
    createdAt: now,
    updatedAt: now,
  });
}

async function owner(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to add a brand");
  return identity.subject;
}

/** A brand set up by hand. */
export const create = mutation({
  args: { name: v.string(), url: v.optional(v.string()), about: v.optional(v.any()), kit: v.optional(v.any()), products: v.optional(v.array(v.any())), images: v.optional(v.array(v.string())) },
  returns: v.id("mediaBrands"),
  handler: async (ctx, a) => {
    const name = a.name.trim();
    if (!name) throw new Error("Name the brand");
    const url = safeUrl(a.url);
    return insertBrand(ctx, await owner(ctx), { name, url, about: cleanAbout(a.about), kit: named(a.kit as MediaKit | undefined, name, url), products: cleanProducts(a.products), images: cleanImages(a.images), source: { kind: "manual" } });
  },
});

/** A Media brand copied from one of the owner's Pages or Email brands. */
async function copyBrand(ctx: MutationCtx, me: string, from: { pagesBrandId?: Id<"pagesBrands">; emailBrandId?: Id<"emailBrands"> }): Promise<Id<"mediaBrands">> {
  if (from.pagesBrandId) {
    const pagesBrandId = from.pagesBrandId;
    const b = await ctx.db.get(pagesBrandId);
    if (!b || b.owner !== me) throw new Error("Unknown brand");
    const brief = b.brief as BrandBrief | undefined;
    return insertBrand(ctx, me, {
      name: b.name,
      url: safeUrl(b.url),
      about: cleanAbout(brief ? { summary: brief.summary, audience: brief.audience, categories: brief.categories, location: brief.locations?.[0] } : undefined),
      kit: kitFromPages(b.name, safeUrl(b.url), b.kit as BrandKit | undefined),
      products: cleanProducts(brief?.items),
      images: cleanImages(b.site?.images),
      source: { kind: "pages", pagesBrandId },
    });
  }
  if (from.emailBrandId) {
    const emailBrandId = from.emailBrandId;
    const b = await ctx.db.get(emailBrandId);
    if (!b || b.owner !== me) throw new Error("Unknown brand");
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", emailBrandId)).collect();
    items.sort((x, y) => x.order - y.order);
    return insertBrand(ctx, me, {
      name: b.name,
      url: safeUrl(b.url),
      about: cleanAbout(b.about as EmailAbout | undefined),
      kit: kitFromEmail(b.name, safeUrl(b.url), b.kit as EmailKit | undefined),
      products: cleanProducts(items.map((i) => ({ id: i._id, name: i.name, image: i.image, price: i.price, url: i.url, description: i.description }))),
      images: cleanImages(items.map((i) => i.image)),
      source: { kind: "email", emailBrandId },
    });
  }
  throw new Error("Pick a Pages or Email brand");
}

/** A copy of a Pages or Email brand: kit, what it does, its items and photos. */
export const importBrand = mutation({
  args: { pagesBrandId: v.optional(v.id("pagesBrands")), emailBrandId: v.optional(v.id("emailBrands")) },
  returns: v.id("mediaBrands"),
  handler: async (ctx, from) => copyBrand(ctx, await owner(ctx), from),
});

/** One-off (npx convex run mediaBrands:migrateCampaigns): campaigns made before Media had brands get one from where their kit came from. */
export const migrateCampaigns = internalMutation({
  args: {},
  returns: v.object({ brands: v.number(), campaigns: v.number() }),
  handler: async (ctx) => {
    let brands = 0;
    let campaigns = 0;
    const made = new Map<string, Id<"mediaBrands">>();
    for (const c of await ctx.db.query("mediaCampaigns").collect()) {
      if (c.brandId) continue;
      const key = `${c.owner}:${c.source.pagesBrandId ?? c.source.emailBrandId ?? (c.kit as MediaKit | undefined)?.name ?? c.name}`;
      let id = made.get(key);
      if (!id) {
        if (c.source.pagesBrandId || c.source.emailBrandId) id = await copyBrand(ctx, c.owner, { pagesBrandId: c.source.pagesBrandId, emailBrandId: c.source.emailBrandId }).catch(() => undefined);
        if (!id) {
          const kit = c.kit as MediaKit | undefined;
          id = await insertBrand(ctx, c.owner, { name: kit?.name ?? c.name, url: kit?.url, kit: named(kit, kit?.name ?? c.name, kit?.url), products: cleanProducts(c.products), source: { kind: "manual" } });
        }
        made.set(key, id);
        brands++;
      }
      const brand = (await ctx.db.get(id))!;
      // The campaign keeps its own kit (it may have been edited); new products come from the brand.
      await ctx.db.patch(c._id, { brandId: id, products: c.products.length ? c.products : brand.products });
      campaigns++;
    }
    return { brands, campaigns };
  },
});

/** A brand read from its website: made now in "reading", filled by the agent (/media/brand). */
export const startFromUrl = mutation({
  args: { url: v.string(), name: v.optional(v.string()) },
  returns: v.id("mediaBrands"),
  handler: async (ctx, { url, name }) => {
    const t = url.trim();
    const full = safeUrl(/^https?:\/\//i.test(t) ? t : `${/^(localhost|127\.|0\.0\.0\.0)/i.test(t) ? "http" : "https"}://${t}`);
    if (!full) throw new Error("Enter the brand's website");
    const host = new URL(full).hostname.replace(/^www\./, "");
    const guess = name?.trim() || host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
    return insertBrand(ctx, await owner(ctx), { name: guess, url: full, kit: named(undefined, guess, full), source: { kind: "url" }, status: "reading", progress: { value: 0.02, label: "Starting" } });
  },
});

export const update = mutation({
  args: {
    id: v.id("mediaBrands"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    about: v.optional(v.any()),
    kit: v.optional(v.any()),
    products: v.optional(v.array(v.any())),
    images: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...p }) => {
    const brand = await ownBrand(ctx, id);
    const name = p.name?.trim() || brand.name;
    const url = p.url !== undefined ? safeUrl(p.url) : brand.url;
    // Saved by hand, a brand is ready (even one whose website could not be read).
    const patch: Partial<Doc<"mediaBrands">> = { name, url, status: "ready", error: undefined, progress: undefined, updatedAt: Date.now() };
    if (p.about !== undefined) patch.about = cleanAbout(p.about);
    patch.kit = named((p.kit ?? brand.kit) as MediaKit, name, url);
    if (p.products) patch.products = cleanProducts(p.products);
    if (p.images) patch.images = cleanImages(p.images);
    await ctx.db.patch(id, patch);
    await refreshCampaigns(ctx, (await ctx.db.get(id))!);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("mediaBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await ownBrand(ctx, id);
    // Campaigns keep their copy of the kit; they just stop following the brand.
    const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", brand.owner)).collect();
    for (const c of campaigns) if (c.brandId === id) await ctx.db.patch(c._id, { brandId: undefined });
    await ctx.db.delete(id);
    return null;
  },
});

/** The public URL of a file the console just uploaded (a logo, a brand photo). */
export const fileUrl = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => {
    await owner(ctx);
    return ctx.storage.getUrl(storageId);
  },
});

/* Agent (via http.ts /media/brand) ---------------------------------------------- */

export const patchFromAgent = internalMutation({
  args: { id: v.id("mediaBrands"), patch: v.any() },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const brand = await ctx.db.get(id);
    if (!brand) throw new Error("Unknown brand");
    const p = (patch ?? {}) as Record<string, unknown>;
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 80) : brand.name;
    const url = safeUrl(p.url) ?? brand.url;
    const update: Partial<Doc<"mediaBrands">> = { name, url, updatedAt: Date.now() };
    if (p.about) update.about = cleanAbout(p.about);
    if (p.kit && typeof p.kit === "object") update.kit = named(p.kit as MediaKit, name, url);
    else if (name !== brand.name) update.kit = named(brand.kit as MediaKit, name, url);
    if (p.products) update.products = cleanProducts(p.products);
    if (p.images) update.images = cleanImages(p.images);
    if (typeof p.status === "string" && ["reading", "ready", "failed"].includes(p.status)) update.status = p.status;
    const prog = p.progress as { value?: unknown; label?: unknown } | undefined;
    if (prog && typeof prog.value === "number") update.progress = { value: Math.max(0, Math.min(1, prog.value)), label: String(prog.label ?? "").slice(0, 80) };
    if (typeof p.error === "string") update.error = p.error.slice(0, 400);
    await ctx.db.patch(id, update);
    if (update.status === "ready") await refreshCampaigns(ctx, (await ctx.db.get(id))!);
    return null;
  },
});
