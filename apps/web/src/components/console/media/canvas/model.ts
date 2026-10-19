// The canvas's nodes, built from the campaign's live data: every creative
// (poster or video), every file placed on the board (image, clip, track) and
// every standalone generation still running or failed (a placeholder holding
// its spot). Positions are board units; a node's height follows its content.

import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { AUDIO_NODE, FORMATS, aspectSize, boardWidth, docDuration, modelLabel, type BoardPos, type FormatPreset, type MediaDoc } from "@slice/backend/convex/mediaTypes";

export type NodeKind = "poster" | "video" | "image" | "clip" | "audio" | "pending";
export type NodeRef = { kind: "creative" | "asset" | "job"; id: string };
export type NodeKey = string;

export interface BoardNode {
  key: NodeKey;
  ref: NodeRef;
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  /** Short facts under the name: format, length, model. */
  meta: string;
  creative?: Doc<"mediaCreatives">;
  asset?: Doc<"mediaAssets">;
  job?: Doc<"mediaJobs">;
  /** USD spent on it (its jobs, or the file's own cost). */
  cost: number;
  /** Generations still running inside it (a video's shots). */
  running: number;
}

export const keyOf = (ref: NodeRef): NodeKey => `${ref.kind}:${ref.id}`;
export const refOf = (key: NodeKey): NodeRef => {
  const [kind, id] = key.split(":");
  return { kind: kind as NodeRef["kind"], id };
};

const OPEN = new Set(["queued", "running"]);

/** A name from a prompt: its first words, sentence-cased. */
export function nameFromPrompt(prompt: string | undefined, fallback: string) {
  const words = (prompt ?? "").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ").replace(/[.,;:]+$/, "");
  return words ? words[0].toUpperCase() + words.slice(1) : fallback;
}

const seconds = (s: number | undefined) => (s ? `${Math.round(s)}s` : "");

const JOB_NOUN: Record<string, string> = { image: "Image", video: "Clip", edit: "Clip edit", music: "Music", voice: "Voiceover" };

export function buildNodes(data: { creatives: Doc<"mediaCreatives">[]; assets: Doc<"mediaAssets">[]; jobs: Doc<"mediaJobs">[] }): BoardNode[] {
  const out: BoardNode[] = [];
  const spentBy = new Map<string, number>();
  const runningBy = new Map<string, number>();
  for (const j of data.jobs) {
    if (!j.creativeId) continue;
    if (j.status === "done") spentBy.set(j.creativeId, (spentBy.get(j.creativeId) ?? 0) + (j.cost ?? j.estimate));
    if (OPEN.has(j.status)) runningBy.set(j.creativeId, (runningBy.get(j.creativeId) ?? 0) + 1);
  }

  // Creatives made before the canvas (no spot yet) line up after everything else.
  let spare = { x: 0, y: 0 };
  const placed = [...data.creatives.filter((c) => c.board), ...data.assets.filter((a) => a.board)];
  if (placed.length) {
    const bottom = Math.max(...placed.map((p) => p.board!.y + p.board!.w * 1.8));
    spare = { x: Math.min(...placed.map((p) => p.board!.x)), y: bottom + 120 };
  }
  const nextSpare = (w: number): BoardPos => {
    const pos = { x: spare.x, y: spare.y, w };
    spare = { x: spare.x + w + 72, y: spare.y };
    return pos;
  };

  for (const c of data.creatives) {
    const doc = c.doc as MediaDoc;
    const pos = c.board ?? nextSpare(boardWidth(doc.w, doc.h));
    const fmt = FORMATS[doc.format as FormatPreset]?.label ?? doc.format;
    out.push({
      key: keyOf({ kind: "creative", id: c._id }),
      ref: { kind: "creative", id: c._id },
      kind: doc.kind === "video" ? "video" : "poster",
      ...pos,
      h: (pos.w * doc.h) / doc.w,
      name: c.name.replace(/ · [^·]+$/, "") || (doc.kind === "video" ? "Video" : "Poster"),
      meta: doc.kind === "video" ? `${fmt} · ${seconds(docDuration(doc))}` : fmt,
      creative: c,
      cost: spentBy.get(c._id) ?? 0,
      running: runningBy.get(c._id) ?? 0,
    });
  }

  for (const a of data.assets) {
    if (!a.board) continue;
    const kind: NodeKind = a.kind === "video" ? "clip" : a.kind === "audio" ? "audio" : "image";
    const h = kind === "audio" ? AUDIO_NODE.h : a.w && a.h ? (a.board.w * a.h) / a.w : a.board.w;
    const noun = kind === "clip" ? "Clip" : kind === "audio" ? "Music" : "Image";
    out.push({
      key: keyOf({ kind: "asset", id: a._id }),
      ref: { kind: "asset", id: a._id },
      kind,
      ...a.board,
      h,
      name: a.name && a.source !== "generated" ? a.name.replace(/\.[a-z0-9]+$/i, "") : nameFromPrompt(a.prompt, noun),
      meta: [a.source === "generated" ? modelLabel(a.model) : a.source === "upload" ? "Uploaded" : "Brand", kind !== "image" ? seconds(a.duration) : ""].filter(Boolean).join(" · "),
      asset: a,
      cost: a.cost ?? 0,
      running: 0,
    });
  }

  for (const j of data.jobs) {
    if (!j.board || j.dismissed || !(OPEN.has(j.status) || j.status === "failed")) continue;
    const audio = j.kind === "music" || j.kind === "voice";
    const s = aspectSize(j.aspect);
    out.push({
      key: keyOf({ kind: "job", id: j._id }),
      ref: { kind: "job", id: j._id },
      kind: "pending",
      ...j.board,
      h: audio ? AUDIO_NODE.h : (j.board.w * s.h) / s.w,
      name: nameFromPrompt(j.prompt, JOB_NOUN[j.kind] ?? "Generation"),
      meta: modelLabel(j.model),
      job: j,
      cost: 0,
      running: OPEN.has(j.status) ? 1 : 0,
    });
  }
  return out;
}

/** The box around some nodes, for zoom-to-fit. */
export function bounds(nodes: Pick<BoardNode, "x" | "y" | "w" | "h">[]) {
  if (!nodes.length) return null;
  const x = Math.min(...nodes.map((n) => n.x));
  const y = Math.min(...nodes.map((n) => n.y)) - 34;
  const r = Math.max(...nodes.map((n) => n.x + n.w));
  const b = Math.max(...nodes.map((n) => n.y + n.h));
  return { x, y, w: r - x, h: b - y };
}

/**
 * Top-left for a w×h node as near as possible to `target` (its top-left)
 * without covering anything, names included. Searches outward in 40-unit
 * steps; falls back to the target when the area is packed.
 */
export function openSpot(taken: Pick<BoardNode, "x" | "y" | "w" | "h">[], size: { w: number; h: number }, target: { x: number; y: number }) {
  const GAP = 32;
  const NAME = 34;
  const STEP = 40;
  const free = (x: number, y: number) => taken.every((n) => x + size.w + GAP <= n.x || x - GAP >= n.x + n.w || y + size.h + GAP <= n.y - NAME || y - NAME - GAP >= n.y + n.h);
  for (let k = 0; k <= 40; k++) {
    const ring: { x: number; y: number; d: number }[] = [];
    for (let i = -k; i <= k; i++)
      for (const [dx, dy] of k ? [[i, -k], [i, k], [-k, i], [k, i]] : [[0, 0]]) ring.push({ x: target.x + dx * STEP, y: target.y + dy * STEP, d: dx * dx + dy * dy });
    const hit = ring.sort((a, b) => a.d - b.d).find((p) => free(p.x, p.y));
    if (hit) return { x: Math.round(hit.x), y: Math.round(hit.y) };
  }
  return { x: Math.round(target.x), y: Math.round(target.y) };
}

export type CampaignData = {
  campaign: Doc<"mediaCampaigns">;
  brand: Doc<"mediaBrands"> | null;
  creatives: Doc<"mediaCreatives">[];
  assets: Doc<"mediaAssets">[];
  jobs: Doc<"mediaJobs">[];
  messages: unknown[];
};

export type CampaignId = Id<"mediaCampaigns">;
