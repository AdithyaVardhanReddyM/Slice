import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { servedStoreKey, storeByKey } from "./conciergeWidgets";

// What the Concierge console shows when its sample data is off: the signed-in
// account's own widget's conversations, the taste profiles behind them, what
// shoppers did with the picks (conversations.track) and how many sessions
// loaded slice.js (widgetInstall.ping). Rows are trimmed to what the console
// reads; the web app turns them into the same view models as the sample.

/** The most recent conversations the console reads. */
const TAKE = 200;
const DAY = 86_400_000;

async function myWidget(ctx: QueryCtx, storeKey: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("conciergeWidgets")
    .withIndex("by_owner_store", (q) =>
      q.eq("owner", identity.subject).eq("storeKey", storeKey),
    )
    .unique();
}

/**
 * Whether a conversation counts: the shopper opened the concierge, wrote in
 * it or did something with a pick. A returning shopper's concierge prepares
 * its opener in the background, so an opener alone doesn't prove anyone saw it.
 */
const engaged = (c: Doc<"conversations">) =>
  (c.events ?? []).length > 0 || c.messages.some((m) => m.role === "shopper");

async function recent(ctx: QueryCtx, key: string) {
  const rows = await ctx.db
    .query("conversations")
    .withIndex("by_store", (q) => q.eq("storeKey", key))
    .order("desc")
    .take(TAKE);
  return rows.filter(engaged);
}

type Span = NonNullable<Doc<"conversations">["messages"][number]["trace"]>[number];

/** What the concierge searched or ranked for in one turn, from its catalog spans. */
function askOf(trace: Span[] | undefined) {
  const ask: {
    query?: string;
    keywords?: string[];
    category?: string;
    subcategory?: string;
    budget?: number;
    /** Set when a catalog search came back empty. */
    noMatches?: boolean;
  } = {};
  for (const span of trace ?? []) {
    if (span.kind !== "catalog" || !span.params) continue;
    const p = span.params;
    if (p.query) ask.query = p.query;
    if (p.keywords)
      // The agent writes Python lists: "['hike', 'rain']".
      ask.keywords = [...p.keywords.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    if (p.category) ask.category = p.category;
    if (p.subcategory) ask.subcategory = p.subcategory;
    const budget = Number(p.priceMax);
    if (p.priceMax && Number.isFinite(budget)) ask.budget = budget;
    if (/^0 matches\b/.test(span.result)) ask.noMatches = true;
  }
  return Object.keys(ask).length ? ask : undefined;
}

type RawPick = {
  product?: {
    id?: string;
    slug?: string;
    name?: string;
    brand?: string | null;
    price?: number;
    image?: string | null;
    subcategory?: string;
    styles?: string[];
    materials?: string[];
    colors?: string[];
  };
  reason?: string;
  fit?: number | null;
  breakdown?: { intent?: number } | null;
  matched?: { styles?: string[]; materials?: string[]; keywords?: string[] };
};

function slimPick(raw: RawPick) {
  const p = raw.product ?? {};
  return {
    id: p.id ?? "",
    name: p.name ?? "",
    brand: p.brand ?? undefined,
    price: p.price ?? 0,
    image: p.image ?? null,
    subcategory: p.subcategory ?? "",
    styles: p.styles ?? [],
    materials: p.materials ?? [],
    colors: p.colors ?? [],
    reason: raw.reason ?? "",
    fit: typeof raw.fit === "number" ? raw.fit : null,
    /** How well it answered the turn's ask, 0 to 1 (absent on openers). */
    intent: typeof raw.breakdown?.intent === "number" ? raw.breakdown.intent : null,
    matched: {
      styles: raw.matched?.styles ?? [],
      materials: raw.matched?.materials ?? [],
      keywords: raw.matched?.keywords ?? [],
    },
  };
}

function slimConversation(c: Doc<"conversations">) {
  return {
    id: c.sessionId,
    profileId: c.profileId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messages: c.messages.map((m) => ({
      role: m.role,
      at: m.at,
      text: m.text,
      page: m.page ?? null,
      picks: ((m.picks as RawPick[] | null | undefined) ?? [])
        .map(slimPick)
        .filter((p) => p.id),
      ask: m.role === "concierge" ? askOf(m.trace) : undefined,
    })),
    events: c.events ?? [],
  };
}

function slimProfile(p: Doc<"tasteProfiles">) {
  // The brief is the agent's reading in the store's styles; before it's
  // written, the deterministic hints stand in.
  const styles = p.brief?.styles.length
    ? p.brief.styles.map((s) => ({ id: s.id, weight: s.weight }))
    : p.hints.styles.map((s) => ({ id: s.id, weight: s.score }));
  return {
    id: p._id,
    city: p.city ?? null,
    summary: p.brief?.summary ?? null,
    styles,
    palette: p.brief?.palette ?? [],
    materials: p.brief?.materials ?? [],
    answers: p.answers.map((a) => ({ question: a.question, choice: a.choice })),
    entities: p.entities.map((e) => ({
      name: e.name,
      type: e.type,
      source: e.source,
    })),
    createdAt: p.createdAt,
  };
}

async function profilesFor(ctx: QueryCtx, ids: (Id<"tasteProfiles"> | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is Id<"tasteProfiles"> => !!id))];
  const docs = await Promise.all(unique.map((id) => ctx.db.get(id)));
  return docs.filter((d): d is Doc<"tasteProfiles"> => !!d).map(slimProfile);
}

/**
 * Everything the console's Overview, Conversations and Taste insights read
 * for the account's widget on `storeKey`. Null when signed out or the account
 * has no widget for that store yet. `catalog` adds the products the widget
 * picks from, which only Taste insights needs.
 */
export const data = query({
  args: { storeKey: v.string(), catalog: v.optional(v.boolean()) },
  handler: async (ctx, { storeKey, catalog }) => {
    const widget = await myWidget(ctx, storeKey);
    if (!widget) return null;
    const rows = await recent(ctx, widget.key);
    const since = new Date(Date.now() - 61 * DAY).toISOString().slice(0, 10);
    const visits = await ctx.db
      .query("widgetVisits")
      .withIndex("by_widget_day", (q) =>
        q.eq("widgetKey", widget.key).gte("day", since),
      )
      .collect();
    const served = servedStoreKey(widget);
    const store = await storeByKey(ctx, served);
    const products = catalog
      ? await ctx.db
          .query("products")
          .withIndex("by_store", (q) => q.eq("storeKey", served))
          .collect()
      : [];
    return {
      widgetKey: widget.key,
      styles: (store?.styles ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
      })),
      conversations: rows.map(slimConversation),
      profiles: await profilesFor(ctx, rows.map((r) => r.profileId)),
      visits: visits.map((d) => ({ day: d.day, visitors: d.visitors })),
      catalog: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        subcategory: p.subcategory,
        image: p.images[0] ?? null,
        styles: p.attributes.style,
        materials: p.attributes.material,
        colors: p.attributes.colors,
      })),
    };
  },
});

/** One conversation of the account's widget, with its shopper's profile. */
export const conversation = query({
  args: { storeKey: v.string(), id: v.string() },
  handler: async (ctx, { storeKey, id }) => {
    const widget = await myWidget(ctx, storeKey);
    if (!widget) return null;
    const row = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", id))
      .unique();
    if (!row || row.storeKey !== widget.key || !engaged(row)) return null;
    // Whether this shopper had chatted before: their profile on an earlier conversation.
    const earlier = row.profileId
      ? await ctx.db
          .query("conversations")
          .withIndex("by_store", (q) => q.eq("storeKey", widget.key))
          .order("asc")
          .filter((q) =>
            q.and(
              q.eq(q.field("profileId"), row.profileId),
              q.lt(q.field("createdAt"), row.createdAt),
            ),
          )
          .first()
      : null;
    const store = await storeByKey(ctx, servedStoreKey(widget));
    return {
      styles: (store?.styles ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
      })),
      conversation: slimConversation(row),
      profile: (await profilesFor(ctx, [row.profileId]))[0] ?? null,
      returning: !!earlier,
    };
  },
});

/** How many conversations the account's widget has had (of the most recent the console reads). */
export const count = query({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const widget = await myWidget(ctx, storeKey);
    return widget ? (await recent(ctx, widget.key)).length : 0;
  },
});

/**
 * Changes whenever the widget's console data does: a conversation saved or
 * touched, or a visitor counted. The console refreshes when it moves.
 */
export const version = query({
  args: { storeKey: v.string() },
  handler: async (ctx, { storeKey }) => {
    const widget = await myWidget(ctx, storeKey);
    if (!widget) return null;
    const latest = await ctx.db
      .query("conversations")
      .withIndex("by_store_updated", (q) => q.eq("storeKey", widget.key))
      .order("desc")
      .first();
    const day = new Date(Date.now()).toISOString().slice(0, 10);
    const visits = await ctx.db
      .query("widgetVisits")
      .withIndex("by_widget_day", (q) => q.eq("widgetKey", widget.key).eq("day", day))
      .unique();
    return `${latest?.updatedAt ?? 0}:${visits?.visitors ?? 0}`;
  },
});
