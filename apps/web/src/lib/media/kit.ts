// Turning a Pages or Email brand into a Media kit, products and audiences,
// and estimating what a campaign will cost before it is made. Mirrors the
// agent's pricing (slice_media/models.py) through TIERS in mediaTypes.

import type { BrandItem, BrandKit } from "@slice/backend/convex/pagesTypes";
import type { EmailKit } from "@slice/backend/convex/emailTypes";
import { DEFAULT_KIT, EXTRAS, FORMATS, TIERS, type FormatPreset, type MediaAudience, type MediaKit, type MediaProduct, type PeopleMode, type Tier } from "@slice/backend/convex/mediaTypes";

export function kitFromPages(name: string, url: string | undefined, kit: BrandKit | undefined): MediaKit {
  if (!kit) return { ...DEFAULT_KIT(name), url };
  return {
    name,
    url,
    logo: kit.logo,
    wordmark: kit.wordmark,
    colors: kit.colors,
    fonts: kit.fonts,
    voice: kit.voice,
    imagery: kit.imagery,
    uppercaseLabels: kit.uppercaseLabels,
    buttonStyle: kit.buttonStyle,
  };
}

export function kitFromEmail(name: string, url: string | undefined, kit: EmailKit | undefined): MediaKit {
  if (!kit) return { ...DEFAULT_KIT(name), url };
  const font = (f: EmailKit["fonts"]["heading"]) => ({ family: f.family, source: f.google ? ("google" as const) : ("system" as const), weights: f.weights, fallback: f.fallback });
  return {
    name,
    url,
    logo: kit.logo,
    wordmark: kit.wordmark,
    colors: kit.colors,
    fonts: { heading: font(kit.fonts.heading), body: font(kit.fonts.body) },
    voice: kit.voice,
    uppercaseLabels: kit.uppercaseLabels,
    buttonStyle: kit.buttonStyle,
  };
}

export const productFrom = (i: Pick<BrandItem, "id" | "name" | "description" | "price" | "image" | "url">): MediaProduct => ({
  id: i.id,
  name: i.name,
  ...(i.image ? { image: i.image } : {}),
  ...(i.price ? { price: i.price } : {}),
  ...(i.url ? { url: i.url } : {}),
  ...(i.description ? { description: i.description.slice(0, 300) } : {}),
});

/** A short id the agent can say: "a-austin-runners". */
export function audienceId(name: string, taken: Set<string>): string {
  const base = `a-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "audience"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export const EVERYONE: MediaAudience = { id: "all", name: "Everyone", kind: "everyone" };

/* Estimates ------------------------------------------------------------------ */

export interface Estimate {
  low: number;
  high: number;
  lines: { label: string; amount: number }[];
}

/**
 * What making the campaign once costs. Posters: about one generated image per
 * audience (photos the brand has are free). Videos: per audience and video
 * aspect (9:16, 16:9), a shot plan of ~30% hero and ~25% product on the hero
 * model, ~25% b-roll on the cheaper one and ~20% stills, plus music and voice.
 */
export function estimate({ tier, audiences, formats, kind, duration = 15, music = true, voiceover = false, people = "auto" }: { tier: Tier; audiences: number; formats: FormatPreset[]; kind: "poster" | "video" | "both"; duration?: number; music?: boolean; voiceover?: boolean; people?: PeopleMode }): Estimate {
  const t = TIERS[tier];
  const n = Math.max(1, audiences);
  const lines: Estimate["lines"] = [];
  if (kind !== "video") lines.push({ label: `Posters: ~1 image per audience on ${t.image.label}`, amount: n * t.image.price });
  if (kind !== "poster") {
    const aspects = new Set(formats.filter((f) => FORMATS[f].video).map((f) => FORMATS[f].videoAspect));
    const cuts = n * Math.max(1, aspects.size);
    const hero = duration * 0.55 * t.video.hero.perSecond;
    const broll = duration * 0.25 * t.video.broll.perSecond;
    const extras = t.image.price + (music ? EXTRAS.music.price : 0) + (voiceover ? EXTRAS.voice.price : 0);
    lines.push({ label: `Videos: ${cuts} cut${cuts === 1 ? "" : "s"} of ${duration}s (${t.video.hero.label} hero, ${t.video.broll.label} b-roll)`, amount: cuts * (hero + broll) });
    lines.push({ label: `Stills, music${voiceover ? ", voiceover" : ""}`, amount: cuts * extras });
    // A cast frame per audience keeps the same face across its talent shots.
    if (people === "using" || people === "talking") lines.push({ label: `People: a cast frame per audience${people === "talking" ? ", spoken shots with sound" : ""}`, amount: n * t.image.price });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  // Shots shared across audiences and stills bring it down; retries and edits push it up.
  return { low: total * 0.6, high: total * 1.25, lines };
}

export const usd = (n: number) => (n < 1 ? `$${n.toFixed(2)}` : n < 100 ? `$${n.toFixed(2).replace(/\.00$/, "")}` : `$${Math.round(n)}`);
