import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import {
  bestGroup,
  compileGroupAudience,
  deleteListCascade,
  individualsAudience,
  prospectFits,
  settleGroup,
  type GroupTaste,
} from "./emailAudiences";
import { editableBrand } from "./emailBrands";
import { contactFromRow, readTastes, type ContactLite, type Mapping } from "./emailContacts";
import { MAX_CONTACT_ROWS, MAX_PEOPLE_LIST } from "./emailTypes";
import { kmeans, lift, type ClusterRow } from "./pagesCsv";
import { chunk } from "./pagesUploads";
import type { Span } from "./qlooApi";
import { emailMappingValidator, spanValidator } from "./schema";

// An upload: a CSV (or people added by hand) and where its people went.
// Every row's purchases (catalog items first) and favourites become Qloo
// entities, then either
// - "groups": each person joins the brand's taste group they fit best
//   (`MIN_FIT`); whoever fits none is grouped with the others left over by
//   k-means (favourites, city and age) into new groups, or
// - "people": they join the brand's individual contacts, and each gets a
//   profile of their own, compiled one after another in scheduled steps.

const rowsValidator = v.array(v.record(v.string(), v.string()));

const MAX_ROWS_PER_CALL = 500;
/** Terms searched in Qloo per upload (purchases outside the catalog and favourites); the most common first. */
const MAX_TERMS = 600;
/** Groups k-means may choose (by silhouette). */
const K_RANGE: [number, number] = [2, 6];

export const list = query({
  args: { brandId: v.id("emailBrands") },
  handler: async (ctx, { brandId }) =>
    ctx.db
      .query("emailLists")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .order("desc")
      .collect(),
});

export const get = query({
  args: { id: v.id("emailLists") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("emailLists") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Inserts rows as contacts, skipping invalid emails and ones already in the list. */
async function insertRows(ctx: MutationCtx, list: Doc<"emailLists">, rows: Record<string, string>[], known: Set<string>) {
  const now = Date.now();
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    const contact = contactFromRow(list.brandId, list._id, row, list.mapping as Mapping, now);
    if (!contact || known.has(contact.email)) {
      skipped++;
      continue;
    }
    known.add(contact.email);
    await ctx.db.insert("emailContacts", {
      ...contact,
      ...(list.mode === "people" && list.audienceId ? { individual: true, audienceId: list.audienceId, profileStatus: "pending" as const } : {}),
    });
    added++;
  }
  return { added, skipped };
}

function checkSize(mode: "groups" | "people", total: number) {
  if (mode === "people" && total > MAX_PEOPLE_LIST) {
    throw new Error(`Up to ${MAX_PEOPLE_LIST} people can be kept as individual contacts in one upload; this file has ${total}. Sort them into taste groups instead.`);
  }
  if (total > MAX_CONTACT_ROWS) throw new Error(`An upload holds up to ${MAX_CONTACT_ROWS} contacts; this one has ${total}.`);
}

/**
 * A new upload from CSV rows (≤ 500 per call; send the rest with
 * `appendRows`, then call `process`). Kept as individuals, its people join
 * the brand's individual contacts at once and are read as it goes.
 */
export const create = mutation({
  args: {
    brandId: v.id("emailBrands"),
    name: v.string(),
    filename: v.optional(v.string()),
    columns: v.array(v.string()),
    mapping: emailMappingValidator,
    mode: v.union(v.literal("groups"), v.literal("people")),
    rows: rowsValidator,
    /** "csv" (default) or "demo" for seeded lists. */
    source: v.optional(v.union(v.literal("csv"), v.literal("manual"), v.literal("demo"))),
  },
  returns: v.object({ id: v.id("emailLists"), audienceId: v.optional(v.id("emailAudiences")), added: v.number(), skipped: v.number() }),
  handler: async (ctx, { brandId, name, filename, columns, mapping, mode, rows, source }) => {
    await editableBrand(ctx, brandId);
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call; use appendRows for the rest`);
    checkSize(mode, rows.length);
    const now = Date.now();
    const label = name.trim() || filename?.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Contacts";
    const id = await ctx.db.insert("emailLists", {
      brandId,
      name: label,
      source: source ?? "csv",
      ...(filename ? { filename } : {}),
      columns,
      rowCount: 0,
      mode,
      mapping,
      status: "importing",
      progress: { value: 0, label: "Importing contacts" },
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    let audienceId: Id<"emailAudiences"> | undefined;
    if (mode === "people") {
      audienceId = (await individualsAudience(ctx, brandId))._id;
      await ctx.db.patch(id, { audienceId });
    }
    const list = (await ctx.db.get(id))!;
    const { added, skipped } = await insertRows(ctx, list, rows, new Set());
    await ctx.db.patch(id, { rowCount: added });
    if (audienceId) await growIndividuals(ctx, audienceId, added);
    return { id, ...(audienceId ? { audienceId } : {}), added, skipped };
  },
});

export const appendRows = mutation({
  args: { listId: v.id("emailLists"), rows: rowsValidator },
  returns: v.object({ rowCount: v.number(), added: v.number(), skipped: v.number() }),
  handler: async (ctx, { listId, rows }) => {
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call`);
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Unknown list");
    await editableBrand(ctx, list.brandId);
    const existing = await ctx.db.query("emailContacts").withIndex("by_list", (q) => q.eq("listId", listId)).collect();
    checkSize(list.mode, existing.length + rows.length);
    const { added, skipped } = await insertRows(ctx, list, rows, new Set(existing.map((c) => c.email)));
    const rowCount = existing.length + added;
    await ctx.db.patch(listId, { rowCount, updatedAt: Date.now() });
    if (list.audienceId) await growIndividuals(ctx, list.audienceId, added);
    return { rowCount, added, skipped };
  },
});

/** The individual contacts gained people who still need reading. */
async function growIndividuals(ctx: MutationCtx, audienceId: Id<"emailAudiences">, added: number) {
  const audience = await ctx.db.get(audienceId);
  if (!audience || !added) return;
  await ctx.db.patch(audienceId, { size: audience.size + added, status: "compiling", progress: { value: 0, label: "Importing contacts" }, updatedAt: Date.now() });
}

/** Removes the list, its contacts and its audiences. Sent campaigns keep their reports. */
export const remove = mutation({
  args: { id: v.id("emailLists") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const list = await ctx.db.get(id);
    if (!list) return null;
    await editableBrand(ctx, list.brandId);
    await deleteListCascade(ctx, id);
    return null;
  },
});

export const rename = mutation({
  args: { id: v.id("emailLists"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const list = await ctx.db.get(id);
    if (!list) throw new Error("Unknown list");
    await editableBrand(ctx, list.brandId);
    if (!name.trim()) return null;
    await ctx.db.patch(id, { name: name.trim().slice(0, 80), updatedAt: Date.now() });
    return null;
  },
});

export const setState = internalMutation({
  args: {
    id: v.id("emailLists"),
    status: v.optional(v.union(v.literal("importing"), v.literal("resolving"), v.literal("clustering"), v.literal("profiling"), v.literal("ready"), v.literal("failed"))),
    progress: v.optional(v.object({ value: v.number(), label: v.string() })),
    error: v.optional(v.string()),
    spans: v.optional(v.array(spanValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, status, progress, error, spans }) => {
    const list = await ctx.db.get(id);
    if (!list) return null;
    await ctx.db.patch(id, {
      ...(status ? { status } : {}),
      ...(progress ? { progress } : {}),
      ...(status === "failed" ? { error } : status ? { error: undefined } : {}),
      ...(spans?.length ? { trace: [...list.trace, ...spans].slice(-120) } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

const clusterValidator = v.object({ index: v.number(), size: v.number(), topEntities: v.array(v.string()) });

/** New taste groups started by an upload (or by one person added by hand), named after what their people love most. */
export const newGroups = internalMutation({
  args: { listId: v.id("emailLists"), clusters: v.array(clusterValidator) },
  returns: v.array(v.id("emailAudiences")),
  handler: async (ctx, { listId, clusters }) => {
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Unknown list");
    const taken = new Set((await ctx.db.query("emailAudiences").withIndex("by_brand", (q) => q.eq("brandId", list.brandId)).collect()).map((a) => a.name));
    const now = Date.now();
    const ids: Id<"emailAudiences">[] = [];
    for (const c of clusters) {
      ids.push(
        await ctx.db.insert("emailAudiences", {
          brandId: list.brandId,
          listId,
          kind: "group",
          name: groupName(c.topEntities, taken),
          cluster: c.index,
          status: "compiling",
          progress: { value: 0, label: "Waiting" },
          size: c.size,
          topEntities: c.topEntities,
          trace: [],
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return ids;
  },
});

const placementValidator = v.object({ by: v.literal("demographics"), note: v.string() });

/** Puts people in taste groups (with why, when it wasn't what they bought); the groups they left and joined count again (an emptied one goes). */
export const joinGroups = internalMutation({
  args: { updates: v.array(v.object({ id: v.id("emailContacts"), audienceId: v.id("emailAudiences"), placement: v.optional(placementValidator) })) },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    const touched = new Set<Id<"emailAudiences">>();
    for (const u of updates) {
      const c = await ctx.db.get(u.id);
      if (!c) continue;
      if (c.audienceId && c.audienceId !== u.audienceId) touched.add(c.audienceId);
      touched.add(u.audienceId);
      await ctx.db.patch(u.id, { audienceId: u.audienceId, individual: undefined, placement: u.placement });
    }
    for (const id of touched) await settleGroup(ctx, id);
    return null;
  },
});

/** The names `groupName` can give a group with these top entities. */
function autoNames(top: string[]): string[] {
  const short = top.map((n) => (n.length > 32 ? `${n.slice(0, 30).trim()}…` : n));
  return [short.slice(0, 2).join(" & "), short.slice(0, 3).join(", ")].filter(Boolean);
}

/** "Sally Rooney & Phoebe Bridgers": a group's name until the console (or the agent) gives it a better one. */
function groupName(top: string[], taken: Set<string>): string {
  for (let n = 1; ; n++) {
    const name = [...autoNames(top), `Taste group ${n}`].find((x) => x && !taken.has(x));
    if (name) {
      taken.add(name);
      return name;
    }
  }
}

/** What k-means compares people on: their favourites, and a little of their city and age. */
function featuresOf(entities: { id: string }[], contact: Pick<ContactLite, "city" | "age">): ClusterRow {
  const features: Record<string, number> = {};
  for (const e of entities) features[e.id] = 1;
  if (contact.city) features[`city:${contact.city.toLowerCase()}`] = 0.5;
  if (contact.age) features[`age:${contact.age}`] = 0.5;
  return { features };
}

/**
 * Resolve → cluster or read each person. Long-running; progress is written
 * to the list (and to a people list's audience) so the console can follow.
 * People lists return once their reading is scheduled.
 */
export const process = action({
  args: { id: v.id("emailLists"), k: v.optional(v.number()), seed: v.optional(v.number()) },
  returns: v.object({ groups: v.number(), resolved: v.number(), unique: v.number() }),
  handler: async (ctx, { id, k, seed = 7 }): Promise<{ groups: number; resolved: number; unique: number }> => {
    const list: Doc<"emailLists"> | null = await ctx.runQuery(internal.emailLists.getInternal, { id });
    if (!list) throw new Error("Unknown list");
    const trace: Span[] = [];
    const progress = async (value: number, label: string, status?: Doc<"emailLists">["status"]) => {
      await ctx.runMutation(internal.emailLists.setState, { id, progress: { value, label }, ...(status ? { status } : {}) });
      // A people list's card shows the reading of the rows as the first third of its progress.
      if (list.audienceId) await ctx.runMutation(internal.emailAudiences.setProgress, { id: list.audienceId, value: value * 0.3, label });
    };
    try {
      /* 1. What they bought (catalog items first) and like, as Qloo entities. */
      await progress(0.02, "Reading what they bought", "resolving");
      const contacts: ContactLite[] = await ctx.runQuery(internal.emailContacts.byListInternal, { listId: id });
      if (!contacts.length) throw new Error("The upload has no contacts with a valid email");
      checkSize(list.mode, contacts.length);
      const read = await readTastes(ctx, trace, list.brandId, contacts, {
        maxTerms: MAX_TERMS,
        onProgress: (done, total) => progress(0.05 + 0.55 * (done / total), `Found ${done} of ${total} in Qloo`),
      });
      const updates = contacts.map((c) => ({ id: c._id, ...read.get(c._id)! }));
      for (const batch of chunk(updates, 100)) await ctx.runMutation(internal.emailContacts.setEntities, { updates: batch });
      const resolved = updates.filter((u) => u.entities.length).length;
      const terms = new Set(updates.flatMap((u) => u.entities.map((e) => e.id)));
      trace.push({ kind: "slice", name: "Match tastes to people", ms: 0, result: `${resolved} of ${contacts.length} people have something Qloo knows` });

      if (list.mode === "people") {
        /* 2. A profile per person, read in scheduled steps; the last step makes the list ready. */
        if (!list.audienceId) throw new Error("The list has no audience");
        await ctx.runMutation(internal.emailLists.setState, { id, status: "profiling", progress: { value: 0.62, label: "Reading each person" }, spans: trace });
        await ctx.runMutation(internal.emailAudiences.requeuePeople, { id: list.audienceId });
        await ctx.scheduler.runAfter(0, internal.emailAudiences.compilePeopleStep, { audienceId: list.audienceId });
        return { groups: 0, resolved, unique: terms.size };
      }

      /* 2. Each person joins the taste group they fit best, if they fit one well enough. */
      await progress(0.62, "Matching people to taste groups", "clustering");
      const t1 = Date.now();
      const existing: GroupTaste[] = await ctx.runQuery(internal.emailAudiences.groupTastes, { brandId: list.brandId });
      const placed = new Map<Id<"emailContacts">, Id<"emailAudiences">>();
      const left: number[] = [];
      // Nothing bought or liked that Qloo knows: placed by age, gender and city once the groups are read (step 5).
      let prospects: number[] = [];
      updates.forEach((u, i) => {
        if (!u.entities.length) {
          prospects.push(i);
          return;
        }
        const g = bestGroup(u.entities.map((e) => e.id), existing);
        if (g) placed.set(u.id, g.id);
        else left.push(i);
      });
      // No groups and no one to start one from: group them on city and age alone.
      if (!existing.length && !left.length) {
        left.push(...prospects);
        prospects = [];
      }
      trace.push({
        kind: "slice",
        name: "Match people to the taste groups",
        ms: Date.now() - t1,
        result: `${existing.length ? `${placed.size} joined ${existing.length} existing groups, ${left.length} fit none` : `No taste groups yet, ${left.length} people to group`}${prospects.length ? `, ${prospects.length} with no purchases` : ""}`,
      });

      /* 3. Whoever fits no group is grouped with the others left over, into new groups. */
      let created: Id<"emailAudiences">[] = [];
      if (left.length) {
        const t2 = Date.now();
        const result = kmeans(
          left.map((i) => featuresOf(updates[i].entities, contacts[i])),
          { k, seed, kRange: K_RANGE },
        );
        const overall: Record<string, number> = {};
        const nameOf = new Map<string, string>();
        for (const i of left)
          for (const e of updates[i].entities) {
            overall[e.id] = (overall[e.id] ?? 0) + 1;
            nameOf.set(e.id, e.name);
          }
        const clusters = Array.from({ length: Math.max(1, result.k) }, (_, index) => {
          const inCluster: Record<string, number> = {};
          let size = 0;
          left.forEach((i, n) => {
            if ((result.assignments[n] ?? 0) !== index) return;
            size++;
            for (const e of updates[i].entities) inCluster[e.id] = (inCluster[e.id] ?? 0) + 1;
          });
          // What sets the group apart; in a tiny group, simply what it loves most.
          let top = lift(inCluster, size, overall, left.length, { take: 6 }).map((t) => t.id);
          if (top.length < 2) top = Object.entries(inCluster).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([eid]) => eid);
          return { index, size, topEntities: top.map((eid) => nameOf.get(eid) ?? eid) };
        });
        trace.push({
          kind: "slice",
          name: "k-means on favourites, city and age",
          ms: Date.now() - t2,
          result: `${clusters.length} new groups (${clusters.map((c) => c.size).join("/")})${result.k >= 2 ? `, silhouette ${result.silhouette.toFixed(2)}` : ""}`,
        });
        created = await ctx.runMutation(internal.emailLists.newGroups, { listId: id, clusters });
        left.forEach((i, n) => placed.set(updates[i].id, created[result.assignments[n] ?? 0] ?? created[0]));
      }
      const moves = [...placed].map(([contactId, audienceId]) => ({ id: contactId, audienceId }));
      for (const batch of chunk(moves, 200)) await ctx.runMutation(internal.emailLists.joinGroups, { updates: batch });
      await ctx.runMutation(internal.emailLists.setState, { id, status: "profiling", spans: trace });

      /* 4. Read each new group's taste, and again for the groups that grew. */
      const grown = [...new Set(placed.values())].filter((g) => !created.includes(g));
      const toRead = [...created, ...grown];
      for (const [i, audienceId] of toRead.entries()) {
        await progress(0.7 + 0.25 * (i / toRead.length), `Reading taste group ${i + 1} of ${toRead.length}`);
        await compileGroupAudience(ctx, audienceId);
      }

      /* 5. People with no purchases join the group Qloo says people like them (age, gender, city) go for. */
      if (prospects.length) {
        await progress(0.96, `Placing ${prospects.length} people with no purchases by age and location`);
        const groups: Doc<"emailAudiences">[] = await ctx.runQuery(internal.emailAudiences.groupsOf, { brandId: list.brandId });
        const biggest = [...groups].sort((a, b) => b.size - a.size)[0];
        const moves: { id: Id<"emailContacts">; audienceId: Id<"emailAudiences">; placement: { by: "demographics"; note: string } }[] = [];
        for (const i of prospects) {
          const c = contacts[i];
          const known = !!(c.age || c.gender || c.city || c.neighborhood);
          const best = known ? (await prospectFits(ctx, trace, c, groups))[0] : undefined;
          const target = best?.id ?? biggest?._id;
          if (!target) continue;
          moves.push({ id: c._id, audienceId: target, placement: { by: "demographics", note: best?.note || "No purchases, age or city yet, so they joined the largest group." } });
        }
        if (moves.length) await ctx.runMutation(internal.emailLists.joinGroups, { updates: moves });
        trace.push({ kind: "slice", name: "Place people with no purchases", ms: 0, result: moves.map((m) => groups.find((g) => g._id === m.audienceId)?.name ?? "").join(", ") });
        await ctx.runMutation(internal.emailLists.setState, { id, spans: trace.slice(-1) });
      }
      await ctx.runMutation(internal.emailLists.setState, { id, status: "ready", progress: { value: 1, label: "Ready" } });
      return { groups: created.length, resolved, unique: terms.size };
    } catch (err) {
      const error = String(err).replace(/^Error: /, "").slice(0, 300);
      await ctx.runMutation(internal.emailLists.setState, { id, status: "failed", error, spans: trace });
      if (list.audienceId) await ctx.runMutation(internal.emailAudiences.setStatus, { id: list.audienceId, status: "failed", error });
      throw err;
    }
  },
});
