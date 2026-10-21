"use client";

// What the prompt bar asks for: what to make, on which models, in what shape,
// how many, for which audience. The picks are a per-browser preference (they
// carry from campaign to campaign); the audience is per campaign and lives in
// the workspace. Estimates mirror slice_media/models.py at list prices.

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MUSIC_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  MUSIC_MODELS,
  VIDEO_MODELS,
  imageModel,
  musicModel,
  videoModel,
  type Aspect,
  type MediaOutput,
} from "@slice/backend/convex/mediaTypes";

export interface PromptPicks {
  output: MediaOutput;
  imageModel: string;
  videoModel: string;
  musicModel: string;
  aspect: Aspect;
  /** Images per prompt, 1 to 4. */
  count: number;
  /** Hold every generated image to the brand's guidelines (one retry when it fails). */
  check: boolean;
}

export const DEFAULT_PICKS: PromptPicks = {
  output: "auto",
  imageModel: DEFAULT_IMAGE_MODEL,
  videoModel: DEFAULT_VIDEO_MODEL,
  musicModel: DEFAULT_MUSIC_MODEL,
  aspect: "4:5",
  count: 1,
  check: true,
};

const KEY = "slice.media.picks";
const listeners = new Set<() => void>();
let memory: PromptPicks = DEFAULT_PICKS;
let cached: { raw: string | null; value: PromptPicks } | null = null;

function clean(raw: unknown): PromptPicks {
  const r = (raw ?? {}) as Partial<PromptPicks>;
  return {
    // Clips and music only come inside a video ad now.
    output: (r.output as string) === "clip" || (r.output as string) === "music" ? "video" : r.output && ["auto", "image", "poster", "video"].includes(r.output) ? r.output : DEFAULT_PICKS.output,
    imageModel: IMAGE_MODELS.some((m) => m.id === r.imageModel) ? r.imageModel! : DEFAULT_PICKS.imageModel,
    videoModel: VIDEO_MODELS.some((m) => m.id === r.videoModel) ? r.videoModel! : DEFAULT_PICKS.videoModel,
    musicModel: MUSIC_MODELS.some((m) => m.id === r.musicModel) ? r.musicModel! : DEFAULT_PICKS.musicModel,
    aspect: r.aspect && ["9:16", "4:5", "1:1", "16:9"].includes(r.aspect) ? r.aspect : DEFAULT_PICKS.aspect,
    count: typeof r.count === "number" ? Math.max(1, Math.min(4, Math.round(r.count))) : 1,
    check: r.check !== false,
  };
}

function read(): PromptPicks {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (cached && cached.raw === raw) return cached.value;
    const value = raw ? clean(JSON.parse(raw)) : memory;
    cached = { raw, value };
    return value;
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePromptPicks(): [PromptPicks, (patch: Partial<PromptPicks>) => void] {
  const picks = useSyncExternalStore(subscribe, read, () => DEFAULT_PICKS);
  const set = useCallback((patch: Partial<PromptPicks>) => {
    const next = clean({ ...read(), ...patch });
    memory = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // memory holds it for this tab
    }
    listeners.forEach((l) => l());
  }, []);
  return [picks, set];
}

/** Video models make 9:16 and 16:9 only. */
export const videoAspect = (a: Aspect): Aspect => (a === "16:9" ? "16:9" : "9:16");

/** What a prompt will roughly cost, or null when the agent decides (Auto). */
export function promptEstimate(p: PromptPicks): { usd: number; label: string } | null {
  const img = imageModel(p.imageModel);
  const vid = videoModel(p.videoModel);
  switch (p.output) {
    case "image":
      return { usd: img.price * p.count, label: `${p.count} × ${img.label}` };
    case "poster":
      // One picture for it, at most; brand and product photos are free.
      return { usd: img.price, label: `Up to one ${img.label} image` };
    case "video": {
      // About 15 s: half on the chosen model, a quarter of b-roll a step cheaper, the rest stills; plus music.
      const broll = VIDEO_MODELS[Math.min(VIDEO_MODELS.length - 1, VIDEO_MODELS.indexOf(vid) + 1)];
      return { usd: 15 * 0.55 * vid.perSecond + 15 * 0.25 * broll.perSecond + img.price + musicModel(p.musicModel).price, label: `About 15s, ${vid.label} hero shots` };
    }
    default:
      return null;
  }
}

export const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? "<$0.01" : n < 1 ? `$${n.toFixed(2)}` : n < 100 ? `$${n.toFixed(2).replace(/\.00$/, "")}` : `$${Math.round(n)}`);
