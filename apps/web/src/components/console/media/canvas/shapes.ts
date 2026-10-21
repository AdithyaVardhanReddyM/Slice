// What the merchant draws on the canvas to organise it (mediaShapes): frames,
// arrows, text and sticky notes. Their colours, sizes and the geometry the
// board needs: where an arrow pinned to a node meets that node's edge, and
// whether a drag box catches an arrow.

import type { NodeKey } from "./model";

export type ShapeKind = "frame" | "arrow" | "text" | "sticky";
/** The toolbar's drawing tools. */
export type DrawTool = ShapeKind;

/** One end of an arrow, in board units; `node` pins it to that node. */
export interface End {
  x: number;
  y: number;
  node?: NodeKey;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Swatch {
  key: string;
  label: string;
  value: string;
}

export const STICKY_COLORS: Swatch[] = [
  { key: "yellow", label: "Yellow", value: "#ffe58f" },
  { key: "orange", label: "Orange", value: "#ffc98d" },
  { key: "pink", label: "Pink", value: "#ffbccb" },
  { key: "green", label: "Green", value: "#c1e6ad" },
  { key: "blue", label: "Blue", value: "#b3d8f7" },
  { key: "violet", label: "Violet", value: "#d8cbf6" },
  { key: "gray", label: "Grey", value: "#e5e3de" },
];

/** Text and arrows. */
export const INK_COLORS: Swatch[] = [
  { key: "black", label: "Black", value: "#1f1f1f" },
  { key: "gray", label: "Grey", value: "#8b8b8b" },
  { key: "orange", label: "Orange", value: "#ff7900" },
  { key: "red", label: "Red", value: "#e5484d" },
  { key: "green", label: "Green", value: "#2f9e5b" },
  { key: "blue", label: "Blue", value: "#2f7de1" },
];

export const FRAME_COLORS: Swatch[] = [
  { key: "white", label: "White", value: "#ffffff" },
  { key: "gray", label: "Grey", value: "#ebe9e5" },
  { key: "yellow", label: "Yellow", value: "#fff4cc" },
  { key: "orange", label: "Orange", value: "#ffe6d1" },
  { key: "green", label: "Green", value: "#e2f2d9" },
  { key: "blue", label: "Blue", value: "#deedfb" },
];

export const swatch = (list: Swatch[], key: string | undefined) => list.find((s) => s.key === key) ?? list[0];

export const TEXT_SIZES = [
  { label: "S", name: "Small", size: 16 },
  { label: "M", name: "Medium", size: 24 },
  { label: "L", name: "Large", size: 40 },
  { label: "XL", name: "Extra large", size: 64 },
];

export const STICKY_SIZE = 220;
export const FRAME_SIZE = { w: 640, h: 420 };
export const ARROW_STROKE = 3;

export const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

export const contains = (b: Box, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Where the line from a box's centre toward `p` leaves the box, `gap` further out. */
export function edgePoint(b: Box, p: { x: number; y: number }, gap = 10) {
  const c = center(b);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return c;
  const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  const k = t + gap / len;
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/** An arrow's drawn ends: a pinned end meets its node's edge on the line between the two. */
export function arrowLine(from: End, to: End, boxOf: (key: NodeKey) => Box | undefined) {
  const a = from.node ? boxOf(from.node) : undefined;
  const b = to.node ? boxOf(to.node) : undefined;
  const aim1 = b ? center(b) : to;
  const aim2 = a ? center(a) : from;
  const p1 = a ? edgePoint(a, aim1) : from;
  const p2 = b ? edgePoint(b, aim2) : to;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

export const lineBox = (l: { x1: number; y1: number; x2: number; y2: number }): Box => ({ x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2), w: Math.abs(l.x2 - l.x1), h: Math.abs(l.y2 - l.y1) });

/** Whether a line crosses a box (sampled along its length). */
export function lineHits(l: { x1: number; y1: number; x2: number; y2: number }, b: Box) {
  const steps = Math.max(2, Math.ceil(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) / 12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (contains(b, { x: l.x1 + (l.x2 - l.x1) * t, y: l.y1 + (l.y2 - l.y1) * t })) return true;
  }
  return false;
}

/** The two strokes of an arrowhead at (x2, y2). */
export function arrowHead(l: { x1: number; y1: number; x2: number; y2: number }, size: number) {
  const ang = Math.atan2(l.y2 - l.y1, l.x2 - l.x1);
  const spread = Math.PI / 7;
  const a = { x: l.x2 - size * Math.cos(ang - spread), y: l.y2 - size * Math.sin(ang - spread) };
  const b = { x: l.x2 - size * Math.cos(ang + spread), y: l.y2 - size * Math.sin(ang + spread) };
  return `M${a.x},${a.y} L${l.x2},${l.y2} L${b.x},${b.y}`;
}

/** A sticky note's starting text size: it shrinks to fit as the words grow. */
export const stickyFont = (w: number) => Math.max(12, Math.min(48, w / 10));

export const newSid = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
