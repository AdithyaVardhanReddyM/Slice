import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { tagKey } from "./catalog";
import { cachedQlooGet } from "./qloo";
import { CITIES } from "./taste";

// Geo routing for pages. A city's taste is read from Qloo (what its people
// are into, artists and brands, with their tags) and each page variant is
// scored by how much of its Qloo tag profile that city shares. The answer is
// stored on the page, so a city costs Qloo calls once.

type Json = Record<string, unknown>;
type Fit = { city: string; segmentId: string; score: number; matched: string[] };
type Routing = {
  id: Id<"pages">;
  published: boolean;
  cityMap: Fit[];
  segments: {
    id: string;
    isDefault: boolean;
    tags: { id: string; name: string; affinity: number }[];
    anchors: string[];
  }[];
};

const KINDS = ["urn:entity:artist", "urn:entity:brand"];

/** Tag word → weight, from the city's top entities (higher-ranked count more). */
async function cityTaste(ctx: ActionCtx, city: string) {
  const weights = new Map<string, { name: string; w: number }>();
  const entityIds = new Set<string>();
  for (const type of KINDS) {
    let body: { results?: { entities?: Json[] } };
    try {
      const res = await cachedQlooGet(ctx, "/v2/insights", {
        "filter.type": type,
        "signal.location.query": city,
        take: 25,
      });
      body = JSON.parse(res.body);
    } catch {
      continue;
    }
    const entities = body.results?.entities ?? [];
    entities.forEach((e, rank) => {
      entityIds.add(String(e.entity_id));
      const rw = 1 - 0.6 * (rank / Math.max(1, entities.length - 1));
      for (const t of (e.tags as Json[] | undefined) ?? []) {
        const id = String(t.tag_id ?? t.id ?? "");
        const name = String(t.name ?? "");
        if (!id || !name) continue;
        const key = tagKey(id);
        const prev = weights.get(key);
        weights.set(key, { name, w: (prev?.w ?? 0) + rw });
      }
    });
  }
  return { weights, entityIds };
}

function bestFit(page: Routing, city: string, taste: Awaited<ReturnType<typeof cityTaste>>): Fit {
  const fallback = page.segments.find((s) => s.isDefault) ?? page.segments[0];
  let best: Fit = { city, segmentId: fallback.id, score: 0, matched: [] };
  for (const s of page.segments) {
    if (s.isDefault) continue;
    let score = 0;
    const matched: { name: string; w: number }[] = [];
    for (const t of s.tags) {
      const hit = taste.weights.get(tagKey(t.id));
      if (!hit) continue;
      const w = hit.w * Math.max(0.05, t.affinity);
      score += w;
      matched.push({ name: t.name, w });
    }
    // The segment's own anchors showing up in the city's top list is a strong signal.
    score += 2 * s.anchors.filter((a) => taste.entityIds.has(a)).length;
    // Normalise so a segment with more tags doesn't win by volume alone.
    score /= Math.sqrt(Math.max(1, s.tags.length));
    if (score > best.score) {
      best = {
        city,
        segmentId: s.id,
        score: Math.round(score * 1000) / 1000,
        matched: matched.sort((a, b) => b.w - a.w).map((m) => m.name).slice(0, 6),
      };
    }
  }
  return best;
}

/** Scheduled when the agent saves a page: route the well-known cities up front. */
export const mapCities = internalAction({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = (await ctx.runQuery(internal.pages.routingInfo, { id })) as Routing | null;
    if (!page || page.segments.length < 2) return null;
    const fits: Fit[] = [];
    for (const city of CITIES) {
      fits.push(bestFit(page, city, await cityTaste(ctx, city)));
    }
    await ctx.runMutation(internal.pages.saveCityFits, { id, fits });
    return null;
  },
});

/** A visitor from a city we haven't routed yet; called by the page with a short timeout. */
export const cityFit = action({
  args: { slug: v.string(), city: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { slug, city }) => {
    const name = city.trim();
    if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(name)) return null;
    const page = (await ctx.runQuery(internal.pages.routingInfo, { slug })) as Routing | null;
    if (!page?.published || page.segments.length < 2) return null;
    const known = page.cityMap.find((c) => c.city.toLowerCase() === name.toLowerCase());
    if (known) return known.segmentId;
    const fit = bestFit(page, name, await cityTaste(ctx, name));
    await ctx.runMutation(internal.pages.saveCityFits, { id: page.id, fits: [fit] });
    return fit.segmentId;
  },
});
