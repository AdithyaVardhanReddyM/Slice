import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { PageDoc } from "./pagesTypes";
import type { IngestArgs } from "./pagesEvents";
import { rng } from "./pagesCsv";
import { hash32 } from "./pagesUtil";

// Demo helpers: a deterministic traffic simulator so dashboards are populated
// on day one, and a reset that wipes a brand for re-running the demo.
//
//   npx convex run pagesSeed:simulateTraffic '{"pageId":"...","days":14,"sessionsPerDay":40}'
//   npx convex run pagesSeed:reset '{"brandSlug":"ridgeline"}'

const DAY = 86_400_000;
const HOUR_CURVE = [0.2, 0.1, 0.1, 0.1, 0.1, 0.2, 0.4, 0.7, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 1.0, 1.1, 1.2, 1.3, 1.2, 0.9, 0.6, 0.4];
const WEEKDAY_FACTOR = [0.7, 1.0, 1.05, 1.05, 1.0, 0.95, 0.8]; // Sun..Sat

const CITY_COUNTRY: Record<string, string> = {
  austin: "US", seattle: "US", "new york city": "US", "new york": "US", "los angeles": "US", chicago: "US", portland: "US",
  denver: "US", "san francisco": "US", nashville: "US", boston: "US", london: "GB", manchester: "GB", edinburgh: "GB",
  berlin: "DE", munich: "DE", hamburg: "DE", paris: "FR", marseille: "FR", lyon: "FR", lisbon: "PT", porto: "PT",
  copenhagen: "DK", barcelona: "ES", madrid: "ES", amsterdam: "NL", stockholm: "SE", dublin: "IE", milan: "IT", rome: "IT",
  toronto: "CA", vancouver: "CA", montreal: "CA", sydney: "AU", melbourne: "AU", tokyo: "JP",
};
const COUNTRY_MIX: [string, number][] = [["US", 45], ["GB", 15], ["DE", 8], ["FR", 7], ["CA", 6], ["AU", 5], ["NL", 4], ["ES", 4], ["PT", 3], ["SE", 3]];

type Weighted<T> = [T, number][];
const pickWeighted = <T>(random: () => number, options: Weighted<T>): T => {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [value, w] of options) {
    r -= w;
    if (r <= 0) return value;
  }
  return options[options.length - 1][0];
};
const between = (random: () => number, lo: number, hi: number) => lo + (hi - lo) * random();

interface VariantPlan {
  variant: Doc<"pagesVariants">;
  audience: Doc<"pagesAudiences"> | undefined;
  share: number;
  ctaP: number;
  sectionIds: string[];
  formId?: string;
  ctaId: string;
}

function planVariants(
  variants: Doc<"pagesVariants">[],
  audiences: Doc<"pagesAudiences">[],
  weights: Record<string, number> | undefined,
): VariantPlan[] {
  const sorted = [...variants].sort((a, b) => Number(!!a.audienceId) - Number(!!b.audienceId));
  const audienceVariants = sorted.filter((x) => x.audienceId).length;
  return sorted.map((variant, i) => {
    const doc = variant.doc as PageDoc | undefined;
    const sections = doc?.sections?.map((s) => s.id) ?? ["hero", "s2", "s3", "s4", "s5", "cta"];
    const formId = doc?.sections?.find((s) => s.type === "form")?.id;
    const ctaId = doc?.sections?.find((s) => s.type === "cta")?.id ?? sections[sections.length - 1];
    const isDefault = !variant.audienceId;
    const share = audienceVariants === 0 ? 1 : isDefault ? 0.35 : 0.65 / audienceVariants;
    // A built-in spread so there is a winner even without explicit weights.
    const ctaP = weights?.[variant._id] ?? (isDefault ? 0.05 : 0.065 + 0.02 * i);
    return {
      variant,
      audience: audiences.find((a) => a._id === variant.audienceId),
      share,
      ctaP,
      sectionIds: sections,
      formId,
      ctaId,
    };
  });
}

function resolvedByFor(random: () => number, plan: VariantPlan): string {
  if (!plan.audience) return pickWeighted(random, [["default", 70], ["quiz", 15], ["cookie", 15]]);
  switch (plan.audience.kind) {
    case "location":
      return pickWeighted(random, [["geo", 60], ["param", 15], ["utm", 10], ["cookie", 10], ["quiz", 5]]);
    case "csv":
      return pickWeighted(random, [["lead", 40], ["param", 30], ["cookie", 20], ["utm", 10]]);
    case "lead":
      return "lead";
    default:
      return pickWeighted(random, [["param", 40], ["utm", 25], ["quiz", 20], ["cookie", 15]]);
  }
}

function geoFor(random: () => number, plan: VariantPlan, resolvedBy: string): { country: string; city?: string } {
  const loc = plan.audience?.sources.location;
  if (loc) {
    const country = loc.country?.toUpperCase().slice(0, 2) ?? CITY_COUNTRY[loc.city.toLowerCase()] ?? "US";
    if (resolvedBy === "geo" || random() < 0.7) return { country, city: loc.city };
  }
  const memberCities = (plan.audience?.profile as { geo?: { name: string; count: number }[] } | undefined)?.geo;
  if (memberCities?.length && random() < 0.6) {
    const g = pickWeighted(random, memberCities.map((c) => [c.name, Math.max(1, c.count)] as [string, number]));
    return { country: CITY_COUNTRY[g.toLowerCase()] ?? pickWeighted(random, COUNTRY_MIX), city: g };
  }
  return { country: pickWeighted(random, COUNTRY_MIX) };
}

interface Source {
  source: string;
  utm?: Record<string, string>;
  referrer?: string;
  referrerHost?: string;
}

function sourceFor(random: () => number, resolvedBy: string): Source {
  if (resolvedBy === "utm") {
    return random() < 0.6
      ? { source: "ads", utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "launch" } }
      : { source: "email", utm: { utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch" } };
  }
  if (resolvedBy === "param" || resolvedBy === "lead") {
    return pickWeighted<Source>(random, [
      [{ source: "email", utm: { utm_source: "newsletter", utm_medium: "email" } }, 50],
      [{ source: "qr", utm: { utm_source: "qr", utm_medium: "ooh" } }, 20],
      [{ source: "social", utm: { utm_source: "instagram", utm_medium: "social" }, referrer: "https://l.instagram.com/", referrerHost: "l.instagram.com" }, 30],
    ]);
  }
  return pickWeighted<Source>(random, [
    [{ source: "direct" }, 30],
    [{ source: "search", referrer: "https://www.google.com/", referrerHost: "www.google.com" }, 25],
    [{ source: "social", referrer: "https://l.instagram.com/", referrerHost: "l.instagram.com" }, 20],
    [{ source: "ads", utm: { utm_source: "google", utm_medium: "cpc" } }, 10],
    [{ source: "email", utm: { utm_source: "newsletter", utm_medium: "email" } }, 8],
    [{ source: "referral", referrer: "https://www.timeout.com/", referrerHost: "www.timeout.com" }, 5],
    [{ source: "qr", utm: { utm_source: "qr" } }, 2],
  ]);
}

function deviceFor(random: () => number): { device: string; browser: string; os: string; screen: { w: number; h: number } } {
  const device = pickWeighted(random, [["mobile", 55], ["desktop", 40], ["tablet", 5]]);
  if (device === "mobile") {
    const ios = random() < 0.58;
    return {
      device,
      browser: ios ? pickWeighted(random, [["Safari", 85], ["Chrome", 15]]) : pickWeighted(random, [["Chrome", 80], ["Samsung Internet", 15], ["Firefox", 5]]),
      os: ios ? "iOS" : "Android",
      screen: ios ? { w: 390, h: 844 } : { w: 412, h: 915 },
    };
  }
  if (device === "tablet") return { device, browser: "Safari", os: "iPadOS", screen: { w: 820, h: 1180 } };
  const os = pickWeighted(random, [["macOS", 55], ["Windows", 40], ["Linux", 5]]);
  const browser = os === "macOS" ? pickWeighted(random, [["Chrome", 55], ["Safari", 35], ["Firefox", 10]]) : pickWeighted(random, [["Chrome", 65], ["Edge", 25], ["Firefox", 10]]);
  return { device, browser, os, screen: pickWeighted(random, [[{ w: 1440, h: 900 }, 50], [{ w: 1920, h: 1080 }, 35], [{ w: 1280, h: 720 }, 15]]) };
}

function buildSession(
  random: () => number,
  plan: VariantPlan,
  page: Doc<"pages">,
  brandSlug: string,
  startAt: number,
  visitorId: string,
  sessionId: string,
): IngestArgs {
  const resolvedBy = resolvedByFor(random, plan);
  const geo = geoFor(random, plan, resolvedBy);
  const src = sourceFor(random, resolvedBy);
  const dev = deviceFor(random);
  const path = `/${brandSlug}/${page.slug}`;
  const events: IngestArgs["batch"]["events"] = [];
  let t = startAt;
  events.push({ type: "pageview", at: t });
  events.push({ type: "section_seen", at: t + 200, sectionId: plan.sectionIds[0] });

  const bounce = random() < 0.25;
  const depth = bounce ? between(random, 0.1, 0.35) : Math.min(1, between(random, 0.4, 1.15));
  const engagedMs = bounce ? between(random, 3000, 12000) : between(random, 20000, 200000);
  const seenCount = Math.max(1, Math.min(plan.sectionIds.length, Math.ceil(depth * plan.sectionIds.length)));
  const step = engagedMs / (seenCount + 1);
  for (let i = 1; i < seenCount; i++) {
    t += step;
    events.push({ type: "section_seen", at: Math.round(t), sectionId: plan.sectionIds[i] });
    if (i % 2 === 0 || i === seenCount - 1) events.push({ type: "scroll", at: Math.round(t), value: Math.round((i / plan.sectionIds.length) * 100) / 100 });
  }
  events.push({ type: "scroll", at: Math.round(startAt + engagedMs), value: Math.round(depth * 100) / 100 });
  // Heartbeats carry engaged time in chunks.
  let remaining = engagedMs;
  let hb = startAt;
  while (remaining > 0 && events.length < 90) {
    const chunk = Math.min(remaining, 15000);
    hb += chunk;
    events.push({ type: "heartbeat", at: Math.round(hb), value: Math.round(chunk) });
    remaining -= chunk;
  }
  if (!bounce) {
    const clicks = pickWeighted(random, [[0, 35], [1, 35], [2, 20], [3, 10]]);
    for (let c = 0; c < clicks; c++) {
      const sectionId = plan.sectionIds[Math.floor(random() * seenCount)];
      events.push({
        type: "click",
        at: Math.round(startAt + between(random, 2000, engagedMs)),
        sectionId,
        x: Math.min(0.98, Math.max(0.02, 0.5 + (random() - 0.5) * 0.7)),
        y: Math.min(0.98, Math.max(0.02, 0.6 + (random() - 0.5) * 0.6)),
        label: pickWeighted(random, [["Learn more", 3], ["See details", 2], ["View", 2], ["Image", 3]]),
      });
    }
    if (random() < plan.ctaP) {
      const sectionId = random() < 0.6 ? plan.sectionIds[0] : plan.ctaId;
      const at = Math.round(startAt + between(random, 4000, engagedMs));
      const label = page.brief.cta.label || "Get started";
      events.push({ type: "click", at, sectionId, x: 0.5 + (random() - 0.5) * 0.2, y: 0.7 + (random() - 0.5) * 0.1, label, href: page.brief.cta.href });
      events.push({ type: "cta_click", at: at + 1, sectionId, label, href: page.brief.cta.href });
    }
    const formP = plan.formId ? 0.05 : 0.008;
    if (random() < formP && depth > 0.5) {
      const n = Math.floor(random() * 9000) + 1000;
      events.push({
        type: "form_submit",
        at: Math.round(startAt + engagedMs - 1000),
        sectionId: plan.formId ?? "form",
        data: { email: `guest${n}@example.com`, name: pickWeighted(random, [["Alex", 1], ["Sam", 1], ["Jordan", 1], ["Priya", 1], ["Marta", 1], ["Noah", 1]]), city: geo.city ?? "" },
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return {
    batch: {
      pageId: page._id,
      variantId: plan.variant._id,
      visitorId,
      sessionId,
      resolvedBy,
      path,
      referrer: src.referrer,
      utm: src.utm,
      screen: dev.screen,
      events,
    },
    device: dev.device,
    browser: dev.browser,
    os: dev.os,
    country: geo.country,
    city: geo.city,
    source: src.source,
    referrerHost: src.referrerHost,
  };
}

/**
 * Deterministic, realistic traffic over the last `days`. `weights` sets each
 * variant's CTA click probability (0..1); without it audience variants get
 * a built-in spread so one wins. Batches several sessions per mutation.
 */
export const simulateTraffic = internalAction({
  args: {
    pageId: v.id("pages"),
    days: v.number(),
    sessionsPerDay: v.number(),
    weights: v.optional(v.record(v.string(), v.number())),
    seed: v.optional(v.number()),
  },
  returns: v.object({ sessions: v.number(), events: v.number(), perVariant: v.record(v.string(), v.number()) }),
  handler: async (ctx, { pageId, days, sessionsPerDay, weights, seed }) => {
    const data = await ctx.runQuery(internal.pages.getInternal, { id: pageId });
    if (!data) throw new Error("Unknown page");
    const { page, variants, audiences } = data;
    if (!variants.length) throw new Error("Page has no variants");
    const brand = await ctx.runQuery(internal.pagesBrands.getInternal, { id: page.brandId });
    const plans = planVariants(variants, audiences, weights);
    const random = rng(seed ?? hash32(String(pageId)));
    const now = Date.now();
    const visitors: string[] = [];
    const perVariant: Record<string, number> = {};
    let sessions = 0;
    let events = 0;
    let pending: IngestArgs[] = [];
    const flush = async () => {
      if (!pending.length) return;
      events += await ctx.runMutation(internal.pagesEvents.ingestMany, { batches: pending });
      pending = [];
    };
    for (let d = days - 1; d >= 0; d--) {
      const dayStart = Date.parse(new Date(now - d * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z");
      const dow = new Date(dayStart).getUTCDay();
      const count = Math.round(sessionsPerDay * WEEKDAY_FACTOR[dow] * between(random, 0.85, 1.15));
      const maxHour = d === 0 ? new Date(now).getUTCHours() : 23;
      const hours: Weighted<number> = HOUR_CURVE.slice(0, maxHour + 1).map((w, h) => [h, w]);
      for (let i = 0; i < count; i++) {
        const hour = pickWeighted(random, hours);
        const startAt = Math.min(now - 5000, dayStart + hour * 3_600_000 + Math.floor(random() * 3_600_000));
        const plan = pickWeighted(random, plans.map((p) => [p, p.share] as [VariantPlan, number]));
        let visitorId: string;
        if (visitors.length > 20 && random() < 0.3) visitorId = visitors[Math.floor(random() * visitors.length)];
        else {
          visitorId = `sim_v_${hash32(`${pageId}|${seed ?? 0}|${sessions}`).toString(36)}`;
          visitors.push(visitorId);
        }
        const sessionId = `sim_s_${hash32(`${pageId}|${seed ?? 0}|s${sessions}`).toString(36)}`;
        pending.push(buildSession(random, plan, page, brand?.slug ?? "brand", startAt, visitorId, sessionId));
        perVariant[plan.variant._id] = (perVariant[plan.variant._id] ?? 0) + 1;
        sessions++;
        if (pending.length >= 8) await flush();
      }
    }
    await flush();
    return { sessions, events, perVariant };
  },
});

/** Deletes a brand and everything under it, synchronously, for re-running demos. */
export const reset = internalAction({
  args: { brandSlug: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { brandSlug }) => {
    const brand = await ctx.runQuery(api.pagesBrands.bySlug, { slug: brandSlug });
    if (!brand) return { deleted: 0 };
    const pageIds: Id<"pages">[] = await ctx.runQuery(internal.pagesBrands.pageIdsOf, { brandId: brand._id });
    let deleted = 0;
    for (let i = 0; i < 500; i++) {
      const r = await ctx.runMutation(internal.pagesBrands.purgeChunk, { brandId: brand._id, pageIds, reschedule: false });
      deleted += r.deleted;
      if (!r.more) break;
    }
    return { deleted };
  },
});
