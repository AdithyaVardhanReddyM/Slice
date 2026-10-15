import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import {
  bestGroup,
  compileGroupAudience,
  compilePersonProfile,
  individualsAudience,
  prospectFits,
  refreshPeopleAudience,
  resolveTerms,
  settleGroup,
  type GroupTaste,
  type ResolvedTerm,
} from "./emailAudiences";
import { editableBrand } from "./emailBrands";
import type { AudienceProfile } from "./emailTypes";
import { ageBucket, normalizeGender, splitTerms } from "./pagesCsv";
import { safeRecord } from "./pagesUtil";
import { plausible } from "./pagesUploads";
import type { Span } from "./qlooApi";
import { emailEntityValidator, emailMappingValidator } from "./schema";

// The people a brand emails. A contact came in with one upload (or by hand)
// and is either in a taste group or one of the brand's individual contacts,
// with a profile of its own. Their taste is read from what they bought or
// booked (matched to the brand's catalog first) and, when the business knows
// it, what they like. Opting out covers the whole brand.

export type Mapping = Infer<typeof emailMappingValidator>;

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export const cleanEmail = (raw: string | undefined): string | null => {
  const e = raw?.trim().toLowerCase().replace(/^mailto:/, "") ?? "";
  return EMAIL_RE.test(e) ? e : null;
};

/** "maya.okafor@x" → "Maya Okafor", for rows without a name. */
const nameFromEmail = (email: string) =>
  email
    .split("@")[0]
    .split(/[._+-]+/)
    .filter((w) => /[a-z]/i.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || email;

/** "Salt, Fat, Acid, Heat" stays one purchase: purchases split on ; | and new lines, never commas. */
export function splitPurchases(value: string | undefined | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[;|\n]/)) {
    const term = raw.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
    if (term.length < 2 || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push(term.slice(0, 160));
  }
  return out;
}

/** Where someone lives as precisely as we know it: "Park Slope, Brooklyn", else the city. */
export const locationOf = (c: { neighborhood?: string; city?: string }) => [c.neighborhood, c.city].filter(Boolean).join(", ") || undefined;

/** Everything a person's taste is read from: what they bought, then what they like. */
export const tasteTerms = (c: { purchases?: string[]; interests: string[] }) => [...new Set([...(c.purchases ?? []), ...c.interests])];

/** A contact row from a CSV row and its column mapping, or null without a valid email. */
export function contactFromRow(brandId: Id<"emailBrands">, listId: Id<"emailLists">, row: Record<string, string>, mapping: Mapping, now: number) {
  const pick = (col?: string) => (col ? row[col]?.trim() || undefined : undefined);
  const email = cleanEmail(pick(mapping.email));
  if (!email) return null;
  let firstName = pick(mapping.firstName);
  const lastName = pick(mapping.lastName);
  const name = pick(mapping.name) ?? ([firstName, lastName].filter(Boolean).join(" ") || nameFromEmail(email));
  firstName ??= name.split(/\s+/)[0];
  const purchases: string[] = [];
  for (const col of mapping.purchases ?? []) {
    for (const p of splitPurchases(row[col])) if (!purchases.some((x) => x.toLowerCase() === p.toLowerCase())) purchases.push(p);
  }
  const interests: string[] = [];
  const seen = new Set<string>();
  for (const col of mapping.taste) {
    for (const t of splitTerms(row[col])) {
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      interests.push(t.slice(0, 120));
    }
  }
  return {
    brandId,
    listId,
    email,
    name: name.slice(0, 120),
    ...(firstName ? { firstName: firstName.slice(0, 60) } : {}),
    ...(lastName ? { lastName: lastName.slice(0, 60) } : {}),
    row: safeRecord(row) ?? {},
    ...(purchases.length ? { purchases: purchases.slice(0, 24) } : {}),
    interests: interests.slice(0, 24),
    entities: [] as Doc<"emailContacts">["entities"],
    ...strip({
      neighborhood: pick(mapping.neighborhood),
      city: pick(mapping.city),
      country: pick(mapping.country),
      age: ageBucket(pick(mapping.age)),
      gender: normalizeGender(pick(mapping.gender)),
    }),
    createdAt: now,
  };
}

const strip = <T extends Record<string, unknown>>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as Partial<T>;

/** A contact as compiles read it: no profile, no raw row. */
export type ContactLite = Omit<Doc<"emailContacts">, "profile" | "row">;

/** A contact without its profile, for lists and grids (profiles come with `get`). */
const slim = ({ profile, ...c }: Doc<"emailContacts">) => ({ ...c, hasProfile: !!profile });

export const list = query({
  args: { listId: v.id("emailLists") },
  handler: async (ctx, { listId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_list", (q) => q.eq("listId", listId)).collect();
    return contacts.map(slim);
  },
});

export const byAudience = query({
  args: { audienceId: v.id("emailAudiences") },
  handler: async (ctx, { audienceId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", audienceId)).collect();
    return contacts.map(slim);
  },
});

/** Members of an audience in list order, without profiles (compiles read entities and terms). */
export const byAudienceInternal = internalQuery({
  args: { audienceId: v.id("emailAudiences") },
  handler: async (ctx, { audienceId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_audience", (q) => q.eq("audienceId", audienceId)).collect();
    return contacts.map(({ profile: _p, row: _r, ...c }) => c);
  },
});

export const byListInternal = internalQuery({
  args: { listId: v.id("emailLists") },
  handler: async (ctx, { listId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_list", (q) => q.eq("listId", listId)).collect();
    return contacts.map(({ profile: _p, row: _r, ...c }) => c);
  },
});

export const get = query({
  args: { id: v.id("emailContacts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("emailContacts") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** How many people the brand can email. */
export const counts = query({
  args: { brandId: v.id("emailBrands") },
  returns: v.object({ total: v.number(), subscribed: v.number(), unsubscribed: v.number(), lists: v.number(), withProfile: v.number() }),
  handler: async (ctx, { brandId }) => {
    const contacts = await ctx.db.query("emailContacts").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
    const emails = new Set(contacts.map((c) => c.email));
    const out = new Set(contacts.filter((c) => c.unsubscribed).map((c) => c.email));
    return {
      total: emails.size,
      subscribed: emails.size - out.size,
      unsubscribed: out.size,
      lists: lists.length,
      withProfile: contacts.filter((c) => c.profileStatus === "ready").length,
    };
  },
});

/* Adding and editing by hand ------------------------------------------------------------- */

const HAND_LIST = "Added by hand";

/** The brand's "Added by hand" upload: where people added one at a time are filed, made on first use. */
async function handList(ctx: MutationCtx, brandId: Id<"emailBrands">): Promise<Doc<"emailLists">> {
  const lists = await ctx.db.query("emailLists").withIndex("by_brand", (q) => q.eq("brandId", brandId)).collect();
  const found = lists.find((l) => l.source === "manual" && l.mode === "people");
  if (found) return found;
  const now = Date.now();
  const listId = await ctx.db.insert("emailLists", {
    brandId,
    name: HAND_LIST,
    source: "manual",
    columns: ["email", "name", "city", "age", "gender", "interests"],
    rowCount: 0,
    mode: "people",
    mapping: { email: "email", name: "name", taste: ["interests"], city: "city", age: "age", gender: "gender" },
    status: "ready",
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(listId))!;
}

/**
 * One person by hand, filed under the brand's "Added by hand" upload. As an
 * individual contact their profile is read next; for a taste group their
 * favourites are resolved and they join the group they fit best, or start a
 * new one when they fit none.
 */
export const add = mutation({
  args: {
    brandId: v.id("emailBrands"),
    keep: v.optional(v.union(v.literal("group"), v.literal("individual"))),
    email: v.string(),
    name: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    /** What they bought or booked, most recent first. */
    purchases: v.optional(v.array(v.string())),
    interests: v.optional(v.array(v.string())),
  },
  returns: v.id("emailContacts"),
  handler: async (ctx, { keep = "individual", ...args }) => {
    await editableBrand(ctx, args.brandId);
    const email = cleanEmail(args.email);
    if (!email) throw new Error(`"${args.email}" isn't an email address`);
    const same = await ctx.db.query("emailContacts").withIndex("by_brand_email", (q) => q.eq("brandId", args.brandId).eq("email", email)).collect();
    if (same.length) throw new Error(`${email} is already one of your contacts`);
    const tasteless = !args.purchases?.length && !args.interests?.length;
    if (keep === "group" && tasteless) {
      const groups = (await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", args.brandId)).collect()).filter((a) => a.kind === "group");
      if (!groups.length) throw new Error("There's no taste group yet to place them in by age and location. Add what they bought, or add them as an individual contact.");
    }
    const list = await handList(ctx, args.brandId);
    const individuals = keep === "individual" ? await individualsAudience(ctx, args.brandId) : null;
    const now = Date.now();
    const interests = [...new Set((args.interests ?? []).flatMap((t) => splitTerms(t)))].slice(0, 24);
    const purchases = [...new Set((args.purchases ?? []).map((p) => p.trim()).filter((p) => p.length > 1))].slice(0, 24);
    const name = args.name.trim() || nameFromEmail(email);
    const id = await ctx.db.insert("emailContacts", {
      brandId: args.brandId,
      listId: list._id,
      email,
      name,
      firstName: args.firstName?.trim() || name.split(/\s+/)[0],
      ...(args.lastName?.trim() ? { lastName: args.lastName.trim() } : {}),
      row: safeRecord({ email, name, neighborhood: args.neighborhood, city: args.city, age: args.age, gender: args.gender, purchases: purchases.join("; "), interests: interests.join("; ") }) ?? {},
      ...(purchases.length ? { purchases } : {}),
      interests,
      entities: [],
      ...strip({ neighborhood: args.neighborhood?.trim() || undefined, city: args.city?.trim() || undefined, age: ageBucket(args.age), gender: normalizeGender(args.gender) }),
      ...(individuals ? { individual: true, audienceId: individuals._id, profileStatus: "pending" as const } : {}),
      createdAt: now,
    });
    await ctx.db.patch(list._id, { rowCount: list.rowCount + 1, updatedAt: now });
    if (individuals) {
      await ctx.db.patch(individuals._id, { status: "compiling", size: individuals.size + 1, progress: { value: 0.5, label: `Reading ${name}` }, updatedAt: now });
    }
    await ctx.scheduler.runAfter(0, internal.emailContacts.compileInternal, { id });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("emailContacts"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    neighborhood: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    purchases: v.optional(v.array(v.string())),
    interests: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...f }) => {
    const contact = await ctx.db.get(id);
    if (!contact) throw new Error("Unknown contact");
    await editableBrand(ctx, contact.brandId);
    const update: Partial<Doc<"emailContacts">> = {};
    if (f.email !== undefined) {
      const email = cleanEmail(f.email);
      if (!email) throw new Error(`"${f.email}" isn't an email address`);
      update.email = email;
    }
    if (f.name?.trim()) update.name = f.name.trim();
    if (f.firstName !== undefined) update.firstName = f.firstName.trim() || undefined;
    if (f.lastName !== undefined) update.lastName = f.lastName.trim() || undefined;
    if (f.neighborhood !== undefined) update.neighborhood = f.neighborhood.trim() || undefined;
    if (f.city !== undefined) update.city = f.city.trim() || undefined;
    if (f.age !== undefined) update.age = ageBucket(f.age);
    if (f.gender !== undefined) update.gender = normalizeGender(f.gender);
    let retaste = ["neighborhood", "city", "age", "gender"].some((k) => k in update && update[k as keyof typeof update] !== contact[k as keyof typeof contact]);
    if (f.interests !== undefined) {
      const interests = [...new Set(f.interests.flatMap((t) => splitTerms(t)))].slice(0, 24);
      if (interests.join("|") !== contact.interests.join("|")) {
        update.interests = interests;
        retaste = true;
      }
    }
    if (f.purchases !== undefined) {
      const purchases = [...new Set(f.purchases.map((p) => p.trim()).filter((p) => p.length > 1))].slice(0, 24);
      if (purchases.join("|") !== (contact.purchases ?? []).join("|")) {
        update.purchases = purchases;
        retaste = true;
      }
    }
    // What they bought or like changed: their entities are read again.
    if (update.interests || update.purchases) {
      update.entities = [];
      update.boughtItemIds = [];
    }
    if (retaste && contact.individual) update.profileStatus = "pending";
    await ctx.db.patch(id, update);
    if (retaste) {
      if (contact.individual && contact.audienceId) await ctx.db.patch(contact.audienceId, { status: "compiling", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.emailContacts.compileInternal, { id });
    }
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const contact = await ctx.db.get(id);
    if (!contact) return null;
    await editableBrand(ctx, contact.brandId);
    await ctx.db.delete(id);
    const list = await ctx.db.get(contact.listId);
    if (list) await ctx.db.patch(list._id, { rowCount: Math.max(0, list.rowCount - 1), updatedAt: Date.now() });
    if (contact.audienceId) {
      const audience = await ctx.db.get(contact.audienceId);
      if (audience?.kind === "people") await refreshPeopleAudience(ctx, audience._id);
      else if (audience) await settleGroup(ctx, audience._id);
    }
    return null;
  },
});

/* Compile ------------------------------------------------------------------------------- */

/** pending → compiling, so two people steps never read the same person. */
export const claim = internalMutation({
  args: { id: v.id("emailContacts") },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c || (c.profileStatus && c.profileStatus !== "pending")) return false;
    await ctx.db.patch(id, { profileStatus: "compiling" });
    return true;
  },
});

export const setProfile = internalMutation({
  args: { id: v.id("emailContacts"), profile: v.optional(v.any()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, profile, error }) => {
    if (!(await ctx.db.get(id))) return null;
    await ctx.db.patch(id, profile ? { profile, profileStatus: "ready", profileError: undefined } : { profileStatus: "failed", profileError: error ?? "Couldn't read their taste" });
    return null;
  },
});

export const setEntities = internalMutation({
  args: {
    updates: v.array(v.object({ id: v.id("emailContacts"), entities: v.array(emailEntityValidator), boughtItemIds: v.optional(v.array(v.id("emailItems"))) })),
  },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) {
      if (await ctx.db.get(u.id)) await ctx.db.patch(u.id, { entities: u.entities, ...(u.boughtItemIds ? { boughtItemIds: u.boughtItemIds } : {}) });
    }
    return null;
  },
});

/* Reading taste from purchases ------------------------------------------------------------- */

/** "The Searcher", "the searcher!" and "Searcher" are one title. */
const titleKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");

type TasteSource = { _id: Id<"emailContacts">; purchases?: string[]; interests: string[] };
type ReadTaste = { entities: Doc<"emailContacts">["entities"]; boughtItemIds: Id<"emailItems">[] };

/**
 * People's taste as Qloo entities. A purchase found in the brand's catalog
 * counts as that item (and its Qloo match, made when the catalog was read);
 * other purchases, and what they like, are searched in Qloo, most common
 * first. Purchases come first in each person's entities.
 */
export async function readTastes(
  ctx: ActionCtx,
  trace: Span[],
  brandId: Id<"emailBrands">,
  contacts: TasteSource[],
  options: { maxTerms?: number; label?: string; onProgress?: (done: number, total: number) => unknown } = {},
): Promise<Map<string, ReadTaste>> {
  const items: Doc<"emailItems">[] = await ctx.runQuery(internal.emailItems.listInternal, { brandId });
  const byTitle = new Map(items.map((i) => [titleKey(i.name), i]));
  // "The Searcher by Tana French" and "The Searcher — Tana French" are The Searcher.
  const itemFor = (p: string) => byTitle.get(titleKey(p)) ?? byTitle.get(titleKey(p.split(/\s+(?:—|–|-|by)\s+/i)[0]));

  const counts = new Map<string, { term: string; n: number }>();
  const ask = (t: string) => {
    const cur = counts.get(t.toLowerCase());
    if (cur) cur.n++;
    else counts.set(t.toLowerCase(), { term: t, n: 1 });
  };
  for (const c of contacts) {
    for (const p of c.purchases ?? []) if (!itemFor(p)?.qloo) ask(p);
    for (const t of c.interests) ask(t);
  }
  const ordered = [...counts.values()].sort((a, b) => b.n - a.n);
  const max = options.maxTerms ?? 600;
  if (ordered.length > max) trace.push({ kind: "slice", name: "Keep the most common terms", ms: 0, result: `${max} of ${ordered.length} terms` });
  const terms = ordered.slice(0, max).map((x) => x.term);
  const found = terms.length
    ? await resolveTerms(ctx, trace, terms, { label: options.label ?? `Find ${terms.length} purchases and favourites in Qloo`, onProgress: options.onProgress })
    : new Map<string, ResolvedTerm>();

  const out = new Map<string, ReadTaste>();
  let bought = 0;
  for (const c of contacts) {
    const seen = new Set<string>();
    const entities: ReadTaste["entities"] = [];
    const boughtItemIds: Id<"emailItems">[] = [];
    const add = (e: ReadTaste["entities"][number]) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      entities.push(e);
    };
    const searched = (t: string) => {
      const e = found.get(t.toLowerCase());
      if (e && plausible(t, e.name)) add({ id: e.id, name: e.name, type: e.type, ...(e.image ? { image: e.image } : {}) });
    };
    for (const p of c.purchases ?? []) {
      const item = itemFor(p);
      if (item && !boughtItemIds.includes(item._id)) boughtItemIds.push(item._id);
      if (item?.qloo) add({ id: item.qloo.id, name: item.qloo.name, type: item.qloo.type, ...(item.image ? { image: item.image } : {}) });
      else searched(p);
    }
    for (const t of c.interests) searched(t);
    bought += boughtItemIds.length;
    out.set(c._id, { entities: entities.slice(0, 40), boughtItemIds });
  }
  const purchases = contacts.reduce((n, c) => n + (c.purchases?.length ?? 0), 0);
  if (purchases) trace.push({ kind: "slice", name: "Find purchases in the catalog", ms: 0, result: `${bought} of ${purchases} purchases are catalog items` });
  return out;
}

/** Resolves a contact's favourites if needed, then reads their profile (individuals) or places them in a taste group. */
async function compileOne(ctx: ActionCtx, id: Id<"emailContacts">) {
  const contact: Doc<"emailContacts"> | null = await ctx.runQuery(internal.emailContacts.getInternal, { id });
  if (!contact) return;
  const trace: Span[] = [];
  let entities = contact.entities;
  if (!entities.length && tasteTerms(contact).length) {
    const read = (await readTastes(ctx, trace, contact.brandId, [contact])).get(contact._id)!;
    entities = read.entities;
    await ctx.runMutation(internal.emailContacts.setEntities, { updates: [{ id, entities, boughtItemIds: read.boughtItemIds }] });
  }
  if (!contact.individual) {
    await placeInGroup(ctx, contact, entities);
    return;
  }
  if (!contact.audienceId) return;
  await ctx.runMutation(internal.emailContacts.claim, { id });
  try {
    const profile = await compilePersonProfile(ctx, trace, { ...contact, city: locationOf(contact), interests: tasteTerms(contact), entities }, async () => {});
    await ctx.runMutation(internal.emailContacts.setProfile, { id, profile });
  } catch (err) {
    await ctx.runMutation(internal.emailContacts.setProfile, { id, error: String(err).replace(/^Error: /, "").slice(0, 300) });
  }
  await ctx.runMutation(internal.emailAudiences.refreshPeople, {
    id: contact.audienceId,
    trace: [{ kind: "slice", name: `Read ${contact.name}`, ms: 0, result: `${entities.length} purchases and favourites found in Qloo` }],
  });
}

/**
 * The taste group this person fits best; with none they fit (or none yet), a
 * new group of their own, named after what they love, read from them.
 */
async function placeInGroup(ctx: ActionCtx, contact: Doc<"emailContacts">, entities: Doc<"emailContacts">["entities"]) {
  if (!entities.length) {
    // No purchases Qloo knows: the group people like them (age, gender, city) go for.
    const docs: Doc<"emailAudiences">[] = await ctx.runQuery(internal.emailAudiences.groupsOf, { brandId: contact.brandId });
    const known = !!(contact.age || contact.gender || locationOf(contact));
    const best = known ? (await prospectFits(ctx, [], contact, docs))[0] : undefined;
    const target = best?.id ?? [...docs].sort((a, b) => b.size - a.size)[0]?._id;
    if (target) {
      await ctx.runMutation(internal.emailLists.joinGroups, {
        updates: [{ id: contact._id, audienceId: target, placement: { by: "demographics", note: best?.note || "No purchases, age or city yet, so they joined the largest group." } }],
      });
    }
    return;
  }
  const groups: GroupTaste[] = await ctx.runQuery(internal.emailAudiences.groupTastes, { brandId: contact.brandId });
  const fit = bestGroup(entities.map((e) => e.id), groups);
  if (fit) {
    await ctx.runMutation(internal.emailLists.joinGroups, { updates: [{ id: contact._id, audienceId: fit.id }] });
    return;
  }
  const [audienceId] = await ctx.runMutation(internal.emailLists.newGroups, {
    listId: contact.listId,
    clusters: [{ index: 0, size: 1, topEntities: entities.slice(0, 6).map((e) => e.name) }],
  });
  await ctx.runMutation(internal.emailLists.joinGroups, { updates: [{ id: contact._id, audienceId }] });
  await compileGroupAudience(ctx, audienceId);
}

export const compileInternal = internalAction({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    await compileOne(ctx, id);
    return null;
  },
});

/** Reads one person's taste again (individuals) or places them in a taste group again. */
export const compile = action({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    await ctx.runMutation(internal.emailContacts.requeue, { id });
    await compileOne(ctx, id);
    return null;
  },
});

export const requeue = internalMutation({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) return null;
    await ctx.db.patch(id, { entities: [], ...(c.profileStatus ? { profileStatus: "pending" as const, profileError: undefined } : {}) });
    return null;
  },
});

/* Opting out ------------------------------------------------------------------------- */

/** Marks every contact with this email in the brand as opted out. Returns whether anything changed. */
export async function unsubscribeEmail(ctx: MutationCtx, brandId: Id<"emailBrands">, email: string, at: number): Promise<boolean> {
  const rows = await ctx.db.query("emailContacts").withIndex("by_brand_email", (q) => q.eq("brandId", brandId).eq("email", email)).collect();
  let changed = false;
  for (const r of rows) {
    if (r.unsubscribed) continue;
    await ctx.db.patch(r._id, { unsubscribed: true, unsubscribedAt: at });
    changed = true;
  }
  return changed;
}

/** Back on the list (the merchant re-adds someone who asked to be). */
export const resubscribe = mutation({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const contact = await ctx.db.get(id);
    if (!contact) return null;
    await editableBrand(ctx, contact.brandId);
    const rows = await ctx.db.query("emailContacts").withIndex("by_brand_email", (q) => q.eq("brandId", contact.brandId).eq("email", contact.email)).collect();
    for (const r of rows) await ctx.db.patch(r._id, { unsubscribed: undefined, unsubscribedAt: undefined });
    return null;
  },
});
