"use client";

// The canvas while the builder works. Before the page exists, Slice's cursor
// sketches a landing page on a field of brand-coloured dots that ripple around
// it, dropping in what the agent finds (site and stock photos, Qloo faces,
// taste words); when the CSS starts streaming, the page's palette and type
// collect in a style tile; when the markup streams, the real page renders as
// it is written with the cursor riding the end of the text; over a finished
// page (review, edits) the cursor moves across it like a collaborator.

import { ImageIcon } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import type { BrandKit } from "@slice/backend/convex/pagesTypes";
import { cn } from "@/lib/utils";
import { kitOf, type Brand } from "@/lib/pages/types";
import { googleFontsHref } from "@/components/pages/theme";
import { luminance } from "@/lib/pages/color";
import { clock, draftColors, draftFonts, ingredients, useNow } from "./build-steps";
import type { Draft } from "./use-builder";

export type CanvasMode = "sketch" | "draft" | "presence";

/* Ink: the brand's colour for dots, cursor and sketch ------------------------------- */

/** The brand's primary (or accent) when it reads on white; else Slice orange. */
export function inkOf(brand: Brand | null | undefined): { ink: string; on: string } {
  const c = kitOf(brand)?.colors;
  const ink = [c?.primary, c?.accent, c?.foreground].find((x): x is string => !!x && (luminance(x) ?? 1) < 0.6) ?? "#ea580c";
  return { ink, on: (luminance(ink) ?? 0) > 0.4 ? "#111111" : "#ffffff" };
}

const mix = (ink: string, pct: number) => `color-mix(in oklab, ${ink} ${pct}%, transparent)`;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(q.matches);
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return reduced;
}

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* The cursor ---------------------------------------------------------------------------- */

/** Where the cursor is and where it has been (the dots read this). */
interface Motion {
  x: number;
  y: number;
  trail: { x: number; y: number; at: number }[];
}

export interface CursorApi {
  /** Head for (x, y); `rate` is how tightly it follows (higher = snappier). */
  to(x: number, y: number, rate?: number): void;
  /** A click: the arrow dips. */
  press(): void;
  at(): { x: number; y: number };
}

const SliceCursor = forwardRef<CursorApi, { ink: string; on: string; motion: RefObject<Motion>; hidden?: boolean }>(function SliceCursor({ ink, on, motion, hidden }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const arrow = useRef<SVGSVGElement>(null);
  const target = useRef({ x: -60, y: -60, rate: 9 });
  const placed = useRef(false);

  useImperativeHandle(ref, () => ({
    to(x, y, rate = 9) {
      target.current = { x, y, rate };
      // The first target places it there; after that it travels.
      if (!placed.current) {
        placed.current = true;
        motion.current.x = x;
        motion.current.y = y;
      }
    },
    press() {
      arrow.current?.animate([{ transform: "scale(1)" }, { transform: "scale(0.78)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
    },
    at: () => ({ x: motion.current.x, y: motion.current.y }),
  }));

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastTrail = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = motion.current;
      const t = target.current;
      const k = 1 - Math.exp(-dt * t.rate);
      m.x += (t.x - m.x) * k;
      m.y += (t.y - m.y) * k;
      if (now - lastTrail > 45) {
        lastTrail = now;
        m.trail.push({ x: m.x, y: m.y, at: now });
        while (m.trail.length && now - m.trail[0].at > 1400) m.trail.shift();
      }
      if (el.current) el.current.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [motion]);

  return (
    <div ref={el} aria-hidden className={cn("pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-300 will-change-transform", hidden && "opacity-0")} style={{ transform: "translate3d(-60px,-60px,0)" }}>
      <svg ref={arrow} width="20" height="20" viewBox="0 0 20 20" className="-translate-x-[3px] -translate-y-[2px] origin-top-left drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.25)]">
        <path d="M3.2 2.4 17 8.9c.7.3.6 1.3-.1 1.5l-5.5 1.4-2.2 5.3c-.3.7-1.3.7-1.5-.1L2.1 3.6c-.2-.8.4-1.4 1.1-1.2Z" fill={ink} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="absolute top-[17px] left-[15px] rounded-md px-1.5 py-[3px] text-[11px] leading-none font-semibold whitespace-nowrap shadow-sm" style={{ background: ink, color: on }}>
        Slice
      </span>
    </div>
  );
});

/* Dots ------------------------------------------------------------------------------------ */

const GAP = 22;
/** Resting opacity of a dot away from the cursor. */
const BASE = 0.17;

/** A grid of dots in the brand's ink: brighter along the cursor's trail, rippling out from it. */
function DotField({ ink, motion, w, h, still }: { ink: string; motion: RefObject<Motion>; w: number; h: number; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = ink;
    const cols = Math.ceil(w / GAP);
    const rows = Math.ceil(h / GAP);
    const ox = (w - (cols - 1) * GAP) / 2;
    const oy = (h - (rows - 1) * GAP) / 2;
    let raf = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      const m = motion.current;
      const trail = m.trail;
      const t = now / 1000;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = ox + i * GAP;
          const y = oy + j * GAP;
          let a = BASE;
          if (!still) {
            // The trail: a soft wake where the cursor has been, fading over ~1.4s.
            for (let k = trail.length - 1; k >= 0; k -= 2) {
              const p = trail[k];
              const dx = x - p.x;
              const dy = y - p.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > 26000) continue;
              const age = 1 - (now - p.at) / 1400;
              a += 0.42 * age * Math.exp(-d2 / 5200);
            }
            // The ripple: rings moving out from the cursor.
            const d = Math.hypot(x - m.x, y - m.y);
            const ring = 0.5 + 0.5 * Math.cos(d / 24 - t * 3.2);
            a += 0.5 * Math.exp(-d / 150) * ring * ring;
          }
          a = Math.min(0.85, a);
          ctx.globalAlpha = a;
          const r = 1 + Math.min(1.1, (a - BASE) * 1.8);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ink, motion, w, h, still]);
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ width: w, height: h }} />;
}

/* The sketch -------------------------------------------------------------------------------- */

type SlotKind = "bar" | "strong" | "image" | "button" | "chip" | "face";

/** A component on the sketch, in percent of the board; faces are square (h from w). */
interface Slot {
  id: string;
  kind: SlotKind;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const WIDE: Slot[] = [
  { id: "logo", kind: "strong", name: "Logo", x: 0, y: 0, w: 12, h: 3.4 },
  { id: "nav1", kind: "bar", x: 52, y: 0.8, w: 7, h: 1.8 },
  { id: "nav2", kind: "bar", x: 61, y: 0.8, w: 7, h: 1.8 },
  { id: "nav3", kind: "bar", x: 70, y: 0.8, w: 6, h: 1.8 },
  { id: "navcta", kind: "button", x: 87, y: -0.9, w: 13, h: 5 },
  { id: "h1a", kind: "strong", name: "Headline", x: 0, y: 14, w: 42, h: 6 },
  { id: "h1b", kind: "strong", x: 0, y: 22, w: 30, h: 6 },
  { id: "p1", kind: "bar", x: 0, y: 32.5, w: 40, h: 2.2 },
  { id: "p2", kind: "bar", x: 0, y: 36.6, w: 32, h: 2.2 },
  { id: "cta", kind: "button", name: "Call to action", x: 0, y: 43.5, w: 17, h: 6.5 },
  { id: "hero", kind: "image", name: "Hero", x: 50, y: 11, w: 50, h: 42 },
  { id: "chip1", kind: "chip", name: "Taste", x: 0, y: 60, w: 15, h: 4.8 },
  { id: "chip2", kind: "chip", x: 16.5, y: 60, w: 14, h: 4.8 },
  { id: "chip3", kind: "chip", x: 32, y: 60, w: 16, h: 4.8 },
  { id: "face1", kind: "face", name: "Culture", x: 73.5, y: 59, w: 6, h: 0 },
  { id: "face2", kind: "face", x: 80.3, y: 59, w: 6, h: 0 },
  { id: "face3", kind: "face", x: 87.1, y: 59, w: 6, h: 0 },
  { id: "face4", kind: "face", x: 93.9, y: 59, w: 6, h: 0 },
  { id: "card1", kind: "image", name: "Card", x: 0, y: 70, w: 31, h: 22 },
  { id: "card1t", kind: "bar", x: 0, y: 95, w: 20, h: 2.2 },
  { id: "card2", kind: "image", x: 34.5, y: 70, w: 31, h: 22 },
  { id: "card2t", kind: "bar", x: 34.5, y: 95, w: 16, h: 2.2 },
  { id: "card3", kind: "image", x: 69, y: 70, w: 31, h: 22 },
  { id: "card3t", kind: "bar", x: 69, y: 95, w: 22, h: 2.2 },
];

const NARROW: Slot[] = [
  { id: "logo", kind: "strong", name: "Logo", x: 0, y: 0, w: 28, h: 2.6 },
  { id: "nav1", kind: "bar", x: 82, y: 0.4, w: 18, h: 1.8 },
  { id: "h1a", kind: "strong", name: "Headline", x: 0, y: 9, w: 94, h: 4.4 },
  { id: "h1b", kind: "strong", x: 0, y: 14.6, w: 68, h: 4.4 },
  { id: "p1", kind: "bar", x: 0, y: 21.6, w: 88, h: 1.6 },
  { id: "p2", kind: "bar", x: 0, y: 24.6, w: 66, h: 1.6 },
  { id: "cta", kind: "button", name: "Call to action", x: 0, y: 29, w: 46, h: 4.8 },
  { id: "hero", kind: "image", name: "Hero", x: 0, y: 37.5, w: 100, h: 25 },
  { id: "chip1", kind: "chip", name: "Taste", x: 0, y: 66, w: 31, h: 3.6 },
  { id: "chip2", kind: "chip", x: 34, y: 66, w: 29, h: 3.6 },
  { id: "chip3", kind: "chip", x: 66, y: 66, w: 34, h: 3.6 },
  { id: "card1", kind: "image", name: "Card", x: 0, y: 73, w: 48, h: 17 },
  { id: "card1t", kind: "bar", x: 0, y: 92.4, w: 34, h: 1.6 },
  { id: "card2", kind: "image", x: 52, y: 73, w: 48, h: 17 },
  { id: "card2t", kind: "bar", x: 52, y: 92.4, w: 30, h: 1.6 },
];

const HERO_TEXT = new Set(["h1a", "h1b", "p1", "p2", "cta"]);

/** The board's slots in pixels; every other sketch puts the hero image on the left. */
function layout(w: number, h: number, round: number) {
  const narrow = w < 520;
  const mx = narrow ? 22 : Math.max(28, w * 0.07);
  const my = narrow ? 26 : Math.max(28, h * 0.09);
  const bw = w - mx * 2;
  const bh = h - my * 2;
  const flip = !narrow && round % 2 === 1;
  return (narrow ? NARROW : WIDE).map((s) => {
    let x = s.x;
    if (flip && s.id === "hero") x = 0;
    if (flip && HERO_TEXT.has(s.id)) x = s.x + 56;
    const pw = (s.w / 100) * bw;
    const ph = s.kind === "face" ? pw : (s.h / 100) * bh;
    return { ...s, px: mx + (x / 100) * bw, py: my + (s.y / 100) * bh, pw, ph };
  });
}

type Placed = ReturnType<typeof layout>[number];

const IMAGE_SLOTS = ["hero", "card1", "card2", "card3"];
const FACE_SLOTS = ["face1", "face2", "face3", "face4"];
const CHIP_SLOTS = ["chip1", "chip2", "chip3"];
const contentKind = (s: Slot) => (IMAGE_SLOTS.includes(s.id) ? "images" : FACE_SLOTS.includes(s.id) ? "faces" : CHIP_SLOTS.includes(s.id) ? "chips" : null);

interface Stock {
  images: string[];
  faces: { name: string; image: string }[];
  chips: string[];
}

/** What a slot holds after `fills` drops: the next ingredient of its kind, in turn. */
function contentOf(slot: Slot, fills: number, stock: Stock): string | null {
  const kind = contentKind(slot);
  if (!kind || fills <= 0) return null;
  const list = kind === "faces" ? stock.faces.map((f) => f.image) : stock[kind];
  if (!list.length) return null;
  const order = kind === "images" ? IMAGE_SLOTS : kind === "faces" ? FACE_SLOTS : CHIP_SLOTS;
  return list[(order.indexOf(slot.id) + (fills - 1) * order.length) % list.length];
}

function SlotView({ slot, ink, on, fill, drawing, viewRef }: { slot: Placed; ink: string; on: string; fill: string | null; drawing: boolean; viewRef?: RefObject<HTMLDivElement | null> }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style = { left: slot.px, top: slot.py, width: slot.pw, height: slot.ph };
  const radius = slot.kind === "face" ? "9999px" : slot.kind === "bar" || slot.kind === "strong" || slot.kind === "chip" || slot.kind === "button" ? "9999px" : "12px";
  if (drawing) {
    return (
      <div ref={viewRef} className="absolute" style={{ ...style, width: 0, height: slot.kind === "bar" || slot.kind === "strong" ? slot.ph : 0 }}>
        <div className="absolute inset-0" style={{ border: `1.5px solid ${ink}`, background: mix(ink, 7), borderRadius: slot.kind === "face" ? "9999px" : 4 }} />
        {[
          ["-left-[3px] -top-[3px]"],
          ["-right-[3px] -top-[3px]"],
          ["-left-[3px] -bottom-[3px]"],
          ["-right-[3px] -bottom-[3px]"],
        ].map(([pos]) => (
          <span key={pos} className={cn("absolute size-[6px] bg-white", pos)} style={{ border: `1.5px solid ${ink}` }} />
        ))}
        {slot.name && (
          <span className="absolute -top-[18px] left-0 text-[10px] leading-none font-medium whitespace-nowrap" style={{ color: ink }}>
            {slot.name}
          </span>
        )}
      </div>
    );
  }
  const base = "absolute overflow-hidden animate-in fade-in-0 zoom-in-[0.98] duration-300";
  if (slot.kind === "bar" || slot.kind === "strong") return <div className={base} style={{ ...style, borderRadius: radius, background: mix(ink, slot.kind === "strong" ? 30 : 16) }} />;
  if (slot.kind === "button") {
    return (
      <div className={cn(base, "flex items-center justify-center")} style={{ ...style, borderRadius: radius, background: ink }}>
        <span className="h-[18%] min-h-1 w-1/2 rounded-full" style={{ background: on, opacity: 0.75 }} />
      </div>
    );
  }
  if (slot.kind === "chip") {
    return (
      <div className={cn(base, "flex items-center justify-center px-2")} style={{ ...style, borderRadius: radius, border: `1.5px solid ${mix(ink, 45)}`, background: mix(ink, 6) }}>
        {fill ? (
          <span key={fill} className="truncate text-[11px] font-medium animate-in fade-in-0 duration-500" style={{ color: ink }}>
            {fill}
          </span>
        ) : (
          <span className="h-[22%] w-3/5 rounded-full" style={{ background: mix(ink, 22) }} />
        )}
      </div>
    );
  }
  const show = fill && broken !== fill;
  return (
    <div className={cn(base, "flex items-center justify-center")} style={{ ...style, borderRadius: radius, border: `1.5px solid ${mix(ink, 32)}`, background: mix(ink, 6) }}>
      {show ? (
        // Site, stock and Qloo photos: many hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={fill} src={fill} alt="" onError={() => setBroken(fill)} className="absolute inset-0 size-full object-cover animate-in fade-in-0 zoom-in-[1.04] duration-700" />
      ) : (
        slot.kind === "image" && <ImageIcon className="size-5" style={{ color: mix(ink, 45) }} />
      )}
    </div>
  );
}

/** The page's palette and type as its CSS streams in. */
function StyleTile({ draft, kit, ink, tileRef }: { draft: Draft; kit: BrandKit | null; ink: string; tileRef: RefObject<HTMLDivElement | null> }) {
  const colors = draftColors(draft.css, 10);
  const fonts = draftFonts(draft);
  const href = kit ? googleFontsHref(kit, fonts) : null;
  return (
    <div className="absolute bottom-16 left-1/2 z-20 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      {href && <link rel="stylesheet" href={href} />}
      <p className="text-xs font-medium" style={{ color: ink }}>
        Style
      </p>
      <div ref={tileRef} className="mt-2 flex min-h-8 flex-wrap gap-1.5">
        {colors.map((c) => (
          <span key={c} data-swatch="" className="size-8 rounded-lg ring-1 ring-foreground/10 animate-in zoom-in-50 duration-300" style={{ background: c }} />
        ))}
        {colors.length === 0 && <span className="pg-shimmer text-xs">Choosing colours</span>}
      </div>
      {fonts.length > 0 && (
        <div className="mt-3 flex gap-4 border-t pt-3">
          {fonts.map((f) => (
            <div key={f} className="min-w-0 animate-in fade-in-0 duration-500">
              <p className="text-2xl leading-none" style={{ fontFamily: `"${f}", system-ui` }}>
                Aa
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{f}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Action =
  | { kind: "draw"; slot: string }
  | { kind: "fill"; slot: string }
  | { kind: "visit"; x: number; y: number }
  | { kind: "wander"; x: number; y: number };

/**
 * Slice sketching the page: draws each component (move to its corner, drag
 * it out), fills photos, faces and words in as the agent finds them, keeps
 * swapping in new ones, and starts a fresh sketch now and then.
 */
function Sketch({ w, h, ink, on, cursor, stock, draft, kit, still }: { w: number; h: number; ink: string; on: string; cursor: RefObject<CursorApi | null>; stock: Stock; draft?: Draft | null; kit: BrandKit | null; still: boolean }) {
  const [round, setRound] = useState(0);
  const slots = useMemo(() => layout(w, h, round), [w, h, round]);
  const [drawn, setDrawn] = useState<Set<string>>(() => new Set());
  const [drawing, setDrawing] = useState<string | null>(null);
  const [fills, setFills] = useState<Record<string, number>>({});
  const [fading, setFading] = useState(false);
  const drawingRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  // The director reads the latest state without restarting.
  const live = useRef({ slots, drawn, fills, stock, swatches: 0 });
  useEffect(() => {
    live.current = { ...live.current, slots, drawn, fills, stock };
  }, [slots, drawn, fills, stock]);


  useEffect(() => {
    if (still || !w || !h) return;
    let raf = 0;
    let action: Action | null = null;
    let began = 0;
    let from = cursor.current?.at() ?? { x: w / 2, y: h / 2 };
    let completeAt = 0;
    let lastFill = 0;
    let drawingNow: string | null = null;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const out = (t: number) => 1 - (1 - t) ** 3;
    const find = (id: string) => live.current.slots.find((s) => s.id === id);

    const next = (now: number): Action | null => {
      const { slots, drawn, fills, stock } = live.current;
      // A new colour in the style tile: go and dab it.
      const sw = tileRef.current?.querySelectorAll("[data-swatch]");
      if (sw && sw.length > live.current.swatches) {
        live.current.swatches = sw.length;
        const r = sw[sw.length - 1].getBoundingClientRect();
        const box = tileRef.current?.closest("[data-stage]")?.getBoundingClientRect();
        if (box) return { kind: "visit", x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
      }
      const undrawn = slots.find((s) => !drawn.has(s.id));
      if (undrawn) return { kind: "draw", slot: undrawn.id };
      if (!completeAt) completeAt = now;
      const has = (s: Slot) => {
        const k = contentKind(s);
        return k === "faces" ? stock.faces.length > 0 : k ? stock[k].length > 0 : false;
      };
      // Something new to show where there is still a placeholder.
      const empty = slots.find((s) => contentKind(s) && !fills[s.id] && has(s));
      if (empty) return { kind: "fill", slot: empty.id };
      // A fresh sketch every so often.
      if (now - completeAt > 38000) return null;
      // Swap in the next photo, face or word.
      if (now - lastFill > 2600) {
        const options = slots.filter((s) => {
          const k = contentKind(s);
          if (!k || !has(s)) return false;
          const n = k === "faces" ? stock.faces.length : stock[k].length;
          const per = k === "images" ? IMAGE_SLOTS.length : k === "faces" ? FACE_SLOTS.length : CHIP_SLOTS.length;
          return n > per;
        });
        if (options.length) {
          lastFill = now;
          return { kind: "fill", slot: options[Math.floor(Math.random() * options.length)].id };
        }
      }
      const s = slots[Math.floor(Math.random() * slots.length)];
      return { kind: "wander", x: s.px + s.pw * (0.2 + Math.random() * 0.6), y: s.py + s.ph * (0.3 + Math.random() * 0.5) };
    };

    const frame = (now: number) => {
      const c = cursor.current;
      if (!action) {
        action = next(now);
        began = now;
        from = c?.at() ?? from;
        if (!action) {
          // Clear the board and sketch again.
          setFading(true);
          setTimeout(() => {
            setDrawn(new Set());
            setFills({});
            setRound((r) => r + 1);
            setFading(false);
            completeAt = 0;
          }, 500);
          action = { kind: "wander", x: w / 2, y: h * 0.45 };
        }
      }
      const p = now - began;
      if (action.kind === "draw") {
        const s = find(action.slot);
        if (!s) {
          action = null;
        } else {
          const flat = s.kind === "bar" || s.kind === "strong";
          const start = { x: s.px, y: flat ? s.py + s.ph / 2 : s.py };
          const end = { x: s.px + s.pw, y: flat ? s.py + s.ph / 2 : s.py + s.ph };
          const travel = Math.hypot(start.x - from.x, start.y - from.y);
          const moveMs = Math.min(850, 260 + travel * 0.9);
          const drawMs = flat ? Math.min(700, 260 + s.pw * 1.4) : Math.min(950, 380 + (s.pw + s.ph) * 0.9);
          if (p < moveMs) {
            const k = ease(p / moveMs);
            c?.to(from.x + (start.x - from.x) * k, from.y + (start.y - from.y) * k, 28);
          } else if (p < moveMs + drawMs) {
            if (drawingNow !== s.id) {
              drawingNow = s.id;
              setDrawing(s.id);
            }
            const k = out((p - moveMs) / drawMs);
            const x = start.x + (end.x - start.x) * k;
            const y = start.y + (end.y - start.y) * k;
            c?.to(x, y, 34);
            const v = drawingRef.current;
            if (v) {
              v.style.width = `${Math.max(2, x - s.px)}px`;
              if (!flat) v.style.height = `${Math.max(2, y - s.py)}px`;
            }
          } else {
            drawingNow = null;
            const id = s.id;
            setDrawing(null);
            setDrawn((d) => new Set(d).add(id));
            // Photos, faces and words go in as soon as the frame is drawn.
            if (contentKind(s)) setFills((f) => ({ ...f, [id]: Math.max(1, f[id] ?? 0) }));
            action = null;
          }
        }
      } else if (action.kind === "fill") {
        const s = find(action.slot);
        const target = s ? { x: s.px + s.pw * 0.55, y: s.py + s.ph * 0.55 } : from;
        const moveMs = Math.min(900, 320 + Math.hypot(target.x - from.x, target.y - from.y) * 0.9);
        if (p < moveMs) {
          const k = ease(p / moveMs);
          c?.to(from.x + (target.x - from.x) * k, from.y + (target.y - from.y) * k, 26);
        } else {
          c?.press();
          const id = action.slot;
          setFills((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
          action = { kind: "wander", x: target.x + 6, y: target.y + 4 };
          began = now + 380;
          from = target;
        }
      } else if (action.kind === "visit") {
        const t = { x: action.x, y: action.y };
        const moveMs = Math.min(800, 300 + Math.hypot(t.x - from.x, t.y - from.y) * 0.8);
        if (p < moveMs) {
          const k = ease(p / moveMs);
          c?.to(from.x + (t.x - from.x) * k, from.y + (t.y - from.y) * k, 26);
        } else {
          c?.press();
          action = { kind: "wander", x: t.x + 4, y: t.y + 3 };
          began = now + 300;
          from = t;
        }
      } else {
        const moveMs = 900;
        if (p >= 0) {
          const k = ease(Math.min(1, p / moveMs));
          c?.to(from.x + (action.x - from.x) * k, from.y + (action.y - from.y) * k, 20);
        }
        if (p > moveMs + 450) action = null;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still, w, h, cursor]);

  return (
    <>
      <div className={cn("absolute inset-0 transition-opacity duration-500", fading && "opacity-0")}>
        {slots.map((s) =>
          drawing === s.id ? (
            <SlotView key={`${round}-${s.id}`} slot={s} ink={ink} on={on} fill={null} drawing viewRef={drawingRef} />
          ) : still || drawn.has(s.id) ? (
            // Reduced motion: the finished sketch, still.
            <SlotView key={`${round}-${s.id}`} slot={s} ink={ink} on={on} fill={contentOf(s, still ? 1 : (fills[s.id] ?? 0), stock)} drawing={false} />
          ) : null,
        )}
      </div>
      {draft && !draft.html.trim() && <StyleTile draft={draft} kit={kit} ink={ink} tileRef={tileRef} />}
    </>
  );
}

/* The draft --------------------------------------------------------------------------------- */

/** The page as it is written, in /p/_draft; reports where the writing is so the cursor can follow. */
function DraftFrame({ kit, draft, cursor, settle }: { kit: BrandKit; draft: Draft; cursor: RefObject<CursorApi | null>; settle: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "pg:draft-ready") setReady(true);
      if (e.data?.type === "pg:draft-tip") cursor.current?.to(e.data.x + 2, e.data.y - 4, 7);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cursor]);

  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => frame.current?.contentWindow?.postMessage({ type: "pg:draft", kit, fonts: draft.fonts, css: draft.css, html: draft.html }, window.location.origin));
    return () => cancelAnimationFrame(id);
  }, [ready, kit, draft]);

  useEffect(() => {
    if (!ready || !settle) return;
    frame.current?.contentWindow?.postMessage({ type: "pg:draft-top" }, window.location.origin);
    // Done writing: the cursor drifts up with the page as it scrolls back to the top.
    const box = frame.current?.getBoundingClientRect();
    if (box) cursor.current?.to(box.width * 0.56, box.height * 0.3, 2.5);
  }, [ready, settle, cursor]);

  return <iframe ref={frame} src="/p/_draft" title="The page as it is written" className="absolute inset-0 size-full border-0 bg-background animate-in fade-in-0 duration-500" />;
}

/* Presence: over a page that exists ------------------------------------------------------------- */

function usePresence(on: boolean, w: number, h: number, cursor: RefObject<CursorApi | null>) {
  useEffect(() => {
    if (!on || !w || !h) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const hop = () => {
      if (stop) return;
      cursor.current?.to(w * (0.15 + Math.random() * 0.7), h * (0.12 + Math.random() * 0.72), 2.4 + Math.random());
      if (Math.random() < 0.35) setTimeout(() => cursor.current?.press(), 1100);
      timer = setTimeout(hop, 1500 + Math.random() * 1400);
    };
    hop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [on, w, h, cursor]);
}

/* The canvas ------------------------------------------------------------------------------------- */

/**
 * Covers the preview while the agent works. `sketch` hides whatever is there
 * (nothing yet, or the page being rebuilt); `draft` shows the page as it is
 * written; `presence` leaves the page visible with Slice moving over it.
 */
export function BuildCanvas({
  mode,
  brand,
  steps = [],
  draft,
  label,
  startedAt,
  scanning,
  settle = false,
  className,
}: {
  mode: CanvasMode;
  brand: Brand;
  steps?: Parameters<typeof ingredients>[0];
  draft?: Draft | null;
  /** What the agent is doing, for the pill. */
  label?: string | null;
  /** When the turn began, for the pill's clock. */
  startedAt?: number;
  /** The page is being reviewed: a scan line passes over it. */
  scanning?: boolean;
  /** write_page has landed: the draft scrolls back to the top before the page replaces it. */
  settle?: boolean;
  className?: string;
}) {
  const { ink, on } = useMemo(() => inkOf(brand), [brand]);
  const kit = kitOf(brand);
  const stage = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(stage);
  const motion = useRef<Motion>({ x: -60, y: -60, trail: [] });
  const cursor = useRef<CursorApi>(null);
  const reduced = useReducedMotion();
  const now = useNow(!!startedAt);
  const stockKey = JSON.stringify(ingredients(steps));
  const stock = useMemo(() => JSON.parse(stockKey) as Stock, [stockKey]);
  usePresence(mode === "presence" && !reduced, w, h, cursor);

  return (
    <div ref={stage} data-stage="" className={cn("pointer-events-none absolute inset-0 z-10 overflow-hidden", mode === "sketch" && "pointer-events-auto bg-background", className)}>
      {mode === "sketch" && w > 0 && (
        <>
          <DotField ink={ink} motion={motion} w={w} h={h} still={reduced} />
          <Sketch w={w} h={h} ink={ink} on={on} cursor={cursor} stock={stock} draft={draft} kit={kit} still={reduced} />
        </>
      )}
      {mode === "draft" && kit && draft && <DraftFrame kit={kit} draft={draft} cursor={cursor} settle={settle} />}
      {mode === "presence" && scanning && (
        <div aria-hidden className="absolute inset-x-0 top-0 h-24 animate-[pg-scan_2.6s_ease-in-out_infinite]" style={{ background: `linear-gradient(to bottom, transparent, ${mix(ink, 14)} 70%, ${mix(ink, 55)} 100%)` }} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-2 rounded-xl" style={{ boxShadow: `inset 0 0 0 1.5px ${mix(ink, mode === "presence" ? 55 : 70)}` }} />
      {!reduced && <SliceCursor ref={cursor} ink={ink} on={on} motion={motion} hidden={w === 0} />}
      {label && (
        <div className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3.5 py-1.5 text-xs shadow-sm backdrop-blur">
          <span className="pg-shimmer truncate">{label}</span>
          {startedAt !== undefined && <span className="num shrink-0 text-muted-foreground">{clock(now - startedAt)}</span>}
        </div>
      )}
    </div>
  );
}
