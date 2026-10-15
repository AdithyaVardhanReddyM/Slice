"use client";

import { useEffect, useImperativeHandle, useRef, type Ref, type RefObject } from "react";

export interface RippleFieldHandle {
  /** Drop a ripple at a viewport point; strength 0–1. */
  ripple: (x: number, y: number, strength?: number) => void;
}

/** Grid pitch and dot size, in CSS pixels. */
const PITCH = 12;
const DOT = 0.9;
const DOT_GROW = 0.75;
/** Colour steps a dot can take, drawn as one path each. */
const STEPS = 12;
/** Pointer ripples: ring speed (px/s), ring width (px), lifetime (s). */
const SPEED = 440;
const WIDTH = 30;
const LIFE = 2;
const MAX_RIPPLES = 14;

type Ripple = { x: number; y: number; t0: number; strength: number };

/** Neutral dot → amber → brand orange → deep orange, with alpha rising alongside. */
const STOPS: [number, number, number, number, number][] = [
  [0, 87, 83, 78, 0.16],
  [0.35, 255, 191, 0, 0.55],
  [0.7, 255, 121, 0, 0.85],
  [1, 234, 88, 12, 1],
];

function colourAt(i: number) {
  let k = 1;
  while (k < STOPS.length - 1 && STOPS[k][0] < i) k++;
  const [p0, r0, g0, b0, a0] = STOPS[k - 1];
  const [p1, r1, g1, b1, a1] = STOPS[k];
  const t = Math.min(1, Math.max(0, (i - p0) / (p1 - p0)));
  const mix = (a: number, b: number) => a + (b - a) * t;
  return `rgba(${Math.round(mix(r0, r1))},${Math.round(mix(g0, g1))},${Math.round(mix(b0, b1))},${mix(a0, a1).toFixed(3)})`;
}

const PALETTE = Array.from({ length: STEPS }, (_, s) => colourAt(s / (STEPS - 1)));

/**
 * A dot matrix behind the console home with orange ripples running through
 * it: slow rings spreading from the middle of `anchor` (the viewport's middle
 * without one), a long swell that bends them, raindrops now and then, and a
 * ripple wherever the pointer goes or clicks.
 */
export function RippleField({
  ref,
  anchor,
}: {
  ref?: Ref<RippleFieldHandle>;
  anchor?: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripples = useRef<Ripple[]>([]);
  const clock = useRef<() => number>(() => 0);

  useImperativeHandle(
    ref,
    () => ({
      ripple(x, y, strength = 0.8) {
        const list = ripples.current;
        list.push({ x, y, t0: clock.current(), strength });
        if (list.length > MAX_RIPPLES) list.shift();
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    clock.current = () => (performance.now() - start) / 1000;

    let w = 0;
    let h = 0;
    let sx = 0;
    let sy = 0;
    let cols = 0;
    let rows = 0;
    let ox = 0;
    let oy = 0;
    let level = new Uint8Array(0);
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let pr = new Float32Array(0);

    const place = () => {
      const box = anchor?.current?.getBoundingClientRect();
      sx = box ? box.left + box.width / 2 : w / 2;
      sy = box ? box.top + box.height / 2 : h / 2;
    };

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / PITCH) + 1;
      rows = Math.ceil(h / PITCH) + 1;
      // Centre the grid so the margins match on both sides.
      ox = (w - (cols - 1) * PITCH) / 2;
      oy = (h - (rows - 1) * PITCH) / 2;
      const n = cols * rows;
      level = new Uint8Array(n);
      px = new Float32Array(n);
      py = new Float32Array(n);
      pr = new Float32Array(n);
      place();
    };

    const draw = (t: number) => {
      // The ambient rings quieten in a band along the top, under the nav.
      const fadeTop = h * 0.04;
      const fadeSpan = h * 0.22;
      const list = ripples.current;
      for (let k = list.length - 1; k >= 0; k--) {
        if (t - list[k].t0 > LIFE) list.splice(k, 1);
      }

      let n = 0;
      for (let r = 0; r < rows; r++) {
        const y = oy + r * PITCH;
        const lift = Math.min(1, Math.max(0, (y - fadeTop) / fadeSpan));
        const fade = lift * lift * (3 - 2 * lift);
        for (let c = 0; c < cols; c++, n++) {
          const x = ox + c * PITCH;
          const dx = x - sx;
          const dy = y - sy;
          const d = Math.sqrt(dx * dx + dy * dy);
          // A long diagonal swell bends the rings so they read as water, not a target.
          const swell = Math.sin(x * 0.0038 + y * 0.0055 - t * 0.4);
          const phase = d / 170 - t * 0.5 + swell * 0.5;
          const crest = ((1 + Math.sin(phase * Math.PI * 2)) / 2) ** 2.2;
          let i = 1.3 * crest * (0.75 + 0.25 * swell) * (0.4 + 0.6 * fade) * Math.exp(-d / (h * 2.2));
          // Dots ride the wave a little, out from the source on the crest.
          let shift = Math.cos(phase * Math.PI * 2) * 1.6 * fade;
          let ux = d > 0 ? dx / d : 0;
          let uy = d > 0 ? dy / d : 0;

          for (const rp of list) {
            const age = t - rp.t0;
            const rx = x - rp.x;
            const ry = y - rp.y;
            const rd = Math.sqrt(rx * rx + ry * ry);
            const off = (rd - age * SPEED) / WIDTH;
            if (off < -3 || off > 3) continue;
            const life = (1 - age / LIFE) ** 1.6;
            const v = Math.exp(-off * off) * rp.strength * life;
            if (v > i) {
              shift = -off * 2.4 * life;
              ux = rd > 0 ? rx / rd : 0;
              uy = rd > 0 ? ry / rd : 0;
            }
            i += v * 0.9;
          }

          if (i > 1) i = 1;
          level[n] = Math.round(i * (STEPS - 1));
          px[n] = x + ux * shift;
          py[n] = y + uy * shift;
          pr[n] = DOT + i * DOT_GROW;
        }
      }

      ctx.clearRect(0, 0, w, h);
      for (let s = 0; s < STEPS; s++) {
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          if (level[k] !== s) continue;
          ctx.moveTo(px[k] + pr[k], py[k]);
          ctx.arc(px[k], py[k], pr[k], 0, Math.PI * 2);
        }
        ctx.fillStyle = PALETTE[s];
        ctx.fill();
      }
    };

    layout();
    draw(still ? 0.4 : 0);
    if (still) {
      const redraw = () => {
        layout();
        draw(0.4);
      };
      window.addEventListener("resize", redraw);
      return () => window.removeEventListener("resize", redraw);
    }

    let frame = 0;
    let nextDrop = 2.5;
    const tick = () => {
      const t = clock.current();
      // A raindrop now and then, out at the sides where it won't sit behind the cards' text.
      if (t > nextDrop) {
        const side = Math.random() < 0.5 ? 0.04 + Math.random() * 0.2 : 0.76 + Math.random() * 0.2;
        ripples.current.push({
          x: w * side,
          y: h * (0.35 + Math.random() * 0.55),
          t0: t,
          strength: 0.55,
        });
        nextDrop = t + 3.5 + Math.random() * 3;
      }
      draw(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Pointer: a soft ripple every so often while it moves, a full one on press.
    let last = { x: -1e4, y: -1e4 };
    const push = (x: number, y: number, strength: number) => {
      const list = ripples.current;
      list.push({ x, y, t0: clock.current(), strength });
      if (list.length > MAX_RIPPLES) list.shift();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 140) return;
      last = { x: e.clientX, y: e.clientY };
      push(e.clientX, e.clientY, 0.35);
    };
    const onDown = (e: PointerEvent) => push(e.clientX, e.clientY, 1);

    window.addEventListener("resize", layout);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", layout);
      window.removeEventListener("scroll", place);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [anchor]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full"
    />
  );
}
