"use client";

// What a generation shows while it runs: a halftone dot grid with warm light
// moving through it. Three soft pools of light drift on slow loops, wavy bands
// roll across them, and the dots swell, shift and warm from sand to yellow to
// orange as the light passes, so the grid itself seems to ripple. It livens as
// the job nears its expected time, and when the file lands it grows out of the
// same dots (`.media-reveal` in globals.css, laid on the grid by `revealStyle`).
//
// The grid pitch is in screen pixels, so it reads the same at any canvas zoom
// or stage scale. One animation frame drives every field on the page.

import { useEffect, useRef, type CSSProperties } from "react";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type FieldTone = "light" | "dark";

/** The dot grid for a w×h box in screen pixels: its pitch, and the offset that centres it. */
export function fieldGrid(w: number, h: number) {
  const pitch = Math.min(12, Math.max(5, Math.min(w, h) / 30));
  const cols = Math.max(1, Math.floor(w / pitch));
  const rows = Math.max(1, Math.floor(h / pitch));
  return { pitch, cols, rows, ox: (w - (cols - 1) * pitch) / 2, oy: (h - (rows - 1) * pitch) / 2 };
}

/** A field's seed from where it sits on the board, so a placeholder and the file that replaces it move as one. */
export const seedAt = (x: number, y: number) => (Math.abs(x * 0.0131 + y * 0.0077) % 1) * Math.PI * 2;

/** A seed from any id (video shots). */
export function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 6283) / 1000;
}

/** The reveal mask's dots, matching the field's grid on a node of w×h board units shown at `zoom`. */
export function revealStyle(w: number, h: number, zoom: number): CSSProperties {
  const g = fieldGrid(w * zoom, h * zoom);
  return { "--dot": `${g.pitch / zoom}px`, "--dot-x": `${(g.ox - g.pitch / 2) / zoom}px`, "--dot-y": `${(g.oy - g.pitch / 2) / zoom}px` } as CSSProperties;
}

/* Progress ------------------------------------------------------------------- */

function typicalSeconds(kind: string, model: string) {
  if (kind === "image") return /pro/.test(model) ? 28 : 14;
  if (kind === "video") return /lite/.test(model) ? 50 : /fast/.test(model) ? 65 : 95;
  if (kind === "edit") return 45;
  if (kind === "extend") return 75;
  if (kind === "music") return /pro/.test(model) ? 60 : 35;
  if (kind === "voice") return 12;
  if (kind === "design") return 60;
  if (kind === "design-video") return 75;
  if (kind === "design-image") return 20;
  return 40;
}

/** How long a job like this one takes: the median of the campaign's last few like it, else a typical time for the model. */
export function jobSeconds(job: Doc<"mediaJobs">, jobs: Doc<"mediaJobs">[]) {
  const took = jobs
    .filter((j) => j.status === "done" && j.kind === job.kind && j.model === job.model)
    .map((j) => (j.updatedAt - j.createdAt) / 1000)
    .filter((s) => s > 3 && s < 900)
    .slice(-8)
    .sort((a, b) => a - b);
  return took.length >= 2 ? took[Math.floor(took.length / 2)] : typicalSeconds(job.kind, job.model);
}

/** How far along a job probably is (0 to 0.98): steady up to 70% of its expected time, then easing so it never claims to be done. */
export function progressAt(startedAt: number, expected: number, now: number) {
  const x = Math.max(0, now - startedAt) / 1000 / Math.max(1, expected);
  return x < 0.7 ? x : Math.min(0.98, 0.7 + 0.28 * (1 - Math.exp(-(x - 0.7) / 0.45)));
}

const PHASES: Record<string, string[]> = {
  image: ["Reading the brief", "Sketching it out", "Setting the scene", "Lighting it", "Polishing details", "Adding final touches"],
  video: ["Reading the brief", "Blocking the shot", "Setting the scene", "Rolling camera", "Rendering motion", "Grading colour", "Adding final touches"],
  edit: ["Studying the clip", "Making the change", "Rendering frames", "Adding final touches"],
  extend: ["Studying the last frames", "Carrying the motion on", "Rendering frames", "Adding final touches"],
  music: ["Finding the groove", "Laying down the rhythm", "Writing the melody", "Mixing", "Mastering"],
  voice: ["Warming up", "Recording", "Cleaning up the take"],
  design: ["Working out the idea", "Choosing the imagery", "Laying it out", "Setting the type", "Adding final touches"],
  "design-video": ["Working out the idea", "Planning the shots", "Casting the first frame", "Laying it out", "Adding final touches"],
  "design-image": ["Reading the brief", "Working out the shot", "Setting the scene"],
};

/** What the agent designing a poster or video ad is doing, from its live steps (null before its first). */
const DESIGN_STEP: Record<string, string> = {
  make_image: "Setting the scene",
  get_audience: "Reading the audience",
  qloo_search: "Finding cultural hooks",
  qloo_insights: "Finding cultural hooks",
  save_concepts: "Shaping the idea",
  search_images: "Choosing photographs",
  generate_image: "Generating the imagery",
  write_creative: "Laying it out",
};

export function designPhase(steps: { kind: string; name?: string; status?: string }[]) {
  const last = [...steps].reverse().find((s) => s.kind === "tool" && s.name && s.name in DESIGN_STEP);
  if (!last?.name) return null;
  // Pictures in hand, the layout comes next.
  if (last.status !== "running" && (last.name === "search_images" || last.name === "generate_image")) return "Laying it out";
  return DESIGN_STEP[last.name];
}

/** The line a running job shows: what it is probably doing by now. */
export function phaseAt(job: Doc<"mediaJobs">, expected: number, now: number) {
  if (job.status === "queued") return "Waiting for a slot";
  const over = (now - job.createdAt) / 1000 / Math.max(1, expected);
  if (over > 1.6) return "Taking a little longer";
  const list = PHASES[job.kind] ?? PHASES.image;
  return list[Math.min(list.length - 1, Math.floor((progressAt(job.createdAt, expected, now) / 0.9) * list.length))];
}

/* Drawing -------------------------------------------------------------------- */

/** Brightness steps and warmth steps a dot can take; each pair is drawn as one path. */
const LEVELS = 10;
/** Yellow, amber, brand orange, deep orange. */
const WARM: [number, number, number][] = [
  [255, 214, 51],
  [255, 191, 0],
  [255, 160, 0],
  [255, 121, 0],
  [244, 96, 10],
  [230, 74, 25],
];

function palette(dim: [number, number, number, number]) {
  const out: string[] = [];
  for (const hue of WARM)
    for (let l = 0; l < LEVELS; l++) {
      const x = l / (LEVELS - 1);
      const m = Math.min(1, x / 0.55) ** 0.8;
      const c = dim.slice(0, 3).map((d, k) => Math.round(d + (hue[k] - d) * m));
      out.push(`rgba(${c[0]},${c[1]},${c[2]},${(dim[3] + (1 - dim[3]) * x ** 0.7).toFixed(3)})`);
    }
  return out;
}

const PALETTE: Record<FieldTone, string[]> = { light: palette([200, 170, 128, 0.34]), dark: palette([255, 255, 255, 0.16]) };

/** The soft light under the dots, one per pool: yellow and amber only, since orange on white turns peach. */
const GLOW: Record<FieldTone, [number, number, number, number][]> = {
  light: [
    [255, 222, 80, 0.3],
    [255, 200, 60, 0.2],
    [255, 184, 40, 0.12],
  ],
  dark: [
    [255, 190, 40, 0.22],
    [255, 140, 20, 0.16],
    [255, 100, 10, 0.12],
  ],
};

/** Each pool's loop (speeds in rad/s), size and strength. */
const POOLS = [
  { wu: 0.43, wv: 0.31, pu: 0, pv: 1.7, rr: 0.075, amp: 1 },
  { wu: 0.29, wv: 0.47, pu: 2.1, pv: 4.4, rr: 0.055, amp: 0.85 },
  { wu: 0.53, wv: 0.37, pu: 4.2, pv: 0.6, rr: 0.042, amp: 0.7 },
];

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface FieldOptions {
  tone: FieldTone;
  seed: number;
  /** When the job started and how long it should take: the field livens as it goes. */
  startedAt?: number;
  expected?: number;
  /** A fixed liveliness (0 to 1) instead. */
  level?: number;
}

type Draw = (now: number) => void;
const fields = new Set<Draw>();
let frame = 0;
const tick = (now: number) => {
  for (const draw of fields) draw(now);
  frame = fields.size ? requestAnimationFrame(tick) : 0;
};

/** Run a field on a canvas until the returned function is called. */
export function mountField(canvas: HTMLCanvasElement, read: () => FieldOptions) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const born = performance.now();
  let w = 0;
  let h = 0;
  let level = new Uint8Array(0);
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let pr = new Float32Array(0);

  const draw: Draw = (now) => {
    const box = canvas.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    if (box.right < 0 || box.bottom < 0 || box.left > window.innerWidth || box.top > window.innerHeight) return;
    if (Math.abs(box.width - w) > 0.5 || Math.abs(box.height - h) > 0.5) {
      w = box.width;
      h = box.height;
      // Sharp at the device's pixel ratio, but no bigger than about 2000×2000 when zoomed far in.
      const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4e6 / (w * h)));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
    } else if (still) return;
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);

    const o = read();
    const s = o.seed;
    // One clock for every field, so a placeholder and the file replacing it agree.
    const t = still ? 12 + s : ((performance.timeOrigin + now) / 1000) % 1e5;
    const age = still ? 9 : (now - born) / 1000;
    const p = o.level ?? (o.startedAt ? progressAt(o.startedAt, o.expected ?? 40, Date.now()) : 0.6);
    const energy = (0.72 + 0.28 * p) * (0.35 + 0.65 * smooth(age / 1.4));

    const g = fieldGrid(w, h);
    const S = Math.max(w, h);
    const au = (0.3 * w) / S;
    const av = (0.3 * h) / S;
    const pools = POOLS.map((q, k) => ({ u: au * Math.sin(t * q.wu + q.pu + s * (k + 1)), v: av * Math.sin(t * q.wv + q.pv + s * (k + 2)), rr: q.rr, amp: q.amp }));
    const th1 = 0.7 + 0.35 * Math.sin(t * 0.11 + s);
    const th2 = th1 + 1.9;
    const c1 = Math.cos(th1);
    const s1 = Math.sin(th1);
    const c2 = Math.cos(th2);
    const s2 = Math.sin(th2);
    const phi = t * 0.07 + s;
    const cphi = Math.cos(phi);
    const sphi = Math.sin(phi);
    const shiftMax = g.pitch * 0.17;
    const rMin = g.pitch * (o.tone === "dark" ? 0.08 : 0.085);
    const rMax = g.pitch * 0.27;
    // The field opens out from the middle when it first appears.
    const open = still ? 9 : age * 0.9;

    ctx.clearRect(0, 0, w, h);
    const glow = GLOW[o.tone];
    if (o.tone === "dark") ctx.globalCompositeOperation = "lighter";
    pools.forEach((q, k) => {
      const [r, gr, b, a] = glow[k];
      const cx = w / 2 + q.u * S;
      const cy = h / 2 + q.v * S;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.62);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${(a * energy).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });

    const n = g.cols * g.rows;
    if (level.length < n) {
      level = new Uint8Array(n);
      px = new Float32Array(n);
      py = new Float32Array(n);
      pr = new Float32Array(n);
    }
    let k = 0;
    for (let r = 0; r < g.rows; r++) {
      const y = g.oy + r * g.pitch;
      const v = (y - h / 2) / S;
      for (let c = 0; c < g.cols; c++, k++) {
        const x = g.ox + c * g.pitch;
        const u = (x - w / 2) / S;
        // A slow warp bends the bands so they read as water, not stripes.
        const wu = u + 0.045 * Math.sin(v * 9 + t * 0.9 + s);
        const wv = v + 0.045 * Math.sin(u * 8 - t * 0.75 + s * 1.7);
        let sum = 0;
        for (const q of pools) {
          const du = wu - q.u;
          const dv = wv - q.v;
          sum += q.amp * Math.exp(-(du * du + dv * dv) / q.rr);
        }
        const pool = 0.1 + 0.9 * (1 - Math.exp(-1.5 * sum));
        const ph1 = (wu * c1 + wv * s1) * 16 - t * 1.9;
        const ph2 = (wu * c2 + wv * s2) * 11 + t * 1.3;
        const wave = 0.5 + 0.5 * (0.62 * Math.sin(ph1) + 0.38 * Math.sin(ph2));
        const d = Math.sqrt(u * u + v * v);
        const opened = smooth((open - d) / 0.22);
        let i = 1.25 * energy * pool * (0.18 + 0.82 * wave * wave) * opened;
        if (i > 1) i = 1;
        // Dots ride the waves a little, so the grid itself ripples.
        const sh = shiftMax * (0.35 + 0.65 * pool) * opened;
        const a1 = 0.62 * Math.cos(ph1);
        const a2 = 0.38 * Math.cos(ph2);
        px[k] = x + (c1 * a1 + c2 * a2) * sh;
        py[k] = y + (s1 * a1 + s2 * a2) * sh;
        pr[k] = rMin + (rMax - rMin) * i;
        // Warmth: the brightest dots lean orange, and a slow yellow-to-orange sweep turns across the field.
        const sweep = 0.5 + 0.5 * Math.sin((u * cphi + v * sphi) * 3.2 - t * 0.35 + s);
        const hue = Math.min(1, 0.55 * i * 1.15 + 0.45 * sweep);
        level[k] = Math.round(hue * (WARM.length - 1)) * LEVELS + Math.round(i * (LEVELS - 1));
      }
    }

    ctx.globalCompositeOperation = "source-over";
    const pal = PALETTE[o.tone];
    for (let step = 0; step < pal.length; step++) {
      let any = false;
      for (let j = 0; j < n; j++) {
        if (level[j] !== step) continue;
        if (!any) ctx.beginPath();
        any = true;
        ctx.moveTo(px[j] + pr[j], py[j]);
        ctx.arc(px[j], py[j], pr[j], 0, Math.PI * 2);
      }
      if (!any) continue;
      ctx.fillStyle = pal[step];
      ctx.fill();
    }
  };

  fields.add(draw);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    fields.delete(draw);
  };
}

/** The field as a canvas filling its (positioned) parent. */
export function GenField({ tone = "light", seed = 0, startedAt, expected, level, className }: Partial<FieldOptions> & { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const opts = useRef<FieldOptions>({ tone, seed, startedAt, expected, level });
  useEffect(() => {
    opts.current = { tone, seed, startedAt, expected, level };
  });
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return mountField(canvas, () => opts.current);
  }, []);
  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
