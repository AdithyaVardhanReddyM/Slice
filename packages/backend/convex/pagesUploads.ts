import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Span } from "./qlooApi";
import { spanValidator } from "./schema";
import { ageBucket, kmeans, lift, normalizeGender, splitTerms, type ClusterRow, type CsvMapping } from "./pagesCsv";
import { MAX_LIST_PEOPLE } from "./pagesTypes";
import { uniqueAudienceSlug } from "./pagesAudiences";
import { editable, editableBrand, owned, ownedBrand, ownedBrandInAction } from "./pagesBrands";
import { norm, resolveNames, safeRecord, slugify } from "./pagesUtil";

// A customer CSV (or a CRM list pulled through Composio, in the same row shape)
// becomes audiences: each row's taste columns are resolved to
// Qloo entities, then either
// - "clusters": rows are clustered on those entities (plus city and age) and
//   every cluster is compiled as a `csv` audience (one row can still become a
//   `lead` audience for a personal page), or
// - "people": every row becomes a `lead` audience of its own, gathered under
//   one `people` audience for the list, so the builder can write a page for
//   any one person.

const mappingValidator = v.object({
  taste: v.array(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
  id: v.optional(v.string()),
  name: v.optional(v.string()),
});

const rowsValidator = v.array(v.record(v.string(), v.string()));

const MAX_ROWS_PER_CALL = 200;

function memberFromRow(brandId: Id<"pagesBrands">, uploadId: Id<"pagesUploads">, row: Record<string, string>, mapping: CsvMapping) {
  const safe = safeRecord(row) ?? {};
  const pick = (col?: string) => (col ? row[col]?.trim() || undefined : undefined);
  return {
    brandId,
    uploadId,
    row: safe,
    entities: [] as Doc<"pagesMembers">["entities"],
    city: pick(mapping.city),
    country: pick(mapping.country),
    age: ageBucket(pick(mapping.age)),
    gender: normalizeGender(pick(mapping.gender)),
  };
}

export const create = mutation({
  args: {
    brandId: v.id("pagesBrands"),
    filename: v.string(),
    columns: v.array(v.string()),
    rows: rowsValidator,
    mapping: mappingValidator,
    /** "clusters" (default) or "people". */
    mode: v.optional(v.string()),
    /** The list's name, in people mode. */
    name: v.optional(v.string()),
    /** Set when the rows come from a connected CRM rather than a file. */
    source: v.optional(v.object({ crm: v.string(), listId: v.string(), listName: v.string() })),
  },
  returns: v.object({ id: v.id("pagesUploads"), audienceId: v.optional(v.id("pagesAudiences")) }),
  handler: async (ctx, { brandId, filename, columns, rows, mapping, mode, name, source }) => {
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call; use appendRows for the rest`);
    await editableBrand(ctx, brandId);
    const now = Date.now();
    const id = await ctx.db.insert("pagesUploads", {
      brandId,
      filename,
      columns,
      rowCount: rows.length,
      status: "uploading",
      progress: { value: 0, label: "Uploading rows" },
      mode: mode === "people" ? "people" : "clusters",
      ...(source ? { source } : {}),
      mapping,
      clusters: [],
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    for (const row of rows) await ctx.db.insert("pagesMembers", memberFromRow(brandId, id, row, mapping));
    if (mode !== "people") return { id };
    // The list's card shows up right away and follows the upload from here.
    const label = name?.trim() || filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Customers";
    const audienceId = await ctx.db.insert("pagesAudiences", {
      brandId,
      name: label,
      slug: await uniqueAudienceSlug(ctx, brandId, slugify(label)),
      kind: "people",
      sources: { uploadId: id },
      status: "compiling",
      progress: { value: 0, label: "Uploading rows" },
      size: rows.length,
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, { audienceId });
    return { id, audienceId };
  },
});

export const appendRows = mutation({
  args: { uploadId: v.id("pagesUploads"), rows: rowsValidator },
  returns: v.object({ rowCount: v.number() }),
  handler: async (ctx, { uploadId, rows }) => {
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call`);
    const upload = await editable(ctx, await ctx.db.get(uploadId), "upload");
    for (const row of rows) await ctx.db.insert("pagesMembers", memberFromRow(upload.brandId, uploadId, row, upload.mapping));
    const rowCount = upload.rowCount + rows.length;
    await ctx.db.patch(uploadId, { rowCount, updatedAt: Date.now() });
    return { rowCount };
  },
});

const uploadsOf = (ctx: QueryCtx, brandId: Id<"pagesBrands">) =>
  ctx.db
    .query("pagesUploads")
    .withIndex("by_brand", (q) => q.eq("brandId", brandId))
    .order("desc")
    .collect();

export const list = query({
  args: { brandId: v.id("pagesBrands") },
  handler: async (ctx, { brandId }) => ((await ownedBrand(ctx, brandId)) ? uploadsOf(ctx, brandId) : []),
});

export const listInternal = internalQuery({
  args: { brandId: v.id("pagesBrands") },
  handler: async (ctx, { brandId }) => uploadsOf(ctx, brandId),
});

export const get = query({
  args: { id: v.id("pagesUploads") },
  handler: async (ctx, { id }) => owned(ctx, await ctx.db.get(id)),
});

export const getInternal = internalQuery({
  args: { id: v.id("pagesUploads") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

const membersArgs = { uploadId: v.id("pagesUploads"), cluster: v.optional(v.number()), take: v.optional(v.number()) };

function someMembers(ctx: QueryCtx, uploadId: Id<"pagesUploads">, cluster: number | undefined, take: number) {
  const q = ctx.db.query("pagesMembers").withIndex("by_upload", (q) => q.eq("uploadId", uploadId));
  const filtered = cluster === undefined ? q : q.filter((f) => f.eq(f.field("cluster"), cluster));
  return filtered.take(Math.min(take, 1000));
}

export const members = query({
  args: membersArgs,
  handler: async (ctx, { uploadId, cluster, take = 200 }) =>
    (await owned(ctx, await ctx.db.get(uploadId))) ? someMembers(ctx, uploadId, cluster, take) : [],
});

/** `members` for the agent (over /agent/read). */
export const membersForAgent = internalQuery({
  args: membersArgs,
  handler: async (ctx, { uploadId, cluster, take = 200 }) => someMembers(ctx, uploadId, cluster, take),
});

export const membersInternal = internalQuery({
  args: { uploadId: v.id("pagesUploads"), cluster: v.optional(v.number()) },
  handler: async (ctx, { uploadId, cluster }) => {
    const all = await ctx.db.query("pagesMembers").withIndex("by_upload", (q) => q.eq("uploadId", uploadId)).collect();
    return cluster === undefined ? all : all.filter((m) => m.cluster === cluster);
  },
});

/** One row, for the agent (a CRM contact's id lives in `row.crm_id`). */
export const member = query({
  args: { id: v.id("pagesMembers") },
  handler: async (ctx, { id }) => owned(ctx, await ctx.db.get(id)),
});

export const memberInternal = internalQuery({
  args: { id: v.id("pagesMembers") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const setProgress = internalMutation({
  args: { id: v.id("pagesUploads"), value: v.number(), label: v.string(), status: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, value, label, status }) => {
    await ctx.db.patch(id, { progress: { value, label }, ...(status ? { status } : {}), updatedAt: Date.now() });
    return null;
  },
});

const clustersValidator = v.array(
  v.object({
    index: v.number(),
    name: v.string(),
    size: v.number(),
    audienceId: v.optional(v.id("pagesAudiences")),
    topEntities: v.array(v.string()),
  }),
);

/** Partial update (HTTP /pages/upload and the process action). */
export const patch = internalMutation({
  args: {
    id: v.id("pagesUploads"),
    patch: v.object({
      clusters: v.optional(clustersValidator),
      status: v.optional(v.string()),
      progress: v.optional(v.object({ value: v.number(), label: v.string() })),
      error: v.optional(v.string()),
      spans: v.optional(v.array(spanValidator)),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { id, patch }) => {
    const upload = await ctx.db.get(id);
    if (!upload) throw new Error("Unknown upload");
    const { spans, clusters, ...fields } = patch;
    const update: Partial<Doc<"pagesUploads">> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) (update as Record<string, unknown>)[k] = val;
    if (spans?.length) update.trace = [...upload.trace, ...spans];
    if (clusters) {
      update.clusters = clusters;
      // The agent names clusters here; the audiences follow.
      for (const c of clusters) {
        const prev = upload.clusters.find((p) => p.index === c.index);
        const audienceId = c.audienceId ?? prev?.audienceId;
        if (audienceId && prev && prev.name !== c.name) {
          await ctx.runMutation(internal.pagesAudiences.patch, { id: audienceId, patch: { name: c.name } });
        }
      }
    }
    await ctx.db.patch(id, update);
    return null;
  },
});

export const setMemberEntities = internalMutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("pagesMembers"),
        entities: v.array(v.object({ id: v.string(), name: v.string(), type: v.string(), image: v.optional(v.string()) })),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) await ctx.db.patch(u.id, { entities: u.entities });
    return null;
  },
});

export const setMemberClusters = internalMutation({
  args: { updates: v.array(v.object({ id: v.id("pagesMembers"), cluster: v.number() })) },
  returns: v.null(),
  handler: async (ctx, { updates }) => {
    for (const u of updates) await ctx.db.patch(u.id, { cluster: u.cluster });
    return null;
  },
});

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** A loose name check for CSV cells: the hit must share a word with the term. */
export function plausible(term: string, found: string): boolean {
  const a = new Set(norm(term).split(" ").filter((w) => w.length > 2));
  const b = new Set(norm(found).split(" ").filter((w) => w.length > 2));
  if (!a.size || !b.size) return norm(term) === norm(found);
  for (const w of a) if (b.has(w)) return true;
  return norm(found).startsWith(norm(term)) || norm(term).startsWith(norm(found));
}

/**
 * Resolve → cluster → compile. Long-running; progress is written to the
 * upload so the console can follow.
 */
export const process = action({
  args: { uploadId: v.id("pagesUploads"), k: v.optional(v.number()), seed: v.optional(v.number()) },
  returns: v.object({
    clusters: v.number(),
    resolved: v.number(),
    unique: v.number(),
    /** People mode: each person's audience, in row order. */
    people: v.optional(v.array(v.id("pagesAudiences"))),
  }),
  handler: async (ctx, { uploadId, k, seed = 7 }): Promise<{ clusters: number; resolved: number; unique: number; people?: Id<"pagesAudiences">[] }> => {
    const upload = await ctx.runQuery(internal.pagesUploads.getInternal, { id: uploadId });
    if (!upload || !(await ownedBrandInAction(ctx, upload.brandId))) throw new Error("Unknown upload");
    const listId = upload.mode === "people" ? upload.audienceId : undefined;
    const trace: Span[] = [];
    const progress = async (value: number, label: string, status?: string) => {
      await ctx.runMutation(internal.pagesUploads.setProgress, { id: uploadId, value, label, status });
      // The list's card shows the reading of the rows as the first fifth of its own progress.
      if (listId) await ctx.runMutation(internal.pagesAudiences.setProgress, { id: listId, value: value * 0.3, label });
    };
    try {
      /* 1. Resolve taste terms. */
      await progress(0, "Reading the rows", "resolving");
      const members = await ctx.runQuery(internal.pagesUploads.membersInternal, { uploadId });
      if (listId && members.length > MAX_LIST_PEOPLE) {
        throw new Error(`A list kept one by one holds up to ${MAX_LIST_PEOPLE} people; this file has ${members.length}. Cluster it instead.`);
      }
      const termsByMember = new Map<Id<"pagesMembers">, string[]>();
      const unique = new Map<string, string>(); // lower → display
      for (const m of members) {
        const terms: string[] = [];
        for (const col of upload.mapping.taste) {
          for (const t of splitTerms(m.row[col] ?? m.row[col.replace(/^[$_]+/, "")])) {
            terms.push(t);
            if (!unique.has(t.toLowerCase())) unique.set(t.toLowerCase(), t);
          }
        }
        termsByMember.set(m._id, terms);
      }
      const names = [...unique.values()];
      const t0 = Date.now();
      const found = await resolveNames(ctx, trace, names, undefined, "csv", {
        strict: false,
        label: `Resolve ${names.length} taste terms`,
        onProgress: (done, total) => progress(0.05 + 0.55 * (done / total), `Resolved ${done} of ${total} terms`),
      });
      const resolved = new Map<string, { id: string; name: string; type: string; image?: string }>();
      for (const [term, e] of found) {
        if (plausible(term, e.name)) resolved.set(term.toLowerCase(), { id: e.id, name: e.name, type: e.type, image: e.image });
      }
      trace.push({
        kind: "slice",
        name: "Keep the plausible matches",
        ms: Date.now() - t0,
        result: `${resolved.size} of ${names.length} terms map to a Qloo entity`,
      });
      const updates = members.map((m) => {
        const seen = new Set<string>();
        const entities: { id: string; name: string; type: string; image?: string }[] = [];
        for (const t of termsByMember.get(m._id) ?? []) {
          const e = resolved.get(t.toLowerCase());
          if (e && !seen.has(e.id)) {
            seen.add(e.id);
            entities.push(e);
          }
        }
        return { id: m._id, entities };
      });
      for (const batch of chunk(updates, 50)) await ctx.runMutation(internal.pagesUploads.setMemberEntities, { updates: batch });

      if (listId) {
        /* 2. One audience per person, read one after another; the list's profile gathers theirs. */
        await ctx.runMutation(internal.pagesUploads.patch, { id: uploadId, patch: { spans: trace } });
        await ctx.runMutation(internal.pagesUploads.setProgress, { id: uploadId, value: 0.62, label: "Reading each person", status: "compiling" });
        await ctx.runAction(internal.pagesAudiences.compileInternal, { id: listId });
        const people = await ctx.runMutation(internal.pagesUploads.ensureLeads, { uploadId });
        await ctx.runMutation(internal.pagesUploads.patch, { id: uploadId, patch: { status: "ready", progress: { value: 1, label: "Ready" } } });
        return { clusters: 0, resolved: resolved.size, unique: names.length, people };
      }

      /* 2. Cluster. */
      await progress(0.62, "Clustering members", "clustering");
      const t1 = Date.now();
      const rows: ClusterRow[] = updates.map((u, i) => {
        const features: Record<string, number> = {};
        for (const e of u.entities) features[e.id] = 1;
        const m = members[i];
        if (m.city) features[`city:${m.city.toLowerCase()}`] = 0.5;
        if (m.age) features[`age:${m.age}`] = 0.5;
        return { features };
      });
      const result = kmeans(rows, { k, seed });
      const assignments = updates.map((u, i) => ({ id: u.id, cluster: result.assignments[i] }));
      for (const batch of chunk(assignments, 100)) await ctx.runMutation(internal.pagesUploads.setMemberClusters, { updates: batch });

      const overall: Record<string, number> = {};
      const nameOf = new Map<string, string>();
      for (const u of updates)
        for (const e of u.entities) {
          overall[e.id] = (overall[e.id] ?? 0) + 1;
          nameOf.set(e.id, e.name);
        }
      type Cluster = { index: number; name: string; size: number; audienceId?: Id<"pagesAudiences">; topEntities: string[] };
      const clusters: Cluster[] = Array.from({ length: result.k }, (_, index) => {
        const inCluster: Record<string, number> = {};
        let size = 0;
        updates.forEach((u, i) => {
          if (result.assignments[i] !== index) return;
          size++;
          for (const e of u.entities) inCluster[e.id] = (inCluster[e.id] ?? 0) + 1;
        });
        const top = lift(inCluster, size, overall, updates.length, { take: 6 });
        return { index, name: `Cluster ${index + 1}`, size, topEntities: top.map((t) => nameOf.get(t.id) ?? t.id) };
      });
      trace.push({
        kind: "slice",
        name: "k-means on resolved entities, city and age",
        ms: Date.now() - t1,
        result: `${result.k} clusters (${clusters.map((c) => c.size).join("/")}), silhouette ${result.silhouette.toFixed(2)}`,
      });
      await ctx.runMutation(internal.pagesUploads.patch, { id: uploadId, patch: { clusters, spans: trace } });
      trace.length = 0;

      /* 3. One audience per cluster. */
      for (const c of clusters) {
        await progress(0.7 + 0.3 * (c.index / clusters.length), `Compiling ${c.name} (${c.size} members)`);
        const { id: audienceId } = await ctx.runMutation(internal.pagesAudiences.createInternal, {
          brandId: upload.brandId,
          name: c.name,
          kind: "csv",
          sources: { uploadId, cluster: c.index },
        });
        c.audienceId = audienceId;
        await ctx.runMutation(internal.pagesUploads.patch, { id: uploadId, patch: { clusters } });
        try {
          await ctx.runAction(internal.pagesAudiences.compileInternal, { id: audienceId });
        } catch (err) {
          console.warn(`compile ${c.name}: ${String(err)}`);
        }
      }
      await ctx.runMutation(internal.pagesUploads.patch, {
        id: uploadId,
        patch: { clusters, status: "ready", progress: { value: 1, label: "Ready" } },
      });
      return { clusters: clusters.length, resolved: resolved.size, unique: names.length };
    } catch (err) {
      await ctx.runMutation(internal.pagesUploads.patch, {
        id: uploadId,
        patch: { status: "failed", error: String(err).slice(0, 300), spans: trace },
      });
      if (listId) await ctx.runMutation(internal.pagesAudiences.setStatus, { id: listId, status: "failed", error: String(err).replace(/^Error: /, "").slice(0, 300) });
      throw err;
    }
  },
});

/** A one-member audience for one row: a personal page is a page built for it. */
async function insertLead(ctx: MutationCtx, member: Doc<"pagesMembers">): Promise<Id<"pagesAudiences">> {
  if (member.leadAudienceId && (await ctx.db.get(member.leadAudienceId))) return member.leadAudienceId;
  const upload = await ctx.db.get(member.uploadId);
  const nameCol = upload?.mapping.name;
  const idCol = upload?.mapping.id;
  const label =
    (nameCol && member.row[nameCol]) || (idCol && member.row[idCol]) || `Guest ${String(member._id).slice(-5)}`;
  const now = Date.now();
  const audienceId = await ctx.db.insert("pagesAudiences", {
    brandId: member.brandId,
    name: label,
    slug: await uniqueAudienceSlug(ctx, member.brandId, slugify(`lead-${label}`)),
    kind: "lead",
    sources: { memberId: member._id, uploadId: member.uploadId, cluster: member.cluster },
    status: "compiling",
    progress: { value: 0, label: "Starting" },
    size: 1,
    trace: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(member._id, { leadAudienceId: audienceId });
  return audienceId;
}

/** One row's audience, from a cluster's Members tab. The console compiles it next. */
export const createLead = mutation({
  args: { memberId: v.id("pagesMembers") },
  returns: v.object({ audienceId: v.id("pagesAudiences") }),
  handler: async (ctx, { memberId }) => {
    const member = await editable(ctx, await ctx.db.get(memberId), "member");
    return { audienceId: await insertLead(ctx, member) };
  },
});

/** Every row's audience (created where missing), in row order. For a customer list. */
export const ensureLeads = internalMutation({
  args: { uploadId: v.id("pagesUploads") },
  returns: v.array(v.id("pagesAudiences")),
  handler: async (ctx, { uploadId }) => {
    const members = await ctx.db.query("pagesMembers").withIndex("by_upload", (q) => q.eq("uploadId", uploadId)).collect();
    const ids: Id<"pagesAudiences">[] = [];
    for (const m of members) ids.push(await insertLead(ctx, m));
    return ids;
  },
});
