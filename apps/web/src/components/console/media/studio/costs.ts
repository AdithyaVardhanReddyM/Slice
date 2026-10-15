// Estimates for studio buttons, mirroring slice_media/models.py (list prices, USD).

import { EXTRAS, isTier, type Clip, type Tier } from "@slice/backend/convex/mediaTypes";

export type Quality = "auto" | "draft" | "fast" | "premium";

const VEO = {
  lite: { label: "Veo 3.1 Lite", silent: 0.03, voiced: 0.05 },
  fast: { label: "Veo 3.1 Fast", silent: 0.1, voiced: 0.15 },
  standard: { label: "Veo 3.1", silent: 0.2, voiced: 0.4 },
} as const;
const TIER_VIDEO: Record<Tier, { hero: keyof typeof VEO; broll: keyof typeof VEO; hd: boolean }> = {
  draft: { hero: "lite", broll: "lite", hd: false },
  smart: { hero: "fast", broll: "lite", hd: false },
  premium: { hero: "standard", broll: "fast", hd: true },
};
const IMAGE = {
  draft: { label: "Nano Banana Lite", price: 0.02 },
  smart: { label: "Nano Banana 2", price: 0.067 },
  premium: { label: "Nano Banana Pro", price: 0.134 },
} as const;

const tierOf = (t: string | undefined): Tier => (isTier(t) ? t : "smart");

/** Veo makes 4, 6 or 8 seconds; 1080p makes 8. */
const veoSeconds = (s: number, hd: boolean) => (hd ? 8 : s <= 4.5 ? 4 : s <= 6.5 ? 6 : 8);

export function shotEstimate(tierName: string | undefined, clip: Pick<Clip, "kind" | "role" | "in" | "out">, quality: Quality, sound = false): { model: string; usd: number } {
  const tier = tierOf(tierName);
  if (clip.kind === "still") {
    const key = quality === "draft" ? "draft" : quality === "premium" ? "premium" : tier;
    return { model: IMAGE[key].label, usd: IMAGE[key].price };
  }
  const t = TIER_VIDEO[tier];
  const model = quality === "draft" ? "lite" : quality === "fast" ? "fast" : quality === "premium" ? "standard" : clip.role === "hero" || clip.role === "product" || clip.role === "talent" ? t.hero : t.broll;
  const seconds = veoSeconds(Math.max(0.5, clip.out - clip.in), t.hd);
  const m = VEO[model];
  return { model: m.label, usd: Math.round((sound ? m.voiced : m.silent) * seconds * 1000) / 1000 };
}

export const omniEstimate = (clip: Pick<Clip, "out">) => Math.round(EXTRAS.edit.perSecond * Math.max(4, clip.out) * 1000) / 1000;

export const imageEstimate = (tierName: string | undefined, quality: Quality = "auto") => {
  const key = quality === "draft" ? "draft" : quality === "premium" ? "premium" : tierOf(tierName);
  return IMAGE[key];
};

/** Money on its way: estimates of jobs still running. */
export function committed(jobs: { status: string; estimate: number }[]) {
  return jobs.filter((j) => j.status === "queued" || j.status === "running").reduce((s, j) => s + j.estimate, 0);
}
