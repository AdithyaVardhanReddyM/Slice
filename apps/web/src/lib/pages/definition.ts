// An audience's definition as the builder edits it: conditions combined with
// "and" (a place, age bands, gender, things they love, lifestyle segments,
// genres), plus the helpers that turn it into saved `sources`, a kind, a name
// and a plain sentence.

import { AGE_LABEL, profileOf, type Audience } from "./types";

export type ConditionKey = "location" | "age" | "gender" | "brand" | "listen" | "watch" | "read" | "go" | "play" | "lifestyle" | "genre";

/** A Qloo entity picked from suggestions. */
export type PickedEntity = { id: string; name: string; type: string; image?: string };
export type PickedSegment = { id: string; name: string };
export type PickedTag = { id: string; name: string; type?: string };

export interface Definition {
  /** Conditions in the order the merchant added them; a condition can be added and still empty. */
  rows: ConditionKey[];
  city: string;
  country: string;
  ages: string[];
  gender: "" | "female" | "male";
  entities: PickedEntity[];
  segments: PickedSegment[];
  tags: PickedTag[];
}

export const emptyDefinition = (rows: ConditionKey[] = []): Definition => ({ rows, city: "", country: "", ages: [], gender: "", entities: [], segments: [], tags: [] });

/** Which entity types each "things they love" condition holds. */
export const ENTITY_CONDITIONS: Partial<Record<ConditionKey, string[]>> = {
  brand: ["brand"],
  listen: ["artist", "podcast"],
  watch: ["movie", "tv_show"],
  read: ["book"],
  go: ["place", "destination"],
  play: ["videogame"],
};

const shortType = (type: string) => type.replace("urn:entity:", "");

/** The condition an entity belongs to ("urn:entity:tv_show" → "watch"). */
export function conditionOf(type: string): ConditionKey {
  const t = shortType(type);
  for (const [key, types] of Object.entries(ENTITY_CONDITIONS)) if (types?.includes(t)) return key as ConditionKey;
  return "brand";
}

export const entitiesIn = (def: Definition, key: ConditionKey) => def.entities.filter((e) => conditionOf(e.type) === key);

/* Ages ------------------------------------------------------------------------ */

export const AGE_BANDS = Object.keys(AGE_LABEL);
const AGE_BOUNDS: Record<string, [number, number]> = {
  "24_and_younger": [0, 24],
  "25_to_29": [25, 29],
  "30_to_34": [30, 34],
  "35_to_44": [35, 44],
  "45_to_54": [45, 54],
  "55_and_older": [55, Infinity],
};

/** Contiguous bands read as one range: under 25 + 25 to 29 → "under 30"; 45 to 54 + 55 and older → "45 and older". */
export function agesPhrase(ages: string[]): string {
  const sorted = AGE_BANDS.filter((a) => ages.includes(a));
  if (!sorted.length) return "";
  const runs: [number, number][] = [];
  for (const a of sorted) {
    const [lo, hi] = AGE_BOUNDS[a];
    const last = runs[runs.length - 1];
    if (last && last[1] + 1 === lo) last[1] = hi;
    else runs.push([lo, hi]);
  }
  const one = ([lo, hi]: [number, number]) => (lo === 0 && hi === Infinity ? "of any age" : lo === 0 ? `under ${hi + 1}` : hi === Infinity ? `${lo} and older` : `${lo} to ${hi}`);
  return runs.map(one).join(" or ");
}

/* Sentences and names --------------------------------------------------------- */

const list = (names: string[], joiner = "and") => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`);
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export type Phrase = { text: string; strong?: boolean };

/**
 * The definition as a sentence, with the values marked for emphasis:
 * "Women under 30 in Austin who love Nike, listen to Tyler, the Creator and
 * are in the sneakerheads segment."
 */
export function describe(def: Definition): Phrase[] {
  const out: Phrase[] = [];
  const t = (text: string) => out.push({ text });
  const s = (text: string) => out.push({ text, strong: true });
  const ages = def.ages.length === AGE_BANDS.length ? "" : agesPhrase(def.ages);
  s(def.gender === "female" ? "Women" : def.gender === "male" ? "Men" : "People");
  if (ages) {
    t(ages.startsWith("under") || ages.endsWith("older") ? " " : " aged ");
    s(ages);
  }
  if (def.city.trim()) {
    t(" in ");
    s(def.city.trim());
  }
  const clauses: Phrase[][] = [];
  const clause = (verb: string, names: string[]) => {
    if (names.length) clauses.push([{ text: `${verb} ` }, { text: list(names), strong: true }]);
  };
  for (const key of def.rows) {
    const names = entitiesIn(def, key).map((e) => e.name);
    if (key === "brand") clause("love", names);
    else if (key === "listen") clause("listen to", names);
    else if (key === "watch") clause("watch", names);
    else if (key === "read") clause("read", names);
    else if (key === "go") clause("go to", names);
    else if (key === "play") clause("play", names);
    else if (key === "genre") clause("like", def.tags.map((g) => lower(g.name)));
    else if (key === "lifestyle" && def.segments.length)
      clauses.push([{ text: "are in the " }, { text: list(def.segments.map((x) => lower(x.name))), strong: true }, { text: def.segments.length > 1 ? " segments" : " segment" }]);
  }
  clauses.forEach((c, i) => {
    t(i === 0 ? " who " : i === clauses.length - 1 ? " and " : ", ");
    out.push(...c);
  });
  t(".");
  return out;
}

export const describeText = (def: Definition) => describe(def).map((p) => p.text).join("");

/** A short default name: "Women under 30 in Austin, into Nike and Tyler, the Creator". */
export function autoName(def: Definition): string {
  const ages = def.ages.length === AGE_BANDS.length ? "" : agesPhrase(def.ages);
  const who = def.gender === "female" ? "Women" : def.gender === "male" ? "Men" : "";
  const city = def.city.trim();
  // "Women under 30", "Under 30s", "25 to 34", "Men".
  let head = who ? [who, ages].filter(Boolean).join(" ") : ages ? ages.charAt(0).toUpperCase() + ages.slice(1) + (/^under \d+$/.test(ages) ? "s" : "") : "";
  if (city) head = head ? `${head} in ${city}` : city;
  const picks = def.rows.flatMap((k) => (ENTITY_CONDITIONS[k] ? entitiesIn(def, k).map((e) => e.name) : k === "lifestyle" ? def.segments.map((x) => x.name) : k === "genre" ? def.tags.map((g) => g.name) : []));
  // Names can hold commas ("Tyler, the Creator"), so more than two picks read as "Nike +2".
  const tail = picks.length > 2 ? `${picks[0]} +${picks.length - 1}` : list(picks);
  if (head && tail) return `${head}, into ${tail}`;
  if (tail) return picks.length === 1 ? `${tail} fans` : `Into ${tail}`;
  return head;
}

/* Saving ---------------------------------------------------------------------- */

type Sources = Audience["sources"];

/** Conditions that hold a value; an added but empty row does not count. */
export function filled(def: Definition): ConditionKey[] {
  return def.rows.filter((k) => {
    if (k === "location") return !!def.city.trim();
    if (k === "age") return def.ages.length > 0;
    if (k === "gender") return !!def.gender;
    if (k === "lifestyle") return def.segments.length > 0;
    if (k === "genre") return def.tags.length > 0;
    return entitiesIn(def, k).length > 0;
  });
}

export function toSources(def: Definition): Sources {
  const keys = new Set(filled(def));
  const ages = keys.has("age") ? AGE_BANDS.filter((a) => def.ages.includes(a)) : [];
  const gender = keys.has("gender") ? def.gender : "";
  const entities = def.entities.filter((e) => keys.has(conditionOf(e.type)));
  return {
    ...(keys.has("location") ? { location: { city: def.city.trim(), ...(def.country.trim() ? { country: def.country.trim() } : {}) } } : {}),
    ...(ages.length || gender
      ? { demographics: { ...(ages.length === 1 ? { age: ages[0] } : ages.length > 1 ? { ages } : {}), ...(gender ? { gender } : {}) } }
      : {}),
    ...(entities.length
      ? { interests: entities.map((e) => e.name), interestEntities: entities.map((e) => ({ id: e.id, name: e.name, type: e.type, ...(e.image ? { image: e.image } : {}) })) }
      : {}),
    ...(keys.has("lifestyle") ? { segments: def.segments.map((x) => ({ id: x.id, name: x.name })) } : {}),
    ...(keys.has("genre") ? { tags: def.tags.map((g) => ({ id: g.id, name: g.name, ...(g.type ? { type: g.type } : {}) })) } : {}),
  };
}

/**
 * The kind to save as. A definition one of the simple compilers covers keeps
 * that kind (and its label on the card): a city with at most one age band and
 * a gender, an age and gender alone, or only things they love. Anything else
 * is "custom", read in one combined Qloo query.
 */
export function kindFor(def: Definition): string {
  const keys = new Set(filled(def));
  const has = (k: ConditionKey) => keys.has(k);
  const loves = [...keys].some((k) => !!ENTITY_CONDITIONS[k]);
  const demo = has("age") || has("gender");
  if (has("lifestyle") || has("genre")) return "custom";
  if (has("location")) return loves || def.ages.length > 1 ? "custom" : "location";
  if (loves) return demo ? "custom" : "interests";
  return def.ages.length > 1 ? "custom" : "demographic";
}

/** The builder's definition for a saved audience (its picks, or what the compiler resolved from typed names). */
export function fromAudience(a: Audience): Definition {
  const s = a.sources;
  const resolved = (profileOf(a)?.entities ?? []).filter((e) => e.source === "interest");
  const picked = s.interestEntities?.length ? s.interestEntities : resolved.map((e) => ({ id: e.id, name: e.name, type: e.type, image: e.image }));
  const ages = s.demographics?.ages?.length ? s.demographics.ages : s.demographics?.age ? [s.demographics.age] : [];
  const gender = s.demographics?.gender === "female" || s.demographics?.gender === "male" ? s.demographics.gender : "";
  const def: Definition = {
    rows: [],
    city: s.location?.city ?? "",
    country: s.location?.country ?? "",
    ages,
    gender,
    entities: picked,
    segments: s.segments ?? [],
    tags: s.tags ?? [],
  };
  const rows: ConditionKey[] = [];
  if (def.city) rows.push("location");
  if (ages.length) rows.push("age");
  if (gender) rows.push("gender");
  for (const e of picked) {
    const k = conditionOf(e.type);
    if (!rows.includes(k)) rows.push(k);
  }
  if (def.segments.length) rows.push("lifestyle");
  if (def.tags.length) rows.push("genre");
  def.rows = rows;
  return def;
}

/** Kinds the builder can edit; customer clusters, personal and "everyone" audiences come from elsewhere. */
export const EDITABLE_KINDS = new Set(["location", "demographic", "interests", "custom"]);
