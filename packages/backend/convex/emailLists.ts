import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { compileGroupAudience, deleteListCascade, resolveTerms } from "./emailAudiences";
import { editableBrand } from "./emailBrands";
import { contactFromRow, type ContactLite, type Mapping } from "./emailContacts";
import { MAX_CONTACT_ROWS, MAX_PEOPLE_LIST } from "./emailTypes";
import { kmeans, lift, type ClusterRow } from "./pagesCsv";
import { chunk, plausible } from "./pagesUploads";
import type { Span } from "./qlooApi";
import { emailMappingValidator, spanValidator } from "./schema";

// A contact list: a CSV (or people added by hand) and what it becomes. Every
// row's favourites are resolved to Qloo entities, then either
// - "groups": k-means on those entities (plus city and age) into taste
//   groups, each compiled as a `group` audience, or
// - "people": one `people` audience for the list and a profile per person,
//   compiled one after another in scheduled steps.

const rowsValidator = v.array(v.record(v.string(), v.string()));

const MAX_ROWS_PER_CALL = 500;
/** Unique favourites resolved per list; the most common first. */
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
      ...(list.mode === "people" && list.audienceId ? { audienceId: list.audienceId, profileStatus: "pending" as const } : {}),
    });
    added++;
  }
  return { added, skipped };
}

function checkSize(mode: "groups" | "people", total: number) {
  if (mode === "people" && total > MAX_PEOPLE_LIST) {
    throw new Error(`A list kept one by one holds up to ${MAX_PEOPLE_LIST} people; this one has ${total}. Cluster it into taste groups instead.`);
  }
  if (total > MAX_CONTACT_ROWS) throw new Error(`A list holds up to ${MAX_CONTACT_ROWS} contacts; this one has ${total}.`);
}

/**
 * A new list from CSV rows (≤ 500 per call; send the rest with `appendRows`,
 * then call `process`). In people mode the list's audience card exists from
 * the start and follows the processing.
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
      audienceId = await ctx.db.insert("emailAudiences", {
        brandId,
        listId: id,
        name: label,
        kind: "people",
        status: "compiling",
        progress: { value: 0, label: "Importing contacts" },
        size: 0,
        topEntities: [],
        trace: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(id, { audienceId });
    }
    const list = (await ctx.db.get(id))!;
    const { added, skipped } = await insertRows(ctx, list, rows, new Set());
    await ctx.db.patch(id, { rowCount: added });
    if (audienceId) await ctx.db.patch(audienceId, { size: added });
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
    if (list.audienceId) await ctx.db.patch(list.audienceId, { size: rowCount, updatedAt: Date.now() });
    return { rowCount, added, skipped };
  },
});

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
    if (list.audienceId) await ctx.db.patch(list.audienceId, { name: name.trim().slice(0, 80), updatedAt: Date.now() });
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

const clusterValidator = v.object({ index: v.number(), name: v.string(), size: v.number(), topEntities: v.array(v.string()) });

/**
 * One group audience per cluster. A list processed again keeps its groups'
 * ids where it can (campaigns stay aimed at them); extra old groups go.
 */
export const saveGroups = internalMutation({
  args: { listId: v.id("emailLists"), clusters: v.array(clusterValidator) },
  returns: v.array(v.id("emailAudiences")),
  handler: async (ctx, { listId, clusters }) => {
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Unknown list");
    const old = (await ctx.db.query("emailAudiences").withIndex("by_list", (q) => q.eq("listId", listId)).collect()).filter((a) => a.kind === "group");
    const now = Date.now();
    const ids: Id<"emailAudiences">[] = [];
    for (const c of clusters) {
      const prev = old.find((a) => a.cluster === c.index);
      const fields = {
        name: c.name,
        cluster: c.index,
        status: "compiling" as const,
        progress: { value: 0, label: "Waiting" },
        size: c.size,
        topEntities: c.topEntities,
        updatedAt: now,
      };
      if (prev) {
        // A group the merchant (or the agent) renamed keeps its name.
        const auto = prev.name.startsWith("Group ") || autoNames(prev.topEntities).includes(prev.name);
        await ctx.db.patch(prev._id, { ...fields, name: auto ? c.name : prev.name });
        ids.push(prev._id);
      } else {
        ids.push(await ctx.db.insert("emailAudiences", { brandId: list.brandId, listId, kind: "group", ...fields, trace: [], createdAt: now }));
      }
    }
    for (const a of old) {
      if (ids.includes(a._id)) continue;
      for (const c of await ctx.db.query("emailCampaigns").withIndex("by_brand", (q) => q.eq("brandId", list.brandId)).collect()) {
        if (c.audienceId === a._id && c.status === "draft") await ctx.db.patch(c._id, { audienceId: undefined, updatedAt: now });
      }
      await ctx.db.delete(a._id);
    }
    return ids;
  },
});

export const assignClusters = internalMutation({
  args: { updates: v.array(v.object({ id: v.id("emailContacts"), cluster: v.number(), audienceId: v.id("emailAudiences") })) },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) if (await ctx.db.get(u.id)) await ctx.db.patch(u.id, { cluster: u.cluster, audienceId: u.audienceId });
    return null;
  },
});

/** The names `groupName` can give a group with these top entities. */
function autoNames(top: string[]): string[] {
  const short = top.map((n) => (n.length > 32 ? `${n.slice(0, 30).trim()}…` : n));
  return [short.slice(0, 2).join(" & "), short.slice(0, 3).join(", ")].filter(Boolean);
}

/** "Sally Rooney & Phoebe Bridgers": a group's name until the console (or the agent) gives it a better one. */
function groupName(top: string[], index: number, taken: Set<string>): string {
  for (const name of [...autoNames(top), `Group ${index + 1}`]) {
    if (name && !taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
  return `Group ${index + 1}`;
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
      /* 1. Resolve the favourites, most common first. */
      await progress(0.02, "Reading the favourites", "resolving");
      const contacts: ContactLite[] = await ctx.runQuery(internal.emailContacts.byListInternal, { listId: id });
      if (!contacts.length) throw new Error("The list has no contacts with a valid email");
      checkSize(list.mode, contacts.length);
      const counts = new Map<string, { term: string; n: number }>();
      for (const c of contacts) {
        for (const t of c.interests) {
          const cur = counts.get(t.toLowerCase());
          if (cur) cur.n++;
          else counts.set(t.toLowerCase(), { term: t, n: 1 });
        }
      }
      const ordered = [...counts.values()].sort((a, b) => b.n - a.n);
      const terms = ordered.slice(0, MAX_TERMS).map((x) => x.term);
      if (ordered.length > MAX_TERMS) trace.push({ kind: "slice", name: "Keep the most common favourites", ms: 0, result: `${MAX_TERMS} of ${ordered.length} terms` });
      const found = await resolveTerms(ctx, trace, terms, {
        label: `Find ${terms.length} favourites in Qloo`,
        onProgress: (done, total) => progress(0.05 + 0.55 * (done / total), `Found ${done} of ${total} favourites`),
      });
      const updates = contacts.map((c) => {
        const seen = new Set<string>();
        const entities: { id: string; name: string; type: string; image?: string }[] = [];
        for (const t of c.interests) {
          const e = found.get(t.toLowerCase());
          if (!e || seen.has(e.id) || !plausible(t, e.name)) continue;
          seen.add(e.id);
          entities.push({ id: e.id, name: e.name, type: e.type, ...(e.image ? { image: e.image } : {}) });
        }
        return { id: c._id, entities };
      });
      for (const batch of chunk(updates, 100)) await ctx.runMutation(internal.emailContacts.setEntities, { updates: batch });
      const resolved = updates.filter((u) => u.entities.length).length;
      trace.push({ kind: "slice", name: "Match favourites to people", ms: 0, result: `${resolved} of ${contacts.length} people have at least one favourite Qloo knows` });

      if (list.mode === "people") {
        /* 2. A profile per person, read in scheduled steps; the last step makes the list ready. */
        if (!list.audienceId) throw new Error("The list has no audience");
        await ctx.runMutation(internal.emailLists.setState, { id, status: "profiling", progress: { value: 0.62, label: "Reading each person" }, spans: trace });
        await ctx.runMutation(internal.emailAudiences.requeuePeople, { id: list.audienceId });
        await ctx.scheduler.runAfter(0, internal.emailAudiences.compilePeopleStep, { audienceId: list.audienceId });
        return { groups: 0, resolved, unique: terms.length };
      }

      /* 2. Cluster on favourites, city and age. */
      await progress(0.62, "Finding taste groups", "clustering");
      const t1 = Date.now();
      const rows: ClusterRow[] = updates.map((u, i) => {
        const features: Record<string, number> = {};
        for (const e of u.entities) features[e.id] = 1;
        const c = contacts[i];
        if (c.city) features[`city:${c.city.toLowerCase()}`] = 0.5;
        if (c.age) features[`age:${c.age}`] = 0.5;
        return { features };
      });
      const result = kmeans(rows, { k, seed, kRange: K_RANGE });
      const overall: Record<string, number> = {};
      const nameOf = new Map<string, string>();
      for (const u of updates)
        for (const e of u.entities) {
          overall[e.id] = (overall[e.id] ?? 0) + 1;
          nameOf.set(e.id, e.name);
        }
      const taken = new Set<string>();
      const clusters = Array.from({ length: Math.max(1, result.k) }, (_, index) => {
        const inCluster: Record<string, number> = {};
        let size = 0;
        updates.forEach((u, i) => {
          if (result.assignments[i] !== index) return;
          size++;
          for (const e of u.entities) inCluster[e.id] = (inCluster[e.id] ?? 0) + 1;
        });
        // What sets the group apart; in a tiny group, simply what it loves most.
        let top = lift(inCluster, size, overall, updates.length, { take: 6 }).map((t) => t.id);
        if (top.length < 2) top = Object.entries(inCluster).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([eid]) => eid);
        const topEntities = top.map((eid) => nameOf.get(eid) ?? eid);
        return { index, name: groupName(topEntities, index, taken), size, topEntities };
      });
      trace.push({
        kind: "slice",
        name: "k-means on favourites, city and age",
        ms: Date.now() - t1,
        result: `${clusters.length} groups (${clusters.map((c) => c.size).join("/")})${result.k >= 2 ? `, silhouette ${result.silhouette.toFixed(2)}` : ""}`,
      });
      const audienceIds = await ctx.runMutation(internal.emailLists.saveGroups, { listId: id, clusters });
      const assignments = updates.map((u, i) => {
        const cluster = result.assignments[i] ?? 0;
        return { id: u.id, cluster, audienceId: audienceIds[cluster] ?? audienceIds[0] };
      });
      for (const batch of chunk(assignments, 200)) await ctx.runMutation(internal.emailLists.assignClusters, { updates: batch });
      await ctx.runMutation(internal.emailLists.setState, { id, status: "profiling", spans: trace });

      /* 3. Read each group's taste, one after another. */
      for (const [i, audienceId] of audienceIds.entries()) {
        const c = clusters[i];
        await progress(0.7 + 0.3 * (i / audienceIds.length), `Reading ${c.name} (${c.size} people)`);
        await compileGroupAudience(ctx, audienceId);
      }
      await ctx.runMutation(internal.emailLists.setState, { id, status: "ready", progress: { value: 1, label: "Ready" } });
      return { groups: clusters.length, resolved, unique: terms.length };
    } catch (err) {
      const error = String(err).replace(/^Error: /, "").slice(0, 300);
      await ctx.runMutation(internal.emailLists.setState, { id, status: "failed", error, spans: trace });
      if (list.audienceId) await ctx.runMutation(internal.emailAudiences.setStatus, { id: list.audienceId, status: "failed", error });
      throw err;
    }
  },
});
