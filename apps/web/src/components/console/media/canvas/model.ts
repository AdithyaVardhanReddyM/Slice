// The canvas's nodes, built from the campaign's live data: every creative
// (poster or video), every file placed on the board (image, clip, track),
// every standalone generation still running or failed, or poster or video ad
// being designed (a placeholder holding its spot), and what the merchant drew
// (frames, arrows, text, sticky notes). Positions are board units; a node's
// height follows its content.

import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import { AUDIO_NODE, FORMATS, aspectSize, boardWidth, creativeName, docDuration, modelLabel, type Aspect, type BoardPos, type FormatPreset, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import type { ItemNoun } from "../focus/item-agent";
import { arrowLine, center, contains, lineBox, type Box, type ShapeKind } from "./shapes";
import type { ItemRef, MakerSpot } from "./use-media-agent";

export type NodeKind = "poster" | "video" | "image" | "clip" | "audio" | "pending" | "ghost" | ShapeKind;
/** A shape's id is its `sid`. */
export type NodeRef = { kind: "creative" | "asset" | "job" | "ghost" | "shape"; id: string };

/** What a toolbar maker makes. */
export type MakerKind = "image" | "poster" | "video";

/**
 * A toolbar maker's spot before its first prompt: placed on the canvas and opened in the
 * sidebar, but only in this browser (an empty one goes when you click away). Its id is the
 * thread its conversation runs in; once sent, a design spot holds the place in Convex.
 */
export interface Ghost {
  id: string;
  kind: MakerKind;
  aspect: Aspect;
  x: number;
  y: number;
  /** Its first prompt is on its way. */
  sent: boolean;
}
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
  ghost?: Ghost;
  shape?: Doc<"mediaShapes">;
  /** An arrow's drawn ends (its pinned ends follow their nodes), set by layoutArrows. */
  line?: { x1: number; y1: number; x2: number; y2: number };
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

const JOB_NOUN: Record<string, string> = { image: "Image", video: "Clip", edit: "Clip edit", music: "Music", voice: "Voiceover", design: "Poster", "design-video": "Video ad", "design-image": "Image" };

export const MAKER_NAME: Record<MakerKind, string> = { image: "New image", poster: "New poster", video: "New video ad" };

const SHAPE_NAME: Record<ShapeKind, string> = { frame: "Frame", arrow: "Arrow", text: "Text", sticky: "Sticky note" };

export function buildNodes(data: { creatives: Doc<"mediaCreatives">[]; assets: Doc<"mediaAssets">[]; jobs: Doc<"mediaJobs">[]; shapes?: Doc<"mediaShapes">[] }): BoardNode[] {
  const out: BoardNode[] = [];
  for (const s of data.shapes ?? []) {
    const kind = s.kind as ShapeKind;
    out.push({ key: keyOf({ kind: "shape", id: s.sid }), ref: { kind: "shape", id: s.sid }, kind, x: s.x, y: s.y, w: s.w, h: s.h, name: kind === "frame" ? s.text?.trim() || "Frame" : nameFromPrompt(s.text, SHAPE_NAME[kind]), meta: "", shape: s, cost: 0, running: 0 });
  }
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
      name: creativeName(c.name) || (doc.kind === "video" ? "Video" : "Poster"),
      meta: doc.kind === "video" ? `${fmt}, ${seconds(docDuration(doc))}` : fmt,
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
      meta: [a.source === "generated" ? modelLabel(a.model) : a.source === "upload" ? "Uploaded" : "Brand", kind !== "image" ? seconds(a.duration) : ""].filter(Boolean).join(", "),
      asset: a,
      cost: a.cost ?? 0,
      running: 0,
    });
  }

  for (const j of data.jobs) {
    if (!j.board || j.dismissed || !(OPEN.has(j.status) || j.status === "failed" || j.status === "draft")) continue;
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

/** Arrows drawn between where their ends are now: a pinned end meets its node's edge (wherever that node is, mid-drag too). */
export function layoutArrows(nodes: BoardNode[]): BoardNode[] {
  if (!nodes.some((n) => n.kind === "arrow")) return nodes;
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const boxOf = (key: NodeKey) => {
    const n = byKey.get(key);
    return n && n.kind !== "arrow" ? n : undefined;
  };
  return nodes.map((n) => {
    if (n.kind !== "arrow" || !n.shape?.from || !n.shape.to) return n;
    const line = arrowLine(n.shape.from, n.shape.to, boxOf);
    return { ...n, ...lineBox(line), line };
  });
}

/** Shapes draw under (frames) or over (notes, text, arrows) what is made. */
export const layerOf = (n: BoardNode) => (n.kind === "frame" ? 0 : n.kind === "arrow" ? 3 : n.kind === "text" || n.kind === "sticky" ? 2 : 1);

/** Shows its name above it (made things and frames; not text, notes or arrows). */
export const labelled = (n: BoardNode) => !n.shape || n.kind === "frame";

/** What an arrow's end can be pinned to: something made, a note or text (not a frame, another arrow or a spot still changing). */
export const pinnable = (n: BoardNode) => !["arrow", "frame", "ghost", "pending"].includes(n.kind);

/** What sits in a frame (its middle inside, and smaller), so it moves with it; arrows go when both their ends are in. */
export function contentsOf(frame: Box, nodes: BoardNode[]): BoardNode[] {
  return nodes.filter((n) => {
    if (n.line) return contains(frame, { x: n.line.x1, y: n.line.y1 }) && contains(frame, { x: n.line.x2, y: n.line.y2 });
    return n.w * n.h < frame.w * frame.h && contains(frame, center(n));
  });
}

/** What a new w×h thing aimed at `box` must keep clear of: not arrows, and not a frame it is being put in. */
export const obstacles = (nodes: BoardNode[], box?: Box) => nodes.filter((n) => n.kind !== "arrow" && !(box && n.kind === "frame" && contains(n, center(box))));

export function ghostNode(g: Ghost): BoardNode {
  const s = aspectSize(g.aspect);
  const w = boardWidth(s.w, s.h);
  return { key: keyOf({ kind: "ghost", id: g.id }), ref: { kind: "ghost", id: g.id }, kind: "ghost", x: g.x, y: g.y, w, h: (w * s.h) / s.w, name: MAKER_NAME[g.kind], meta: g.aspect, ghost: g, cost: 0, running: 0 };
}

/** The conversation a node was made in, when it began in its own spot (a maker's thread). */
export function nodeThread(n: BoardNode | undefined): string | undefined {
  return n?.ghost?.id ?? n?.job?.thread ?? n?.creative?.thread ?? n?.asset?.thread;
}

/** What the sidebar's chat is: the canvas conversation, a maker's thread (with its spot until something lands), or one item's own. */
export type SidebarThread = { kind: "campaign" } | { kind: "draft"; thread: string; node: BoardNode; spot?: MakerSpot } | { kind: "item"; thread: string; node: BoardNode; item: ItemRef; noun: ItemNoun };

const SPOT_KIND: Record<string, MakerKind> = { design: "poster", "design-video": "video", "design-image": "image" };

/** The conversation a selected node opens. */
export function threadOf(n: BoardNode | undefined, assets: Doc<"mediaAssets">[]): SidebarThread {
  if (!n) return { kind: "campaign" };
  if (n.ghost) return { kind: "draft", thread: n.ghost.id, node: n, spot: { x: n.x, y: n.y, w: n.w, aspect: n.ghost.aspect, kind: n.ghost.kind } };
  // A design spot still waits for what its thread makes; a generation already running in it has taken it.
  if (n.job?.thread) return { kind: "draft", thread: n.job.thread, node: n, spot: SPOT_KIND[n.job.kind] && n.job.board ? { ...n.job.board, aspect: n.job.aspect ?? "4:5", kind: SPOT_KIND[n.job.kind] } : undefined };
  if (n.creative) {
    const thread = n.creative.thread ?? n.creative._id;
    return { kind: "item", thread, node: n, item: { kind: "creative", id: n.creative._id, thread }, noun: n.kind === "video" ? "video" : "poster" };
  }
  if (n.asset && (n.kind === "image" || n.kind === "clip")) {
    const root = rootAsset(n.asset, assets);
    const thread = root.thread ?? root._id;
    return { kind: "item", thread, node: n, item: { kind: "asset", id: n.asset._id, thread }, noun: n.kind };
  }
  return { kind: "campaign" };
}

/** An image's or clip's first version: its thread is that one's. */
export function rootAsset(a: Doc<"mediaAssets">, assets: Doc<"mediaAssets">[]) {
  const byId = new Map(assets.map((x) => [x._id as string, x]));
  let cur = a;
  for (let hops = 0; cur.parentId && byId.has(cur.parentId) && hops < 50; hops++) cur = byId.get(cur.parentId)!;
  return cur;
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
  shapes: Doc<"mediaShapes">[];
  messages: unknown[];
};

export type CampaignId = Id<"mediaCampaigns">;
