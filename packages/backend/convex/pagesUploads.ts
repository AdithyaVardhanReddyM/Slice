import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Span } from "./qlooApi";
import { spanValidator } from "./schema";
import { ageBucket, kmeans, lift, normalizeGender, splitTerms, type ClusterRow, type CsvMapping } from "./pagesCsv";
import { norm, resolveNames, safeRecord, slugify } from "./pagesUtil";

// A customer CSV becomes audiences: each row's taste columns are resolved to
// Qloo entities, rows are clustered on those entities (plus city and age),
// and every cluster is compiled as a `csv` audience. One row can also become
// a `lead` audience for a personal link.

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
  },
  returns: v.object({ id: v.id("pagesUploads") }),
  handler: async (ctx, { brandId, filename, columns, rows, mapping }) => {
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call; use appendRows for the rest`);
    const now = Date.now();
    const id = await ctx.db.insert("pagesUploads", {
      brandId,
      filename,
      columns,
      rowCount: rows.length,
      status: "uploading",
      progress: { value: 0, label: "Uploading rows" },
      mapping,
      clusters: [],
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    for (const row of rows) await ctx.db.insert("pagesMembers", memberFromRow(brandId, id, row, mapping));
    return { id };
  },
});

export const appendRows = mutation({
  args: { uploadId: v.id("pagesUploads"), rows: rowsValidator },
  returns: v.object({ rowCount: v.number() }),
  handler: async (ctx, { uploadId, rows }) => {
    if (rows.length > MAX_ROWS_PER_CALL) throw new Error(`Send at most ${MAX_ROWS_PER_CALL} rows per call`);
    const upload = await ctx.db.get(uploadId);
    if (!upload) throw new Error("Unknown upload");
    for (const row of rows) await ctx.db.insert("pagesMembers", memberFromRow(upload.brandId, uploadId, row, upload.mapping));
    const rowCount = upload.rowCount + rows.length;
    await ctx.db.patch(uploadId, { rowCount, updatedAt: Date.now() });
    return { rowCount };
  },
});

export const list = query({
  args: { brandId: v.id("pagesBrands") },
  handler: async (ctx, { brandId }) =>
    ctx.db
      .query("pagesUploads")
      .withIndex("by_brand", (q) => q.eq("brandId", brandId))
      .order("desc")
      .collect(),
});

export const get = query({
  args: { id: v.id("pagesUploads") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("pagesUploads") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const members = query({
  args: { uploadId: v.id("pagesUploads"), cluster: v.optional(v.number()), take: v.optional(v.number()) },
  handler: async (ctx, { uploadId, cluster, take = 200 }) => {
    const q = ctx.db.query("pagesMembers").withIndex("by_upload", (q) => q.eq("uploadId", uploadId));
    const filtered = cluster === undefined ? q : q.filter((f) => f.eq(f.field("cluster"), cluster));
    return filtered.take(Math.min(take, 1000));
  },
});

export const membersInternal = internalQuery({
  args: { uploadId: v.id("pagesUploads"), cluster: v.optional(v.number()) },
  handler: async (ctx, { uploadId, cluster }) => {
    const all = await ctx.db.query("pagesMembers").withIndex("by_upload", (q) => q.eq("uploadId", uploadId)).collect();
    return cluster === undefined ? all : all.filter((m) => m.cluster === cluster);
  },
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

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** A loose name check for CSV cells: the hit must share a word with the term. */
function plausible(term: string, found: string): boolean {
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
  returns: v.object({ clusters: v.number(), resolved: v.number(), unique: v.number() }),
  handler: async (ctx, { uploadId, k, seed = 7 }): Promise<{ clusters: number; resolved: number; unique: number }> => {
    const upload = await ctx.runQuery(internal.pagesUploads.getInternal, { id: uploadId });
    if (!upload) throw new Error("Unknown upload");
    const trace: Span[] = [];
    const progress = (value: number, label: string, status?: string) =>
      ctx.runMutation(internal.pagesUploads.setProgress, { id: uploadId, value, label, status });
    try {
      /* 1. Resolve taste terms. */
      await progress(0, "Reading the rows", "resolving");
      const members = await ctx.runQuery(internal.pagesUploads.membersInternal, { uploadId });
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
        const { id: audienceId } = await ctx.runMutation(api.pagesAudiences.create, {
          brandId: upload.brandId,
          name: c.name,
          kind: "csv",
          sources: { uploadId, cluster: c.index },
        });
        c.audienceId = audienceId;
        await ctx.runMutation(internal.pagesUploads.patch, { id: uploadId, patch: { clusters } });
        try {
          await ctx.runAction(api.pagesAudiences.compile, { id: audienceId });
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
      throw err;
    }
  },
});

/** A one-member audience for a personal link (`?g=<memberId>`). The console compiles it next. */
export const createLead = mutation({
  args: { memberId: v.id("pagesMembers") },
  returns: v.object({ audienceId: v.id("pagesAudiences") }),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Unknown member");
    if (member.leadAudienceId && (await ctx.db.get(member.leadAudienceId))) return { audienceId: member.leadAudienceId };
    const upload = await ctx.db.get(member.uploadId);
    const nameCol = upload?.mapping.name;
    const idCol = upload?.mapping.id;
    const label =
      (nameCol && member.row[nameCol]) || (idCol && member.row[idCol]) || `Guest ${String(memberId).slice(-5)}`;
    const now = Date.now();
    const base = slugify(`lead-${label}`);
    let slug = base;
    for (let n = 2; ; n++) {
      const taken = await ctx.db
        .query("pagesAudiences")
        .withIndex("by_brand_slug", (q) => q.eq("brandId", member.brandId).eq("slug", slug))
        .unique();
      if (!taken) break;
      slug = `${base}-${n}`;
    }
    const audienceId = await ctx.db.insert("pagesAudiences", {
      brandId: member.brandId,
      name: label,
      slug,
      kind: "lead",
      sources: { memberId, uploadId: member.uploadId, cluster: member.cluster },
      status: "compiling",
      progress: { value: 0, label: "Starting" },
      size: 1,
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(memberId, { leadAudienceId: audienceId });
    return { audienceId };
  },
});
