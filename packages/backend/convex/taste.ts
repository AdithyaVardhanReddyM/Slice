import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import {
  AESTHETIC_TAG_TYPES,
  CULTURAL_TAG_TYPES,
  brandInsights,
  demographicInsights,
  entitiesForCity,
  entitiesFromSignals,
  placesInCity,
  searchEntity,
  storeBrandAffinities,
  tagInsights,
  type EntityKind,
  type EntityRef,
  type Span,
} from "./qlooApi";
import { briefValidator, entityRefValidator } from "./schema";
import { styleHints, termBag } from "./tasteHints";

// Taste capture. The questionnaire's options come from Qloo's view of the
// shopper's city, so every answer is already a Qloo entity; the profile is
// then Qloo's cross-domain read of those answers (aesthetic tags, brand
// affinities, demographics) translated into the store's style vocabulary.

/** Cities the questionnaire is tuned for; any other city still works via signal.location.query. */
export const CITIES = [
  "New York City",
  "Los Angeles",
  "London",
  "Paris",
  "Berlin",
  "Tokyo",
  "Toronto",
  "Sydney",
];

export interface Question {
  id: string;
  domain: string;
  prompt: string;
  hint: string;
  options: EntityRef[];
}

const dedupe = (refs: EntityRef[], take: number): EntityRef[] => {
  const seen = new Set<string>();
  const out: EntityRef[] = [];
  for (const r of refs) {
    const k = r.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= take) break;
  }
  return out;
};

/** The first four questions for a city. */
export const questionnaire = action({
  args: { city: v.string() },
  handler: async (ctx, { city }): Promise<{ city: string; questions: Question[]; trace: Span[] }> => {
    const trace: Span[] = [];
    const soft = (p: Promise<EntityRef[]>) =>
      p.catch((err) => {
        console.warn(`questionnaire(${city}): ${String(err)}`);
        return [] as EntityRef[];
      });
    const [artists, tv, movies, books, places] = await Promise.all([
      soft(entitiesForCity(ctx, trace, "artist", city, 6)),
      soft(entitiesForCity(ctx, trace, "tv_show", city, 4)),
      soft(entitiesForCity(ctx, trace, "movie", city, 4)),
      soft(entitiesForCity(ctx, trace, "book", city, 6)),
      soft(placesInCity(ctx, trace, city, 6)),
    ]);
    if (artists.length + tv.length + movies.length + books.length === 0) {
      throw new Error(`Qloo returned nothing for "${city}". Try a bigger city nearby.`);
    }
    const screen: EntityRef[] = [];
    for (let i = 0; i < Math.max(tv.length, movies.length); i++) {
      if (tv[i]) screen.push(tv[i]);
      if (movies[i]) screen.push(movies[i]);
    }
    const questions: Question[] = [
      {
        id: "music",
        domain: "Music",
        prompt: "What's on repeat lately?",
        hint: `Artists ${city} is listening to`,
        options: dedupe(artists, 6),
      },
      {
        id: "screen",
        domain: "Screen",
        prompt: "Something you'd happily rewatch",
        hint: `Films and shows big in ${city}`,
        options: dedupe(screen, 6),
      },
      {
        id: "books",
        domain: "Books",
        prompt: "A book that stayed with you",
        hint: `What ${city} is reading`,
        options: dedupe(books, 6),
      },
    ].filter((q) => q.options.length >= 3);
    if (places.length >= 3) {
      questions.push({
        id: "places",
        domain: "Going out",
        prompt: "A table you'd book on a Friday night",
        hint: `Places in ${city}`,
        options: dedupe(places, 6),
      });
    }
    return { city, questions, trace };
  },
});

/** The adaptive last question: trips Qloo suggests from the answers so far. */
export const followUp = action({
  args: { city: v.optional(v.string()), entityIds: v.array(v.string()) },
  handler: async (ctx, { city, entityIds }): Promise<{ question: Question | null; trace: Span[] }> => {
    const trace: Span[] = [];
    if (entityIds.length === 0) return { question: null, trace };
    // No city signal here: a trip is somewhere else, and the location signal
    // otherwise returns the towns next door.
    const trips = await entitiesFromSignals(ctx, trace, "destination", entityIds, undefined, 12).catch(
      () => [] as EntityRef[],
    );
    const options = dedupe(trips, 6);
    if (options.length < 3) return { question: null, trace };
    return {
      question: {
        id: "travel",
        domain: "Travel",
        prompt: "Where would you go next?",
        hint: "Picked from your answers so far",
        options,
      },
      trace,
    };
  },
});

/** Resolve a free-text answer ("Wes Anderson", "Aesop", "natural wine") to a Qloo entity. */
export const resolve = action({
  args: { query: v.string(), kind: v.optional(v.string()) },
  handler: async (ctx, { query, kind }): Promise<{ entity: EntityRef | null; trace: Span[] }> => {
    const trace: Span[] = [];
    const entity = await searchEntity(ctx, trace, query, kind as EntityKind | undefined, "free_text");
    return { entity, trace };
  },
});

const answerValidator = v.object({
  domain: v.string(),
  question: v.string(),
  choice: v.string(),
  entityId: v.optional(v.string()),
});

export const build = action({
  args: {
    storeKey: v.string(),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    answers: v.array(answerValidator),
    entities: v.array(entityRefValidator),
    /** Things the shopper typed that aren't entities yet. */
    freeText: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ profileId: Id<"tasteProfiles"> }> => {
    const trace: Span[] = [];
    const entities = [...args.entities];
    for (const text of args.freeText ?? []) {
      const found = await searchEntity(ctx, trace, text, undefined, "free_text");
      if (found && !entities.some((e) => e.id === found.id)) entities.push(found);
    }
    if (entities.length === 0) throw new Error("At least one taste signal is needed");

    const profile = await computeProfile(ctx, trace, args.storeKey, entities, args.city);
    const profileId = await ctx.runMutation(internal.taste.insert, {
      storeKey: args.storeKey,
      city: args.city,
      age: args.age,
      gender: args.gender,
      answers: args.answers,
      entities,
      ...profile,
      trace,
    });
    return { profileId };
  },
});

async function computeProfile(
  ctx: ActionCtx,
  trace: Span[],
  storeKey: string,
  entities: EntityRef[],
  city: string | undefined,
) {
  const store = await ctx.runQuery(api.catalog.store, { key: storeKey });
  const storeBrands = new Set((store?.brands ?? []).map((b) => b.name.toLowerCase()));
  const ids = entities.map((e) => e.id);

  const [aesthetic, cultural, openBrands, demographics, carried] = await Promise.all([
    tagInsights(ctx, trace, ids, AESTHETIC_TAG_TYPES, "Aesthetic tags Qloo associates with these signals", 30),
    tagInsights(ctx, trace, ids, CULTURAL_TAG_TYPES, "Cultural tags for these signals", 20),
    brandInsights(ctx, trace, ids, city, storeBrands, store?.vertical ?? "retail", 20),
    demographicInsights(ctx, trace, ids).catch(() => null),
    store?.brands?.length
      ? storeBrandAffinities(ctx, trace, ids, store.brands.map((b) => b.name)).catch(() => [])
      : Promise.resolve([]),
  ]);
  const tags = [...aesthetic, ...cultural];
  // Brands the store carries come first, with Qloo's affinity among them; the
  // open-ended list explains the taste even when the store has no such brands.
  const carriedIds = new Set(carried.map((b) => b.id));
  const brands = [
    ...carried.filter((b) => b.affinity >= 0.4).sort((a, b) => b.affinity - a.affinity),
    ...openBrands.filter((b) => !carriedIds.has(b.id)),
  ];
  const terms = termBag(tags, brands);
  const styles = styleHints(terms, store?.styles ?? []);
  const t0 = Date.now();
  trace.push({
    kind: "slice",
    name: "Match Qloo terms to the store's style vocabulary",
    ms: Date.now() - t0,
    result: styles.length
      ? styles.slice(0, 3).map((s) => `${s.id} ${Math.round(s.score * 100)}%`).join(", ")
      : "no direct matches; the concierge will interpret",
  });
  return { tags, brands, demographics: demographics ?? undefined, hints: { styles, terms } };
}

export const insert = internalMutation({
  args: {
    storeKey: v.string(),
    city: v.optional(v.string()),
    age: v.optional(v.string()),
    gender: v.optional(v.string()),
    answers: v.array(answerValidator),
    entities: v.array(entityRefValidator),
    tags: v.array(v.any()),
    brands: v.array(v.any()),
    demographics: v.optional(v.any()),
    hints: v.any(),
    trace: v.array(v.any()),
  },
  returns: v.id("tasteProfiles"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("tasteProfiles", { ...args, createdAt: now, updatedAt: now });
  },
});

export const get = query({
  args: { id: v.id("tasteProfiles") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getInternal = internalQuery({
  args: { id: v.id("tasteProfiles") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** The agent's translation of the profile into the store's language. */
export const saveBrief = internalMutation({
  args: { id: v.id("tasteProfiles"), brief: briefValidator },
  returns: v.null(),
  handler: async (ctx, { id, brief }) => {
    await ctx.db.patch(id, { brief, updatedAt: Date.now() });
    return null;
  },
});

/** A new signal from chat ("I'm really into Wes Anderson"): resolve it and rebuild the Qloo read. */
export const addSignal = action({
  args: { id: v.id("tasteProfiles"), query: v.string(), kind: v.optional(v.string()) },
  handler: async (
    ctx,
    { id, query, kind },
  ): Promise<{ entity: EntityRef | null; profile: Doc<"tasteProfiles"> | null; trace: Span[] }> => {
    const trace: Span[] = [];
    const profile = await ctx.runQuery(internal.taste.getInternal, { id });
    if (!profile) throw new Error("Unknown profile");
    const entity = await searchEntity(ctx, trace, query, kind as EntityKind | undefined, "chat");
    if (!entity) return { entity: null, profile, trace };
    if (profile.entities.some((e) => e.id === entity.id)) return { entity, profile, trace };

    const entities = [...profile.entities, entity];
    const computed = await computeProfile(ctx, trace, profile.storeKey, entities, profile.city);
    await ctx.runMutation(internal.taste.update, {
      id,
      entities,
      ...computed,
      trace: [...profile.trace, ...trace],
    });
    const updated = await ctx.runQuery(internal.taste.getInternal, { id });
    return { entity, profile: updated, trace };
  },
});

export const update = internalMutation({
  args: {
    id: v.id("tasteProfiles"),
    entities: v.array(entityRefValidator),
    tags: v.array(v.any()),
    brands: v.array(v.any()),
    demographics: v.optional(v.any()),
    hints: v.any(),
    trace: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...rest }) => {
    // A new signal changes the Qloo read, so the agent's brief must be redone.
    await ctx.db.patch(id, { ...rest, brief: undefined, updatedAt: Date.now() });
    return null;
  },
});
