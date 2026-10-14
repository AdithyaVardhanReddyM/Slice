import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { WithoutSystemFields } from "convex/server";
import { uniqueSlug } from "./pagesBrands";

// Demo brands. A master is a brand flagged `demo` with no `demoOf`; every
// account that opens Pages gets its own copy of each master (brand, uploads,
// members, audiences, pages, versions, chats, builder memory; no analytics),
// so judges can edit freely without touching anyone else's. The account whose
// email is PAGES_DEMO_OWNER_EMAIL claims unowned masters instead of copying.

/** Old id → new id for one copy. */
type IdMap = Map<string, string>;

/** Replaces every string that is a copied document's old id, however deep (routing, chat steps, docs). */
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
async function copyBrand(ctx: MutationCtx, master: Doc<"pagesBrands">, owner: string) {
  const ids: IdMap = new Map();
  const now = Date.now();
  const brandId = await insertCopy(ctx, ids, "pagesBrands", master, {
    slug: await uniqueSlug(ctx, `${master.slug}-${suffix()}`),
    owner,
    demo: true,
    demoOf: master._id,
    updatedAt: now,
  });

  const uploads = await ctx.db.query("pagesUploads").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const audiences = await ctx.db.query("pagesAudiences").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const members = await ctx.db.query("pagesMembers").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();
  const pages = await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", master._id)).collect();

  // Uploads, audiences and members point at each other, and pages at their
  // default version: insert with those forward links cleared, patch them after.
  const copied: { uploads: [Doc<"pagesUploads">, Id<"pagesUploads">][]; audiences: [Doc<"pagesAudiences">, Id<"pagesAudiences">][]; pages: [Doc<"pages">, Id<"pages">][] } = {
    uploads: [],
    audiences: [],
    pages: [],
  };
  for (const u of uploads) {
    const clusters = u.clusters.map(({ audienceId: _a, ...c }) => c);
    copied.uploads.push([u, await insertCopy(ctx, ids, "pagesUploads", u, { clusters }, ["audienceId"])]);
  }
  for (const a of audiences) {
    const { memberId: _m, ...sources } = remap(ids, a.sources);
    copied.audiences.push([a, await insertCopy(ctx, ids, "pagesAudiences", a, { sources })]);
  }
  for (const m of members) await insertCopy(ctx, ids, "pagesMembers", m);
  for (const p of pages) copied.pages.push([p, await insertCopy(ctx, ids, "pages", p, {}, ["defaultVariantId"])]);
  for (const [p] of copied.pages) {
    for (const variant of await ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", p._id)).collect()) {
      await insertCopy(ctx, ids, "pagesVariants", variant);
    }
    for (const build of await ctx.db.query("pagesBuilds").withIndex("by_page", (q) => q.eq("pageId", p._id)).collect()) {
      await insertCopy(ctx, ids, "pagesBuilds", build);
    }
    for (const memory of await ctx.db.query("pagesMemory").withIndex("by_page", (q) => q.eq("pageId", p._id)).collect()) {
      await insertCopy(ctx, ids, "pagesMemory", memory);
    }
  }

  for (const [u, id] of copied.uploads) await ctx.db.patch(id, { audienceId: remap(ids, u.audienceId), clusters: remap(ids, u.clusters) });
  for (const [a, id] of copied.audiences) if (a.sources.memberId) await ctx.db.patch(id, { sources: remap(ids, a.sources) });
  for (const [p, id] of copied.pages) if (p.defaultVariantId) await ctx.db.patch(id, { defaultVariantId: remap(ids, p.defaultVariantId) });
  return brandId;
}

/**
 * Gives the signed-in merchant every demo brand they don't have yet. The
 * console calls it when Pages opens; it is a no-op once they have them all.
 * Returns how many brands were added or claimed.
 */
export const provision = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const masters = await ctx.db
      .query("pagesBrands")
      .withIndex("by_demo", (q) => q.eq("demo", true).eq("demoOf", undefined))
      .collect();
    if (!masters.length) return 0;
    const mine = await ctx.db
      .query("pagesBrands")
      .withIndex("by_owner", (q) => q.eq("owner", identity.subject))
      .collect();
    const have = new Set<string>(mine.map((b) => b.demoOf ?? b._id));
    const masterEmail = process.env.PAGES_DEMO_OWNER_EMAIL?.trim().toLowerCase();
    const isMasterOwner = !!masterEmail && identity.email?.toLowerCase() === masterEmail;
    let added = 0;
    // Oldest first, so the newest master is also the newest copy and the list keeps its order.
    for (const master of masters.sort((a, b) => a._creationTime - b._creationTime)) {
      if (have.has(master._id)) continue;
      if (!master.owner && isMasterOwner) await ctx.db.patch(master._id, { owner: identity.subject });
      else await copyBrand(ctx, master, identity.subject);
      added++;
    }
    return added;
  },
});

/** Makes brands demo masters (or plain brands again with `demo: false`). `npx convex run pagesDemo:setMasters '{"slugs":[…]}'`. */
export const setMasters = internalMutation({
  args: { slugs: v.array(v.string()), demo: v.optional(v.boolean()) },
  returns: v.array(v.string()),
  handler: async (ctx, { slugs, demo = true }) => {
    const out: string[] = [];
    for (const slug of slugs) {
      const brand = await ctx.db.query("pagesBrands").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (!brand) throw new Error(`Unknown brand ${slug}`);
      await ctx.db.patch(brand._id, { demo: demo || undefined, demoOf: undefined });
      out.push(`${slug}: ${demo ? "master" : "not a demo"}`);
    }
    return out;
  },
});
