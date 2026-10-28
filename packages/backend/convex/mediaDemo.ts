import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { WithoutSystemFields } from "convex/server";
import { deleteCampaign } from "./media";
import { uniqueSlug } from "./pagesBrands";

// Demo Media brands. A master is a brand flagged `demo` with no `demoOf`;
// every account that opens the console gets its own copy of each master with
// its campaigns (canvas, posters, videos and their versions, images, clips,
// chats, Why reports, pre-tests) and the hidden Pages brand that holds its
// audiences, so judges can edit freely without touching anyone else's.
// Files are not copied: a copy shows the master's, which is why demo
// campaigns never delete a file (media.ts).

/** One copied row: where it went, the master's fields to relink and what the copy sets itself (never relinked: `demoOf` names the master). */
type Copied = { id: Id<TableNames>; fields: Record<string, unknown>; override: Record<string, unknown> };

/**
 * Copies rows, then points them at each other. Rows go in as they are (still
 * linked to the master's rows, which the validators accept), and `relink`
 * rewrites every old id in them, however deep and also inside longer strings
 * (a "creative:…" node, a thread), once the whole brand has been copied.
 */
class Copier {
  private ids = new Map<string, string>();
  private rows: Copied[] = [];
  constructor(private ctx: MutationCtx) {}

  async insert<T extends TableNames>(table: T, row: Doc<T>, override: Record<string, unknown> = {}, omit: string[] = []) {
    const { _id, _creationTime: _c, ...rest } = row as Doc<T> & { _id: Id<T>; _creationTime: number };
    const fields: Record<string, unknown> = rest;
    for (const key of omit) delete fields[key];
    const id = await this.ctx.db.insert(table, { ...fields, ...override } as WithoutSystemFields<Doc<T>>);
    this.ids.set(_id, id);
    this.rows.push({ id, fields, override });
    return id;
  }

  async relink() {
    // Convex ids are lowercase letters and digits, so they need no escaping.
    const pattern = new RegExp([...this.ids.keys()].join("|"), "g");
    const swap = (s: string) => s.replace(pattern, (old) => this.ids.get(old) ?? old);
    const remap = (value: unknown): unknown => {
      if (typeof value === "string") return swap(value);
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [swap(k), remap(x)]));
      return value;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of this.rows) await this.ctx.db.replace(row.id, { ...(remap(row.fields) as object), ...row.override } as any);
  }
}

const suffix = () => Math.random().toString(36).slice(2, 6);

/** Every campaign that designs for `brand`. */
async function campaignsOf(ctx: MutationCtx, brand: Doc<"mediaBrands">) {
  const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", brand.owner)).collect();
  return campaigns.filter((c) => c.brandId === brand._id);
}

/** Copies a master, its audiences' home and its campaigns into `owner`'s account. */
async function copyBrand(ctx: MutationCtx, master: Doc<"mediaBrands">, owner: string) {
  const copy = new Copier(ctx);

  const home = master.audienceBrandId ? await ctx.db.get(master.audienceBrandId) : null;
  if (home) {
    await copy.insert("pagesBrands", home, { slug: await uniqueSlug(ctx, `${home.slug}-${suffix()}`), owner }, ["demo", "demoOf"]);
    for (const u of await ctx.db.query("pagesUploads").withIndex("by_brand", (q) => q.eq("brandId", home._id)).collect()) await copy.insert("pagesUploads", u);
    for (const a of await ctx.db.query("pagesAudiences").withIndex("by_brand", (q) => q.eq("brandId", home._id)).collect()) await copy.insert("pagesAudiences", a);
    for (const m of await ctx.db.query("pagesMembers").withIndex("by_brand", (q) => q.eq("brandId", home._id)).collect()) await copy.insert("pagesMembers", m);
  }

  await copy.insert("mediaBrands", master, { owner, demo: true, demoOf: master._id });

  for (const c of await campaignsOf(ctx, master)) {
    // A campaign the master's owner added after setMasters shares its files from now on too.
    if (!c.demo) await ctx.db.patch(c._id, { demo: true });
    await copy.insert("mediaCampaigns", c, { owner, demo: true });
    const creatives = await ctx.db.query("mediaCreatives").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect();
    for (const x of creatives) {
      await copy.insert("mediaCreatives", x);
      for (const version of await ctx.db.query("mediaVersions").withIndex("by_creative", (q) => q.eq("creativeId", x._id)).collect()) {
        await copy.insert("mediaVersions", version);
      }
    }
    for (const a of await ctx.db.query("mediaAssets").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) await copy.insert("mediaAssets", a);
    // Only finished jobs: one still running would never finish in the copy.
    for (const j of await ctx.db.query("mediaJobs").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
      if (j.status === "done") await copy.insert("mediaJobs", j);
    }
    for (const s of await ctx.db.query("mediaShapes").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) await copy.insert("mediaShapes", s);
    for (const chat of await ctx.db.query("mediaChats").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) await copy.insert("mediaChats", chat);
    for (const chat of await ctx.db.query("mediaItemChats").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) await copy.insert("mediaItemChats", chat);
    for (const i of await ctx.db.query("mediaInsights").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) await copy.insert("mediaInsights", i);
  }

  await copy.relink();
}

/**
 * Gives the signed-in merchant every demo Media brand they don't have yet,
 * with its campaigns. The console home calls it; it is a no-op once they
 * have them all. Returns how many brands were added.
 */
export const provision = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const masters = await ctx.db
      .query("mediaBrands")
      .withIndex("by_demo", (q) => q.eq("demo", true).eq("demoOf", undefined))
      .collect();
    if (!masters.length) return 0;
    const mine = await ctx.db
      .query("mediaBrands")
      .withIndex("by_owner", (q) => q.eq("owner", identity.subject))
      .collect();
    const have = new Set<string>(mine.map((b) => b.demoOf ?? b._id));
    let added = 0;
    for (const master of masters.sort((a, b) => a._creationTime - b._creationTime)) {
      if (have.has(master._id)) continue;
      await copyBrand(ctx, master, identity.subject);
      added++;
    }
    return added;
  },
});

/** Makes brands demo masters, with their campaigns (or plain again with `demo: false`). `npx convex run mediaDemo:setMasters '{"ids":[…]}'`. */
export const setMasters = internalMutation({
  args: { ids: v.array(v.id("mediaBrands")), demo: v.optional(v.boolean()) },
  returns: v.array(v.string()),
  handler: async (ctx, { ids, demo = true }) => {
    const out: string[] = [];
    for (const id of ids) {
      const brand = await ctx.db.get(id);
      if (!brand) throw new Error(`Unknown brand ${id}`);
      await ctx.db.patch(id, { demo: demo || undefined, demoOf: undefined });
      const campaigns = await campaignsOf(ctx, brand);
      for (const c of campaigns) await ctx.db.patch(c._id, { demo: demo || undefined });
      out.push(`${brand.name}: ${demo ? "master" : "not a demo"}, ${campaigns.length} campaigns`);
    }
    return out;
  },
});

/** Removes an account's Media brands, campaigns and audiences (a test account's demo copies, say). Refuses the masters' owner. `npx convex run mediaDemo:purgeOwner '{"owner":"…"}'`. */
export const purgeOwner = internalMutation({
  args: { owner: v.string() },
  returns: v.object({ brands: v.number(), campaigns: v.number() }),
  handler: async (ctx, { owner }) => {
    const brands = await ctx.db.query("mediaBrands").withIndex("by_owner", (q) => q.eq("owner", owner)).collect();
    if (brands.some((b) => b.demo && !b.demoOf)) throw new Error("This account owns the demo masters");
    const campaigns = await ctx.db.query("mediaCampaigns").withIndex("by_owner", (q) => q.eq("owner", owner)).collect();
    for (const c of campaigns) await deleteCampaign(ctx, c);
    for (const b of brands) {
      if (b.audienceBrandId) await ctx.scheduler.runAfter(0, internal.pagesBrands.purgeChunk, { brandId: b.audienceBrandId, pageIds: [], reschedule: true });
      await ctx.db.delete(b._id);
    }
    return { brands: brands.length, campaigns: campaigns.length };
  },
});
