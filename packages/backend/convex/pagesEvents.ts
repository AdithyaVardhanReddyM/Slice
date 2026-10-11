import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { dayOf, hourOf, safeKey, safeRecord } from "./pagesUtil";

// First-party analytics for published pages. `ingest` stores raw events and
// keeps the hourly rollup (pagesStats) current, so the dashboard queries only
// read rollups; `heatmap`/`recent`/`forms` read raw rows.

const MAX_EVENTS_PER_BATCH = 100;

const eventValidator = v.object({
  type: v.string(),
  at: v.number(),
  sectionId: v.optional(v.string()),
  label: v.optional(v.string()),
  href: v.optional(v.string()),
  x: v.optional(v.number()),
  y: v.optional(v.number()),
  value: v.optional(v.number()),
  data: v.optional(v.record(v.string(), v.string())),
});

const batchValidator = v.object({
  pageId: v.string(),
  variantId: v.string(),
  visitorId: v.string(),
  sessionId: v.string(),
  resolvedBy: v.string(),
  path: v.string(),
  referrer: v.optional(v.string()),
  utm: v.optional(v.record(v.string(), v.string())),
  screen: v.optional(v.object({ w: v.number(), h: v.number() })),
  events: v.array(eventValidator),
});

export const ingestArgs = {
  batch: batchValidator,
  device: v.string(),
  browser: v.string(),
  os: v.string(),
  country: v.optional(v.string()),
  region: v.optional(v.string()),
  city: v.optional(v.string()),
  source: v.string(),
  referrerHost: v.optional(v.string()),
};
const ingestArgsValidator = v.object(ingestArgs);
export type IngestArgs = Infer<typeof ingestArgsValidator>;

type StatsRow = Doc<"pagesStats">;
type Delta = Omit<StatsRow, "_id" | "_creationTime" | "pageId" | "variantId" | "day" | "hour">;

const emptyDelta = (): Delta => ({
  views: 0,
  sessions: 0,
  visitors: 0,
  clicks: 0,
  ctaClicks: 0,
  formSubmits: 0,
  engagedMs: 0,
  scrollSum: 0,
  scrollN: 0,
  byDevice: {},
  byBrowser: {},
  byCountry: {},
  bySource: {},
  byResolvedBy: {},
  bySection: {},
});

const bump = (map: Record<string, number>, key: string | undefined, n = 1) => {
  const k = safeKey(key || "unknown");
  map[k] = (map[k] ?? 0) + n;
};

const bumpSection = (map: Delta["bySection"], sectionId: string | undefined, field: "seen" | "clicks") => {
  if (!sectionId) return;
  const k = safeKey(sectionId);
  const cur = map[k] ?? { seen: 0, clicks: 0 };
  cur[field] += 1;
  map[k] = cur;
};

/** One tracker batch: raw events, the session row, and the hourly rollups it touches. */
export async function ingestOne(ctx: MutationCtx, args: IngestArgs): Promise<number> {
  const { batch } = args;
  const pageId = ctx.db.normalizeId("pages", batch.pageId);
  const variantId = ctx.db.normalizeId("pagesVariants", batch.variantId);
  if (!pageId || !variantId) return 0;
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.pageId !== pageId) return 0;
  const events = batch.events.slice(0, MAX_EVENTS_PER_BATCH);
  if (!events.length) return 0;
  const now = Date.now();
  // Client clocks drift; keep events within a day of now and never in the future.
  const clamp = (at: number) => (Number.isFinite(at) ? Math.min(at, now + 60_000) : now);
  const times = events.map((e) => clamp(e.at));
  const first = Math.min(...times);
  const last = Math.max(...times);

  const deltas = new Map<string, Delta>();
  const deltaFor = (at: number) => {
    const key = `${dayOf(at)}|${hourOf(at)}`;
    let d = deltas.get(key);
    if (!d) {
      d = emptyDelta();
      deltas.set(key, d);
    }
    return d;
  };

  // Session and visitor. A visitor counts once per page per day: their first session that day.
  const existing = await ctx.db
    .query("pagesSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", batch.sessionId))
    .filter((q) => q.eq(q.field("pageId"), pageId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { lastAt: Math.max(existing.lastAt, last) });
  } else {
    const dayStart = Date.parse(dayOf(first) + "T00:00:00.000Z");
    const earlier = await ctx.db
      .query("pagesSessions")
      .withIndex("by_page_visitor", (q) => q.eq("pageId", pageId).eq("visitorId", batch.visitorId).gte("startedAt", dayStart))
      .first();
    await ctx.db.insert("pagesSessions", {
      pageId,
      variantId,
      sessionId: batch.sessionId,
      visitorId: batch.visitorId,
      startedAt: first,
      lastAt: last,
      resolvedBy: batch.resolvedBy,
    });
    const d = deltaFor(first);
    d.sessions += 1;
    if (!earlier) d.visitors += 1;
  }

  const utm = safeRecord(batch.utm);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const at = times[i];
    const d = deltaFor(at);
    switch (e.type) {
      case "pageview":
        d.views += 1;
        bump(d.byDevice, args.device);
        bump(d.byBrowser, args.browser);
        bump(d.byCountry, args.country);
        bump(d.bySource, args.source);
        bump(d.byResolvedBy, batch.resolvedBy);
        break;
      case "click":
        d.clicks += 1;
        bumpSection(d.bySection, e.sectionId, "clicks");
        break;
      case "cta_click":
        d.ctaClicks += 1;
        bumpSection(d.bySection, e.sectionId, "clicks");
        break;
      case "section_seen":
        bumpSection(d.bySection, e.sectionId, "seen");
        break;
      case "heartbeat":
        d.engagedMs += Math.max(0, Math.min(e.value ?? 0, 60_000));
        break;
      case "scroll":
        d.scrollSum += Math.max(0, Math.min(e.value ?? 0, 1));
        d.scrollN += 1;
        break;
      case "form_submit":
        d.formSubmits += 1;
        await ctx.db.insert("pagesForms", {
          brandId: variant.brandId,
          pageId,
          variantId,
          sessionId: batch.sessionId,
          sectionId: e.sectionId ?? "form",
          at,
          fields: safeRecord(e.data) ?? {},
        });
        break;
      default:
        break;
    }
    await ctx.db.insert("pagesEvents", {
      brandId: variant.brandId,
      pageId,
      variantId,
      visitorId: batch.visitorId,
      sessionId: batch.sessionId,
      type: e.type,
      at,
      resolvedBy: batch.resolvedBy,
      path: batch.path.slice(0, 300),
      sectionId: e.sectionId,
      label: e.label?.slice(0, 80),
      href: e.href?.slice(0, 500),
      x: e.x,
      y: e.y,
      value: e.value,
      data: safeRecord(e.data),
      device: args.device,
      browser: args.browser,
      os: args.os,
      country: args.country,
      region: args.region,
      city: args.city,
      source: args.source,
      referrerHost: args.referrerHost,
      utm,
    });
  }

  for (const [key, d] of deltas) {
    const [day, hourText] = key.split("|");
    const hour = Number(hourText);
    const row = await ctx.db
      .query("pagesStats")
      .withIndex("by_variant_day_hour", (q) => q.eq("variantId", variantId).eq("day", day).eq("hour", hour))
      .unique();
    if (!row) {
      await ctx.db.insert("pagesStats", { pageId, variantId, day, hour, ...d });
      continue;
    }
    const mergeMap = (a: Record<string, number>, b: Record<string, number>) => {
      const out = { ...a };
      for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
      return out;
    };
    const bySection = { ...row.bySection };
    for (const [k, s] of Object.entries(d.bySection)) {
      const cur = bySection[k] ?? { seen: 0, clicks: 0 };
      bySection[k] = { seen: cur.seen + s.seen, clicks: cur.clicks + s.clicks };
    }
    await ctx.db.patch(row._id, {
      views: row.views + d.views,
      sessions: row.sessions + d.sessions,
      visitors: row.visitors + d.visitors,
      clicks: row.clicks + d.clicks,
      ctaClicks: row.ctaClicks + d.ctaClicks,
      formSubmits: row.formSubmits + d.formSubmits,
      engagedMs: row.engagedMs + d.engagedMs,
      scrollSum: row.scrollSum + d.scrollSum,
      scrollN: row.scrollN + d.scrollN,
      byDevice: mergeMap(row.byDevice, d.byDevice),
      byBrowser: mergeMap(row.byBrowser, d.byBrowser),
      byCountry: mergeMap(row.byCountry, d.byCountry),
      bySource: mergeMap(row.bySource, d.bySource),
      byResolvedBy: mergeMap(row.byResolvedBy, d.byResolvedBy),
      bySection,
    });
  }
  return events.length;
}

/** One tracker batch (≤ 100 events). Unknown page/variant ids are ignored. */
export const ingest = mutation({
  args: ingestArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await ingestOne(ctx, args);
    return null;
  },
});

/** Several sessions in one transaction, for the traffic simulator. */
export const ingestMany = internalMutation({
  args: { batches: v.array(ingestArgsValidator) },
  returns: v.number(),
  handler: async (ctx, { batches }) => {
    let n = 0;
    for (const b of batches) n += await ingestOne(ctx, b);
    return n;
  },
});

/* Reads ------------------------------------------------------------------- */

const rangeValidator = v.union(v.number(), v.string());

/** Accepts ms timestamps or "YYYY-MM-DD" and returns inclusive UTC day bounds. */
function dayRange(from: number | string, to: number | string): { fromDay: string; toDay: string; fromMs: number; toMs: number } {
  const toDayText = (x: number | string) => (typeof x === "string" ? x.slice(0, 10) : dayOf(x));
  const fromDay = toDayText(from);
  const toDay = toDayText(to);
  return {
    fromDay,
    toDay,
    fromMs: typeof from === "number" ? from : Date.parse(fromDay + "T00:00:00.000Z"),
    toMs: typeof to === "number" ? to : Date.parse(toDay + "T23:59:59.999Z"),
  };
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 10000 : 0);

function statsRows(ctx: QueryCtx, pageId: Id<"pages">, fromDay: string, toDay: string): Promise<StatsRow[]> {
  return ctx.db
    .query("pagesStats")
    .withIndex("by_page_day", (q) => q.eq("pageId", pageId).gte("day", fromDay).lte("day", toDay))
    .collect();
}

const sumInto = (target: Record<string, number>, source: Record<string, number>) => {
  for (const [k, n] of Object.entries(source)) target[k] = (target[k] ?? 0) + n;
};

/**
 * Rollups for a page over [from, to]. `hourly` is `number[24][7]`: views per
 * UTC hour (first index) and weekday (second index, JS `getUTCDay`, 0 = Sunday).
 */
export const stats = query({
  args: { pageId: v.id("pages"), from: rangeValidator, to: rangeValidator },
  handler: async (ctx, { pageId, from, to }) => {
    const { fromDay, toDay } = dayRange(from, to);
    const rows: StatsRow[] = await statsRows(ctx, pageId, fromDay, toDay);
    const variants = await ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", pageId)).collect();
    const byVariant = new Map<string, Delta>();
    for (const vnt of variants) byVariant.set(vnt._id, emptyDelta());
    const byDevice: Record<string, number> = {};
    const byBrowser: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byResolvedBy: Record<string, number> = {};
    const hourly: number[][] = Array.from({ length: 24 }, () => new Array<number>(7).fill(0));
    const series: { day: string; hour: number; variantId: Id<"pagesVariants">; views: number; sessions: number; ctaClicks: number }[] = [];
    for (const r of rows) {
      let d = byVariant.get(r.variantId);
      if (!d) {
        d = emptyDelta();
        byVariant.set(r.variantId, d);
      }
      d.views += r.views;
      d.sessions += r.sessions;
      d.visitors += r.visitors;
      d.clicks += r.clicks;
      d.ctaClicks += r.ctaClicks;
      d.formSubmits += r.formSubmits;
      d.engagedMs += r.engagedMs;
      d.scrollSum += r.scrollSum;
      d.scrollN += r.scrollN;
      sumInto(byDevice, r.byDevice);
      sumInto(byBrowser, r.byBrowser);
      sumInto(byCountry, r.byCountry);
      sumInto(bySource, r.bySource);
      sumInto(byResolvedBy, r.byResolvedBy);
      const dow = new Date(r.day + "T00:00:00.000Z").getUTCDay();
      hourly[r.hour][dow] += r.views;
      series.push({ day: r.day, hour: r.hour, variantId: r.variantId, views: r.views, sessions: r.sessions, ctaClicks: r.ctaClicks });
    }
    series.sort((a, b) => (a.day === b.day ? a.hour - b.hour : a.day < b.day ? -1 : 1));
    const variantRows = [...byVariant.entries()].map(([variantId, d]) => {
      const vnt = variants.find((x) => x._id === variantId);
      return {
        variantId: variantId as Id<"pagesVariants">,
        name: vnt?.name ?? "Deleted variant",
        audienceId: vnt?.audienceId,
        status: vnt?.status ?? "deleted",
        views: d.views,
        sessions: d.sessions,
        visitors: d.visitors,
        clicks: d.clicks,
        ctaClicks: d.ctaClicks,
        formSubmits: d.formSubmits,
        ctaRate: ratio(d.ctaClicks, d.views),
        clickRate: ratio(d.clicks, d.views),
        avgEngagedMs: d.sessions > 0 ? Math.round(d.engagedMs / d.sessions) : 0,
        avgScroll: d.scrollN > 0 ? Math.round((d.scrollSum / d.scrollN) * 1000) / 1000 : 0,
        formRate: ratio(d.formSubmits, d.views),
      };
    });
    // Default first, then by views.
    variantRows.sort((a, b) => Number(!!a.audienceId) - Number(!!b.audienceId) || b.views - a.views);
    return { variants: variantRows, series, byDevice, byBrowser, byCountry, bySource, byResolvedBy, hourly, from: fromDay, to: toDay };
  },
});

/** Click positions per section (normalised 0..1) plus seen/click counts per section. */
export const heatmap = query({
  args: { variantId: v.id("pagesVariants"), from: rangeValidator, to: rangeValidator },
  handler: async (ctx, { variantId, from, to }) => {
    const { fromDay, toDay, fromMs, toMs } = dayRange(from, to);
    const events = await ctx.db
      .query("pagesEvents")
      .withIndex("by_variant_at", (q) => q.eq("variantId", variantId).gte("at", fromMs).lte("at", toMs))
      .filter((q) => q.or(q.eq(q.field("type"), "click"), q.eq(q.field("type"), "cta_click")))
      .take(5000);
    const points = events
      .filter((e) => e.sectionId && e.x !== undefined && e.y !== undefined)
      .map((e) => ({ sectionId: e.sectionId!, x: e.x!, y: e.y!, type: e.type, label: e.label }));
    const rows = await ctx.db
      .query("pagesStats")
      .withIndex("by_variant_day_hour", (q) => q.eq("variantId", variantId).gte("day", fromDay).lte("day", toDay))
      .collect();
    const sections: Record<string, { seen: number; clicks: number }> = {};
    for (const r of rows) {
      for (const [k, s] of Object.entries(r.bySection)) {
        const cur = sections[k] ?? { seen: 0, clicks: 0 };
        sections[k] = { seen: cur.seen + s.seen, clicks: cur.clicks + s.clicks };
      }
    }
    return { points, sections };
  },
});

export const forms = query({
  args: { pageId: v.id("pages"), take: v.optional(v.number()) },
  handler: async (ctx, { pageId, take = 100 }) =>
    ctx.db
      .query("pagesForms")
      .withIndex("by_page_at", (q) => q.eq("pageId", pageId))
      .order("desc")
      .take(Math.min(take, 1000)),
});

export const recent = query({
  args: { pageId: v.id("pages"), take: v.optional(v.number()) },
  handler: async (ctx, { pageId, take = 50 }) =>
    ctx.db
      .query("pagesEvents")
      .withIndex("by_page_at", (q) => q.eq("pageId", pageId))
      .order("desc")
      .take(Math.min(take, 500)),
});

/** Per page over the last `days`: views, sessions, CTA rate and the variant with the best CTA rate. */
export const brandOverview = query({
  args: { brandId: v.id("pagesBrands"), days: v.number() },
  handler: async (ctx, { brandId, days }) => {
    const now = Date.now();
    const fromDay = dayOf(now - Math.max(0, days - 1) * 86_400_000);
    const toDay = dayOf(now);
    const pages = await ctx.db.query("pages").withIndex("by_brand", (q) => q.eq("brandId", brandId)).order("desc").collect();
    const out = [];
    for (const page of pages) {
      const rows: StatsRow[] = await statsRows(ctx, page._id, fromDay, toDay);
      const variants = await ctx.db.query("pagesVariants").withIndex("by_page", (q) => q.eq("pageId", page._id)).collect();
      let views = 0;
      let sessions = 0;
      let ctaClicks = 0;
      const per = new Map<string, { views: number; ctaClicks: number }>();
      for (const r of rows) {
        views += r.views;
        sessions += r.sessions;
        ctaClicks += r.ctaClicks;
        const p = per.get(r.variantId) ?? { views: 0, ctaClicks: 0 };
        p.views += r.views;
        p.ctaClicks += r.ctaClicks;
        per.set(r.variantId, p);
      }
      let topVariant: { variantId: Id<"pagesVariants">; name: string; views: number; ctaRate: number } | null = null;
      for (const [variantId, p] of per) {
        if (p.views < 1) continue;
        const rate = ratio(p.ctaClicks, p.views);
        if (!topVariant || rate > topVariant.ctaRate) {
          topVariant = {
            variantId: variantId as Id<"pagesVariants">,
            name: variants.find((x) => x._id === variantId)?.name ?? "Variant",
            views: p.views,
            ctaRate: rate,
          };
        }
      }
      out.push({
        pageId: page._id,
        title: page.title,
        slug: page.slug,
        status: page.status,
        publishedAt: page.publishedAt,
        variantCount: variants.length,
        views,
        sessions,
        ctaClicks,
        ctaRate: ratio(ctaClicks, views),
        topVariant,
      });
    }
    return out;
  },
});
