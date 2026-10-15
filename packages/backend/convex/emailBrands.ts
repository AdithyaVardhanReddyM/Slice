import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { SendingMode } from "./emailTypes";
import { emailSenderValidator, sendingModeValidator } from "./schema";
import { slugify } from "./pagesUtil";

// An Email client is a brand of its own (independent of Pages): its kit,
// what it does, its footer details, who sends and from which domain. The
// setup agent fills it over HTTP (/email/brand); the console edits it here.

/** The brand, for a console mutation: unknown and other merchants' brands look the same. */
export async function editableBrand(ctx: QueryCtx, id: Id<"emailBrands">): Promise<Doc<"emailBrands">> {
  const brand = await ctx.db.get(id);
  if (!brand) throw new Error("Unknown brand");
  // Brands made by scripts have no owner and stay editable from scripts.
  if (brand.owner) {
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject !== brand.owner) throw new Error("Unknown brand");
  }
  return brand;
}

/** The signed-in merchant's brands, newest first, with how many campaigns and contacts each has. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const brands = await ctx.db
      .query("emailBrands")
      .withIndex("by_owner", (q) => q.eq("owner", identity.subject))
      .order("desc")
      .collect();
    return Promise.all(
      brands.map(async (b) => {
        const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", b._id)).collect();
        const contacts = await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", b._id)).collect();
        return { ...b, counts: { campaigns: campaigns.length, contacts: contacts.length } };
      }),
    );
  },
});

/** The console's lookup by slug, for the brand's owner only. */
export const mineBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const brand = await ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return brand && brand.owner === identity.subject ? brand : null;
  },
});

export const get = query({
  args: { id: v.id("emailBrands") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("emailBrands") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const bySlugInternal = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) =>
    ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

export async function uniqueBrandSlug(ctx: MutationCtx, base: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

/** "https://www.folio-and-fern.com/shop" → "folio-and-fern.com". */
export function hostOf(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    return u.hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** A readable placeholder from a URL: "stackhouse-books.com" → "Stackhouse Books". */
function nameFromUrl(url: string): string {
  const host = hostOf(url) ?? url;
  const label = host.split(".")[0] ?? host;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "New brand";
}

/** A brand from a URL (setup reads its homepage next) or from a name (set up by hand). */
export const create = mutation({
  args: { url: v.optional(v.string()), name: v.optional(v.string()) },
  returns: v.object({ id: v.id("emailBrands"), slug: v.string() }),
  handler: async (ctx, { url, name }) => {
    const cleanUrl = url?.trim() || undefined;
    const given = name?.trim();
    if (!cleanUrl && !given) throw new Error("Give the brand a website or a name");
    const display = given || nameFromUrl(cleanUrl!);
    const now = Date.now();
    const owner = (await ctx.auth.getUserIdentity())?.subject;
    const slug = await uniqueBrandSlug(ctx, slugify(display));
    const id = await ctx.db.insert("emailBrands", {
      slug,
      name: display,
      ...(given ? {} : { nameFromSite: true }),
      ...(cleanUrl ? { url: cleanUrl } : {}),
      status: "setup",
      // The console starts the homepage read right after; its card follows from here.
      ...(cleanUrl ? { setup: { status: "reading" as const, progress: { value: 0, label: "Starting" }, at: now } } : {}),
      ...(owner ? { owner } : {}),
      createdAt: now,
      updatedAt: now,
    });
    return { id, slug };
  },
});

export const update = mutation({
  args: {
    id: v.id("emailBrands"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    kit: v.optional(v.any()),
    about: v.optional(v.any()),
    footer: v.optional(v.any()),
    sender: v.optional(emailSenderValidator),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, url, kit, about, footer, sender }) => {
    await editableBrand(ctx, id);
    const update: Partial<Doc<"emailBrands">> = { updatedAt: Date.now() };
    if (name?.trim()) {
      update.name = name.trim();
      update.nameFromSite = undefined;
    }
    if (url !== undefined) update.url = url.trim() || undefined;
    if (kit !== undefined) update.kit = kit;
    if (about !== undefined) update.about = about;
    if (footer !== undefined) update.footer = footer;
    if (sender !== undefined) update.sender = cleanSender(sender);
    await ctx.db.patch(id, update);
    return null;
  },
});

/** The merchant accepted the kit in the review step (or finished setting it up by hand). */
export const markReady = mutation({
  args: { id: v.id("emailBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await editableBrand(ctx, id);
    await ctx.db.patch(id, {
      status: "ready",
      // A read still in flight when the merchant moves on is over as far as the console is concerned.
      ...(brand.setup?.status === "reading" ? { setup: { ...brand.setup, status: "done" as const, at: Date.now() } } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

function cleanSender(input: unknown): Doc<"emailBrands">["sender"] {
  const s = (input ?? {}) as Record<string, unknown>;
  const fromName = typeof s.fromName === "string" ? s.fromName.trim() : "";
  // The local part of an address: letters, digits, dots, dashes, plus and underscores.
  const fromLocal = typeof s.fromLocal === "string" ? s.fromLocal.trim().toLowerCase().replace(/[^a-z0-9._+-]/g, "") : "";
  const replyTo = typeof s.replyTo === "string" && /\S+@\S+\.\S+/.test(s.replyTo) ? s.replyTo.trim() : undefined;
  return { fromName: fromName.slice(0, 80), fromLocal: (fromLocal || "hello").slice(0, 64), ...(replyTo ? { replyTo } : {}) };
}

/**
 * Partial update from the setup agent (HTTP /email/brand). The name is applied
 * only while the current one is a placeholder; `setup` merges into the
 * current read's state.
 */
export const patch = internalMutation({
  args: {
    id: v.id("emailBrands"),
    patch: v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
      kit: v.optional(v.any()),
      about: v.optional(v.any()),
      footer: v.optional(v.any()),
      sender: v.optional(v.any()),
      setup: v.optional(v.any()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const brand = await ctx.db.get(id);
    if (!brand) throw new Error("Unknown brand");
    const now = Date.now();
    const update: Partial<Doc<"emailBrands">> = { updatedAt: now };
    if (patch.kit !== undefined) update.kit = patch.kit;
    if (patch.about !== undefined) update.about = patch.about;
    if (patch.footer !== undefined) update.footer = patch.footer;
    if (patch.url?.trim()) update.url = patch.url.trim();
    if (patch.sender !== undefined) update.sender = cleanSender(patch.sender);
    if (patch.name?.trim() && brand.nameFromSite) {
      update.name = patch.name.trim();
      update.nameFromSite = undefined;
    }
    if (patch.setup && typeof patch.setup === "object") {
      const s = patch.setup as Record<string, unknown>;
      const status = s.status === "done" || s.status === "failed" || s.status === "reading" ? s.status : (brand.setup?.status ?? "reading");
      const p = s.progress as { value?: unknown; label?: unknown } | undefined;
      const progress =
        p && typeof p.value === "number" && typeof p.label === "string" ? { value: Math.max(0, Math.min(1, p.value)), label: p.label } : brand.setup?.progress;
      const error = typeof s.error === "string" ? s.error.slice(0, 500) : status === "failed" ? brand.setup?.error : undefined;
      update.setup = { status, ...(progress ? { progress } : {}), ...(error ? { error } : {}), at: now };
    }
    await ctx.db.patch(id, update);
    return null;
  },
});

/* Sending ------------------------------------------------------------------- */

/** `"Stackhouse Books" <hello@stackhousebooks.com>`; quoted when the name has characters an address header can't carry bare. */
export function formatFrom(name: string, address: string): string {
  const clean = name.replace(/["\r\n<>]/g, "").trim();
  if (!clean) return address;
  return /[^A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]/.test(clean) ? `"${clean}" <${address}>` : `${clean} <${address}>`;
}

export const RESEND_MISSING = "Resend isn't configured yet: add RESEND_API_KEY to the Convex environment";

/**
 * How a brand sends. Demo brands simulate; a verified domain sends as the
 * brand; the platform's shared domain when one is configured; otherwise
 * nothing goes out but test emails from Resend's sandbox address.
 */
export function sendingInfoFor(brand: Doc<"emailBrands">): { mode: SendingMode; from: string; reason?: string } {
  const fromName = brand.sender?.fromName?.trim() || brand.name;
  const local = brand.sender?.fromLocal?.trim() || "hello";
  if (brand.demo) {
    // A demo site often runs on localhost; the reply-to inbox names the brand's real-looking domain.
    const site = hostOf(brand.url);
    const replyDomain = brand.sender?.replyTo?.split("@")[1]?.trim().toLowerCase();
    const host = brand.domain?.name ?? replyDomain ?? (site && !/(^|\.)localhost$|^127\.|^\[?::1/.test(site) ? site : undefined) ?? `${brand.slug}.example.com`;
    return { mode: "demo", from: formatFrom(fromName, `${local}@${host}`), reason: "A demo brand: sends are simulated and nothing leaves Slice." };
  }
  const sandbox = formatFrom(fromName, "onboarding@resend.dev");
  if (!process.env.RESEND_API_KEY) return { mode: "none", from: sandbox, reason: RESEND_MISSING };
  if (brand.domain?.status === "verified") return { mode: "domain", from: formatFrom(fromName, `${local}@${brand.domain.name}`) };
  const shared = process.env.EMAIL_SHARED_DOMAIN?.trim();
  if (shared) return { mode: "shared", from: formatFrom(fromName, `${brand.slug}@${shared}`) };
  return {
    mode: "none",
    from: sandbox,
    reason: brand.domain
      ? `${brand.domain.name} isn't verified yet. Add the DNS records, then verify it. Until then test emails go from onboarding@resend.dev, which Resend delivers only to the address that owns the Resend account.`
      : "Connect your domain to send campaigns. Until then test emails go from onboarding@resend.dev, which Resend delivers only to the address that owns the Resend account.",
  };
}

export const sendingInfo = query({
  args: { id: v.id("emailBrands") },
  returns: v.object({ mode: sendingModeValidator, from: v.string(), reason: v.optional(v.string()) }),
  handler: async (ctx, { id }) => {
    const brand = await ctx.db.get(id);
    if (!brand) throw new Error("Unknown brand");
    return sendingInfoFor(brand);
  },
});

/* Files ------------------------------------------------------------------------ */

/** A Convex storage upload URL, for logos, images and chat attachments. POST the file, then read `fileUrl`. */
export const uploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in to upload files");
    return ctx.storage.generateUploadUrl();
  },
});

export const fileUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});

/* Cascade delete ------------------------------------------------------------- */

const PURGE_BATCH = 1000;

type Row = { _id: Id<any> };

/**
 * Deletes a slice of everything under a brand and reports whether more
 * remain (one read budget per call, as in pagesBrands.purgeChunk). Children
 * go before their parents, campaigns after their sends, versions and chats,
 * the brand last. `remove` schedules it until done; seeds and tests can call
 * it with `reschedule: true` to purge a brand, demo or not.
 */
export const purgeChunk = internalMutation({
  args: { brandId: v.id("emailBrands"), reschedule: v.boolean() },
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx, { brandId, reschedule }) => {
    const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const sources: ((n: number) => Promise<Row[]>)[] = [
      ...campaigns.flatMap((c) => [
        (n: number) => ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).take(n),
        (n: number) => ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).take(n),
        (n: number) => ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).take(n),
      ]),
      (n) => ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
      (n) => ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).take(n),
    ];
    for (const c of campaigns) {
      // A pending send would otherwise wake up for a campaign that is gone (it would then do nothing).
      if (c.sendJob && (c.status === "scheduled" || c.status === "sending")) {
        const job = await ctx.db.system.get(c.sendJob);
        if (job?.state.kind === "pending") await ctx.scheduler.cancel(c.sendJob);
      }
    }
    let budget = PURGE_BATCH - campaigns.length;
    for (const source of sources) {
      if (budget <= 0) break;
      const docs = await source(budget);
      for (const d of docs) await ctx.db.delete(d._id);
      budget -= docs.length;
    }
    const more = budget <= 0;
    if (!more && (await ctx.db.get(brandId))) await ctx.db.delete(brandId);
    if (more && reschedule) await ctx.scheduler.runAfter(0, internal.emailBrands.purgeChunk, { brandId, reschedule: true });
    return { deleted: PURGE_BATCH - campaigns.length - Math.max(0, budget), more };
  },
});

/** Removes the brand and everything under it. The brand goes at once; the rest in scheduled batches. */
export const remove = mutation({
  args: { id: v.id("emailBrands") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const brand = await ctx.db.get(id);
    if (!brand) return null;
    if (brand.demo) throw new Error("Demo brands can't be deleted");
    await editableBrand(ctx, id);
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.emailBrands.purgeChunk, { brandId: id, reschedule: true });
    return null;
  },
});
