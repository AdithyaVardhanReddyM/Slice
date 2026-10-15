"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/*
 * The sign-in art: a figure lit by a beam of light under a spinning halo,
 * standing over rippling ground, drawn as particles in the brand colours. The
 * halo spins up while someone types, a submit sends a ripple through the
 * scene, and the cursor pushes particles aside.
 */

// A ramp through the brand oranges into "Freshly squeezed" yellow, plus sand.
const RAMP_STOPS: [number, string][] = [
  [0, "#9a3412"],
  [0.22, "#c2410c"],
  [0.42, "#ea580c"],
  [0.6, "#FF7900"],
  [0.8, "#FFBF00"],
  [1, "#FFE642"],
];
const RAMP_STEPS = 16;
const COLORS = [...buildRamp(), "#F2CF7E"];
const SAND = COLORS.length - 1;

function buildRamp() {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Array.from({ length: RAMP_STEPS }, (_, i) => {
    const t = i / (RAMP_STEPS - 1);
    let k = 1;
    while (k < RAMP_STOPS.length - 1 && RAMP_STOPS[k][0] < t) k++;
    const [t0, c0] = RAMP_STOPS[k - 1];
    const [t1, c1] = RAMP_STOPS[k];
    const u = (t - t0) / (t1 - t0);
    const a = rgb(c0);
    const b = rgb(c1);
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * u)).join(",")})`;
  });
}

/** Ramp colour for 0 (deep orange) to 1 (yellow). */
function ramp(t: number) {
  return Math.round(Math.max(0, Math.min(1, t)) * (RAMP_STEPS - 1));
}

// Particle kinds, and what their a–e params hold.
const BEAM = 0; // a x, c end (fraction of the way to BEAM_END), d speed, e progress
const DRIP = 1; // a x, d speed, e progress
const HALO = 2; // a angle, b radius factor, c y jitter
const ORBIT = 3; // a angle, b radius factor, c y jitter
const BODY = 4; // a x, b y
const FLOOR = 5; // a angle, b radius (or ripple phase), c y jitter, d 1 when rippling
const DUST = 6; // a x, b y, c dx, d dy (scene units, per second for c and d)

// Layout in scene units, where the scene is the panel height unless the panel is narrow.
const RING = { y: 0.5, rx: 0.165, ry: 0.05 };
const FIGURE = { top: 0.515, height: 0.27 }; // the silhouette is drawn 100 units tall
const GROUND = { y: 0.86, rx: 0.25, ry: 0.032 };
const BEAM_END = 0.42;
const PULSE_ORIGIN = 0.65;

// Spring that pulls displaced particles home, and the cursor's push.
const K = 22;
const DAMP = 7;
const PUSH = 900;

type Seed = {
  kind: number;
  color: number;
  size: number;
  alpha: number;
  a: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  ox?: number;
  oy?: number;
};

type Field = {
  n: number;
  kind: Uint8Array;
  size: Float32Array;
  alpha: Float32Array;
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  d: Float32Array;
  e: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Particles are sorted by colour; groups[c] is where colour c starts. */
  groups: number[];
};

function gauss() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function beamX() {
  return Math.max(-0.17, Math.min(0.17, gauss() * 0.05));
}

/** A standing figure, 100 units tall, centred on x = 0. */
function drawSilhouette(g: CanvasRenderingContext2D) {
  const poly = (pts: number[]) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
    g.stroke();
  };
  const oval = (x: number, y: number, rx: number, ry: number) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  oval(0, 6.4, 4.7, 5.9);
  poly([-2, 11, 2, 11, 2.4, 16, -2.4, 16]);
  poly([
    -2.6, 15.2, -9, 16.6, -11.2, 19.2, -10.6, 30, -8.2, 40, -7.6, 45, -8.8, 52,
    8.8, 52, 7.6, 45, 8.2, 40, 10.6, 30, 11.2, 19.2, 9, 16.6, 2.6, 15.2,
  ]);
  for (const s of [-1, 1]) {
    poly([
      s * 9.6, 17, s * 12.4, 19, s * 14.2, 32, s * 15, 45, s * 14.6, 51.5,
      s * 12.6, 52, s * 12.2, 45, s * 11.4, 33, s * 10.6, 26,
    ]);
    oval(s * 13.6, 53, 1.6, 2.4);
    poly([
      s * 0.6, 50, s * 8.8, 50, s * 7.8, 62, s * 6.4, 76, s * 5.2, 95,
      s * 2.2, 95, s * 1.6, 76, s * 1, 62,
    ]);
    oval(s * 3.9, 96.6, 2.8, 1.6);
  }
}

/** Points inside the silhouette with how far each sits from its edge (0 on it, 1 deep inside). */
function sampleSilhouette(count: number) {
  const scale = 5;
  const w = 200;
  const h = 515;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return [];
  g.setTransform(scale, 0, 0, scale, w / 2, scale * 1.5);
  g.fillStyle = g.strokeStyle = "#000";
  g.lineWidth = 1.2;
  g.lineJoin = "round";
  drawSilhouette(g);
  const data = g.getImageData(0, 0, w, h).data;
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && data[((y | 0) * w + (x | 0)) * 4 + 3] > 127;

  const points: { x: number; y: number; depth: number }[] = [];
  for (let tries = 0; points.length < count && tries < count * 80; tries++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    if (!inside(px, py)) continue;
    let depth = 1;
    for (let r = 1; r <= 3 && depth === 1; r++) {
      for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4;
        if (!inside(px + Math.cos(angle) * r * scale, py + Math.sin(angle) * r * scale)) {
          depth = (r - 1) / 3;
          break;
        }
      }
    }
    // Denser along the edge so the outline reads.
    if (Math.random() > 0.35 + 0.65 * (1 - depth)) continue;
    points.push({ x: (px - w / 2) / scale, y: (py - scale * 1.5) / scale, depth });
  }
  return points;
}

function buildField(sceneSize: number, settled: boolean): Field {
  const q = Math.max(0.5, Math.min(1.4, (sceneSize / 900) ** 2));
  const count = (n: number) => Math.round(n * q);
  const scatter = () => {
    if (settled) return {};
    const angle = Math.random() * Math.PI * 2;
    const r = (0.05 + Math.random() * 0.25) * sceneSize;
    return { ox: Math.cos(angle) * r, oy: Math.sin(angle) * r };
  };
  const seeds: Seed[] = [];

  // The beam: a saturated core that pales to yellow at its edges.
  for (let i = 0; i < count(3200); i++) {
    const x = beamX();
    const edge = Math.min(1, Math.abs(x) / 0.12);
    seeds.push({
      kind: BEAM,
      color: ramp(0.66 + edge * 0.3 + gauss() * 0.06),
      size: 1 + Math.random() * 0.6,
      alpha: (0.45 + Math.random() * 0.5) * (1 - edge * 0.45),
      a: x,
      c: Math.random() ** 0.55,
      d: 0.05 + Math.random() * 0.06,
      e: Math.random(),
    });
  }

  for (let i = 0; i < count(120); i++) {
    seeds.push({
      kind: DRIP,
      color: ramp(0.55 + Math.random() * 0.25),
      size: 1.1 + Math.random() * 0.4,
      alpha: 0.5 + Math.random() * 0.4,
      a: gauss() * 0.003,
      d: 0.025 + Math.random() * 0.025,
      e: Math.random(),
    });
  }

  for (let i = 0; i < count(1800); i++) {
    const stray = Math.random() < 0.08;
    seeds.push({
      kind: HALO,
      color: ramp(0.45 + Math.random() * 0.3),
      size: 1.3 + Math.random() * 0.5,
      alpha: stray ? 0.25 + Math.random() * 0.3 : 0.65 + Math.random() * 0.35,
      a: Math.random() * Math.PI * 2,
      b: 1 + gauss() * (stray ? 0.08 : 0.018),
      c: gauss() * 0.004,
      ...scatter(),
    });
  }

  for (let i = 0; i < count(600); i++) {
    seeds.push({
      kind: ORBIT,
      color: ramp(0.7 + Math.random() * 0.15),
      size: 1.1 + Math.random() * 0.4,
      alpha: 0.3 + Math.random() * 0.35,
      a: Math.random() * Math.PI * 2,
      b: 1 + gauss() * 0.012,
      c: gauss() * 0.003,
      ...scatter(),
    });
  }

  // The figure, lit from above by the beam: bright head and shoulders, deep edges and feet.
  const unit = FIGURE.height / 100;
  for (const p of sampleSilhouette(count(3600))) {
    const lit = 1 - p.y / 100;
    seeds.push({
      kind: BODY,
      color: ramp(0.1 + 0.4 * lit + 0.28 * p.depth + gauss() * 0.07),
      size: 1.3 + Math.random() * 0.4,
      alpha: Math.min(1, 0.62 + 0.35 * (1 - p.depth) + Math.random() * 0.1),
      a: p.x * unit,
      b: FIGURE.top + p.y * unit,
      ...scatter(),
    });
  }

  // The ground: a soft disc with ripples running out from under the figure.
  for (let i = 0; i < count(2400); i++) {
    const ripple = i % 3 !== 0;
    const radius = ripple
      ? (Math.floor(Math.random() * 5) / 5 + gauss() * 0.022 + 1) % 1
      : Math.sqrt(Math.random()) * 0.85;
    seeds.push({
      kind: FLOOR,
      color: ripple
        ? ramp(0.55 + Math.random() * 0.3)
        : Math.random() < 0.4
          ? SAND
          : ramp(0.6 + radius * 0.3 + gauss() * 0.05),
      size: 1.1 + Math.random() * 0.5,
      alpha: ripple ? 0.4 + Math.random() * 0.4 : 0.35 + Math.random() * 0.35,
      a: Math.random() * Math.PI * 2,
      b: radius,
      c: gauss() * 0.0025,
      d: ripple ? 1 : 0,
      ...scatter(),
    });
  }

  // Motes hanging in the light around the scene.
  for (let i = 0; i < count(260); i++) {
    const x = gauss() * 0.4;
    const y = 0.5 + gauss() * 0.3;
    seeds.push({
      kind: DUST,
      color: Math.random() < 0.5 ? SAND : ramp(0.75 + Math.random() * 0.2),
      size: 1.1,
      alpha: (0.2 + Math.random() * 0.3) * Math.exp(-(x * x) / 0.12),
      a: x,
      b: y,
      c: (Math.random() - 0.5) * 0.006,
      d: -0.004 - Math.random() * 0.008,
    });
  }

  seeds.sort((x, y) => x.color - y.color);
  const n = seeds.length;
  const field: Field = {
    n,
    kind: new Uint8Array(n),
    size: new Float32Array(n),
    alpha: new Float32Array(n),
    a: new Float32Array(n),
    b: new Float32Array(n),
    c: new Float32Array(n),
    d: new Float32Array(n),
    e: new Float32Array(n),
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    groups: COLORS.map(() => n),
  };
  seeds.forEach((s, i) => {
    field.kind[i] = s.kind;
    field.size[i] = s.size;
    field.alpha[i] = s.alpha;
    field.a[i] = s.a;
    field.b[i] = s.b ?? 0;
    field.c[i] = s.c ?? 0;
    field.d[i] = s.d ?? 0;
    field.e[i] = s.e ?? 0;
    field.ox[i] = s.ox ?? 0;
    field.oy[i] = s.oy ?? 0;
    field.groups[s.color] = Math.min(field.groups[s.color], i);
  });
  // Empty colours start where the next one does.
  for (let c = COLORS.length - 2; c >= 0; c--) {
    field.groups[c] = Math.min(field.groups[c], field.groups[c + 1]);
  }
  return field;
}

export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let field: Field | null = null;
    let width = 0;
    let height = 0;
    let cx = 0;
    let scene = 0;
    let top = 0;
    let frame = 0;
    let last = 0;
    let time = 0;
    let impulse = 0;
    let ringAngle = 0;
    let orbitAngle = 0;
    let groundAngle = 0;
    let pointer: { x: number; y: number } | null = null;
    const pulses: number[] = [];

    const step = (dt: number) => {
      if (!field) return;
      const f = field;
      time += dt;
      impulse *= Math.exp(-dt * 2.2);
      ringAngle += (0.16 + impulse * 1.4) * dt;
      orbitAngle -= (0.08 + impulse * 0.6) * dt;
      groundAngle += 0.035 * dt;
      for (let p = pulses.length - 1; p >= 0; p--) {
        pulses[p] += dt;
        if (pulses[p] > 1.2) pulses.splice(p, 1);
      }

      const beamStart = -top / scene - 0.02;
      const feet = FIGURE.top + FIGURE.height;
      const jitter = 0.35 + impulse * 2.5;
      const ringScale = 1 + impulse * 0.06;
      const glow = 1 + impulse * 0.25;
      const ripple = time * 0.045;
      const pulseY = top + PULSE_ORIGIN * scene;
      const reach = 0.08 * scene;
      const band = 0.05 * scene;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = canvas.width / width;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // A faint warm light where the beam meets the halo.
      const lightY = top + RING.y * scene;
      const light = ctx.createRadialGradient(cx, lightY, 0, cx, lightY, scene * 0.3);
      light.addColorStop(0, `rgba(255, 191, 0, ${0.06 + impulse * 0.05})`);
      light.addColorStop(1, "rgba(255, 191, 0, 0)");
      ctx.fillStyle = light;
      ctx.fillRect(cx - scene * 0.3, lightY - scene * 0.3, scene * 0.6, scene * 0.6);

      for (let color = 0; color < COLORS.length; color++) {
        const end = color + 1 < COLORS.length ? f.groups[color + 1] : f.n;
        if (f.groups[color] >= end) continue;
        ctx.fillStyle = COLORS[color];
        for (let i = f.groups[color]; i < end; i++) {
          const phase = (i * 2.399) % (Math.PI * 2);
          let hx = 0;
          let hy = 0;
          let alpha = f.alpha[i];

          switch (f.kind[i]) {
            case BEAM: {
              const stop = beamStart + (BEAM_END - beamStart) * f.c[i];
              let t = f.e[i] + (f.d[i] * dt * (1 + impulse * 2)) / (stop - beamStart);
              if (t >= 1) {
                t -= 1;
                f.a[i] = beamX();
              }
              f.e[i] = t;
              hx = cx + (f.a[i] * (1 + 0.25 * t) + Math.sin(time * 0.8 + phase) * 0.003) * scene;
              hy = top + (beamStart + (stop - beamStart) * t) * scene;
              alpha *= Math.min(1, t / 0.08) * (1 - t * t) * glow;
              break;
            }
            case DRIP: {
              let t = f.e[i] + (f.d[i] * dt) / (GROUND.y - feet);
              if (t >= 1) t -= 1;
              f.e[i] = t;
              hx = cx + f.a[i] * scene;
              hy = top + (feet + (GROUND.y - feet) * t) * scene;
              alpha *= Math.min(1, t / 0.15) * (1 - t);
              break;
            }
            case HALO:
            case ORBIT: {
              const halo = f.kind[i] === HALO;
              const angle = f.a[i] + (halo ? ringAngle : orbitAngle);
              const r = f.b[i] * ringScale;
              const sin = Math.sin(angle);
              const rx = halo ? RING.rx : RING.rx * 1.32;
              const ry = halo ? RING.ry : RING.ry * 1.7;
              hx = cx + Math.cos(angle) * rx * r * scene + Math.sin(time * 2 + phase) * jitter * 0.5;
              hy = top + (RING.y + sin * ry * r + f.c[i]) * scene;
              alpha *= (sin < 0 ? 0.5 : 1) * glow;
              break;
            }
            case BODY: {
              hx = cx + f.a[i] * scene + Math.sin(time * 1.7 + phase) * jitter;
              hy = top + f.b[i] * scene + Math.cos(time * 1.3 + phase) * jitter;
              alpha *= (0.85 + 0.15 * Math.sin(time * 2.3 + phase)) * glow;
              break;
            }
            case FLOOR: {
              const angle = f.a[i] + groundAngle;
              let r = f.b[i];
              if (f.d[i]) {
                const t = (r + ripple) % 1;
                r = 0.1 + t;
                alpha *= Math.sin(Math.PI * t);
              } else {
                alpha *= 0.8 + 0.2 * Math.sin(time * 1.1 + phase);
              }
              hx = cx + Math.cos(angle) * GROUND.rx * r * scene;
              hy = top + (GROUND.y + Math.sin(angle) * GROUND.ry * r + f.c[i]) * scene;
              break;
            }
            case DUST: {
              f.a[i] += f.c[i] * dt;
              f.b[i] += f.d[i] * dt;
              if (f.b[i] < -0.05) {
                f.b[i] = 1.05;
                f.a[i] = gauss() * 0.4;
              }
              hx = cx + f.a[i] * scene;
              hy = top + f.b[i] * scene;
              alpha *= 0.6 + 0.4 * Math.sin(time + phase);
              break;
            }
          }

          if (dt > 0) {
            let fx = -K * f.ox[i] - DAMP * f.vx[i];
            let fy = -K * f.oy[i] - DAMP * f.vy[i];
            const x = hx + f.ox[i];
            const y = hy + f.oy[i];
            if (pointer) {
              const dx = x - pointer.x;
              const dy = y - pointer.y;
              const d = Math.hypot(dx, dy);
              if (d < reach && d > 0.1) {
                const push = (1 - d / reach) ** 2 * PUSH;
                fx += (dx / d) * push;
                fy += (dy / d) * push;
              }
            }
            for (const age of pulses) {
              const dx = x - cx;
              const dy = y - pulseY;
              const d = Math.hypot(dx, dy);
              const gap = Math.abs(d - age * 1.1 * scene);
              if (gap < band && d > 0.1) {
                const push = (1 - gap / band) * 4000 * (1 - age / 1.2);
                fx += (dx / d) * push;
                fy += (dy / d) * push;
              }
            }
            f.vx[i] += fx * dt;
            f.vy[i] += fy * dt;
            f.ox[i] += f.vx[i] * dt;
            f.oy[i] += f.vy[i] * dt;
          }

          const s = f.size[i];
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.fillRect(hx + f.ox[i] - s / 2, hy + f.oy[i] - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 0;
      last = now;
      step(dt);
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) {
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      cx = width / 2;
      scene = Math.min(height, width / 0.62);
      top = (height - scene) / 2;
      field ??= buildField(scene, reduced);
      if (reduced) {
        step(0);
      } else if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
      canvas.style.opacity = "1";
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // On the window, so the wordmark sitting over the canvas doesn't swallow moves.
    const onPointerMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.length === 1 || e.key === "Backspace") {
        impulse = Math.min(1, impulse + 0.25);
      }
    };
    const onSubmit = () => {
      impulse = 1;
      pulses.push(0);
    };

    if (!reduced) {
      window.addEventListener("pointermove", onPointerMove);
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("submit", onSubmit, true);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("size-full opacity-0 transition-opacity duration-1000", className)}
    />
  );
}
