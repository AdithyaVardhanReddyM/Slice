import type { Product } from "@slice/demo-catalogs";
import { hash, slug } from "@/lib/mock/random";

// How Slice "reads" a product: readiness, mock 7-day stats, inferred
// attributes and the Qloo tags its style tends to match. Server-only by
// convention: the page builds plain rows from it and ships only those.

export type ReadinessTier = "strong" | "good" | "thin";

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface Readiness {
  score: number;
  tier: ReadinessTier;
  checks: ReadinessCheck[];
}

const APPAREL = new Set([
  "Tops",
  "Bottoms",
  "Outerwear",
  "Dresses & one-pieces",
]);

const words = (s: string) => s.trim().split(/\s+/).length;

/**
 * Deterministic 0–100 score: copy depth plus attribute completeness. Weighted
 * toward the fields the matcher actually scores (style, material, colors).
 */
export function readiness(p: Product): Readiness {
  const a = p.attributes;
  const w = words(p.description);
  const context = a.room ?? a.occasion ?? [];
  const contextLabel = a.room ? "Room" : "Occasion";

  const parts: {
    label: string;
    weight: number;
    credit: number;
    ok: boolean;
    detail: string;
  }[] = [
    {
      label: "Description depth",
      weight: 30,
      credit: Math.min(1, w / 60),
      ok: w >= 50,
      detail: `${w} words${w < 50 ? " · aim for 50+" : ""}`,
    },
    {
      label: "Style tagged",
      weight: 20,
      credit: a.style.length ? 1 : 0,
      ok: a.style.length > 0,
      detail: a.style.length ? `${a.style.length} of 2 max` : "Missing",
    },
    {
      label: "Material",
      weight: 15,
      credit: Math.min(1, a.material.length / 2),
      ok: a.material.length > 0,
      detail:
        a.material.length > 1
          ? `${a.material.length} listed`
          : "1 listed · 2+ scores better",
    },
    {
      label: "Colors",
      weight: 15,
      credit: Math.min(1, a.colors.length / 2),
      ok: a.colors.length >= 2,
      detail: `${a.colors.length} named${a.colors.length < 2 ? " · aim for 2+" : ""}`,
    },
    {
      label: "Use cases",
      weight: 10,
      credit: Math.min(1, a.useCase.length / 3),
      ok: a.useCase.length >= 3,
      detail: `${a.useCase.length} listed${a.useCase.length < 3 ? " · aim for 3+" : ""}`,
    },
    {
      label: contextLabel,
      weight: 10,
      credit: context.length ? 1 : 0,
      ok: context.length > 0,
      detail: context.length ? `${context.length} listed` : "Missing",
    },
  ];
  if (APPAREL.has(p.category)) {
    parts.push({
      label: "Fit",
      weight: 8,
      credit: a.fit ? 1 : 0,
      ok: Boolean(a.fit),
      detail: a.fit ?? "Missing",
    });
  }

  const total = parts.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(
    (100 * parts.reduce((s, x) => s + x.weight * x.credit, 0)) / total,
  );
  return {
    score,
    tier: score >= 95 ? "strong" : score >= 85 ? "good" : "thin",
    checks: parts.map(({ label, ok, detail }) => ({ label, ok, detail })),
  };
}

/** Attribute gaps the merchant can fix in their source file. */
export function attributeGaps(p: Product): string[] {
  const a = p.attributes;
  const gaps: string[] = [];
  if (a.colors.length < 2) gaps.push("Fewer than 2 colors");
  if (a.useCase.length < 3) gaps.push("Fewer than 3 use cases");
  if (!(a.room ?? a.occasion)?.length)
    gaps.push(a.room ? "No room" : "No occasion");
  if (APPAREL.has(p.category) && !a.fit) gaps.push("No fit");
  return gaps;
}

export interface RecStats {
  recommended: number;
  ctr: number;
  addToCart: number;
}

/**
 * Mock 7-day performance, stable per product and nudged by readiness and
 * merchandising flags. `scale` lets the caller match a store-level total.
 */
export function recStats(p: Product, score: number, scale = 1): RecStats {
  const h = hash(`${p.id}:recs`);
  const base = h % 100;
  if (base < 9) return { recommended: 0, ctr: 0, addToCart: 0 };
  const lift = (p.bestseller ? 16 : 0) + (p.new ? 5 : 0);
  const raw = ((base - 9) / 91) ** 1.7 * 64 * (score / 100) + lift + 1;
  const recommended = Math.max(1, Math.round(raw * scale));
  const clicks = Math.round(recommended * (0.18 + ((h >>> 8) % 24) / 100));
  const addToCart = Math.round(clicks * (0.2 + ((h >>> 16) % 22) / 100));
  return { recommended, ctr: clicks / recommended, addToCart };
}

/**
 * A few products have attributes Slice inferred from the description at
 * import. Keys are `field:value`.
 */
export function enrichedAttributes(p: Product): string[] {
  const h = hash(`${p.id}:enrich`);
  if (h % 5 !== 0) return [];
  const a = p.attributes;
  const out: string[] = [];
  const lastUse = a.useCase.at(-1);
  if (lastUse) out.push(`useCase:${lastUse}`);
  if ((h >>> 4) % 2 === 0 && a.colorFamily[0])
    out.push(`colorFamily:${a.colorFamily[0]}`);
  const ctx = a.room ?? a.occasion;
  const ctxField = a.room ? "room" : "occasion";
  if ((h >>> 6) % 3 === 0 && ctx?.at(-1)) out.push(`${ctxField}:${ctx.at(-1)}`);
  return out;
}

/** Plausible Qloo taste tags per catalog style. Mirrors the persona seeds. */
const STYLE_TAGS: Record<string, string[]> = {
  // Marlow
  japandi: [
    "minimalism",
    "craftsmanship",
    "contemplative",
    "wabi-sabi",
    "nature",
  ],
  "scandi-minimal": [
    "minimalism",
    "nordic",
    "understated",
    "hygge",
    "functional",
  ],
  "mid-century": [
    "modernist",
    "1960s",
    "symmetry",
    "nostalgic",
    "design classic",
  ],
  "retro-70s": [
    "1970s",
    "nostalgic",
    "warm color palette",
    "whimsical",
    "groovy",
  ],
  "art-deco-glam": [
    "opulent",
    "glamorous",
    "jazz age",
    "romantic",
    "geometric",
  ],
  "cottage-rustic": ["cozy", "pastoral", "autumnal", "folk", "small town"],
  coastal: ["beach", "breezy", "sun-washed", "relaxed", "mediterranean"],
  industrial: ["urban", "gritty", "loft", "craft", "culinary"],
  "boho-global": ["eclectic", "wanderlust", "folk", "handmade", "earthy"],
  "maximalist-eclectic": [
    "eclectic",
    "bold",
    "whimsical",
    "layered",
    "warm color palette",
  ],
  // Fold
  streetwear: ["streetwear", "hip hop", "urban", "bold", "skate"],
  "gorpcore-outdoor": [
    "outdoors",
    "utilitarian",
    "earthy",
    "adventure",
    "technical",
  ],
  "quiet-minimal": [
    "understated",
    "introspective",
    "scandinavian",
    "minimalism",
    "melancholic",
  ],
  "heritage-workwear": [
    "workwear",
    "utilitarian",
    "craftsmanship",
    "americana",
    "rugged",
  ],
  athletic: ["sporty", "energetic", "performance", "streetwear", "hip hop"],
  "preppy-ivy": ["preppy", "collegiate", "classic", "new england", "old money"],
  "romantic-boho": ["romantic", "whimsical", "folk", "dreamy", "vintage"],
  "y2k-retro": ["y2k", "neon", "nostalgic", "pop", "bold"],
  "dark-gothic": ["gothic", "dark", "moody", "punk", "melancholic"],
  "coastal-resort": [
    "beach",
    "resort",
    "sun-washed",
    "mediterranean",
    "breezy",
  ],
};

export interface MatchedTag {
  id: string;
  name: string;
  weight: number;
  via: string;
}

/** Tags a product tends to match, strongest first. Primary style weighs more. */
export function matchedTags(p: Product): MatchedTag[] {
  const best = new Map<string, MatchedTag>();
  p.attributes.style.forEach((style, si) => {
    (STYLE_TAGS[style] ?? []).forEach((name, ti) => {
      const jitter = (hash(`${p.id}:${name}`) % 7) / 100;
      const weight = Math.max(0.3, 0.9 - ti * 0.07 - si * 0.12 - jitter);
      const prev = best.get(name);
      if (!prev || prev.weight < weight) {
        best.set(name, {
          id: `urn:tag:keyword:qloo:${slug(name)}`,
          name,
          weight,
          via: style,
        });
      }
    });
  });
  return [...best.values()].sort((a, b) => b.weight - a.weight).slice(0, 6);
}
