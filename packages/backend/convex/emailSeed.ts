import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { ContactLite } from "./emailContacts";
import { andList } from "./emailItems";
import {
  FOLIO_ABOUT,
  FOLIO_CONTACT_COLUMNS,
  FOLIO_INDIVIDUALS,
  FOLIO_LIST_MAPPING,
  FOLIO_SENDER,
  FOLIO_SITE,
  FOLIO_SUBSCRIBERS,
  FOLIO_SUBSCRIBER_GROUPS,
  folioFooter,
  folioItems,
  folioKit,
  type FolioContact,
} from "./emailDemoData";
import { cachedQlooGet } from "./qloo";
import type { AudienceProfile, EmailKit } from "./emailTypes";

// Seeds Stackhouse Books, the Email service's demo brand (data in emailDemoData.ts),
// as a demo master: the brand and its kit, the catalog matched to Qloo, three
// regulars kept as individual contacts, and seven customers sorted into two
// taste groups (five by what they bought, two prospects by age, gender and
// city through Qloo), read through the same pipeline a merchant's CSV goes
// through. No campaigns: the merchant writes those.
//
//   npx convex run emailSeed:run                                  # local site
//   npx convex run emailSeed:run '{"site":"https://…/stackhouse"}'     # deployed site
//   npx convex run emailSeed:status                               # what exists, and how far it got
//
// `run` replaces any earlier Stackhouse Books master (and the account copies made
// from it), creates the brand, items and uploads, and starts reading the
// regulars; `step` then follows the uploads in scheduled steps (the regulars
// first, then the customers, one at a time because Qloo rate-limits bursts)
// and calls `finish`, which names the two groups and writes their briefs.

const SLUG = "stackhouse-books";
/** How long `step` keeps waiting for the lists (polls every 15 s). */
const MAX_STEPS = 60;

/* Brand ------------------------------------------------------------------------------ */

export const existing = internalQuery({
  args: {},
  handler: async (ctx) => {
    const master = await ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", SLUG))
      .unique();
    if (!master) return null;
    const copies = await ctx.db
      .query("emailBrands")
      .withIndex("by_demo", (q) => q.eq("demo", true).eq("demoOf", master._id))
      .collect();
    return { master, copies: copies.map((c) => c._id) };
  },
});

export const insertBrand = internalMutation({
  args: { site: v.string(), kit: v.any() },
  returns: v.id("emailBrands"),
  handler: async (ctx, { site, kit }) => {
    const now = Date.now();
    return ctx.db.insert("emailBrands", {
      slug: SLUG,
      name: "Stackhouse Books",
      url: site,
      status: "ready",
      setup: { status: "done", progress: { value: 1, label: "Ready" }, at: now },
      kit,
      about: FOLIO_ABOUT,
      footer: folioFooter(site),
      sender: FOLIO_SENDER,
      // A master: no owner, no demoOf. emailDemo.provision copies it into each account.
      demo: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Uploads the logo and the square mark to Convex storage, so emails load them wherever the site runs. */
async function storeAssets(ctx: ActionCtx, site: string): Promise<EmailKit> {
  const store = async (b64: string) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const id = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
    return (await ctx.storage.getUrl(id))!;
  };
  const kit = folioKit(site);
  return { ...kit, logo: { ...kit.logo!, src: await store(LOGO_PNG), light: await store(LOGO_LIGHT_PNG) }, icon: await store(MARK_PNG) };
}

/** The storage files an earlier seed uploaded (their ids end the URLs). */
export async function dropAssets(ctx: ActionCtx, kit: EmailKit | undefined) {
  for (const url of [kit?.logo?.src, kit?.logo?.light, kit?.icon]) {
    const id = url?.match(/\/api\/storage\/([^/?#]+)/)?.[1];
    if (!id) continue;
    try {
      await ctx.storage.delete(id as Id<"_storage">);
    } catch {
      // Already gone, or not ours.
    }
  }
}

/** Deletes a brand and everything under it, a chunk at a time. */
export async function purge(ctx: ActionCtx, brandId: Id<"emailBrands">) {
  for (let i = 0; i < 200; i++) {
    const { more } = await ctx.runMutation(internal.emailBrands.purgeChunk, { brandId, reschedule: false });
    if (!more) return;
  }
  throw new Error("Purging the old brand took too many passes");
}

/* Catalog matches ------------------------------------------------------------------------ */

/**
 * Titles Qloo files under their full name: a plain title search for these
 * finds a different book first.
 */
const FULL_TITLES: Record<string, string> = {
  "How to Do Nothing": "How to Do Nothing: Resisting the Attention Economy",
};

/** "The Dispossessed: An Ambiguous Utopia" is The Dispossessed; "Orbital Decay (Near Space, #1)" isn't Orbital. */
function sameBook(title: string, found: string): boolean {
  const bare = (x: string) => x.toLowerCase().replace(/&amp;/g, "&").replace(/^(the|a|an) /, "").trim();
  const t = bare(title);
  const f = bare(found);
  return f === t || f.startsWith(`${t}:`) || f.startsWith(`${t} (`);
}

export const clearQloo = internalMutation({
  args: { ids: v.array(v.id("emailItems")) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.patch(id, { qloo: undefined });
    return null;
  },
});

type Hit = { entity_id?: string; id?: string; name?: string; types?: string[]; tags?: { name?: string }[] };

/**
 * `emailItems.resolve` matches books by title alone, and a few of ours share a
 * title's first words with a better-known book ("Orbital Decay", "Bee Sting
 * Cake"). Drops those matches, retries the ones Qloo knows by a fuller title,
 * and leaves the rest unmatched (their tags still rank them).
 */
export const fixMatches = internalAction({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }): Promise<{ cleared: string[]; rematched: string[]; matched: string }> => {
    const items: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
    const books = items.filter((i) => i.kind === "book");
    const wrong = books.filter((i) => i.qloo && !sameBook(i.name, i.qloo.name));
    if (wrong.length) await ctx.runMutation(internal.emailSeed.clearQloo, { ids: wrong.map((i) => i._id) });
    const rematched: string[] = [];
    const updates: { id: Id<"emailItems">; qloo: { id: string; name: string; type: string; tags: string[] } }[] = [];
    for (const item of books.filter((i) => (!i.qloo || wrong.includes(i)) && FULL_TITLES[i.name])) {
      const { body } = await cachedQlooGet(ctx, "/search", { query: FULL_TITLES[item.name], types: "urn:entity:book" });
      const hit = ((JSON.parse(body) as { results?: Hit[] }).results ?? []).find((h) => sameBook(item.name, String(h.name ?? "")));
      if (!hit) continue;
      const tags = [...new Set((hit.tags ?? []).map((t) => String(t.name ?? "").trim()).filter((n) => n && !/^(null|none|n\/a)$/i.test(n)))].slice(0, 30);
      updates.push({ id: item._id, qloo: { id: String(hit.entity_id ?? hit.id), name: String(hit.name), type: hit.types?.[0] ?? "urn:entity:book", tags } });
      rematched.push(`${item.name} → ${hit.name}`);
    }
    if (updates.length) await ctx.runMutation(internal.emailItems.setQloo, { updates });
    const after: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
    const matched = after.filter((i) => i.kind === "book" && i.qloo).length;
    return { cleared: wrong.map((i) => `${i.name} ≠ ${i.qloo!.name}`), rematched, matched: `${matched} of ${books.length} books` };
  },
});

/* Run ------------------------------------------------------------------------------- */

const rowsOf = (people: FolioContact[]) => people.map((p) => Object.fromEntries(FOLIO_CONTACT_COLUMNS.map((k) => [k, String(p[k])])));

/**
 * Replaces Stackhouse Books with a fresh master and starts reading its lists.
 * Returns once the book club's reading is under way; `step` does the rest.
 */
export const run = internalAction({
  args: { site: v.optional(v.string()) },
  handler: async (ctx, { site = FOLIO_SITE }): Promise<Record<string, unknown>> => {
    const t0 = Date.now();
    const old = await ctx.runQuery(internal.emailSeed.existing, {});
    if (old) {
      // Account copies point at the old master's files and ids; they go with it.
      for (const id of old.copies) await purge(ctx, id);
      await dropAssets(ctx, old.master.kit as EmailKit | undefined);
      await dropCovers(ctx, old.master._id);
      await purge(ctx, old.master._id);
    }

    const kit = await storeAssets(ctx, site.replace(/\/$/, ""));
    const brandId = await ctx.runMutation(internal.emailSeed.insertBrand, { site: site.replace(/\/$/, ""), kit });

    // The catalog in shop order, then each item matched to Qloo (books as books).
    const items = folioItems(site.replace(/\/$/, ""));
    await ctx.runMutation(internal.emailItems.append, { brandId, items });
    const matched = await ctx.runAction(api.emailItems.resolve, { brandId });
    const fixed = await ctx.runAction(internal.emailSeed.fixMatches, { brandId });

    const columns = FOLIO_CONTACT_COLUMNS.map(String);
    const club = await ctx.runMutation(api.emailLists.create, {
      brandId,
      name: "Regulars",
      filename: "regulars.csv",
      columns,
      mapping: FOLIO_LIST_MAPPING,
      mode: "people",
      rows: rowsOf(FOLIO_INDIVIDUALS),
      source: "demo",
    });
    const subscribers = await ctx.runMutation(api.emailLists.create, {
      brandId,
      name: "Customers",
      filename: "customers.csv",
      columns,
      mapping: FOLIO_LIST_MAPPING,
      mode: "groups",
      rows: rowsOf(FOLIO_SUBSCRIBERS),
      source: "demo",
    });

    // Reads the regulars' purchases now and schedules each person's profile.
    const read = await ctx.runAction(api.emailLists.process, { id: club.id });
    await ctx.scheduler.runAfter(15_000, internal.emailSeed.step, { brandId, site, clubId: club.id, subscribersId: subscribers.id, stage: "club", attempt: 0, startedAt: t0 });
    return {
      brandId,
      items: items.length,
      qlooMatched: `${matched.resolved} of ${matched.total} items by resolve; books after checking titles: ${fixed.matched}`,
      qlooCleared: fixed.cleared,
      qlooRematched: fixed.rematched,
      clubList: club.id,
      subscribersList: subscribers.id,
      regulars: `${read.resolved} of ${FOLIO_INDIVIDUALS.length} people matched, ${read.unique} entities from what they bought`,
      seconds: Math.round((Date.now() - t0) / 1000),
      next: "step follows the lists every 15 s; check with emailSeed:status",
    };
  },
});

/**
 * Waits for the book club to be read, then clusters the subscribers into four
 * groups (k = 4: the four tastes they were written with), then finishes.
 */
export const step = internalAction({
  args: {
    brandId: v.id("emailBrands"),
    site: v.string(),
    clubId: v.id("emailLists"),
    subscribersId: v.id("emailLists"),
    stage: v.union(v.literal("club"), v.literal("subscribers")),
    attempt: v.number(),
    startedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { brandId, clubId, subscribersId, stage, attempt, startedAt } = args;
    const again = () => ctx.scheduler.runAfter(15_000, internal.emailSeed.step, { ...args, attempt: attempt + 1 });
    if (attempt > MAX_STEPS) {
      console.error(`emailSeed: gave up waiting at stage ${stage}`);
      return null;
    }
    if (stage === "club") {
      const club: Doc<"emailLists"> | null = await ctx.runQuery(internal.emailLists.getInternal, { id: clubId });
      if (!club) return null;
      if (club.status !== "ready" && club.status !== "failed") {
        await again();
        return null;
      }
      console.log(`emailSeed: regulars ${club.status} after ${Math.round((Date.now() - startedAt) / 1000)} s`);
      await ctx.scheduler.runAfter(0, api.emailLists.process, { id: subscribersId, k: 2 });
      await ctx.scheduler.runAfter(30_000, internal.emailSeed.step, { ...args, stage: "subscribers", attempt: 0 });
      return null;
    }
    const subs: Doc<"emailLists"> | null = await ctx.runQuery(internal.emailLists.getInternal, { id: subscribersId });
    if (!subs) return null;
    if (subs.status !== "ready" && subs.status !== "failed") {
      await again();
      return null;
    }
    console.log(`emailSeed: customers ${subs.status} after ${Math.round((Date.now() - startedAt) / 1000)} s`);
    if (subs.status === "failed") return null;
    await ctx.runAction(internal.emailSeed.finish, { brandId, site: args.site, startedAt });
    return null;
  },
});

/* Finish: groups and briefs ------------------------------------------------------------- */

type Audience = Doc<"emailAudiences">;
type Profile = AudienceProfile | undefined;
type GroupKey = keyof typeof FOLIO_SUBSCRIBER_GROUPS;

/** "The Searcher ×3, Slow Horses ×2" from a profile's ranked entities of one kind (all kinds when none); `plain` drops the counts, for prose. */
function favourites(profile: Profile, kinds: string[], n: number, plain = false): string {
  const ents = (profile?.entities ?? []).filter((e) => !kinds.length || kinds.some((k) => e.type.endsWith(k)));
  const names = ents.slice(0, n).map((e) => (!plain && e.count && e.count > 1 ? `${e.name} ×${e.count}` : e.name));
  return plain ? andList(names) : names.join(", ");
}

const tagNames = (profile: Profile, n: number) =>
  (profile?.tags ?? [])
    .filter((t) => t.type.startsWith("urn:tag:genre"))
    .slice(0, n)
    .map((t) => t.name)
    .join(", ");

/** Qloo's cultural read of the group, of one kind (what people who bought these also love). */
const cultureNames = (profile: Profile, key: keyof AudienceProfile["culture"], n: number) => {
  const list = (profile?.culture?.[key] ?? []) as { name: string }[];
  return list
    .slice(0, n)
    .map((x) => x.name)
    .join(", ");
};

export function cite(parts: [string, string][]): string {
  return parts
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("; ");
}

/** Each group's read, in the shop's words; the evidence is what its customers bought and Qloo's read of it. */
function groupBrief(key: GroupKey, p: Profile) {
  const bought = favourites(p, ["book"], 4);
  const genres = tagNames(p, 4);
  const books = cultureNames(p, "books", 3);
  const films = cultureNames(p, "films", 3);
  switch (key) {
    case "crime":
      return {
        summary: "Customers whose recent buys are slow-burn crime: Tana French's The Searcher, Liz Moore's The God of the Woods, Mick Herron's Slow Horses and Highsmith's Ripley.",
        speakTo: "Dry, a little dark and specific. Tease the setup, never the twist.",
        leadWith: "A new mystery with a strong sense of place, set next to the book they last bought.",
        hooks: [
          { text: "They finished The Searcher: lead with another patient, atmospheric mystery.", evidence: cite([["They bought", bought], ["Genres", genres]]) },
          { text: "Slow Horses buyers want the next Jackson Lamb, with Jonah's note on it.", evidence: cite([["They bought", bought], ["Qloo also suggests", books]]) },
          { text: "For the Ripley readers, literary suspense: The Secret History.", evidence: cite([["On screen, Qloo suggests", films], ["Genres", genres]]) },
        ],
      };
    case "speculative":
      return {
        summary: "Customers buying other worlds: N. K. Jemisin's The Fifth Season, Piranesi, Becky Chambers and Le Guin.",
        speakTo: "Curious and generous; talk about ideas and world-building, not genre labels. A little wonder is welcome.",
        leadWith: "One novel with a big idea (utopia, climate, time travel), then the Other Worlds book club.",
        hooks: [
          { text: "A Psalm for the Wild-Built buyers want gentle, hopeful science fiction next.", evidence: cite([["They bought", bought], ["Genres", genres]]) },
          { text: "Piranesi buyers like the strange and beautiful: Annihilation, The Ministry of Time.", evidence: cite([["They bought", bought], ["Qloo also suggests", books]]) },
          { text: "Le Guin's The Dispossessed is the Other Worlds pick: invite the Jemisin readers.", evidence: cite([["On screen, Qloo suggests", films], ["Genres", genres]]) },
        ],
      };
  }
}

/** Names each taste group after the customers most of its people were written as, writes its brief, then mirrors the covers. */
export const finish = internalAction({
  args: { brandId: v.id("emailBrands"), site: v.optional(v.string()), startedAt: v.optional(v.number()) },
  handler: async (ctx, { brandId, startedAt }): Promise<Record<string, unknown>> => {
    const audiences: Audience[] = await ctx.runQuery(api.emailAudiences.list, { brandId });
    const groups = audiences.filter((a) => a.kind === "group");
    const membersOf = new Map<string, ContactLite[]>();
    for (const a of groups) membersOf.set(a._id, await ctx.runQuery(internal.emailContacts.byAudienceInternal, { audienceId: a._id }));
    const pairs: { audience: Audience; key: GroupKey; n: number }[] = [];
    for (const a of groups) {
      const emails = new Set(membersOf.get(a._id)!.map((m) => m.email));
      for (const key of Object.keys(FOLIO_SUBSCRIBER_GROUPS) as GroupKey[]) {
        pairs.push({ audience: a, key, n: FOLIO_SUBSCRIBER_GROUPS[key].emails.filter((e) => emails.has(e)).length });
      }
    }
    pairs.sort((x, y) => y.n - x.n);
    const named = new Map<string, GroupKey>();
    const used = new Set<GroupKey>();
    for (const p of pairs) {
      if (named.has(p.audience._id) || used.has(p.key) || p.n === 0) continue;
      named.set(p.audience._id, p.key);
      used.add(p.key);
    }
    const groupReport: string[] = [];
    for (const a of groups) {
      const key = named.get(a._id);
      const members = membersOf.get(a._id)!;
      const intended = key ? FOLIO_SUBSCRIBER_GROUPS[key].emails.filter((e) => members.some((m) => m.email === e)).length : 0;
      if (key) await ctx.runMutation(internal.emailAudiences.setBrief, { id: a._id, name: FOLIO_SUBSCRIBER_GROUPS[key].name, brief: groupBrief(key, a.profile as Profile) });
      groupReport.push(`${key ? FOLIO_SUBSCRIBER_GROUPS[key].name : a.name}: ${members.length} people (${intended} as written), ${a.status}, top ${a.topEntities.slice(0, 3).join(", ")}`);
    }
    const covers = await ctx.runAction(internal.emailSeed.mirrorCovers, { brandId });
    const result = { groups: groupReport, covers, ...(startedAt ? { seconds: Math.round((Date.now() - startedAt) / 1000) } : {}) };
    console.log("emailSeed: finished", JSON.stringify(result));
    return result;
  },
});

/* Covers ---------------------------------------------------------------------------------- */

const storageIdOf = (url: string | undefined) => url?.match(/\/api\/storage\/([^/?#]+)/)?.[1] as Id<"_storage"> | undefined;

/** Replaces every string equal to a key of `map`, however deep. */
function swapUrls<T>(value: T, map: Record<string, string>): T {
  if (typeof value === "string") return (map[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((x) => swapUrls(x, map)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, swapUrls(x, map)])) as T;
  return value;
}

export const coverRefs = internalQuery({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) => {
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    return items.map((i) => ({ id: i._id, image: i.image }));
  },
});

export const applyCovers = internalMutation({
  args: { brandId: v.id("emailBrands"), map: v.record(v.string(), v.string()) },
  handler: async (ctx, { brandId, map }) => {
    for (const i of await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect())
      if (i.image && map[i.image]) await ctx.db.patch(i._id, { image: map[i.image] });
    // What people bought carries the cover too, and so do the profiles read from it.
    for (const c of await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()) {
      const entities = swapUrls(c.entities, map);
      if (JSON.stringify(entities) !== JSON.stringify(c.entities)) await ctx.db.patch(c._id, { entities });
      if (c.profile) {
        const profile = swapUrls(c.profile, map);
        if (JSON.stringify(profile) !== JSON.stringify(c.profile)) await ctx.db.patch(c._id, { profile });
      }
    }
    for (const a of await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()) {
      const profile = swapUrls(a.profile, map);
      if (JSON.stringify(profile) !== JSON.stringify(a.profile)) await ctx.db.patch(a._id, { profile });
    }
    for (const c of await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect()) {
      const doc = swapUrls(c.doc, map);
      if (JSON.stringify(doc) !== JSON.stringify(c.doc)) await ctx.db.patch(c._id, { doc });
      for (const r of await ctx.db.query("emailVersions").withIndex("by_campaign", (q) => q.eq("campaignId", c._id)).collect()) {
        const personalization = swapUrls(r.personalization, map);
        if (JSON.stringify(personalization) !== JSON.stringify(r.personalization)) await ctx.db.patch(r._id, { personalization });
      }
    }
  },
});

/**
 * Copies the catalog's covers into Convex storage. Open Library redirects every
 * cover to archive.org (1–3 s each, throttled), which leaves a grid of 40
 * covers half empty; storage URLs are fast and public, so sent emails load them too.
 */
export const mirrorCovers = internalAction({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }): Promise<string> => {
    const refs: { id: Id<"emailItems">; image?: string }[] = await ctx.runQuery(internal.emailSeed.coverRefs, { brandId });
    const map: Record<string, string> = {};
    let failed = 0;
    for (const { image } of refs) {
      if (!image || storageIdOf(image) || map[image]) continue;
      try {
        const res = await fetch(image, { redirect: "follow" });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !type.startsWith("image/")) throw new Error(`${res.status} ${type}`);
        const blob = await res.blob();
        if (blob.size < 1000) throw new Error("placeholder image");
        const id = await ctx.storage.store(blob);
        map[image] = (await ctx.storage.getUrl(id))!;
      } catch (err) {
        failed++;
        console.warn(`emailSeed: could not copy cover ${image}: ${err}`);
      }
    }
    await ctx.runMutation(internal.emailSeed.applyCovers, { brandId, map });
    return `${Object.keys(map).length} covers copied to storage${failed ? `, ${failed} left on Open Library` : ""}`;
  },
});

/** Deletes the covers an earlier seed copied into storage. */
export async function dropCovers(ctx: ActionCtx, brandId: Id<"emailBrands">) {
  const refs: { image?: string }[] = await ctx.runQuery(internal.emailSeed.coverRefs, { brandId });
  for (const { image } of refs) {
    const id = storageIdOf(image);
    if (!id) continue;
    try {
      await ctx.storage.delete(id);
    } catch {
      // Already gone.
    }
  }
}

/* Status ---------------------------------------------------------------------------------- */

/** What the seed made so far; `slug` picks another demo master ("covers"). */
export const status = internalQuery({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, { slug = SLUG }) => {
    const brand = await ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!brand) return null;
    const items = await ctx.db.query("emailItems").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    const audiences = await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    const contacts = await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    const campaigns = await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", brand._id)).collect();
    const copies = await ctx.db
      .query("emailBrands")
      .withIndex("by_demo", (q) => q.eq("demo", true).eq("demoOf", brand._id))
      .collect();
    return {
      brand: { id: brand._id, slug: brand.slug, name: brand.name, status: brand.status, demo: brand.demo, owner: brand.owner ?? null, url: brand.url, logo: (brand.kit as EmailKit | undefined)?.logo?.src, copies: copies.length },
      items: {
        total: items.length,
        byKind: Object.fromEntries([...new Set(items.map((i) => i.kind))].map((k) => [k, items.filter((i) => i.kind === k).length])),
        qloo: items.filter((i) => i.qloo).length,
        unmatched: items.filter((i) => !i.qloo).map((i) => i.name),
      },
      lists: lists.map((l) => ({ id: l._id, name: l.name, mode: l.mode, status: l.status, rows: l.rowCount, progress: l.progress?.label, error: l.error })),
      audiences: audiences.map((a) => ({
        id: a._id,
        name: a.name,
        kind: a.kind,
        status: a.status,
        size: a.size,
        top: a.topEntities.slice(0, 4),
        tags: ((a.profile as AudienceProfile | undefined)?.tags ?? []).slice(0, 4).map((t) => t.name),
        brief: !!a.brief?.summary,
        error: a.error,
      })),
      people: contacts
        .filter((c) => c.profileStatus)
        .map((c) => ({ id: c._id, name: c.name, status: c.profileStatus, entities: c.entities.length, error: c.profileError })),
      contactsWithEntities: `${contacts.filter((c) => c.entities.length).length} of ${contacts.length}`,
      campaigns: campaigns.map((c) => ({ id: c._id, name: c.name, status: c.status, groupIds: c.groupIds ?? [], contactIds: c.contactIds ?? [], templateId: c.templateId ?? null, stats: c.stats, sentAt: c.sentAt ?? null })),
    };
  },
});

/* Assets ------------------------------------------------------------------------------------ */

// apps/stores/public/stackhouse/logo.svg, logo-light.svg and mark.svg rendered
// at 2x (588 × 96, 588 × 96 and 128 × 128), base64, so the seed can store them
// without reaching the site.
const LOGO_PNG = "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";
const LOGO_LIGHT_PNG = "iVBORw0KGgoAAAANSUhEUgAAAkwAAABgCAYAAADvlS2nAAAQAElEQVR4nOydB5ycZfH4Z97dvbvdy+0FgeTuEBKqCEgH6SDVEJoCEhKUJpCIDVT+tEAI4UeRrpCAIiCEXkS6SEdpKkpTQZPQrgSCd3t3u3e7+77zn3n3LtnbfduWK0nm+/lc2bc8b9mnzDMzz4wBiqIoiqIoiicGKIqiKIqiKJ6owKQoiqIoiuKDCkyKoiiKoig+qMCkKIqiKIrigwpMiqIoiqIoPqjApCiKoiiK4oMKTIqiKIqiKD6EYdGCBCA0wJiCnuFfj0CNdR+sc+pHMJzMO3KdCEWOAMItAWkjBNyYtzYHOZUIEpnzFjaCoiiKoiirNGEWEloB8EswpsC9+dfekA5dyQLdTdAQOQ3WPrEbqsmlhzRE0g1XIMFJuUsu/xX8LhE+AUVRFEVRVnkM1qx8DGMZhBOhO/0OLLlxF6gS4XlH71aTHvcOi0cnQSUQfQiKoiiKoqzyGKwmeRHGOojrAlkvwJIFp0OFhOfOOAMJn+NC14UKsQBeAEVRFEVRVnkMMMxHYOUgBARXwOIFM6FMIhdOP81AuBQBQ1AFWNp8GBRFURRFWeXJOe0smr+EtTiTYGXBMr4EG578Ximn1Mw9enNA422oGvR+evYdm4CiKIqiKKs8g2EFzoCVCcNaACVCgNdBFTEBKzYPKoqiKIqycrBiWdiiBS/yp91gZQFhKkye+ViQQ8Pzpu9hED4P1eOJ9OyFU0BRFEVRlNWCFYErw5Gj+HcnrCwQXBj0ULTgXKgSBNSRNo1jQVEURVGU1YYVAtN6J7ayODANVh62hQ8W7ON3UGTutG0QcT+oAkRgAeJhMOe2paAoiqIoymrD0NQo68960jZ1Af0PVgYCaI4QjAugCohmiRD3yZy78BVQFEVRFGW1wjm09ZIbmsGiW3lvVTQzwwrCLjB55stOu2rmzvgK738TKoYeSJt0Csy58zNQFEVRFGW1I+y4dfIpbfx7f1gyfwZYeDULHWvBWIXgev69jfMu+FVpyU6KCvjYJJxpnr/wUVAURVEUZbUlmDyx5PopQMYBLEHswKe08JYJ/BODscPLEMZTYN1T3pIPNRcdvSWZxvWIsGvQAoggiUDthNCKgC9bFj2ePf+OZ0FRFEVRlNWeihQwiqIoiqIoqwMGKIqiKIqiKJ6EQVGUMUVvov1gg2hbQuOpWHzin2EUSCaXrQvpzAxC6o7Fm36DiClQFEUJQF9n+wa1jRPbVrV+QwUmRRllqKvrCylIHQBgHUQAByDRmiQ7LPME/j1iOR6TiY6diawpbKf/OmTSO4jBXmz2qa72T/nPPaAoiuJCX2fH/haaUwlwPwvoy6lEuySnPwRWIVRgWkXp7WzdzkDYjIe8yRbB+oD0RQRcBgQfAuIbUQOewYYmxwCc6d6l22Sz2dMJQ/fXxyf+DpSqQkSY7Grj7wensGB0YAqSO4JtHschToXc8TTCMEKJ1rX6KHQAgXmgCGpA1ppOTo0ENB4URVHy6O39tNkwzYN4kjUVCPe10Kof2oetev2GCkyrEGzKOQQsOoyFo4O52q5FA9vRrsED1dj+Q5CyWKPQ1fYX/nxvFOFmbGgWLYJoGXbNZs2X7IpvWZJbUAWmKsMzr1dYVb0jweiR7GqfniJaKNFfCwW1QgzDsEBRRhiiZfFkIv0vrpvNUA5ESe78Wrm7a+UK3sb1vJUH9/fCIXyhtqH5XVDKJtnV+mPIZq/K9WHovHyMcJXrN1RgWgXo727b3LToRu4gdoF84SjH6/z5JRaa3kWyPiI01rGI1uMjJHnwjtyZbJ8iuJQbwNU8bL5hkXkVrhCuJvcnWjetjbf8C5Rq0s7v/XkWbCfyS94URgEEK0S5hNTyde8BijLGQFwzwYL9xSzkbMEfvogEu3NdbXA6lgduiR14Y94mVuDimvxXYghKGJyjbJ0td4QmD+O9Xa2fcXkv8lXuio1vVnNziWCN8RCm6X1+leuzxnxLfq8nwWqAhhVYyUl1tp9FSP/nsOs/hHh6fbzpYbdzk8llX4RM5nTuSE4DV/CHscamX4AyLCQ723q4FdY77SOCrvrxzcOu1u7taruAO4Lz3PZzZ3hyNN70K1CUUYQ6O9dg8/WbIjwV7SP6a/34lu29zk1CkoUmnMUy05YF5/49hHBmXWPLk6CUTF/X0o0sMN8v2kHwAguje8IqRBgWLUi4Se3DBz3Dvx6BGus+WOfUj2A4mXfkOhGr5ki+5oHVSsI7CA9oicx5C4fVz8QLNu2cwI29WFgi+iTaaGyN2NTrdX4stubH/Of0VKrtWuqHW501DbQv/1KBaZhgYbePVTz1MIrwANILHvZBy7J0YqWMOjh+/P94grGI//1iOefynwXyk0y0ncH1/dLl+xC3Zk3JE8nO1t/Fxrd8A5TqgLTK9RsGP1QrjDi4N/9cCenQhyyw/Ro+van6AtulhzRELpxxY4QiH/GAcFW1hSWBy/0ERolUd+seLCzd6LQPQ/htP2Epn2i0eUm0sWl/7kSeKdpJsA9fJwSKoiirALF482Uk7giFIB6W7GpVn03FFYOnuB/DaIJwInSn34ElN+4CVSI87+jdatLj3mHx9iQccHkeFog+hFGCTLyF/xQLMgSLow3NJad0YYGyn4WmqUVCE5uLUt1LvwqKoiirCPWNza9zZ3l68R48NNnVdicoigOsYcIXYbRBXBfIegGWLDgdKiQ8d8YZrAl8jgtdF4YZVuO+AKMAq6W/xYLM+o47kd6EMmGhqS/aiIew0PTB0CKtqmvnFEVRSqaKZp5YY8tVLDQ5BYad1tfVNhUUpQADDPMRGBuEeKC+AhYvmAllErlw+mkGwqWsVRoRExJLmw/DKMDq5HPc9+E/oALElBcK48FcUv+KMm0/ppKROD8SqwMURVGqQ3UtBoTXOG02iS4ERSnAgEnf+yublj6AscN8+O+Nm0CJ1Mw9enMUv6gRg95Pn7fwLRhhZLVH4SqPoQdAO1RI7bimt1jbNGvFFtyNaOm4EooQLdiRKcJ2zGZHX4OpKIriQLSx6QEi6izczv3fNnZcO0XJYzD57hkwljCsBSWeIZqV62AEMQErNh+WQyac9k6VgdgCVSAab76ZNUt/GPyc7Lb2Cnpusqt9J1ad387/hriMUVtFqCiK4gULRll0c0ux6FBQlDxyAtMGs+5hieMlGDt8DZYsODDoweF50/fgSj+S8R6eMGcvHBVTZsay1vPajxK8skqEKPQ9ENnQLtcKZJaTmBxE1mMS2gwURVHGPksctyKtA4qSh7H8v3DkKP7dCWMFgsA2ZLTgXBghWGPSkTaNY2GUMHJRa91B2Lu399OqaJnqxk/8Lz+xrbkjklAQ3lBPx0SLzD+y8LoGKIqiVJthSbdBi503o/pfKkNYITCtd2Ir15BpMHbYFj5YsI/fQZG507YZjhhLThCBJbE6YM5tS2GU4P7ic9+DMplboUpEKTZHIk4jQr/XcUTt9cms9RQLbJNAURRlOEAyoOoYpuOlAPz7WmW1YmjlW3/Wk1xLpvLw9z8YCwTQHCEYF8AIIJolQtwnc+7CV2A0oVCb3yEsQO7b29l6I1QBiZAba6ydFI037e52DLH6KZmge1mo+opDCatcAkZ+3khf4tNNJFFxf3frl6m7fQJvG4aOXFGGQl1dX0j3dGyV7l26Dde5Oq9j+zrbN4BqXJPrdirVOonr+y7pnqVbJ5PL1pUJEqwqoOWoSeI+/31QlDyKk+9OnvkYLLlhc7BIUmWMdvydvWDJgp35nl522lkzd8ZX+B4PhmGHHsiYdArMuf0zGGUwYrVROsBxiCf1drVOjuG4ozEeXwYVgPiFrvzP1LO0qS+bPcFCrOEZXySVaN+bZ2M7OZ5LUN/b1TbHaZ8BlEUI31XXOOE/4IMIJSkL2CxIu/LPtrzpCwS4BgKtwfJaiuvBx7z9Y+7lPkYD/xW1ojcNpEOoGBkcUgk6nv87iq+5ET9v0+A+kxBSEugh0daf7Gp7kKWm22vjTU/w+zdhmLFzaxmpE1kDGGgFo4GwOBpvdtI+kud5huG4X76TPotm8s6p/DOJv4tGvpd3JdEzn/VorLHpLqgSA9//0UTWZqLF5Po2ie96vYHX/wECLgHJn2jgi7GGifL+s1Ahdo4sso7gAZW/e9yEkC6uj7ecDSWSSrVNpjQeaieRBTgc0biF302gRSMimFuUkTx/O/BzfjEFyRgM1Kxsop2SnW0f8Dt420B8qK5h4m/4ua3+7vYtTItusoB2TCaW7h6LTyjJP1UmQKmetm+ShSdw+92c6/sXwQ7VYkFWrm2akMoA8KTsH1w3ruPr3iYx3GAlhR+32SlWAfcjFQlMItD2dy3dwwRrQy5/siQz53YS5z5iCX9ni/l1LoYaejUWaxmWAMj295jo+Coibcp1Z5IkyuWtLfyd9pBozxBbud28GzXoaWxo/hSqDTcY30Po88a+nv5twBeyog0tvnEPk8nW9SBt7AwGTeKrT7bAtnhwU4BPeVs7KyjfjsbhocFMGL2J9kP5Jk4OYfj0uvja//Yr3zumxZL5M8DCq/motWD0+DusP9PxhUbmzniFO+fhi0LNgy8PiDPN829/FMYQ3EkuCWr64kbzP24Ys2PxpgXVGsQHctjdBFWAK+D50cbmuW77+3vav2KaNI//XbHEl+B5lrYeNojeYa1fEw/S3xiyP3cQd+B4E0RqLhnImVcy4guG2exZfL3j+EbzhRJJJyQ5ECU4qpO/2H/5vn5SH296CPyuIVnTwc6qXoRf8t2BAKZ3Q0Ak92GssW4S4hpDfBWTibaf8TNe5nZeYfJdok8b+hJZSS/hHTON4N5oY93JhdcLfr9U29fdcQxZNIOf82t52//B7Z47fdyE68/aDueJoHxfJBKeX1M/4Q0ogf6eji0t0zrMIjiiUGPK5b5RP75l2yDlsLC1MUH2KC7nm7JEfUg5AO/UNzZv4XW+rcVJ95/P57Kwlm8JoJd4HHwfDerggljTA5stL5+I6yQu4lkKT16wduBil8bGN58JAeDnq+EB9hT+53QZ3PPu91N+z4v4v6243CKtFmtiPjfQOIPrSFX6BC+SXa0vSpiTwu1+yXd9ynyPy9y4YLNlkLFJzo8zOCKk9PV0fM2y6FgesA/PJda2p7ivynfC72ojbu9fGHoSPIsG3FrXELofcUIPVEh/onVT7uiPZTFhOjfewUVCf7Fj65EIbljgzE5pvu3bQxi6hCevJQuJHsl3n+e6t5fXuTzJlD4yUPgGbu/z6hubZoPLPZhgnsP19Dtgz8UlCwe+zu+/lU/s57+bSDoc3t/Ef1lwgttYII7z93VKrnA8Kza+6RK/ewgWBGzJ9VOAjAO41B34FBkgxPE4BiPHyxDGU2DdU+y4RzUXHb0lmcb13KHtClWCO54kz5DbWfIXqftlrvCPZ8+/o+QUIyNBqrP1HB6Q55VyDleSd3kWenW1ss7LoJnsNvdC4sEM4Cj3A6GX3+nlhZuR+xVWeTwfi098ocoUkQAAEABJREFU2bl8inBj4u8Yv1tw5lVOs3M+9lr+8wOHglKhEG5f29D8LpQAz8x3IzIfyB+QZcAMh4zv1DY0vZ133R15x/1OGdR5++9YGJwmaWfcrlOJwJQ7Zlk81dO/L5lwHl9nK5eDfsedw0N1UP+wk7axMBlp8el0Cg9Gtom3r7NjPxOtW/m9BHOIDdBpOsGalS+ZVvY+buNb5JX1QDQEM/Nnw6lE6+6WBdcUCiWDZ4hAXhdvukg0L27XsgcYiwUTpG84DJwrCmNBjd/D1m77+d1saKKtiTyMr7u5azncFllgct3PwtIXWVh6M3/xhAgtrOI5tq6x+fGi8rrb1k5a8H2+5ln8MVKw+7VYY7PvpFIWbKRMS/Ko5WmK6U9cB3/Mz/wX+xNRqD/RfgALgXcXTCAGuTsaD323GoO+G9UWmPq72zYzLXineA/dEWtsmQElkJtgZVirioPuC6w5x/PzNRqCmFOz2exPed/0IVcE+ixExtF145v+CGWQE3jbfs7l/nCgQPke5lEkfFt9/drLc8aKhSBpZX+AFv4oJ9CtKIL75XOi45suhhLwEJhe4Lbvu3pdTMcWspaaaB639/jQIqCdZwu/Y2vGo7GG2pecJl9cJ34MuRiMIs9wE8TZdY0Tr3Tqd3Pv3hQ3noPLuVfNQr4SQonEmknq+bfbQOt5Lne8/LXfAOHQ9dyIfP2hguCl8eLrLeXBYSKUgG0C66LHuMw9CvdFkdbGeMtnxeewANeV+ZAbiYOAQe+xKWpr3peCALAJ8VRuGBIBOLSifPorDzy7OZkeUqn29anfepuFJodJBP2Jr72f27UrFZhW3IOYfaBwtc8vo6HQRThugmcw0yACEz/7b1izeBV//D6UCtI3Y/GWB4MezqYe1krBtcu1JPZNwDPRxqYp/B7TDvcXTXW1P8z1xXmRCHeG0XDoKKf3MGC+ChSA1ktgEiEHMumPAhTjqWEamCiw5hzzNVkm24f25MnFn7zKzQl+8Ac71VTeudF4eA3EtbvdzuP3vR2f83C+EMx1722emOzoVG/FlwnIfNpF2/RkfWPL12GY4L7mead+oVyBKdXVNr9QUyqCi1ED20ejLYEDOqd62vdhzeRd3JbXypUBt8TidCpiS9L92h0zCMybhtTznJB/AQv5c/nd+5q0BrFNURm8n/+13wG/j7+HwDicha9FbuewsLg5W1cfLey7+aKPx+K1Rxe6YrhRqcA0CPe7c/nZZ+dOhTauk7P8tPSp7ra9yLLzn+ZkmYCaomSi9RtsPRO3o4aBTdlovGZNxDUTXuepo+pKiK0lQONEKAPRmLAm7Vw2NX3Inc99qe5233ABfogHj8fekutYKmFd5NQpMhknYUmQAYE7q2ecS8RNkon26yHItbkT43f0S8gXlrgDjYVwipufRjTatJjv10Vzh7v2Jdp/CsNNNq/TI1jMHeYOLOT8wE9YWn6GBwbCBJ65Pg8iLBE8DQYdHoXYmhQOt/D/R4hg53U+d0yXQ0CSXe0/4vd8Q+EgYhjhWU7CkiCDughTorlxLJTrUsrMPu8UrV60hWze2pNNIl9jwe4nUCa22ReNXaQcvo9ToUy4rlxbICzJt/Ocn7Ak1MZb/kWRyFdlgpC3mbVCGVdNvAj73G6eL9QYhozw4W5CPt/Ln3lgcgwUzGUdwALYKTBcVHGVnAg5DsLS52GE3UsSlrgPJZOeWi4syeQq3vRdL2FJiDZOXMia30LhUqSkOTwB8B30l99zV9cXuGcUTX1OYGStulELh3kJSwJr3d+JYmxbvl7HkBsAmJLs6ntahHcYIcTfix/8GPt/gEdj8brN/IQl0eixJeheWC4s0Uf8Ti8Ncj2ZwBkYknY2qHkLp7r7fVflq8C0kpKrTFRJVu0wV7PDyaKneUb7Pv+UrjkYBqQD5/r/A+e95Dfjcu0guEUd57eyJ7f6x5pffK4x188pEtF4220fdwZnDueqIlnBxB32woGPr0Yhut2gGaUaEOCF4mBtsFmeZ4z7xhpaHsDGxs9FQ8n/38/aoP09C0DYQAYnv+vIbJGv5pDeiO6qi6/9nuclEDMssJzjccQmqS7zZqc94kwabWh+LmrFboYKEPOylMPaIz/h3FGzT9Qac/QLQ/gnBES+E/6epoi/2uA2i3Av5+uRQWnuQ4aaZWwTrt/7DoXgN277uD5cY2vcxjC2H2aWCgZkugPCkS1E8AxYjN32WLN0H6z4Tq1w2Dg+qL+o1Bf+zn9btAPhjGR36zf9zhczaYqSD0C+L6UB5wYV+KQdG2AUTRT4/rfjMWHEsmewgHi7JJTnd3Eht5+Dgvg9GpnMcYNCag58tRStnL3YCEPiTmKb61lTNcXvHBWYVmLY1HOC+HVA5WzEP79gjdMinuFPF8dFGC0yJJolt3rpGaKA77rXa3+6xztKOqTT+SraXJk88ETjE31T9fCNuWty2FSXTNBmMAyID4aVFudGXEdU6dF4057VWh04CJf7RLSxbou68RP/4LSfNVmv8UH3e5ZhWVt57u9Z2jQwW3T47o1AUfXr4xPFB+d11wMQjhBzq+v+Rj+BHAO1C/El8SzFReua7g1t5HJKoAUeg4hmIYQwPe+Cezkdx9osMX8U+TexOs9VGBpkwCfwNee9WEuZ9EkwHFQQuNKOFcf9G/dzT9uLVgYFRTYd8T3vJD5LpbgpiIBr9ePvCwL1vi65OKEEYgb8NF/AXY6Jv5VVkl7nsub3Cn6OfLOXVargL5oueyFNAbLSWgRLKBf0H0dE68vfx3P8DIfxCTNYWDoPAkKImw79DEkoEVlByhNC22eLn3eq3/EqMK3EiImIZ/yyEuP/QTVAe9npQp5Z/EW0LTAKsJTf5LqPKlzma4GrwJTsbD8qfyXWIDxhedbWXvgQIsvzGDbVlDToBSHV3bqHacIrYmblDvc3bAaY6uVg7nV7nnuJHvTzZ+Dne9S7CPQUmFJZ88dDZ4srMAhfhYCwSOOj3aE5I2lqKAXTMjd02XWg38BZSF1js3wfg+9ix0JzpHxm85Pj6rlYQ+g5CAS97LHzpBGNTcb2Lwlf4vJzS29n25upBPXwg9/IA6v0MfdwXTlOTMviZxNrbApcxwZJJeDkwkTo3JAehxIR7TWXc2vxDqg3KXuV23niO8QH/ahg8+vlTJjIcDabswXi2uHSjstCg2TCfEUWk2EID+Dv4A4ojS/lf+CJSFkr5lkzfBHXi0/43xaJq+d1rApMqwCxePNlBoa58tCfoQqIDwXPEF+TAHkwwmAIXAODsvBSkcmETRNx973kNiN+DoJAhqcwxyazxVBFJKQAWfi8rREjOLN+fPOJpaijq42B+LrXfh5IXDVsPLCGCcnFJ4/SpSztrmuoEY1r1v0+cC02D47JpKr8fbpNFkI8cD4ooQqgBFjb+BOuG2KmxlQ3DWnLfd3mkc5O2xJHy91BPB/+Tj/z2Nec7mnfFEYIrvkN/LOX0w8/1LZ8QMvAjdUP1MVv8STjFjZnPZjqaj3XXu1aOsXmU4OehTIIhwzHkAx8rwcmk5855rSzIFukLWVtSVkr7GINEx/LLQgquoH6vm6PVdBlIppxniSJ28CEcDi0S3Rc09NQIsUTH/ySLBiBErF99dA4Q/63yNjN61gVmFYRxOeAVcq7spT9Ha5JZcUdykfiVWSy5rNiKoERhG36z4sdGyRmyADcMDplqSw/31UwDPT2ftosOfic9nEDCeTPkHOwJEfHXAlHwGarv0GV4E5h5kD8pQzf4JE8Qw7k6Dic1IybKH42rgIb73DV7vUl2qa5aZfsoKQlYK9yIfi950GmT/yoUYLb3DKPfZtZYL7D3/2vJTYZBCmPNdCGET6Q3/1j0Qb6e/4+1rbOcLlOYOHUIvAM5Jsl3AhGCNaW/VvCVzj98GRiy/rGlrW4DbIiNLQxm3IOkxWP9okIe9g+egCvSjwmNnEdG+R6ot2VAbpoR9gItFKyEG4//5B+wmkfZtLHF26TGGXcNorMZei28MEHCbvBwqXjhJSv9V0oB5fAlanutj2zJrzMN5syavCr8uxQBnzPHztsu66cRQei3SJZ1BIBT4FTBaZVjGhjy23Rxub1uGfYm2dQNzvaxgMitnmeBVQtWnNQxI4djTc3SqAx0ZxxR8edXdMvYJgwshnRbjiapSwMBZpt20TEb4ReHLKN4BmjFr9ZLe0Pa5Yu47LmL7+iRbdLSAEYZQacXF39P/jlSvqYkNM+HrDcncYRSo4gzYPnHzwPQNhTtFow1jCMT3yOiPB7PtE06U0xMfUmWv8vmejY2cvnUKIXc3uamh8HyE7O7RaCAShwfWch1zODAJK1IYwxxNFXFsxIeAgxyeUmY4PgxqJ1YsHpn3boBA8sC/d1LL8Oys8zisZjTpv56y26Vqp76XaFMYvsIkJDV7yVdPmQqzlR6lgtlIqDD1Oyu+0IFtafknvndt9YVxcpOwsFF+9kEg5zG1nAZtjHehPtB5diFuZ2cp294tmDMCxakCh0dK0if+De6xHW198Hk0+pSswfV+ZNnxS24EhRYfIL+xqMACKMZM5b2AhjjIHBWVTDz3KF+R6bIA4CU6Il42FQKjy4yFJvFliugRFkwBfndagq6Nh4eKa8p5s7L5EVIBFNjoEUB3vwDGd7RGPnUAifrx038U2oAnY+r672u/j7OHLoHqxlXdwtAM6OvSOMzK5b3Hb2Jz5dH+xgfoXQBq5uVASe+dKc4LrjF907zPcy2fleRo9ow4S/sWmo0zmW2FDsKOSErGmyzkom2tu4zj1mhI07A5k2THMHt10yiOVWK/pc38SwBOn0cn6T1EUwhpE0QdTT8YRtGhoSeBY3ZYnoSRaa9ncLrMua/I0c6mwmXzAtFTSsN3iG5rCHigRPJHNDcmgzbNYtSSObT904ei2VcP5GM71LxbxaliZokGSi9XS2I4qvlH0RmUQlE2kJOHwclAEL7Pfw5Oj/nPfBFO40pyQTbctYAH6S28rvoo2hxysNqmrwm2+F4WN/kAB04lC1aP4v4KMro1BtLp6+RmTujNtqCJcYiD8fKWFJ4E7Lb0Y46tiO4Q3N98XGt3wjGq8dLysfoNSBgqyfwapMUaqAFYSASg4OKkv6RSNWRWEpygPpk8XC0gAs1KYS7cOzKqkUCDzNEWQ4r1Lkjt81SSy3sUa/VWeFRONNIjB5r6Yiqkpi2moivhQGwhVQIuIvJJonMumPLDi9wTPrg7yONxzSyeSVNZU1AM/6/bD95il7UHKDoJffsW9qoNEGx03sYM1KsXlSIpmz0CSTH5czi82NBIEnV04YpuEs6MsKWO4D8jdZLhHp2bJWUlsZeq4dN8pxbMiSVZL/XCGprrbrWWiRuj1EIuMPx5YbCzDn20ieE/lcUGCczv/ck0qYn3M/+ntWABxd7sIPgx+iYn+XAPB94/chE30TPlxQVr4fJ8IXzNinJoOS7PMYGA3sfDUrD7LSiQeTX/PPl/nmTxvIuRXkxHUkBffMOiMAABAASURBVAWsqpC7VoQH8wkwithpL7raXuIBcV+v4yyLLh9pf7Mi0Md3jmjd4k1U55dmJZn8rKRclrKqkXx8zyQhKoxB6uLNl7j5sgSBn31rJHqYZ9W/k3frdAwLPF7v82UJvlnpD9TUfJknDn+FaoPVX3kncbgIHTQVYnlBvNXJrEMOWh9xkHZ750Gw/SCJnDREmO6R+HT5lyLH+osWVLaijeDvjttNKL29DPgwSYBk/meW62GmdYtTUNkgsJbwJxLoMuDhIiQdLPG2WFv/fqqr9dulruQMc4V4kQvwDSpXFZCl8iy9DB8sOB4mzbwdyoVHsZoLZ8zh72N20NgowwFPYX2zJ49FBjK5X93b++ndlMk86pKHaygWiMD0Ioww0gGlEh1sSrS+yg1wHe4wWSjAZjaHTuBOQ+rv23zUf/jvG2TROp7VIUSmc/ntrmZVKkPDVCKuvk2iXUmZ8Dp/P74hCcQngE0L4ud1JIwWyBomL08tcnD87mn3dQeIEInQWqomXCYzrivzWLUeKOXMSCNtM5lcdgil+x8qivhdWkmHcr1+gev3HsUR6ukLrqcR9EswRVjNiDXUXZZK9J9duF2c7VkjIU7EywPaij8Pv1vHd9jX1yZpoD6AskGJ57Z+4VYyDTEZrnDotvvC4rMlGTlUAuJHjl0SgnuYGX4hjvcC1MiTPVm5vTOCcUwd1D2epOQi6dcKrrluX8KU5N/fg5JvF02+/CEsAP1fSeF1ECbxTf+Wv8fvcXv7Viy2ZiBnfYP1gIGCwlUNxDAPvrfBkgW+UUzdqJk3/Tx+4PNwFIUlgTvdh2EUoETrWpJsNuhqGTfsSM2Nzbtwib6qcxYOJ8MIYgeZS7RezA3hs1xEc/xxziSFu3MDWZOFpWfsdCS5oHNhsLPL4/FlXEp8pbIe+6umEXUBffZO4mf7uazwkTQkPsceIY6OMFpY6NnpWA4aJhjXJN+vpykjY/kEHHWCwNtnEq2yVjONBJJmJdcuQSItV7JYYIe+7o6rCzdy23GPqYVQUrynVYWBOGP/dd4HJwz9jP22ydEByoRczftBkNQsTtuNCBYu+XfMPMBtrPS2kg+SYwBe7qTcndnReRy2k4ETbYUh3NdOAyNRxQ34kdOxooFKJjpcU/h4ISv8YuObz+RxYfsyAjnvROn0W5I4O8jBBkz63l/5oSqQiMvEolvhk+tKDo4YmTd9R35Fc2DUoffT5y0sKaJrteij0AH85wdm1nqsEhWwILPPaDzMJk36t+dxHn4m1UaC9KUS9B5Pl850StsQCxmbik9WrLHlx9xQfsaDy1H8sxMfe2ap17Id5AlcTUlEONVtdddIIHnJ+BntGCGShkSWiHsdj5Y1v1z1dsUYhrdJDos1TLn3j36mvNKFVoPafe5l5Pu8EpBBmev097GGJJjs1S6mGl8kcXKRH47h+b5bJHs8rJ64mRC3KlyJSG71h2g7qAxHN4lItnbo9dzN3xVdn1wEwXLai+TgDIfDu+YvRBBHezsfpeMJ1q2FvlqlICZgCeQcCuGWrD26aHnoCB9E42WheUuQDBeD9rszYKRBHAfpUOlLxS3wTVMxEpiAp8MowRXiHfsfxC+mujp+DBVirxww4Byfw0ZkGbadUJGyssKvyK9IMlhHG5unYUOT42yHG7u3oGCis+Dj4Xsjjamvp2NPGAUkqW1hXjKMRE72HDwR1xlQb4884bCP1gbdJkh+2p6SBSaDvNMksDF3TAtMg0hOMJ4YnBZtNNYWswa3gUf8NHKFcB3+9pAN3gITWAaVrf0fdipIjeJfNrjFSouke5cWavNd/FfJdQVi2XB7F+3MkG3o2mYqur7hlimgDIEJCd+tGTehyCcKa2XhETmFC9mQLQpzoUIkNU19Y9O5EjoCIjXc5+CPBlK/eNQd3C3Z3XGQX9k5gWmDWfdwgS/ByHMofHDDbkEPDl1wzNRA/jbDzxPm7IUja8rMY2glpLPFRAcVItoLbpiugwyVENCuXCiRWBOzmWfAbWk6wYVlpv4YLMDNvOHpvG9ZVsmaq3ySXa2nVSsZaSy21ifcuC/wOsZWb3e1l5UmoBLElARePllE6ztt53nd8+AF0c5QIhYYtR7lfTgQAmKlQZari1mDBeiDo/G6CdwOvstvWiYWQUx2Bwwpywp5C6gEJQf+G3I6/W98srNtsTjVQrXB4Uu3woKl+wozssyht4EudbZiganIN4oQny6+HWf/WXupfgV9DZFVPOlkrVPdOCw9xItLLjk71hHi+c7nwE+qmWEiZ95uulYCmLLwJO4NV/CPY2gB1s77unSsqHzhiIQ/980QXHUscdwOhmFQxdJnpbCasSNtGoGiwQ7rfRDlZkMIDX2EVXkvXiuLDKxuag8n+qzkyeAUPXcA7tAqXHXjZms3nvM8C3A/FkCmQRn02g7reCVkMntAlYg2Nl3uZ0LlhvXbUTEl5nIyOYMYpc7Ootg8Rg3eAp7O7zieZ/glTZTQM9CeMR/KgK2HgczffL+eGiACdy2JmAVkhZskiXUv317tehMPAntHDWziacD3yMWnZYDJ+R9qG9b6D1/IS2jaqJwUE4MkE33ibzhZGhasRHj5/9SMaxo6YayJyKIlJ+/oTUvN+zfkbMAigQmN4pRQErqEXKJ6UyZ9CJR/AxOLygO4u5L4Uk5EG5ou53LfcdiFGdO6I2jfJauIgwbutYWn8c0/pUj4S1y+w1iCvoLaigq93omtfPmyBoUK2R+WzPftDMMXTt+XR7sKVo1UDndMlh38cc5t5UdzrR7L1ceiUUj1tFe+0hHdO13u5L2iJ7vPcgkDxwVhbfsWXvujEKsw0CA5DlR1DXCHmxPnilPpV37Rf4tPoVq0TAnMBlEDysrx5EQuqrZxnM9RmyQT7YEzf1cN9Hb8Tof7i8xy9oyTvHP2ZTPm0VDSbbiaZykaxpudz1nDZ8KIw+8Q3bt0gqxw46r6qyC+RGKerh/fPD+G9V92D3OCtfmRzcVJlmdAnu4QPHBfmUq1rw8lItol/i5tNwGeZL0GKxH8zI59qAyuhSsNZfB1iyhvkVlW6p2ckEBDBBa+xrLouGbHxUVcx292LqiC1D8WFE1Y0TB+A1VG6mAkHBINZNHKZXtlYqL9/CDlpCw6l/rhuVJ8eevr124Nh2wz9dDFPki+mrmhM4D1Z0lwvKn8xkvOdlwRBHP8DkGCc2EUEc0Sq0b3yZy78BUYCxREM7ZM62475UElRQI6rhSQmUyssfk191uhHvd9ECf61HHpuMym87NDk4+E3099FUYOdp7xyuyJv9+F3qdKIDvzj0GiIAuSny6VaH9Olszyx/+4+V2VC6uZX+H3d5PXMdzxnF1qwtYq4CkwZS2XWTzir8ATOiqIU+byo938ngjul2CFHicuAQ/svIPDiNybHR8NMWahdVvQZ8Z4fBkZIccVSCJIDYQSWU60oeYGyMvXWFwg1FtpetU9cKPDZWS2n+h73F42TpSqGdf8b6g2w+TDxBo9WTTiKCAahuHoN4sG/tppO5u1jitnMU5fT/tuooUdcg3AWyWumNPxUcTfOn2HEgVeUuZAieQCxOJ+Q7YB/DMWn/gnGAZq6ifwGIbXOu3jSn9W/tjgivhWIUzifjmQgDVIbUPLP/mBhwiiPP74WtiKB5DJMx/jmrA5n/0UjBh4CHx0g+sS+fC8abtwpRkVx9sc9EDGpC2ys29/DsYI3JD+VvB5TcxmHyJaFocyGFid4Jgs00C8yvtc9OwY+7usnZy2p7raz8haeHleQX55w4Zt9U4Iwz/3XYkkJiULnk52td3t1iFJI5ccX6wSkRWUuefG4VmoEGus+4nMQD0OCVtg/hZGFu8VbxY5On6zAHgn/3EP04G4Xl+iPZBPzMBgVbRaSMxW0ZB3rBdCH1NnNjvLa7dklmcho6K+k9vygI8i7sIDwWlBz4s1TBC/SocQGVjkf2gnKQbvVaU8aK3N/e6fe7va53kJALIqkwWOHyYtO3WGXefJgKttTdZKArcjtwH3NQn267RDMig4hWSRHJysITkbSr0HiwpTV/03Gg+5CgIyCSO3xUdkXlbKBEPoT7TvC0M1s5lIODysQaGj8YlnuySLD2dNuMMvsCQLh3+x/yH8WX93u6eFovjcoUoHflmL/M5xvhnJ+7bBzP1ZrXMM+GSkrhpZy3lQufLIKFrGjTAaEHxsWnhQevYdh8OcO0fmPQSEK5p0ToUd0vbJrvSL1NX1BSiRVKLDLbXGy3UNE2/xOFX0Nn5RlS8vdEy3HUIRLuJ//zK4jQUzTxW+idYMqAR0j3kkSTn5DoLEcZI28y3u3XggaWvnn0clIa6E3Of/W7m+vIuEZ+VC8oOMJh+xvf5aGAbEl4Xf2U98DtuJ7+tUGDE8fWPEH8PVT4QHh+nc5lxX43Blv5yoNQY+8HfxHSju2zL85R+EDc2fet4f4Hve+2E2Cwc/KNwubS7VxbPcdEbaQmWxuxBXLOogvCzZ3Xp4sNNYi0TFK+h42Lzf6fhYY8vVAeLWRBDoHImHxvXo4WRn+5mSWqKvq21qqrP9LK779yS7zE/4KtcMRmy3tRINzRfAcIClCQFBkGfiQr9etIOgJ4Tk6a8ajUe+7aSVzGlI2jaDgIjmkuWbFfGeiJJ87YP8cp/lVtE6xdHD3VjDHbjdi3DF7WvO0G3wo5r6tf8Gw4iYOg0IneCyb+tUV4fnCv66cc2DzuihrB0xPHj9sAp8ErnePul3jrdT3uRZC1lwWhvQOpA/XcNFStTOJfy37AR/7uAusHjBs7D4hk0Ht0TmTtsm0lPzPL+4zWGYIVmGTLSIZxqyWvDnlkV7p89buK55/u1Bw66PKJJ3ir/gfxdvhy1T0PtKKaYD6umYyM9+UfEO+jgarzuwUJ1fRJjuclkmuvyekoRv84ByHs+Yv8Yd7wUSZZV3WWFDzh08EDwFJsk71Jtod3RoFOdqNtt6Cg/83W6ae6z/jRdhp1AbFxvfdDf/+SUEhO9noiR75n8k197BWJziwzTAOMFNpb6iGNcdvk6zdlwTIE+VOb+XS5LJ1koC2gV33iX0jshNMMltlwwOobBxiJupSDQeyQTe75Vbzt6HxasIefv3vczKg4RCxq/BF7qWtUh/6+1su4kFhp/zzx9TkFzG7XEOd9cfGbXGtl5pk1gA8XRo5f35S7FD3LPfI0IK+GAP0GzKG3qr9Eks3uRq7ow2ho/zM0MO3FS9CJxcmS7mQu/gwfURO50IwpFidl9+OYA2jNQcUNlqVp87cd5cVm6wVGfrOblnKkC0zYbx9dp4i+dkEHHt7nDYEM1QYRsPmyY8FjSmFWayd+S/R/7Wv+137UHchDbmShZsp0AAUt3t0neuWOHHgrT4xsEIUDd+4lNSpxx38nfjtWpuYBx8d+D/7VKJtoWB88RZsGPep0zMwOv9Tqm6tK6MHMmu1tv4K3RUmUrQMAONM2U1jVcZUhlZMpdBomBWTC9SODJNHOQgADKuVh12AAAK+klEQVS7JvD3RcuHJ4tnR8c3Le+sRHuQSogpGD2dq7lB/Jo1Ky9y5V3G/29FiIfy5h3tJaNARw3NPD7kzDRPQG7nWj9FNKfcIWzpUHYo2d02FyVoZimCQjEWGPQtO1yD23P0LG1KmaZnRGqsockSi8frGAlbYK/E84AnBG9yWQc7Ladn4fFWfpff8Tj9OgmiCAHgejCf64GX02krRGp28kpFIHUyk7Vu5wHEUcXO5T8ei9cePRCdecV2SVKcaL9XEsjmHduBSLNi8ZYHISCiMRwQgksid1/ho2QQ5Xf6Nt+H60SPtWkNbtqD/p6OLU3Tcgq6dyVPYC50ck6XkBxJq+dpO7ryihvq5cF815pxEz0D+IkZkdLphysN2SImzxCEdmVt7fswDAw8439k1aTTftZUbJzTFPsjCV95Unx6fl1Zfh2AdxCNk2LxiS9DQPj73oEnJndxvdmgoKwONvfvWRdf29HUK8+Uol5x3j44dzx9zmrY4+vjTb+HEpC+JGmaNztoyljrCNNj45vvdTyP+zs2dZ/D9ymr1WVhgMmT2Uv42S/wmegtJ5lYuhubAIvSZokgwxqwQMoOMaeZFjkGguZy2jES2T4XUqUYfve3yGQ674TnowYdgfEWV6tQbgKyQkiTlaZBBEQVmFZikonW0wcyQA9yHQ9Gl0I6/UP+Zn9qbyFYxALFnYYBz+RWibFRxALJzTWRx/TtnQQurqAXckUvaYVVLidbmzjxbRrwlF/wIPzD4nKWxVOJ9BP8b3CnRYJu7mh+Wj++5cYAA7aNQcb+uZmNM7LqUBzpl5vWSoLeNwBPq2tsdtROspbsUH5QCQ64PzdAz9xPMgjxMU+w5HYXlzckyre99BtROtodEIqXAzuXR0/xTGpG0ghHwMycyp38HqK+D3Di06w9+XMsTpcMZDVfsauzc40k9p2ORLtzvfP3NZTQA4gPhgyYX9vQ7Lw0mijMHflZFsFPh8y8VzzH5xIeANH6KxpGAkxrZwtwOr+HQUdRyTF1c6wx+jP/1W9F146yCepRfpavBTse3sIQXZAvHLMQezVIwDz3kz7kgelpI4S3s8n2mYLrG9yWUiIuO9xbJ08WroYQvlRXX/OXVHdmcwJzKlr4AztZ7IoDP8KwcXx+lGXvZ6AaNuGI0F2e+ZbgOYqEZwSdYAWFzavf53v7igRk5bq6J7ivfpS2spTfGWvTqEgjzkJzLU+WZFHMBH7Yr4qfkUMJ7/F3ck1hsNig5Hy5sldy2cdBLtHr4J4+riO/RSN0axSt98UsLAJClqyjuf8+cXnbJXowGjJmVrJAhLWes/gdXSDa2CH3JglqERcYEeuturpmnjR1NqYS/d8hsk4YFLJFwOHzjg+iiRX6Ojv2swxra54aziwUFPOuvJDL/yNaxovc3xb50rFWdHPTwn24PW/nOWmT2EmIv4pCdF5hEM+ciZyuLTyeNbUXc595lWihlm/mep5MdMzmfTIhtgVEyUEXizdfAQFQgWklRlZssfDzbO4T3RlrbFkeu0Vy45hgnc1qnEMDDfpsM2fBSmbn1wdtMMVF8CDX3f5tsmiOOOk6HiPqU8SzeQb1kEc52NfdcbxFPDgXNPyCA1kdi3dhTWT24OxDZkw82F3C/51auOIktx+6uMyTecZ1D/g+z9Jxfd3WNO5UjvfTeg1cW2J7/Irf369zS/+d4cH0nyUIloP3fTPPgIbY+nlm1eYncDnBg4cISRtwmbeUcp44mIcgvFPhLD7d++m2mUzmabeZv3t5eJFE5PU8Rjq47o4paNEMrsssHKL36iMWxvg+bqwLhW7EcRO806P4kOrqmGGBdYWbMGpH3eZO3EkbIEJkClPz+X4OcaqHeWU8xgN0kZaDBQXxzdjejq+EeEIYaZFp2U7aXo7vlphnWTtym/gdBtUQ5CMxhCwreyILx8d7tr3B+7fTT+ANw2G+sSdPXelPvISkCmnl+3+X39ObPI18KNrQ8gJUAaLPG5NdfdO4XNF6eE/8bEEAbjEIr6ob3+TrdBzs+hTmNvN1bjPHDrSZWp8z/kRoXBZrmPiwnaooAMnu1m+yqfh+CAy9x+NTUcgC7gvZ7Ogee8+hnIe4nCHO8bZ2D+A1MUsaRvgAK5zpgyweyePQOfw8DWK64DYkfnbiRztpcCIy0F/PlJhWAS+uAtPKjjgd85fYzYO0awwtGdCy2cyeLDhtzK1hHR74omxy6uS/nbyti9vIP+rizffnS+KVYAs8fe2TsB83stCS1Y+SzfoDjOAb0WjzkuDltNcnu2Ffw7I2txA35i3r8P0u479sZsF/1DWE7nUza8iA1YfJg/jCO/Ezr8/vaDHPKl6pixsPlBOETZbn8/tim7e5PmsyNuIrtPA75HfHAxrRx2hE7ndTuyvVQXwTWJDYyjCMLVnY24LA2ozrw1L+fpcYEv8J6f26cU0vegmr5dCfaN00C8aX0IIvE1KClbStEDJeleTVMEzkVmFau0Yp9pv8GbUs3eeZzVdZTbw1P/eXuX43cjf+Bg8If42B+ZKXGaIURMvV19O+O2tANmGhcTLX9Q3tpNco7Q8+4/b8oQHhh7TOeyOLAfqpbzvWxGzD4uz2XEd5sDZEMPqAhdJFsYbQc2LChWEip/nv2Fo0OPxha9HUGblrL+a+69U6K/ZWUdqVlRDxRUMw7swXOmX8SPVYLDjiZpZ4hQ3Az50st+6qwKQoiqIoiuLDShW6XlEURVEUZTRQgUlRFEVRFMUHFZgURVEURVF8CMOiBYkhy1G9aRNvdyD8D9jB1cL3wgYndcBwMm/6pLAFR0qAQEQMtMx3pCCCROa8hY2gKIqiKMoqTRiQWktY1tfMxzbnYq2Iv3j2Gli84BcQTp4F655e3ejfF09fI5LBa5HgmLHqmo4In4CiKIqiKKs8BmuLPoaysbO//wgysX/A4hu3hioRvmDGPjUZfJcFkmFN/FcxHukPFEVRFEVZdTBYTfIiVArCxkDWq/DBgsoEHAKsmTvjAjToKS6z5IB8I40FUJVAZ4qiKIqijG0MMMxHoBog1LAEcRssWfBNKJOaedPP43LOQzF2rQSwtPkwKIqiKIqyypMTTBbNX8IyyiSoBkQ9EIFNYd1ZJfn3ROZN3xEJX4WVBno/PfuOTUBRFEVRlFWewbACZ0C1QBwHWfwllIoFC2AlwgQ8HRRFURRFWS1YYfpatOBF/uSftTwoBu4Ok055KcihoQuOmRoyqDqmwZHhifTshVNAURRFUZTVghWBK8ORo/h3J1QLi2YHPdQwaC6sJBBQR9o0jgVFURRFUVYbVghM653YyuLANKge+8OS+dv4HRS+cPq+rObaFlYCiNhwiHgYzLltKSiKoiiKstowNDXK+rOeZLPcVBYN/gfVgGCO3yFIcC6sBIhmiRD3yZy78BVQFEVRFGW1wnn5/pIbmtmkdivv3Q8qJYxbwrqnvOW4a960XQwK/QnGPPRA2qRTYM6dn4GiKIqiKKsd3vGOlsyfARZezUetBWVDf2bN1a5Fm688MhrpibyOiJvDWIXgY5Nwpnn+7Y+CoiiKoiirLcECRC65fgqQcQBLEDvwKS38dyL/jUJwnuPjZ8H6p/xLPkTmTtsGIHQDIuwAYwQiSCJQOyG0IuDLlkWPZ8+/41lQFEVRFGW1Z6WIqK0oiqIoijKaGKAoiqIoiqJ4ogKToiiKoiiKDyowKYqiKIqi+KACk6IoiqIoig8qMCmKoiiKovigApOiKIqiKIoPKjApiqIoiqL48P8BAAD//3RBBVIAAAAGSURBVAMA8f2IrBmeB68AAAAASUVORK5CYII=";
const MARK_PNG = "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";
