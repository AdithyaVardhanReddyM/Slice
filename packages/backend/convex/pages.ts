import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { tagKey } from "./catalog";
import {
  clip,
  currentOwner,
  EVENT_TYPES,
  PAGE_GOALS,
  requireOwner,
  safeColor,
  safeHref,
  safeImage,
  SECTION_KINDS,
  slugify,
} from "./pageUtil";
import {
  cityFitValidator,
  pageSectionValidator,
  pageSegmentValidator,
  spanValidator,
} from "./schema";

// Taste-personalized landing pages. A page has one variant per Qloo taste
// segment of the brand's audience (written by apps/agent/slice_agent/pages);
// `resolve` picks the variant for each visitor from what we know about them:
// the quiz, a Slice taste profile, the campaign that brought them, or the
// taste of their city.

type Page = Doc<"pages">;
type Segment = Page["segments"][number];
type Section = Segment["sections"][number];

function sanitizeSection(s: Section, ctaUrl: string): Section {
  const link = (l: Section["cta"]) =>
    l && clip(l.label, 40) ? { label: clip(l.label, 40), href: safeHref(l.href) ?? ctaUrl } : undefined;
  return {
    id: clip(s.id, 40) || Math.random().toString(36).slice(2, 10),
    kind: (SECTION_KINDS as readonly string[]).includes(s.kind) ? s.kind : "story",
    eyebrow: s.eyebrow ? clip(s.eyebrow, 60) : undefined,
    heading: clip(s.heading, 160),
    body: s.body ? clip(s.body, 900) : undefined,
    image: safeImage(s.image),
    cta: link(s.cta),
    secondaryCta: link(s.secondaryCta),
    items: s.items?.slice(0, 12).map((i) => ({
      title: clip(i.title, 120),
      body: i.body ? clip(i.body, 500) : undefined,
      image: safeImage(i.image),
      href: safeHref(i.href),
      price: i.price ? clip(i.price, 24) : undefined,
    })),
  };
}

function sanitizeSegment(s: Segment, ctaUrl: string): Segment {
  return {
    ...s,
    id: clip(s.id, 40),
    name: clip(s.name, 60),
    summary: clip(s.summary, 300),
    why: clip(s.why, 500),
    utmKeywords: s.utmKeywords.map((k) => clip(k, 40).toLowerCase()).filter(Boolean).slice(0, 12),
    accent: s.accent ? safeColor(s.accent, "") || undefined : undefined,
    seo: { title: clip(s.seo.title, 70), description: clip(s.seo.description, 170) },
    sections: s.sections.slice(0, 12).map((x) => sanitizeSection(x, ctaUrl)),
  };
}

async function ownedPage(ctx: QueryCtx, id: Id<"pages">, ownerId: string | null) {
  const page = await ctx.db.get(id);
  return page && page.ownerId === ownerId ? page : null;
}

async function uniqueSlug(ctx: QueryCtx, base: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!taken) return slug;
  }
  throw new ConvexError("Couldn't pick a page address; try again.");
}

// --- Merchant ---------------------------------------------------------------

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    goal: v.string(),
    offer: v.string(),
    audience: v.optional(v.string()),
    ctaLabel: v.string(),
    ctaUrl: v.string(),
    notes: v.optional(v.string()),
    storeKey: v.optional(v.string()),
    segmentCount: v.number(),
  },
  returns: v.id("pages"),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx);
    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.ownerId !== ownerId) throw new ConvexError("Brand not found.");
    if (brand.status !== "ready" || !brand.kit) throw new ConvexError("The brand is still being read.");
    if (!(PAGE_GOALS as readonly string[]).includes(args.goal)) throw new ConvexError("Unknown goal.");
    const ctaUrl = safeHref(args.ctaUrl);
    if (!ctaUrl || ctaUrl.startsWith("#")) throw new ConvexError("The button link must be an http(s) address.");
    if (clip(args.offer, 600).length < 10) throw new ConvexError("Describe what the page is promoting.");
    if (args.storeKey) {
      const store = await ctx.db
        .query("stores")
        .withIndex("by_key", (q) => q.eq("key", args.storeKey!))
        .unique();
      if (!store) throw new ConvexError("Unknown store.");
    }
    const now = Date.now();
    return ctx.db.insert("pages", {
      ownerId,
      brandId: args.brandId,
      slug: await uniqueSlug(ctx, slugify(brand.kit.name)),
      name: clip(args.name, 80) || `${brand.kit.name} page`,
      goal: args.goal,
      brief: {
        offer: clip(args.offer, 600),
        audience: args.audience ? clip(args.audience, 300) : undefined,
        ctaLabel: clip(args.ctaLabel, 40) || "Get started",
        ctaUrl,
        notes: args.notes ? clip(args.notes, 600) : undefined,
      },
      storeKey: args.storeKey,
      segmentCount: Math.min(4, Math.max(2, Math.round(args.segmentCount))),
      status: "generating",
      progress: "Queued",
      published: false,
      segments: [],
      cityMap: [],
      trace: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentOwner(ctx);
    if (!ownerId) return [];
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(100);
    const brands = new Map<string, Doc<"brands"> | null>();
    for (const p of pages) {
      if (!brands.has(p.brandId)) brands.set(p.brandId, await ctx.db.get(p.brandId));
    }
    return pages.map((p) => {
      const brand = brands.get(p.brandId);
      return {
        _id: p._id,
        name: p.name,
        slug: p.slug,
        goal: p.goal,
        status: p.status,
        progress: p.progress,
        published: p.published,
        updatedAt: p.updatedAt,
        segments: p.segments.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault })),
        brand: brand?.kit
          ? { name: brand.kit.name, logo: brand.kit.logo, icon: brand.kit.icon, colors: brand.kit.colors }
          : null,
      };
    });
  },
});

export const get = query({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const page = await ownedPage(ctx, id, await currentOwner(ctx));
    if (!page) return null;
    const brand = await ctx.db.get(page.brandId);
    return { page, brand };
  },
});

/** Set the page back to generating; the web app calls the agent right after. */
export const regenerate = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ownedPage(ctx, id, await requireOwner(ctx));
    if (!page) throw new ConvexError("Page not found.");
    await ctx.db.patch(id, {
      status: "generating",
      progress: "Queued",
      error: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateSection = mutation({
  args: { id: v.id("pages"), segmentId: v.string(), section: pageSectionValidator },
  returns: v.null(),
  handler: async (ctx, { id, segmentId, section }) => {
    const page = await ownedPage(ctx, id, await requireOwner(ctx));
    if (!page) throw new ConvexError("Page not found.");
    const clean = sanitizeSection(section, page.brief.ctaUrl);
    let found = false;
    const segments = page.segments.map((s) =>
      s.id !== segmentId
        ? s
        : {
            ...s,
            sections: s.sections.map((x) => {
              if (x.id !== section.id) return x;
              found = true;
              return clean;
            }),
          },
    );
    if (!found) throw new ConvexError("Section not found.");
    await ctx.db.patch(id, { segments, updatedAt: Date.now() });
    return null;
  },
});

export const updateSegment = mutation({
  args: {
    id: v.id("pages"),
    segmentId: v.string(),
    name: v.optional(v.string()),
    utmKeywords: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { id, segmentId, name, utmKeywords }) => {
    const page = await ownedPage(ctx, id, await requireOwner(ctx));
    if (!page) throw new ConvexError("Page not found.");
    const segments = page.segments.map((s) =>
      s.id !== segmentId
        ? s
        : sanitizeSegment(
            { ...s, name: name ?? s.name, utmKeywords: utmKeywords ?? s.utmKeywords },
            page.brief.ctaUrl,
          ),
    );
    await ctx.db.patch(id, { segments, updatedAt: Date.now() });
    return null;
  },
});

export const setPublished = mutation({
  args: { id: v.id("pages"), published: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, published }) => {
    const page = await ownedPage(ctx, id, await requireOwner(ctx));
    if (!page) throw new ConvexError("Page not found.");
    if (published && (page.status !== "ready" || !page.segments.length)) {
      throw new ConvexError("Generate the page before publishing it.");
    }
    await ctx.db.patch(id, { published, updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("pages") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const page = await ownedPage(ctx, id, await requireOwner(ctx));
    if (!page) throw new ConvexError("Page not found.");
    const events = await ctx.db
      .query("pageEvents")
      .withIndex("by_page", (q) => q.eq("pageId", id))
      .take(4000);
    for (const e of events) await ctx.db.delete(e._id);
    await ctx.db.delete(id);
    return null;
  },
});

/** Views, unique visitors and CTA clicks per variant, and why visitors landed where they did. */
export const stats = query({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const page = await ownedPage(ctx, id, await currentOwner(ctx));
    if (!page) return null;
    const events = await ctx.db
      .query("pageEvents")
      .withIndex("by_page", (q) => q.eq("pageId", id))
      .order("desc")
      .take(10_000);
    const per = new Map<string, { views: number; visitors: Set<string>; clickers: Set<string>; ctas: number; quiz: number }>();
    const sources: Record<string, number> = {};
    const cities: Record<string, number> = {};
    for (const e of events) {
      const s =
        per.get(e.segmentId) ??
        { views: 0, visitors: new Set<string>(), clickers: new Set<string>(), ctas: 0, quiz: 0 };
      per.set(e.segmentId, s);
      if (e.type === "view") {
        s.views++;
        s.visitors.add(e.visitorId);
        sources[e.source] = (sources[e.source] ?? 0) + 1;
        if (e.city) cities[e.city] = (cities[e.city] ?? 0) + 1;
      } else if (e.type === "cta") {
        s.ctas++;
        s.clickers.add(e.visitorId);
      } else if (e.type === "quiz") s.quiz++;
    }
    const segments = page.segments.map((seg) => {
      const s = per.get(seg.id);
      const visitors = s?.visitors.size ?? 0;
      const converted = s?.clickers.size ?? 0;
      return {
        id: seg.id,
        name: seg.name,
        views: s?.views ?? 0,
        visitors,
        ctas: s?.ctas ?? 0,
        quiz: s?.quiz ?? 0,
        conversion: visitors ? converted / visitors : 0,
      };
    });
    return { total: events.length, segments, sources, cities };
  },
});

// --- Visitors (public) ------------------------------------------------------

async function bySlug(ctx: QueryCtx, slug: string) {
  return ctx.db
    .query("pages")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

/** How much two tag lists agree, by tag word (see catalog.tagKey). */
function overlap(
  a: { id: string; name: string; affinity: number }[],
  b: { id: string; name: string; affinity: number }[],
): { score: number; matched: string[] } {
  const bw = new Map(b.map((t) => [tagKey(t.id), t]));
  let score = 0;
  const matched: string[] = [];
  for (const t of a) {
    const hit = bw.get(tagKey(t.id));
    if (!hit) continue;
    score += Math.max(0.05, t.affinity) * Math.max(0.05, hit.affinity);
    matched.push(t.name);
  }
  return { score, matched };
}

function utmMatch(segment: Segment, utm: string[]): string | null {
  const words = utm.map((u) => u.toLowerCase().replace(/[_+-]+/g, " "));
  for (const k of segment.utmKeywords) {
    if (k && words.some((w) => w.includes(k))) return k;
  }
  return null;
}

const quizAnchor = (s: Segment) => s.anchors.find((a) => a.image) ?? s.anchors[0];

export const resolve = query({
  args: {
    slug: v.string(),
    /** ?seg= on a shared or preview link. */
    seg: v.optional(v.string()),
    /** What the visitor picked in the on-page quiz (a cookie). */
    choice: v.optional(v.string()),
    /** A Slice taste profile id from the concierge (?p=). */
    profileId: v.optional(v.string()),
    /** utm_campaign, utm_term, utm_content, utm_source values. */
    utm: v.optional(v.array(v.string())),
    city: v.optional(v.string()),
  },
  handler: async (ctx, { slug, seg, choice, profileId, utm, city }) => {
    const page = await bySlug(ctx, slug);
    // Segments stay in place while a regeneration runs, so a live page keeps serving.
    if (!page || !page.published || !page.segments.length) return null;
    const brand = await ctx.db.get(page.brandId);
    if (!brand?.kit) return null;

    const fallback = page.segments.find((s) => s.isDefault) ?? page.segments[0];
    const taste = page.segments.filter((s) => !s.isDefault);
    const byId = (id: string | undefined) => (id ? page.segments.find((s) => s.id === id) : undefined);
    let segment: Segment = fallback;
    let reason: { source: string; detail: string; matched?: string[] } = {
      source: "default",
      detail: "Everyone",
    };
    let needsCity = false;

    const picked = byId(seg) ?? byId(choice);
    if (picked) {
      segment = picked;
      reason = byId(seg)
        ? { source: "link", detail: "Shared link" }
        : { source: "quiz", detail: `You picked ${quizAnchor(picked)?.name ?? picked.name}` };
    } else {
      let decided = false;
      const pid = profileId ? ctx.db.normalizeId("tasteProfiles", profileId) : null;
      const profile = pid ? await ctx.db.get(pid) : null;
      if (profile?.tags.length && taste.length) {
        const best = taste
          .map((s) => ({ s, ...overlap(s.tags, profile.tags) }))
          .sort((a, b) => b.score - a.score)[0];
        if (best && best.score > 0) {
          segment = best.s;
          reason = {
            source: "profile",
            detail: "Your Slice taste profile",
            matched: best.matched.slice(0, 5),
          };
          decided = true;
        }
      }
      if (!decided && utm?.length) {
        for (const s of taste) {
          const k = utmMatch(s, utm);
          if (k) {
            segment = s;
            reason = { source: "utm", detail: `Campaign “${k}”` };
            decided = true;
            break;
          }
        }
      }
      if (!decided && city) {
        const hit = page.cityMap.find((c) => c.city.toLowerCase() === city.toLowerCase());
        const s = byId(hit?.segmentId);
        if (hit && s) {
          segment = s;
          reason = {
            source: s.isDefault ? "default" : "geo",
            detail: s.isDefault ? "Everyone" : `What ${hit.city} is into`,
            matched: hit.matched.slice(0, 5),
          };
        } else if (!hit) needsCity = true;
      }
    }

    return {
      page: {
        id: page._id,
        slug: page.slug,
        name: page.name,
        goal: page.goal,
        ctaUrl: page.brief.ctaUrl,
      },
      brand: { domain: brand.domain, kit: brand.kit },
      segment,
      reason,
      needsCity,
      quiz: taste
        .map((s) => {
          const a = quizAnchor(s);
          return a
            ? { segmentId: s.id, name: s.name, anchor: { name: a.name, image: a.image, type: a.type } }
            : null;
        })
        .filter((q) => q !== null),
    };
  },
});

/** Page metadata for <head>, without picking a variant. */
export const meta = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await bySlug(ctx, slug);
    if (!page || !page.published) return null;
    const fallback = page.segments.find((s) => s.isDefault) ?? page.segments[0];
    const brand = await ctx.db.get(page.brandId);
    return fallback
      ? { title: fallback.seo.title, description: fallback.seo.description, icon: brand?.kit?.icon }
      : null;
  },
});

export const track = mutation({
  args: {
    pageId: v.id("pages"),
    segmentId: v.string(),
    type: v.string(),
    visitorId: v.string(),
    source: v.string(),
    city: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { pageId, segmentId, type, visitorId, source, city }) => {
    const page = await ctx.db.get(pageId);
    if (!page?.published) return null;
    if (!page.segments.some((s) => s.id === segmentId)) return null;
    if (!(EVENT_TYPES as readonly string[]).includes(type)) return null;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(visitorId)) return null;
    await ctx.db.insert("pageEvents", {
      pageId,
      segmentId,
      type,
      visitorId,
      source: clip(source, 20),
      city: city ? clip(city, 60) : undefined,
      at: Date.now(),
    });
    return null;
  },
});

// --- Agent side (http.ts, behind QLOO_PROXY_SECRET) -------------------------

export const agentLoad = internalQuery({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    return { page, brand: await ctx.db.get(page.brandId) };
  },
});

export const agentPatch = internalMutation({
  args: {
    id: v.id("pages"),
    status: v.optional(v.union(v.literal("generating"), v.literal("ready"), v.literal("failed"))),
    progress: v.optional(v.string()),
    error: v.optional(v.string()),
    segments: v.optional(v.array(pageSegmentValidator)),
    trace: v.optional(v.array(spanValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, segments, progress, error, ...rest }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    const clean = segments?.map((s) => sanitizeSegment(s, page.brief.ctaUrl));
    if (clean && !clean.some((s) => s.isDefault) && clean[0]) clean[0].isDefault = true;
    await ctx.db.patch(id, {
      ...rest,
      ...(progress !== undefined ? { progress: clip(progress, 120) } : {}),
      ...(error !== undefined ? { error: clip(error, 300) } : {}),
      // New segments make the old city routing meaningless.
      ...(clean ? { segments: clean, cityMap: [] } : {}),
      updatedAt: Date.now(),
    });
    if (clean && rest.status === "ready") {
      await ctx.scheduler.runAfter(0, internal.pageRouting.mapCities, { id });
    }
    return null;
  },
});

export const routingInfo = internalQuery({
  args: { id: v.optional(v.id("pages")), slug: v.optional(v.string()) },
  handler: async (ctx, { id, slug }) => {
    const page = id ? await ctx.db.get(id) : slug ? await bySlug(ctx, slug) : null;
    if (!page) return null;
    return {
      id: page._id,
      published: page.published,
      cityMap: page.cityMap,
      segments: page.segments.map((s) => ({
        id: s.id,
        isDefault: s.isDefault,
        tags: s.tags,
        anchors: s.anchors.map((a) => a.id),
      })),
    };
  },
});

export const saveCityFits = internalMutation({
  args: { id: v.id("pages"), fits: v.array(cityFitValidator) },
  returns: v.null(),
  handler: async (ctx, { id, fits }) => {
    const page = await ctx.db.get(id);
    if (!page) return null;
    const known = new Set(page.segments.map((s) => s.id));
    const merged = new Map(page.cityMap.map((c) => [c.city.toLowerCase(), c]));
    for (const f of fits) if (known.has(f.segmentId)) merged.set(f.city.toLowerCase(), f);
    // Bounded: visitors can add cities through cityFit.
    await ctx.db.patch(id, { cityMap: [...merged.values()].slice(-300) });
    return null;
  },
});
