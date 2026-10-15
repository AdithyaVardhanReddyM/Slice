import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import type { ContactLite } from "./emailContacts";
import { andList } from "./emailItems";
import {
  FOLIO_ABOUT,
  FOLIO_BOOK_CLUB,
  FOLIO_CONTACT_COLUMNS,
  FOLIO_LIST_MAPPING,
  FOLIO_SENDER,
  FOLIO_SITE,
  FOLIO_SUBSCRIBERS,
  FOLIO_SUBSCRIBER_GROUPS,
  folioCampaigns,
  folioFooter,
  folioItems,
  folioKit,
  type FolioContact,
  type FolioDoc,
} from "./emailDemoData";
import { themeFromKit } from "./emailThemes";
import { cachedQlooGet } from "./qloo";
import type { AudienceProfile, EmailDoc, EmailKit } from "./emailTypes";

// Seeds Folio & Fern, the Email service's demo brand (data in emailDemoData.ts),
// as a demo master: the brand and its kit, the catalog matched to Qloo, the
// book club (people) and the newsletter subscribers (four taste groups) read
// through the same list pipeline a merchant's CSV goes through, then three
// campaigns with their builder chats, one of them sent (simulated).
//
//   npx convex run emailSeed:run                                  # local site
//   npx convex run emailSeed:run '{"site":"https://…/folio"}'     # deployed site
//   npx convex run emailSeed:status                               # what exists, and how far it got
//
// `run` replaces any earlier Folio & Fern master (and the account copies made
// from it), creates the brand, items and lists, and starts the book club's
// reading; `step` then follows the lists in scheduled steps (the book club
// first, then the subscribers, one at a time because Qloo rate-limits bursts)
// and calls `finish`, which names the groups, writes their briefs and adds the
// campaigns. Each person's version of the autumn campaign is left to the
// email agent (/email/personalise).

const SLUG = "folio-fern";
const DAY = 86_400_000;
const HOUR = 3_600_000;
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
      name: "Folio & Fern",
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

/** Seeded campaigns look as if they were written over the past few days. */
export const backdate = internalMutation({
  args: { id: v.id("emailCampaigns"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, at }) => {
    await ctx.db.patch(id, { createdAt: at, updatedAt: at });
    return null;
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
  return { ...kit, logo: { ...kit.logo!, src: await store(LOGO_PNG) }, icon: await store(MARK_PNG) };
}

/** The storage files an earlier seed uploaded (their ids end the URLs). */
async function dropAssets(ctx: ActionCtx, kit: EmailKit | undefined) {
  for (const url of [kit?.logo?.src, kit?.icon]) {
    const id = url?.match(/\/api\/storage\/([^/?#]+)/)?.[1];
    if (!id) continue;
    try {
      await ctx.storage.delete(id as Id<"_storage">);
    } catch {
      // Already gone, or not ours.
    }
  }
}

async function purge(ctx: ActionCtx, brandId: Id<"emailBrands">) {
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
 * Replaces Folio & Fern with a fresh master and starts reading its lists.
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
      name: "Book club",
      filename: "book-club.csv",
      columns,
      mapping: FOLIO_LIST_MAPPING,
      mode: "people",
      rows: rowsOf(FOLIO_BOOK_CLUB),
      source: "demo",
    });
    const subscribers = await ctx.runMutation(api.emailLists.create, {
      brandId,
      name: "Newsletter subscribers",
      filename: "fern-letter-subscribers.csv",
      columns,
      mapping: FOLIO_LIST_MAPPING,
      mode: "groups",
      rows: rowsOf(FOLIO_SUBSCRIBERS),
      source: "demo",
    });

    // Resolves the club's favourites now and schedules each person's reading.
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
      clubFavourites: `${read.resolved} of ${FOLIO_BOOK_CLUB.length} people matched, ${read.unique} unique favourites`,
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
      console.log(`emailSeed: book club ${club.status} after ${Math.round((Date.now() - startedAt) / 1000)} s`);
      await ctx.scheduler.runAfter(0, api.emailLists.process, { id: subscribersId, k: 4 });
      await ctx.scheduler.runAfter(30_000, internal.emailSeed.step, { ...args, stage: "subscribers", attempt: 0 });
      return null;
    }
    const subs: Doc<"emailLists"> | null = await ctx.runQuery(internal.emailLists.getInternal, { id: subscribersId });
    if (!subs) return null;
    if (subs.status !== "ready" && subs.status !== "failed") {
      await again();
      return null;
    }
    console.log(`emailSeed: subscribers ${subs.status} after ${Math.round((Date.now() - startedAt) / 1000)} s`);
    if (subs.status === "failed") return null;
    await ctx.runAction(internal.emailSeed.finish, { brandId, site: args.site, startedAt });
    return null;
  },
});

/* Finish: groups, briefs, campaigns ------------------------------------------------------ */

type Audience = Doc<"emailAudiences">;
type Profile = AudienceProfile | undefined;
type GroupKey = keyof typeof FOLIO_SUBSCRIBER_GROUPS;

/** "Sally Rooney ×5, Phoebe Bridgers ×4" from a profile's ranked favourites of one kind (all kinds when none); `plain` drops the counts, for prose. */
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

/** The profile's cultural references of one kind beyond its top favourites (the long tail of what members listed, topped up by Qloo). */
const cultureNames = (profile: Profile, key: keyof AudienceProfile["culture"], n: number) => {
  const own = new Set((profile?.entities ?? []).map((e) => e.name.toLowerCase()));
  return (profile?.culture?.[key] ?? [])
    .filter((e) => !own.has(e.name.toLowerCase()))
    .slice(0, n)
    .map((e) => e.name)
    .join(", ");
};

/** "Qloo: …" evidence strings that only cite what the profile really holds. */
function cite(parts: [string, string][]): string {
  return parts
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("; ");
}

/** Each group's read, in the shop's words; the evidence comes from its compiled profile. */
function groupBrief(key: GroupKey, p: Profile) {
  const authors = favourites(p, ["author", "book"], 4);
  const artists = favourites(p, ["artist"], 3);
  const screen = favourites(p, ["movie", "tv_show"], 3);
  const genres = tagNames(p, 4);
  const books = cultureNames(p, "books", 3);
  const films = cultureNames(p, "films", 3);
  const artistsMore = cultureNames(p, "artists", 3);
  switch (key) {
    case "literary":
      return {
        summary: "Brooklyn readers in their twenties and early thirties who read for feeling and for sentences: Sally Rooney, Ocean Vuong and Rachel Cusk on the shelf, Phoebe Bridgers and Mitski in their ears, A24 dramas on a Friday night.",
        speakTo: "Quiet and close, like a note left at the counter. Short paragraphs, one specific image per book, no hype; let a bookseller's line do the selling.",
        leadWith: "One new novel framed by mood and attention (grief, love, small moments), under a warm, lamp-lit photo of the shop.",
        hooks: [
          { text: "Pitch new novels the way Aftersun and Past Lives work: small moments that quietly add up.", evidence: cite([["Their films", screen], ["Also in the group", films]]) },
          { text: "When a book is spare and aching, say it sounds like a Phoebe Bridgers song.", evidence: cite([["Their music", artists], ["Also in the group", artistsMore]]) },
          { text: "Poetry belongs in their email: Vuong's collections sit next to the novels.", evidence: cite([["Their writers", authors], ["Genres", genres]]) },
        ],
      };
    case "speculative":
      return {
        summary: "Readers who live in other worlds: Le Guin, Jemisin, Octavia Butler and Becky Chambers, with Studio Ghibli, Arrival and Radiohead as the soundtrack.",
        speakTo: "Curious and generous; talk about ideas and world-building, not genre labels. A little wonder is welcome; skip the spaceship clichés.",
        leadWith: "One novel with a big idea (utopia, climate, first contact), then the Other Worlds book club.",
        hooks: [
          { text: "Gentle, hopeful science fiction for the Ghibli crowd: A Psalm for the Wild-Built.", evidence: cite([["Their films", screen], ["Also in the group", films]]) },
          { text: "Le Guin's politics, argued over at Other Worlds: The Dispossessed in November.", evidence: cite([["Their writers", authors], ["Genres", genres]]) },
          { text: "For the Radiohead and Björk side of the group, the strange and beautiful: Annihilation, Piranesi.", evidence: cite([["Their music", artists], ["Their other books", books]]) },
        ],
      };
    case "crime":
      return {
        summary: "Suspense readers who like it slow and atmospheric: Tana French, Gillian Flynn and Dennis Lehane on the shelf; Zodiac, Gone Girl and Mindhunter on screen; Nick Cave and The National on the stereo.",
        speakTo: "Dry, a little dark and specific. Tease the setup, never the twist.",
        leadWith: "A slow-burn mystery with a strong sense of place, introduced through a film or a show they already love.",
        hooks: [
          { text: "If Zodiac is their film, The Searcher is their book: patience, weather and dread.", evidence: cite([["Their screen", screen], ["Also in the group", films]]) },
          { text: "True-crime readers get Say Nothing: real, and it reads like a thriller.", evidence: cite([["Their writers", authors], ["Genres", genres]]) },
          { text: "The le Carré readers among them want Slow Horses, and Jonah's note on Jackson Lamb.", evidence: cite([["Their music", artists], ["Their other books", books]]) },
        ],
      };
    case "ideas":
      return {
        summary: "Curious nonfiction readers: Oliver Sacks, Robert Macfarlane, Rebecca Solnit and Michael Pollan, with nature documentaries on and Talking Heads or Brian Eno in the background.",
        speakTo: "Clear and generous: one surprising fact per book, plain words, no lecture.",
        leadWith: "A big-idea book with its most surprising detail up front, then a nature or history pick.",
        hooks: [
          { text: "For the My Octopus Teacher crowd: An Immense World and Entangled Life.", evidence: cite([["Their screen", screen], ["Also in the group", films]]) },
          { text: "Sapiens readers want history told like a story: The Dawn of Everything, Say Nothing.", evidence: cite([["Their writers", authors], ["Genres", genres]]) },
          { text: "Jenny Odell readers want How to Do Nothing next to the science.", evidence: cite([["Their music", artists], ["Their other books", books]]) },
        ],
      };
  }
}

function clubBrief(members: ContactLite[], p: Profile) {
  const first = (email: string) => members.find((m) => m.email === email);
  const who = (email: string) => {
    const m = first(email);
    return m ? `${m.firstName ?? m.name}: ${m.entities.slice(0, 3).map((e) => e.name).join(", ")}` : "";
  };
  return {
    summary: "Eight regulars with eight very different shelves, from Cormac McCarthy and Robert Caro to Emily Henry and Agatha Christie. What they share is the fourth Thursday and the reading room.",
    speakTo: "Like the club's host: warm, first names, a little in-joke about the last meeting. Each person's picks should speak to their own favourites.",
    leadWith: "The month's pick and the meeting date, then three books chosen for each member.",
    hooks: [
      { text: "Ravi reads hard science fiction and watches Arrival: give him ideas, not spaceships.", evidence: who("ravi.menon@example.com") },
      { text: "Hana's shelf is Japanese fiction and quiet films: translated novels first.", evidence: who("hana.kobayashi@example.com") },
      { text: "Marcus wants history he can argue about at the table.", evidence: who("marcus.bell@example.com") },
      {
        text: "Across the table the common ground is character-driven fiction: lead the shared sections with it.",
        evidence: cite([["One favourite each", members.map((m) => m.entities[0]?.name).filter(Boolean).join(", ")], ["Genres", tagNames(p, 4)]]),
      },
    ].filter((h) => h.evidence),
  };
}

/** Item refs ("slug:…", "event:…") in items blocks → the brand's emailItems ids. */
function withItemIds(doc: FolioDoc, ids: Map<string, string>): FolioDoc {
  const copy = JSON.parse(JSON.stringify(doc)) as FolioDoc;
  for (const section of copy.sections) {
    for (const column of section.columns) {
      for (const block of column.blocks) {
        if (block.type !== "items") continue;
        block.itemIds = block.itemIds.map((r) => ids.get(r)).filter((x): x is string => !!x);
        if (block.reasons) block.reasons = Object.fromEntries(Object.entries(block.reasons).flatMap(([r, why]) => (ids.get(r) ? [[ids.get(r)!, why]] : [])));
      }
    }
  }
  return copy;
}

type Tool = [name: string, label: string, summary: string, seconds: number];

/** A finished generate turn as the chat stores it: tool steps one after another, then the reply. */
function turn(tools: Tool[], reply: string) {
  let t = 1200;
  const steps: Record<string, unknown>[] = [];
  for (const [name, label, summary, seconds] of tools) {
    steps.push({ kind: "tool", name, label, status: "done", summary, t, ms: seconds * 1000 });
    t += seconds * 1000 + 600;
  }
  steps.push({ kind: "text", text: reply, t });
  return steps;
}

const msgId = (key: string, n: number) => `m_seed_${key}_${n}`;

/**
 * Names the subscriber groups after the tastes they were written with
 * (majority of members, one name per group), writes every audience's brief
 * and adds the campaigns and their chats. Safe to call again: it only adds
 * campaigns the brand doesn't have yet.
 */
export const finish = internalAction({
  args: { brandId: v.id("emailBrands"), site: v.optional(v.string()), startedAt: v.optional(v.number()) },
  handler: async (ctx, { brandId, site = FOLIO_SITE, startedAt }): Promise<Record<string, unknown>> => {
    site = site.replace(/\/$/, "");
    const brand: Doc<"emailBrands"> | null = await ctx.runQuery(internal.emailBrands.getInternal, { id: brandId });
    if (!brand) throw new Error("Unknown brand");
    const audiences: Audience[] = await ctx.runQuery(api.emailAudiences.list, { brandId });
    const people = audiences.find((a) => a.kind === "people");
    const groups = audiences.filter((a) => a.kind === "group");

    /* 1. Name each group after the intended taste most of its members share. */
    const membersOf = new Map<string, ContactLite[]>();
    for (const a of [...groups, ...(people ? [people] : [])]) membersOf.set(a._id, await ctx.runQuery(internal.emailContacts.byAudienceInternal, { audienceId: a._id }));
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
      const size = membersOf.get(a._id)!.length;
      const intended = key ? FOLIO_SUBSCRIBER_GROUPS[key].emails.filter((e) => membersOf.get(a._id)!.some((m) => m.email === e)).length : 0;
      if (key) {
        await ctx.runMutation(internal.emailAudiences.setBrief, { id: a._id, name: FOLIO_SUBSCRIBER_GROUPS[key].name, brief: groupBrief(key, a.profile as Profile) });
      }
      groupReport.push(`${key ? FOLIO_SUBSCRIBER_GROUPS[key].name : a.name}: ${size} people (${intended} as written), ${a.status}, top ${a.topEntities.slice(0, 3).join(", ")}`);
    }
    if (people) {
      await ctx.runMutation(internal.emailAudiences.setBrief, { id: people._id, brief: clubBrief(membersOf.get(people._id)!, people.profile as Profile) });
    }
    const literary = groups.find((a) => named.get(a._id) === "literary");

    /* 2. The campaigns, themed with the kit, refs swapped for item ids. */
    const items: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
    const byName = new Map(items.map((i) => [i.name, i._id as string]));
    const refIds = new Map<string, string>();
    for (const it of folioItems(site)) {
      const id = byName.get(it.name);
      if (id) refIds.set(it.ref, id);
    }
    const have: Doc<"emailCampaigns">[] = await ctx.runQuery(api.emailCampaigns.list, { brandId });
    const theme = themeFromKit(brand.kit as EmailKit);
    const now = Date.now();
    const created: string[] = [];
    const club = people ? membersOf.get(people._id)! : [];
    const literaryMembers = literary ? membersOf.get(literary._id)! : [];

    for (const c of folioCampaigns(site)) {
      if (have.some((x) => x.name === c.name)) continue;
      const audienceId = c.audience?.kind === "group" ? literary?._id : c.audience?.kind === "people" ? people?._id : undefined;
      const doc = { ...withItemIds(c.doc, refIds), theme } as EmailDoc;
      const plan = chatFor(c.key, {
        // The group was renamed above; the row read earlier still has its automatic name.
        groupName: FOLIO_SUBSCRIBER_GROUPS.literary.name,
        groupSize: literaryMembers.length,
        groupTop: favourites(literary?.profile as Profile, [], 5, true),
        groupGenres: tagNames(literary?.profile as Profile, 3),
        groupFilms: cultureNames(literary?.profile as Profile, "films", 3),
        clubSize: club.length,
        // One favourite per member shows how wide the club reads (the audience's top entities are mostly one person's).
        clubTop: andList(club.map((m) => m.entities[0]?.name).filter((x): x is string => !!x).slice(0, 6)),
      });
      const id = await ctx.runMutation(api.emailCampaigns.create, {
        brandId,
        name: c.name,
        doc,
        prompt: plan.prompt,
        ...(c.key === "debut-night" ? { templateId: "event-invite" } : {}),
        ...(audienceId ? { audienceId } : {}),
      });
      await ctx.runMutation(internal.emailSeed.backdate, { id, at: now - plan.daysAgo * DAY });
      await ctx.runMutation(internal.emailCampaigns.appendChat, {
        id,
        messages: plan.messages.map((m, n) => ({
          id: msgId(c.key, n),
          role: m.role,
          at: now - plan.daysAgo * DAY + m.minutes * 60_000,
          // An agent turn's text is its reply (the last step), for the agent's own history.
          text: m.text || String(m.steps?.at(-1)?.text ?? ""),
          ...(m.steps ? { steps: m.steps } : {}),
        })),
      });
      if (c.status === "sent" && audienceId) {
        // The simulation is random (each person opens with p ≈ 0.45); with nine
        // recipients a run can come out nearly empty, which reads as broken in
        // a demo. Re-roll (it replaces the sends) until it looks like a normal send.
        let sent = await ctx.runMutation(internal.emailSend.seedSent, { campaignId: id, sentAt: now - 3 * DAY + 2 * HOUR });
        for (let roll = 0; roll < 6 && (sent.opens < 3 || sent.clicks < 1); roll++) {
          sent = await ctx.runMutation(internal.emailSend.seedSent, { campaignId: id, sentAt: now - 3 * DAY + 2 * HOUR });
        }
        created.push(`${c.name} (sent: ${sent.delivered} delivered, ${sent.opens} opens, ${sent.clicks} clicks)`);
      } else created.push(`${c.name} (${c.status}${audienceId ? "" : ", no audience"})`);
    }

    // Covers last: the campaigns above embed some of them too.
    const covers = await ctx.runAction(internal.emailSeed.mirrorCovers, { brandId });
    const result = {
      groups: groupReport,
      campaigns: created,
      covers,
      ...(startedAt ? { seconds: Math.round((Date.now() - startedAt) / 1000) } : {}),
    };
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
async function dropCovers(ctx: ActionCtx, brandId: Id<"emailBrands">) {
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

/* Builder chats ------------------------------------------------------------------------- */

interface ChatFacts {
  groupName: string;
  groupSize: number;
  groupTop: string;
  groupGenres: string;
  groupFilms: string;
  clubSize: number;
  clubTop: string;
}

type ChatMessage = { role: "merchant" | "agent"; minutes: number; text: string; steps?: Record<string, unknown>[] };

/** A short, believable builder conversation per campaign, citing the audience's real taste evidence. */
function chatFor(key: "literary-new" | "autumn-list" | "debut-night", f: ChatFacts): { prompt: string; daysAgo: number; messages: ChatMessage[] } {
  if (key === "literary-new") {
    const prompt = `Write this month's new literary fiction email for ${f.groupName}: four of the new books, a staff note and a nudge about Debut Night.`;
    return {
      prompt,
      daysAgo: 4,
      messages: [
        { role: "merchant", minutes: 0, text: prompt },
        {
          role: "agent",
          minutes: 2,
          text: "",
          steps: turn(
            [
              ["get_brand", "Reading Folio & Fern's kit and voice", "Fraunces and Source Sans 3, fern green and terracotta; warm, bookish, never snobbish", 2],
              ["get_audience", `Reading ${f.groupName}`, `${f.groupSize} people. ${f.groupTop}${f.groupGenres ? `. Genres: ${f.groupGenres}` : ""}`, 3],
              ["qloo_insights", "Asking Qloo what else they watch and read", f.groupFilms ? `Films that go with their taste: ${f.groupFilms}` : "Films and music around Rooney and Vuong", 6],
              ["pick_items", "Ranking the new books by taste fit", "Kairos, Western Lane, The Safekeep and Orbital lead; all on the new table", 5],
              ["search_images", "Finding a photograph", "A reader by the shelves under warm light", 4],
              ["start_email", "Starting the email", "Four novels for the slow evenings ahead", 1],
              ["add_section", "Adding the header", "", 1],
              ["add_section", "Adding the hero", "Green band, terracotta button", 2],
              ["add_section", "Adding the picks", "Four books, each with a reason", 3],
              ["add_section", "Adding Theo's note", "On Western Lane", 1],
              ["add_section", "Adding Debut Night", "Thursday, November 5", 2],
              ["add_section", "Adding the footer", "", 1],
              ["review_email", "Checking it on desktop and phone", "Reads well at 375 px; alt text on every image", 6],
            ],
            `Done. I wrote it for ${f.groupName} (${f.groupSize} people). Their strongest signals are ${f.groupTop || "Sally Rooney, Ocean Vuong and Phoebe Bridgers"}, so the email leads with mood rather than plot: a lamp-lit hero, then four picks, each explained in their own references (Kairos for Normal People readers, Western Lane next to Phoebe Bridgers, The Safekeep for Portrait of a Lady on Fire, Orbital for Aftersun). Theo's note on Western Lane sits in the middle, and Debut Night closes it, since two of the four picks are debuts.\n\nSubject: "Four new novels for slow evenings".`,
          ),
        },
        { role: "merchant", minutes: 9, text: "Love it. Can the hero button be terracotta so it stands out on the green?" },
        {
          role: "agent",
          minutes: 10,
          text: "",
          steps: turn([["edit_email", "Changing the hero button", "Fill: accent (terracotta)", 1]], "Done: the hero button now uses the terracotta accent, and the event button stays an outline so there's one clear first click."),
        },
      ],
    };
  }
  if (key === "autumn-list") {
    const prompt = "Autumn reading list for the book club: three picks for each member from their own taste, plus October's pick and the November date.";
    return {
      prompt,
      daysAgo: 2,
      messages: [
        { role: "merchant", minutes: 0, text: prompt },
        {
          role: "agent",
          minutes: 2,
          text: "",
          steps: turn(
            [
              ["get_brand", "Reading Folio & Fern's kit and voice", "Warm, bookish, specific", 2],
              ["get_audience", "Reading the Book club", `${f.clubSize} people, one profile each. ${f.clubTop}`, 3],
              ["pick_items", "Ranking books for the club as a whole", "Kairos, Piranesi, The God of the Woods work across the table", 5],
              ["search_images", "Finding a photograph", "Friends laughing over their books", 4],
              ["start_email", "Starting the email", "Your autumn reading list", 1],
              ["add_section", "Adding the header", "", 1],
              ["add_section", "Adding the hero", "Heading and intro marked personal", 2],
              ["add_section", "Adding the picks", "Taste slot: three books per person", 2],
              ["add_section", "Adding October's pick", "Small Things Like These, Thursday 22 October", 2],
              ["add_section", "Adding November's date", "The Bee Sting, Thursday 19 November", 1],
              ["add_section", "Adding the footer", "", 1],
            ],
            `Here's the base version. The heading, the intro and the three picks are taste slots: each of the ${f.clubSize} members gets their own, written from their profile. The club reads very widely (${f.clubTop || "Cormac McCarthy to Emily Henry"}), so the defaults are books that work for the whole table: Kairos, Piranesi and The God of the Woods. Below them sit October's pick and a heads-up that November meets a week early for Thanksgiving.\n\nNext: Recipients, then "Personalise for each person".`,
          ),
        },
      ],
    };
  }
  const prompt = "Invite for Debut Night on Thursday, November 5 with Marisol Tran, Owen Achterberg and Ada Lindqvist. Start from the event template.";
  return {
    prompt,
    daysAgo: 1,
    messages: [
      { role: "merchant", minutes: 0, text: prompt },
      {
        role: "agent",
        minutes: 2,
        text: "",
        steps: turn(
          [
            ["get_brand", "Reading Folio & Fern's kit and voice", "Warm, bookish, specific", 2],
            ["get_email", "Reading the Event invite template", "Photo, date line, heading, button, details, quote, footer", 1],
            ["list_items", "Looking up the event", "Debut Night: three first novels, the reading room, free with RSVP", 1],
            ["search_images", "Finding a photograph", "An author talking to a small room under lamplight", 4],
            ["edit_email", "Rewriting the template for Folio & Fern", "Date and place up top, one line per author, Maeve as host", 6],
            ["review_email", "Checking it on desktop and phone", "Authors stack on phones; RSVP buttons link to the events page", 5],
          ],
          `I started from the Event invite template and rewrote it for Folio & Fern: the reading room photo, the date and place up top, one line for each author and book, the practical details, and Maeve's note as host. Both RSVP buttons go to the events page.\n\nIt has no audience yet. ${f.groupName} is the natural fit (debut and literary fiction lead their taste: ${f.groupTop || "Sally Rooney, Ocean Vuong"}), or send it to every Fern Letter group.`,
        ),
      },
    ],
  };
}

/* Status ---------------------------------------------------------------------------------- */

/** What the seed made so far. */
export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const brand = await ctx.db
      .query("emailBrands")
      .withIndex("by_slug", (q) => q.eq("slug", SLUG))
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
        books: items.filter((i) => i.kind === "book").length,
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
      campaigns: campaigns.map((c) => ({ id: c._id, name: c.name, status: c.status, audienceId: c.audienceId ?? null, templateId: c.templateId ?? null, stats: c.stats, sentAt: c.sentAt ?? null })),
    };
  },
});

/* Assets ------------------------------------------------------------------------------------ */

// apps/stores/public/folio/logo.svg and mark.svg rendered at 2x (540 × 132 and
// 128 × 128), base64, so the seed can store them without reaching the site.
const LOGO_PNG = "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";
const MARK_PNG = "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";
