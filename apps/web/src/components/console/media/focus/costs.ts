// Estimates for studio buttons, mirroring slice_media/models.py (list prices, USD).

import { EXTRAS, IMAGE_MODELS, VIDEO_MODELS, isTier, veoSeconds, type Clip, type Tier } from "@slice/backend/convex/mediaTypes";

/** "auto" lets the campaign tier pick by the shot's role; a model id picks that model. */
export type Quality = "auto" | "draft" | "fast" | "premium" | (string & {});

const [VEO, VEO_FAST, VEO_LITE] = VIDEO_MODELS;
const [IMAGE_PRO, IMAGE] = IMAGE_MODELS;
const TIER_VIDEO: Record<Tier, { hero: typeof VEO; broll: typeof VEO; hd: boolean }> = {
  draft: { hero: VEO_LITE, broll: VEO_LITE, hd: false },
  smart: { hero: VEO_FAST, broll: VEO_LITE, hd: false },
  premium: { hero: VEO, broll: VEO_FAST, hd: true },
};

const tierOf = (t: string | undefined): Tier => (isTier(t) ? t : "smart");
const heroRole = (role: string | undefined) => role === "hero" || role === "product" || role === "talent";

export function shotEstimate(tierName: string | undefined, clip: Pick<Clip, "kind" | "role" | "in" | "out">, quality: Quality, sound = false): { model: string; usd: number } {
  const tier = tierOf(tierName);
  if (clip.kind === "still") {
    const img = quality === "premium" || quality === IMAGE_PRO.id ? IMAGE_PRO : tier === "premium" && quality === "auto" ? IMAGE_PRO : IMAGE;
    return { model: img.label, usd: img.price };
  }
  const t = TIER_VIDEO[tier];
  const picked = VIDEO_MODELS.find((m) => m.id === quality);
  const m = picked ?? (quality === "draft" ? VEO_LITE : quality === "fast" ? VEO_FAST : quality === "premium" ? VEO : heroRole(clip.role) ? t.hero : t.broll);
  const seconds = veoSeconds(Math.max(0.5, clip.out - clip.in), m.hd || (t.hd && m === VEO));
  return { model: m.label, usd: Math.round((sound ? m.withSound : m.perSecond) * seconds * 1000) / 1000 };
}

export const omniEstimate = (clip: Pick<Clip, "out">) => Math.round(EXTRAS.edit.perSecond * Math.max(4, clip.out) * 1000) / 1000;

export const imageEstimate = (tierName: string | undefined, quality: Quality = "auto") => {
  const img = IMAGE_MODELS.find((m) => m.id === quality) ?? (quality === "premium" || (quality === "auto" && tierOf(tierName) === "premium") ? IMAGE_PRO : IMAGE);
  return { label: img.label, price: img.price };
};

/** Money on its way: estimates of jobs still running. */
export function committed(jobs: { status: string; estimate: number }[]) {
  return jobs.filter((j) => j.status === "queued" || j.status === "running").reduce((s, j) => s + j.estimate, 0);
}
