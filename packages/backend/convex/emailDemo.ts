import { v } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { uniqueBrandSlug } from "./emailBrands";

// Demo email brands, the way pagesDemo.ts does Pages: a master is a brand
// flagged `demo` with no `demoOf`; every account that opens Email gets its
// own copy of each master (brand, items, lists, contacts, audiences,
// campaigns, chats, versions, and the sends of sent campaigns so reports
// read the same), so judges can edit freely. The account whose email is
// PAGES_DEMO_OWNER_EMAIL claims unowned masters instead of copying them.

/** Old id → new id for one copy. */
type IdMap = Map<string, string>;

/** Replaces every string that is a copied document's old id, however deep (docs' item ids, versions' block maps). */
function remap<T>(ids: IdMap, value: T): T {
  if (typeof value === "string") return (ids.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((x) => remap(ids, x)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, remap(ids, x)])) as T;
  }
  return value;
}

/** Inserts a copy of `row` with ids remapped, `override` applied and the `omit` fields left out. */
async function insertCopy<T extends TableNames>(
  ctx: MutationCtx,
  ids: IdMap,
  table: T,
  row: Doc<T>,
  override: Record<string, unknown> = {},
  omit: string[] = [],
): Promise<Id<T>> {
  const { _id, _creationTime: _c, ...fields } = row as Doc<T> & { _id: Id<T>; _creationTime: number };
  const value: Record<string, unknown> = { ...remap(ids, fields), ...override };
  for (const key of omit) delete value[key];
  const id = await ctx.db.insert(table, value as WithoutSystemFields<Doc<T>>);
  ids.set(_id, id);
  return id;
}

const suffix = () => Math.random().toString(36).slice(2, 6);

/** Copies a master and everything under it into `owner`'s account. */
async function copyBrand(ctx: MutationCtx, master: Doc<"emailBrands">, owner: string) {
  const ids: IdMap = new Map();
  const now = Date.now();
  const brandId = await insertCopy(ctx, ids, "emailBrands", master, {
    slug: await uniqueBrandSlug(ctx, `${master.slug}-${suffix()}`),
    owner,
    demo: true,
    demoOf: master._id,
    updatedAt: now,
  });
  const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const audiences = await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const contacts = await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();

  for (const i of items) await insertCopy(ctx, ids, "emailItems", i);
  // Lists point at their people audience and audiences at their list: insert
  // lists without the link, patch it after.
  const copiedLists: [Doc<"emailLists">, Id<"emailLists">][] = [];
  for (const l of lists) copiedLists.push([l, await insertCopy(ctx, ids, "emailLists", l, {}, ["audienceId"])]);
  for (const a of audiences) await insertCopy(ctx, ids, "emailAudiences", a);
  for (const c of contacts) await insertCopy(ctx, ids, "emailContacts", c);
  for (const c of campaigns) {
    // A copy never inherits a pending send; one caught mid-send is copied as a draft.
    const busy = c.status === "scheduled" || c.status === "sending";
    await insertCopy(ctx, ids, "emailCampaigns", c, busy ? { status: "draft" } : {}, busy ? ["sendJob", "scheduledAt", "sendingMode"] : ["sendJob"]);
  }
  for (const c of campaigns) {
    for (const chat of await ctx.db.query("emailChats").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
      await insertCopy(ctx, ids, "emailChats", chat);
    }
    for (const version of await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
      await insertCopy(ctx, ids, "emailVersions", version);
    }
    if (c.status !== "sent") continue;
    for (const send of await ctx.db.query("emailSends").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
      // Resend ids belong to the master's sends; webhooks must not find the copies.
      await insertCopy(ctx, ids, "emailSends", send, {}, ["resendId"]);
    }
  }
  for (const [l, id] of copiedLists) if (l.audienceId) await ctx.db.patch(id, { audienceId: remap(ids, l.audienceId) });
  return brandId;
}

/**
 * Gives the signed-in merchant every demo email brand they don't have yet.
 * The console calls it when Email opens; it is a no-op once they have them
 * all. Returns how many brands were added or claimed.
 */
export const provision = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const masters = await ctx.db
      .query("emailBrands")
      .withIndex("by_demo", (q) => q.eq("demo", true).eq("demoOf", undefined))
      .collect();
    if (!masters.length) return 0;
    const mine = await ctx.db
      .query("emailBrands")
      .withIndex("by_owner", (q) => q.eq("owner", identity.subject))
      .collect();
    const have = new Set<string>(mine.map((b) => b.demoOf ?? b._id));
    const masterEmail = process.env.PAGES_DEMO_OWNER_EMAIL?.trim().toLowerCase();
    const isMasterOwner = !!masterEmail && identity.email?.toLowerCase() === masterEmail;
    let added = 0;
    // Oldest first, so the newest master is also the newest copy.
    for (const master of masters.sort((a, b) => a._creationTime - b._creationTime)) {
      if (have.has(master._id)) continue;
      if (!master.owner && isMasterOwner) await ctx.db.patch(master._id, { owner: identity.subject });
      else await copyBrand(ctx, master, identity.subject);
      added++;
    }
    return added;
  },
});

/** Makes brands demo masters (or plain brands again with `demo: false`). `npx convex run emailDemo:setMasters '{"slugs":[…]}'`. */
export const setMasters = internalMutation({
  args: { slugs: v.array(v.string()), demo: v.optional(v.boolean()) },
  returns: v.array(v.string()),
  handler: async (ctx, { slugs, demo = true }) => {
    const out: string[] = [];
    for (const slug of slugs) {
      const brand = await ctx.db.query("emailBrands").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (!brand) throw new Error(`Unknown brand ${slug}`);
      await ctx.db.patch(brand._id, { demo: demo || undefined, demoOf: undefined });
      out.push(`${slug}: ${demo ? "master" : "not a demo"}`);
    }
    return out;
  },
});
