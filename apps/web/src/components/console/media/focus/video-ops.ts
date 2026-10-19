// Edits the video editor makes from outside the timeline: a picture or clip
// from the library as a shot, a picture as an overlay, a track as the music.

import { clipLength, newId, timeline, type Clip, type Layer, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import type { DragItem } from "../sidebar/assets";

/** A library item as a shot: a picture becomes a 3 s still with a slow push-in, a clip plays from its start. */
export function shotFrom(item: Pick<DragItem, "url" | "kind" | "w" | "h"> & { duration?: number }): Clip | null {
  if (item.kind === "image") return { id: newId("c"), kind: "still", poster: item.url, in: 0, out: 3, status: "ready", role: "still", kenburns: "in", transition: "fade" };
  if (item.kind === "video") return { id: newId("c"), kind: "motion", src: item.url, in: 0, out: Math.min(8, item.duration ?? 5), status: "ready", role: "broll", transition: "cut" };
  return null;
}

/** Where a shot dropped at time `t` goes: before the shot whose middle is past `t`. */
export function insertShot(doc: MediaDoc, clip: Clip, t: number | null): MediaDoc {
  const list = [...(doc.video ?? [])];
  if (t === null) return { ...doc, video: [...list, clip] };
  const tl = timeline(doc);
  let at = tl.findIndex((s) => t < (s.start + s.end) / 2);
  if (at < 0) at = list.length;
  list.splice(at, 0, clip);
  return { ...doc, video: list };
}

/** A picture over the video from `t` for 3 s, fading in. */
export function overlayFrom(doc: MediaDoc, url: string, t: number, dims?: { w?: number; h?: number }): Layer {
  const w = Math.round(doc.w * 0.5);
  const h = dims?.w && dims?.h ? Math.round((w * dims.h) / dims.w) : w;
  const total = (doc.video ?? []).reduce((s, c) => s + clipLength(c), 0);
  return { id: newId("l"), type: "image", src: url, x: Math.round((doc.w - w) / 2), y: Math.round((doc.h - h) / 2), w, h, fit: "cover", role: "photo", start: Math.max(0, t), end: Math.min(total, t + 3), anim: "fade" };
}
