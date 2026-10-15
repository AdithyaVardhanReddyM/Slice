import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { compilePersonProfile, refreshPeopleAudience, resolveTerms } from "./emailAudiences";
import { editableBrand } from "./emailBrands";
import { MAX_PEOPLE_LIST, type AudienceProfile } from "./emailTypes";
import { ageBucket, normalizeGender, splitTerms } from "./pagesCsv";
import { safeRecord } from "./pagesUtil";
import { plausible } from "./pagesUploads";
import type { Span } from "./qlooApi";
import { emailEntityValidator, emailMappingValidator } from "./schema";

// The people a brand emails. A contact belongs to one list; in a groups list
// it joins the taste group k-means put it in, in a people list it carries a
// profile of its own. Opting out covers every list of the brand.

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

/** A contact row from a CSV row and its column mapping, or null without a valid email. */
export function contactFromRow(brandId: Id<"emailBrands">, listId: Id<"emailLists">, row: Record<string, string>, mapping: Mapping, now: number) {
  const pick = (col?: string) => (col ? row[col]?.trim() || undefined : undefined);
  const email = cleanEmail(pick(mapping.email));
  if (!email) return null;
  let firstName = pick(mapping.firstName);
  const lastName = pick(mapping.lastName);
  const name = pick(mapping.name) ?? ([firstName, lastName].filter(Boolean).join(" ") || nameFromEmail(email));
  firstName ??= name.split(/\s+/)[0];
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
    interests: interests.slice(0, 24),
    entities: [] as Doc<"emailContacts">["entities"],
    ...strip({
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

/** The brand's "Added by hand" list (kept one by one), created with its audience on first use. */
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
  const audienceId = await ctx.db.insert("emailAudiences", {
    brandId,
    listId,
    name: HAND_LIST,
    kind: "people",
    status: "ready",
    size: 0,
    topEntities: [],
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(listId, { audienceId });
  return (await ctx.db.get(listId))!;
}

/**
 * One person by hand. Without `listId` they go to the brand's "Added by hand"
 * list. In a people list their profile is compiled next; in a groups list
 * their favourites are resolved and they join the nearest group.
 */
export const add = mutation({
  args: {
    brandId: v.id("emailBrands"),
    listId: v.optional(v.id("emailLists")),
    email: v.string(),
    name: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
  },
  returns: v.id("emailContacts"),
  handler: async (ctx, args) => {
    await editableBrand(ctx, args.brandId);
    const list = args.listId ? await ctx.db.get(args.listId) : await handList(ctx, args.brandId);
    if (!list || list.brandId !== args.brandId) throw new Error("Unknown list");
    const email = cleanEmail(args.email);
    if (!email) throw new Error(`"${args.email}" isn't an email address`);
    const members = await ctx.db.query("emailContacts").withIndex("by_list", (q) => q.eq("listId", list._id)).collect();
    if (members.some((m) => m.email === email)) throw new Error(`${email} is already in ${list.name}`);
    if (list.mode === "people" && members.length >= MAX_PEOPLE_LIST) {
      throw new Error(`A list kept one by one holds up to ${MAX_PEOPLE_LIST} people. Add them to a list clustered into taste groups instead.`);
    }
    const now = Date.now();
    const interests = [...new Set((args.interests ?? []).flatMap((t) => splitTerms(t)))].slice(0, 24);
    const name = args.name.trim() || nameFromEmail(email);
    const id = await ctx.db.insert("emailContacts", {
      brandId: args.brandId,
      listId: list._id,
      email,
      name,
      firstName: args.firstName?.trim() || name.split(/\s+/)[0],
      ...(args.lastName?.trim() ? { lastName: args.lastName.trim() } : {}),
      row: safeRecord({ email, name, city: args.city, age: args.age, gender: args.gender, interests: interests.join("; ") }) ?? {},
      interests,
      entities: [],
      ...strip({ city: args.city?.trim() || undefined, age: ageBucket(args.age), gender: normalizeGender(args.gender) }),
      ...(list.mode === "people" && list.audienceId ? { audienceId: list.audienceId, profileStatus: "pending" as const } : {}),
      // Someone who opted out before stays opted out when added again.
      ...((await ctx.db.query("emailContacts").withIndex("by_brand_email", (q) => q.eq("brandId", args.brandId).eq("email", email)).collect()).some((c) => c.unsubscribed)
        ? { unsubscribed: true, unsubscribedAt: now }
        : {}),
      createdAt: now,
    });
    await ctx.db.patch(list._id, { rowCount: members.length + 1, updatedAt: now });
    if (list.mode === "people" && list.audienceId) {
      await ctx.db.patch(list.audienceId, { status: "compiling", size: members.length + 1, progress: { value: 0.5, label: `Reading ${name}` }, updatedAt: now });
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
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
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
    if (f.city !== undefined) update.city = f.city.trim() || undefined;
    if (f.age !== undefined) update.age = ageBucket(f.age);
    if (f.gender !== undefined) update.gender = normalizeGender(f.gender);
    let retaste = ["city", "age", "gender"].some((k) => k in update && update[k as keyof typeof update] !== contact[k as keyof typeof contact]);
    if (f.interests !== undefined) {
      const interests = [...new Set(f.interests.flatMap((t) => splitTerms(t)))].slice(0, 24);
      if (interests.join("|") !== contact.interests.join("|")) {
        update.interests = interests;
        update.entities = [];
        retaste = true;
      }
    }
    const list = await ctx.db.get(contact.listId);
    if (retaste && list?.mode === "people") update.profileStatus = "pending";
    await ctx.db.patch(id, update);
    if (retaste) {
      if (list?.mode === "people" && contact.audienceId) await ctx.db.patch(contact.audienceId, { status: "compiling", updatedAt: Date.now() });
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
      else if (audience) await ctx.db.patch(audience._id, { size: Math.max(0, audience.size - 1), updatedAt: Date.now() });
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
  args: { updates: v.array(v.object({ id: v.id("emailContacts"), entities: v.array(emailEntityValidator) })) },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) if (await ctx.db.get(u.id)) await ctx.db.patch(u.id, { entities: u.entities });
    return null;
  },
});

/** Joins the group whose members share the most favourites with this contact (the largest group when none do). */
export const joinNearestGroup = internalMutation({
  args: { id: v.id("emailContacts") },
  returns: v.union(v.id("emailAudiences"), v.null()),
  handler: async (ctx, { id }) => {
    const contact = await ctx.db.get(id);
    if (!contact) return null;
    const groups = (await ctx.db.query("emailAudiences").withIndex("by_list", (q) => q.eq("listId", contact.listId)).collect()).filter((a) => a.kind === "group");
    if (!groups.length) return null;
    const mine = new Set(contact.entities.map((e) => e.id));
    let best = groups.reduce((a, b) => (b.size > a.size ? b : a));
    let bestScore = 0;
    for (const g of groups) {
      // Share of the group that loves each of the contact's favourites, summed.
      const entities = ((g.profile as AudienceProfile | undefined)?.entities ?? []).filter((e) => mine.has(e.id));
      const score = entities.reduce((s, e) => s + (e.count ?? 1) / Math.max(1, g.size), 0);
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    if (contact.audienceId === best._id) return best._id;
    if (contact.audienceId) {
      const prev = await ctx.db.get(contact.audienceId);
      if (prev) await ctx.db.patch(prev._id, { size: Math.max(0, prev.size - 1), updatedAt: Date.now() });
    }
    await ctx.db.patch(id, { audienceId: best._id, cluster: best.cluster });
    await ctx.db.patch(best._id, { size: best.size + 1, updatedAt: Date.now() });
    return best._id;
  },
});

/** Resolves a contact's favourites if needed, then compiles their profile (people list) or places them in a group. */
async function compileOne(ctx: ActionCtx, id: Id<"emailContacts">) {
  const contact: Doc<"emailContacts"> | null = await ctx.runQuery(internal.emailContacts.getInternal, { id });
  if (!contact) return;
  const list: Doc<"emailLists"> | null = await ctx.runQuery(internal.emailLists.getInternal, { id: contact.listId });
  if (!list) return;
  const trace: Span[] = [];
  let entities = contact.entities;
  if (!entities.length && contact.interests.length) {
    const found = await resolveTerms(ctx, trace, contact.interests);
    const seen = new Set<string>();
    entities = [];
    for (const t of contact.interests) {
      const e = found.get(t.toLowerCase());
      if (!e || seen.has(e.id) || !plausible(t, e.name)) continue;
      seen.add(e.id);
      entities.push({ id: e.id, name: e.name, type: e.type, ...(e.image ? { image: e.image } : {}) });
    }
    await ctx.runMutation(internal.emailContacts.setEntities, { updates: [{ id, entities }] });
  }
  if (list.mode === "groups") {
    await ctx.runMutation(internal.emailContacts.joinNearestGroup, { id });
    return;
  }
  if (!contact.audienceId) return;
  await ctx.runMutation(internal.emailContacts.claim, { id });
  try {
    const profile = await compilePersonProfile(ctx, trace, { ...contact, entities }, async () => {});
    await ctx.runMutation(internal.emailContacts.setProfile, { id, profile });
  } catch (err) {
    await ctx.runMutation(internal.emailContacts.setProfile, { id, error: String(err).replace(/^Error: /, "").slice(0, 300) });
  }
  await ctx.runMutation(internal.emailAudiences.refreshPeople, {
    id: contact.audienceId,
    trace: [{ kind: "slice", name: `Read ${contact.name}`, ms: 0, result: `${entities.length} favourites resolved` }],
  });
}

export const compileInternal = internalAction({
  args: { id: v.id("emailContacts") },
  returns: v.null(),
  handler: async (ctx, { id }): Promise<null> => {
    await compileOne(ctx, id);
    return null;
  },
});

/** Reads one person's taste again (people lists) or re-places them (groups lists). */
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
