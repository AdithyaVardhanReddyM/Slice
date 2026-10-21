import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { dayOf } from "./pagesUtil";

// The console home's Pages summary in one read: every brand the merchant
// owns with its counts and traffic, the latest pages with their screenshots,
// and audiences trimmed to what a taste cover draws.

const DAY = 86_400_000;

type Totals = {
  visitors: number;
  views: number;
  ctaClicks: number;
  formSubmits: number;
};
const empty = (): Totals => ({
  visitors: 0,
  views: 0,
  ctaClicks: 0,
  formSubmits: 0,
});
const add = (t: Totals, r: Totals) => {
  t.visitors += r.visitors;
  t.views += r.views;
  t.ctaClicks += r.ctaClicks;
  t.formSubmits += r.formSubmits;
};

type Thin = { id: string; name: string; image?: string };
const thin = (list: unknown, n = 6): Thin[] =>
  (Array.isArray(list) ? (list as Thin[]) : [])
    .slice(0, n)
    .map((e) => ({ id: e.id, name: e.name, image: e.image }));

/** The parts of an AudienceProfile a cover uses, a few of each kind. */
function coverProfile(profile: unknown) {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as {
    entities?: unknown;
    brands?: unknown;
    culture?: Record<string, unknown>;
  };
  return {
    entities: thin(p.entities),
    brands: thin(p.brands),
    culture: {
      artists: thin(p.culture?.artists),
      films: thin(p.culture?.films),
      places: thin(p.culture?.places),
      books: thin(p.culture?.books),
    },
  };
}

const firstImage = (c: ReturnType<typeof coverProfile>) =>
  c
    ? [
        c.culture.artists,
        c.culture.places,
        c.brands,
        c.culture.films,
        c.entities,
      ]
        .flat()
        .find((e) => e.image)?.image
    : undefined;

/** Newest pages first, taking one brand at a time so a single busy brand doesn't fill the row. */
function latestAcrossBrands<T extends { brandSlug: string; updatedAt: number }>(
  rows: T[],
  n: number,
): T[] {
  const byBrand = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => b.updatedAt - a.updatedAt)) {
    byBrand.set(r.brandSlug, [...(byBrand.get(r.brandSlug) ?? []), r]);
  }
  const queues = [...byBrand.values()];
  const out: T[] = [];
  for (let i = 0; out.length < n && queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (q[i] && out.length < n) out.push(q[i]);
  }
  return out;
}

export const summary = query({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const now = Date.now();
    const span = Math.min(Math.max(1, Math.round(days)), 30);
    const toDay = dayOf(now);
    const fromDay = dayOf(now - (span - 1) * DAY);
    const prevFromDay = dayOf(now - (2 * span - 1) * DAY);
    const dayList = Array.from({ length: span }, (_, i) =>
      dayOf(now - (span - 1 - i) * DAY),
    );
    const daily = new Map(
      dayList.map((day) => [day, { day, visitors: 0, formSubmits: 0 }]),
    );
    const total = empty();
    const prev = empty();

    const brands = (
      await ctx.db
        .query("pagesBrands")
        .withIndex("by_owner", (q) => q.eq("owner", identity.subject))
        .order("desc")
        .collect()
    ).filter((b) => !b.mediaBrandId);

    const brandRows = [];
    const pageRows = [];
    const audiencesByBrand: {
      brand: Doc<"pagesBrands">;
      rows: Doc<"pagesAudiences">[];
    }[] = [];

    for (const brand of brands) {
      const pages = await ctx.db
        .query("pages")
        .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
        .collect();
      const audiences = await ctx.db
        .query("pagesAudiences")
        .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
        .order("desc")
        .collect();
      const brandCur = empty();
      const brandPrev = empty();
      for (const page of pages) {
        const rows = await ctx.db
          .query("pagesStats")
          .withIndex("by_page_day", (q) =>
            q.eq("pageId", page._id).gte("day", prevFromDay).lte("day", toDay),
          )
          .collect();
        const pageCur = empty();
        for (const r of rows) {
          if (r.day < fromDay) {
            add(brandPrev, r);
            continue;
          }
          add(pageCur, r);
          const d = daily.get(r.day);
          if (d) {
            d.visitors += r.visitors;
            d.formSubmits += r.formSubmits;
          }
        }
        add(brandCur, pageCur);
        const byDefault = page.defaultVariantId
          ? await ctx.db.get(page.defaultVariantId)
          : null;
        const variants = byDefault
          ? []
          : await ctx.db
              .query("pagesVariants")
              .withIndex("by_page", (q) => q.eq("pageId", page._id))
              .collect();
        const version =
          byDefault ??
          variants.find((x) => x.screenshot) ??
          variants[0] ??
          null;
        const audience = page.audienceIds[0]
          ? audiences.find((a) => a._id === page.audienceIds[0])
          : undefined;
        pageRows.push({
          _id: page._id,
          brandSlug: brand.slug,
          brandName: brand.name,
          title: page.title,
          slug: page.slug,
          status: page.status,
          updatedAt: Math.max(page.updatedAt, version?.updatedAt ?? 0),
          screenshot: version?.screenshot ?? null,
          building: version ? version.status !== "ready" : true,
          audience: audience
            ? {
                name: audience.name,
                kind: audience.kind,
                image: firstImage(coverProfile(audience.profile)) ?? null,
              }
            : null,
          ...pageCur,
        });
      }
      add(total, brandCur);
      add(prev, brandPrev);
      audiencesByBrand.push({ brand, rows: audiences });

      const kit = (brand.kit ?? null) as {
        colors?: Record<string, string>;
        logo?: { src?: string; onDark?: boolean; alt?: string };
        icon?: string;
        wordmark?: string;
      } | null;
      brandRows.push({
        _id: brand._id,
        slug: brand.slug,
        name: brand.name,
        url: brand.url,
        status: brand.status,
        demo: !!brand.demo,
        kit: kit
          ? {
              colors: kit.colors ?? {},
              logo: kit.logo ?? null,
              icon: kit.icon ?? null,
              wordmark: kit.wordmark ?? null,
            }
          : null,
        shot:
          brand.site?.fold ??
          brand.site?.screenshot ??
          brand.screenshot ??
          null,
        pages: pages.length,
        live: pages.filter((p) => p.status === "published").length,
        audiences: audiences.filter((a) => a.kind !== "lead").length,
        ...brandCur,
        prev: brandPrev,
      });
    }

    // Covers alternate between brands so one brand never fills the strip. People
    // kept one by one inside a customer list show under the list, not here.
    const queues = audiencesByBrand.map(({ brand, rows }) => {
      const lists = new Set(
        rows
          .filter((a) => a.kind === "people")
          .map((a) => a.sources?.uploadId)
          .filter(Boolean),
      );
      return rows
        .filter(
          (a) =>
            a.profile &&
            !(
              a.kind === "lead" &&
              a.sources?.uploadId &&
              lists.has(a.sources.uploadId)
            ),
        )
        .map((a) => ({
          _id: a._id,
          brandSlug: brand.slug,
          brandName: brand.name,
          name: a.name,
          kind: a.kind,
          size: a.size,
          profile: coverProfile(a.profile),
        }));
    });
    const audiences = [];
    for (
      let i = 0;
      audiences.length < 8 && queues.some((q) => i < q.length);
      i++
    ) {
      for (const q of queues)
        if (q[i] && audiences.length < 8) audiences.push(q[i]);
    }

    return {
      days: span,
      brands: brandRows,
      pages: latestAcrossBrands(pageRows, 6),
      pageCount: pageRows.length,
      liveCount: pageRows.filter((p) => p.status === "published").length,
      audiences,
      total,
      prev,
      daily: [...daily.values()],
    };
  },
});
