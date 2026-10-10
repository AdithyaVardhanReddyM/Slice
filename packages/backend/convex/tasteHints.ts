import type { TasteBrand, TasteTag } from "./qlooApi";

// Deterministic first pass from Qloo's output to the store's style vocabulary.
// The agent refines this into a "brief" with its own judgement; the hints make
// the profile useful before the agent runs and keep the ranking grounded in
// Qloo's terms rather than the shopper's own words.

export interface TermWeight {
  term: string;
  weight: number;
  /** Where it came from: "tag:personal_style", "brand:Patagonia". */
  from: string;
}

export interface StyleHint {
  id: string;
  score: number;
  from: string[];
}

const TAG_WEIGHTS: Record<string, number> = {
  "urn:tag:personal_style:qloo": 1,
  "urn:tag:lifestyle:qloo": 0.8,
  "urn:tag:style:qloo": 0.7,
  "urn:tag:emotional_tone:qloo": 0.5,
  "urn:tag:customer_identity:qloo": 0.5,
  "urn:tag:core_values:qloo": 0.4,
  "urn:tag:audience:qloo": 0.4,
  "urn:tag:keyword:media": 0.3,
};

/** Qloo's vocabulary → words merchants actually use in style names and copy. */
const SYNONYMS: Record<string, string[]> = {
  outdoorsy: ["outdoor", "trail", "hiking", "gorpcore", "fleece"],
  outdoor: ["trail", "gorpcore", "hiking"],
  rugged: ["workwear", "canvas", "heritage", "boots"],
  workwear: ["chore", "canvas", "selvedge", "heritage"],
  heritage: ["workwear", "selvedge", "classic"],
  preppy: ["ivy", "oxford", "loafers", "campus"],
  classic: ["ivy", "heritage", "timeless"],
  athletic: ["running", "track", "sport", "jersey"],
  sporty: ["athletic", "running", "track"],
  streetwear: ["oversized", "graphic", "sneakers"],
  urban: ["streetwear", "city"],
  edgy: ["dark", "gothic", "leather", "black"],
  gothic: ["dark", "black", "leather"],
  alternative: ["dark", "gothic", "streetwear"],
  bohemian: ["boho", "crochet", "rattan", "woven"],
  boho: ["bohemian", "crochet", "rattan"],
  romantic: ["floral", "puff", "drape", "boho"],
  feminine: ["romantic", "floral", "dress"],
  vintage: ["retro", "y2k", "mid-century", "heritage"],
  retro: ["vintage", "y2k", "70s"],
  nostalgic: ["retro", "vintage", "y2k"],
  minimalist: ["minimal", "quiet", "clean", "scandi", "japandi"],
  minimal: ["quiet", "scandi", "japandi", "clean"],
  scandinavian: ["scandi", "nordic", "minimal", "oak"],
  nordic: ["scandi", "scandinavian", "minimal"],
  japanese: ["japandi", "indigo", "stoneware"],
  zen: ["japandi", "calm", "minimal"],
  calm: ["quiet", "japandi", "scandi"],
  natural: ["linen", "oak", "stoneware", "wool", "earth"],
  earthy: ["earth", "terracotta", "clay", "rustic"],
  rustic: ["cottage", "farmhouse", "pine", "stoneware"],
  cozy: ["cottage", "wool", "knit", "throw"],
  coastal: ["linen", "resort", "stripes", "sand"],
  resort: ["coastal", "linen", "espadrilles"],
  beach: ["coastal", "resort", "linen"],
  mediterranean: ["coastal", "resort", "terracotta", "linen"],
  tropical: ["resort", "coastal", "raffia"],
  glamorous: ["glam", "deco", "velvet", "brass", "gold"],
  luxurious: ["glam", "velvet", "brass", "marble", "premium"],
  luxury: ["premium", "glam", "velvet"],
  elegant: ["deco", "glam", "tailoring"],
  sophisticated: ["tailoring", "quiet", "deco"],
  bold: ["maximalist", "saturated", "graphic", "eclectic"],
  eclectic: ["maximalist", "bold", "mixed"],
  colorful: ["maximalist", "bold", "saturated"],
  playful: ["maximalist", "y2k", "graphic", "bold"],
  industrial: ["steel", "concrete", "loft", "reclaimed"],
  modern: ["mid-century", "minimal", "clean"],
  midcentury: ["mid-century", "walnut", "tapered"],
  artisanal: ["handmade", "craft", "stoneware", "hand-dyed"],
  craft: ["handmade", "artisanal", "stoneware"],
  sustainable: ["organic", "recycled", "repair"],
  "eco-friendly": ["organic", "recycled"],
  technical: ["gorpcore", "shell", "ripstop", "athletic"],
  functional: ["technical", "gorpcore", "utility"],
  utilitarian: ["workwear", "utility", "cargo", "canvas"],
  casual: ["everyday", "relaxed"],
  "smart-casual": ["tailoring", "quiet", "ivy"],
  tailored: ["tailoring", "quiet", "pleated"],
  dark: ["gothic", "black"],
  moody: ["dark", "gothic", "melancholic"],
  melancholic: ["dark", "quiet", "introspective"],
  introspective: ["quiet", "minimal"],
  intimate: ["quiet", "soft", "minimal"],
  indie: ["quiet", "vintage", "artistic"],
  artistic: ["eclectic", "craft", "gallery"],
  energetic: ["athletic", "bold", "streetwear"],
  adventurous: ["outdoor", "trail", "gorpcore"],
  "home improvement": ["home", "workspace"],
  "home decor": ["home", "decor"],
  wellness: ["calm", "linen", "candle"],
};

export const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .flatMap((t) => t.split("-").concat(t.includes("-") ? [t] : []))
    .filter((t) => t.length > 2);

function expand(term: string): string[] {
  const base = tokenize(term);
  const extra = base.flatMap((t) => SYNONYMS[t] ?? []);
  const whole = SYNONYMS[term.toLowerCase()] ?? [];
  return [...new Set([...base, ...extra, ...whole])];
}

function stem(w: string): string {
  return w.length >= 6 ? w.slice(0, Math.max(5, w.length - 2)) : w;
}

function lexMatch(termWords: string[], lexicon: Set<string>): boolean {
  return termWords.some((w) => {
    if (w.length < 4) return lexicon.has(w);
    const s = stem(w);
    for (const l of lexicon) if (l.startsWith(s) || w.startsWith(stem(l))) return true;
    return false;
  });
}

/** Tags and brand descriptors as one weighted term bag. */
export function termBag(tags: TasteTag[], brands: TasteBrand[]): TermWeight[] {
  const bag = new Map<string, TermWeight>();
  const add = (term: string, weight: number, from: string) => {
    const key = term.trim().toLowerCase();
    if (!key || weight <= 0) return;
    const cur = bag.get(key);
    if (cur) {
      cur.weight = Math.min(1, cur.weight + weight * 0.5);
    } else {
      bag.set(key, { term: term.trim(), weight: Math.min(1, weight), from });
    }
  };
  for (const t of tags) {
    const w = TAG_WEIGHTS[t.type];
    if (!w) continue;
    add(t.name, t.affinity * w, `tag:${t.type.split(":")[2]}`);
  }
  const top = brands.slice(0, 12);
  for (const b of top) {
    for (const s of b.personalStyle) add(s, b.affinity * 0.9, `brand:${b.name}`);
    for (const s of b.lifestyle) add(s, b.affinity * 0.5, `brand:${b.name}`);
    for (const s of b.keywords) add(s, b.affinity * 0.4, `brand:${b.name}`);
  }
  return [...bag.values()].sort((a, b) => b.weight - a.weight).slice(0, 40);
}

export function styleHints(
  terms: TermWeight[],
  styles: { id: string; label: string; description: string }[],
): StyleHint[] {
  const scored = styles.map((s) => {
    const lexicon = new Set(tokenize(`${s.id} ${s.label} ${s.description}`));
    let score = 0;
    const from: { term: string; weight: number }[] = [];
    for (const t of terms) {
      if (lexMatch(expand(t.term), lexicon)) {
        score += t.weight;
        from.push({ term: t.term, weight: t.weight });
      }
    }
    return { id: s.id, score, from: from.sort((a, b) => b.weight - a.weight).slice(0, 4).map((f) => f.term) };
  });
  const max = Math.max(0, ...scored.map((s) => s.score));
  return scored
    .map((s) => ({ ...s, score: max > 0 ? Math.round((s.score / max) * 100) / 100 : 0 }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}
