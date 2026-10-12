"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { HEAT_STOPS } from "./colors";

// Draws the click map and the scroll-reach map INSIDE the preview iframe's
// document (it is same-origin: /p/{brand}/{page}?preview=1), positioned in
// document coordinates. The layer therefore scrolls with the page for free;
// an overlay on top of the iframe would have to mirror the iframe's scroll and
// layout, which is what made the old heat map drift.
//
// Click positions are stored per section (x, y in 0..1 of the section's box),
// so they land on the right element at any width the page is rendered at.

export type HeatMode = "clicks" | "reach";

export interface HeatPoint {
  sectionId: string;
  x: number;
  y: number;
}

export interface ReachRow {
  id: string;
  /** Share of sessions that saw this section, 0..1. */
  reach: number;
}

const LAYER_ID = "slice-heat-layer";
/** Canvas resolution relative to the document; the blobs are soft, so half is plenty. */
const SCALE = 0.5;
/** Blob radius in document pixels. */
const RADIUS = 30;

const LAYER_CSS = `
:host { all: initial; }
.veil { position: absolute; inset: 0; background: rgba(12, 10, 9, 0.42); transition: opacity .2s; }
canvas { position: absolute; top: 0; left: 0; }
.band { position: absolute; left: 0; right: 0; box-sizing: border-box; border-top: 1px dashed rgba(255,255,255,.55); transition: background-color .2s; }
.band:first-child { border-top: 0; }
.pill { position: absolute; top: 16px; left: 24px; display: inline-flex; align-items: baseline; gap: 8px; padding: 8px 16px;
  border-radius: 999px; background: rgba(17, 17, 17, 0.88); color: #fff; white-space: nowrap;
  font: 500 20px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; letter-spacing: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,.25); backdrop-filter: blur(6px); }
.pill b { font-weight: 600; font-variant-numeric: tabular-nums; }
.pill span { opacity: .7; }
.focus { position: absolute; left: 4px; right: 4px; box-sizing: border-box; border-radius: 10px; border: 2px solid #ea580c;
  box-shadow: 0 0 0 5px rgba(234, 88, 12, 0.18); pointer-events: none; transition: top .2s, height .2s; }
`;

/** 256-entry RGBA lookup from transparent through the heat stops. */
function palette(): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [at, color] of HEAT_STOPS) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

let lut: Uint8ClampedArray | null = null;

function drawHeat(canvas: HTMLCanvasElement, points: { x: number; y: number }[]) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points.length) return;
  // Accumulate density as alpha, then colour it through the palette.
  const r = RADIUS * SCALE;
  const alpha = Math.min(0.35, Math.max(0.05, 2.4 / Math.sqrt(points.length)));
  for (const p of points) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let max = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > max) max = px[i];
  if (!max) return;
  lut ??= palette();
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (!a) continue;
    // Normalised so the hottest spot always reads as the top of the scale.
    const t = Math.min(255, Math.round((a / max) * 255));
    px[i] = lut[t * 4];
    px[i + 1] = lut[t * 4 + 1];
    px[i + 2] = lut[t * 4 + 2];
    // Fade the faint edges out entirely so lone clicks read as a soft glow, not a disc.
    px[i + 3] = t < 6 ? 0 : Math.min(230, Math.round(t * 1.15));
  }
  ctx.putImageData(img, 0, 0);
}

export function useHeatLayer({
  frame,
  mode,
  points,
  reach,
  focus,
  onSelect,
  onInView,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  mode: HeatMode;
  points: HeatPoint[];
  reach: ReachRow[];
  /** Section outlined because the merchant points at it in the list. */
  focus: string | null;
  onSelect: (id: string) => void;
  /** The section at the top of the viewport changed because the page was scrolled. */
  onInView: (id: string) => void;
}) {
  const state = useRef({ mode, points, reach, focus, onSelect, onInView, lockUntil: 0 });
  useEffect(() => {
    Object.assign(state.current, { mode, points, reach, focus, onSelect, onInView });
  });
  const api = useRef<{ draw: () => void; win: Window; doc: Document } | null>(null);

  const attach = useCallback(() => {
    const iframe = frame.current;
    const win = iframe?.contentWindow;
    const doc = iframe?.contentDocument;
    if (!iframe || !win || !doc?.body) return () => {};

    // Links and buttons must not navigate the preview away.
    const style = doc.createElement("style");
    style.textContent = "html { scrollbar-width: thin; } [data-section] { cursor: default; }";
    doc.head.appendChild(style);

    doc.getElementById(LAYER_ID)?.remove();
    const host = doc.createElement("div");
    host.id = LAYER_ID;
    host.style.cssText = "position:absolute;top:0;left:0;z-index:2147483000;pointer-events:none;";
    doc.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const css = doc.createElement("style");
    css.textContent = LAYER_CSS;
    const veil = doc.createElement("div");
    veil.className = "veil";
    const canvas = doc.createElement("canvas");
    const bands = doc.createElement("div");
    const focusBox = doc.createElement("div");
    focusBox.className = "focus";
    shadow.append(css, veil, canvas, bands, focusBox);

    const sectionEls = () =>
      Array.from(doc.querySelectorAll<HTMLElement>("[data-section]")).filter((el) => !el.parentElement?.closest("[data-section]"));
    const boxOf = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left + win.scrollX, top: r.top + win.scrollY, width: r.width, height: r.height };
    };

    const draw = () => {
      const s = state.current;
      const width = doc.documentElement.scrollWidth;
      const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      const els = sectionEls();
      const boxes = new Map(els.map((el) => [el.dataset.section ?? "", boxOf(el)]));

      // Clicks: soft density blobs on a dimmed page.
      const clicks = s.mode === "clicks";
      veil.style.opacity = clicks ? "1" : "0";
      canvas.style.display = clicks ? "block" : "none";
      if (clicks) {
        canvas.width = Math.ceil(width * SCALE);
        canvas.height = Math.ceil(height * SCALE);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const pts: { x: number; y: number }[] = [];
        for (const p of s.points) {
          const b = boxes.get(p.sectionId);
          if (!b || b.height < 4) continue;
          pts.push({ x: (b.left + p.x * b.width) * SCALE, y: (b.top + p.y * b.height) * SCALE });
        }
        drawHeat(canvas, pts);
      }

      // Reach: each section darkens as fewer visitors get to it.
      const frag = doc.createDocumentFragment();
      if (!clicks) {
        const byId = new Map(s.reach.map((r) => [r.id, r.reach]));
        for (const el of els) {
          const id = el.dataset.section ?? "";
          const b = boxes.get(id);
          const value = byId.get(id);
          if (!b || b.height < 8 || value === undefined) continue;
          const band = doc.createElement("div");
          band.className = "band";
          band.style.top = `${b.top}px`;
          band.style.height = `${b.height}px`;
          band.style.background = `rgba(12, 10, 9, ${(0.62 * (1 - value)).toFixed(3)})`;
          const pill = doc.createElement("div");
          pill.className = "pill";
          const n = doc.createElement("b");
          n.textContent = `${Math.round(value * 100)}%`;
          const label = doc.createElement("span");
          label.textContent = "of visitors reached this";
          pill.append(n, label);
          band.appendChild(pill);
          frag.appendChild(band);
        }
      }
      bands.replaceChildren(frag);

      const f = s.focus ? boxes.get(s.focus) : undefined;
      focusBox.style.display = f ? "block" : "none";
      if (f) {
        focusBox.style.top = `${f.top + 4}px`;
        focusBox.style.height = `${Math.max(0, f.height - 8)}px`;
      }
    };

    let req = 0;
    const onScroll = () => {
      if (Date.now() < state.current.lockUntil) return;
      cancelAnimationFrame(req);
      req = requestAnimationFrame(() => {
        const probe = win.scrollY + win.innerHeight * 0.3;
        let current: string | null = null;
        for (const el of sectionEls()) if (boxOf(el).top <= probe) current = el.dataset.section ?? null;
        if (current) state.current.onInView(current);
      });
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = ((e.target as Element | null)?.closest?.("[data-section]") as HTMLElement | null)?.dataset.section;
      if (id) state.current.onSelect(id);
    };
    const onSubmit = (e: Event) => e.preventDefault();

    // Layout moves (fonts, images, the streamed page being revealed) shift the sections: redraw.
    let redraw = 0;
    const schedule = () => {
      cancelAnimationFrame(redraw);
      redraw = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(doc.body);
    win.addEventListener("scroll", onScroll, { passive: true });
    win.addEventListener("resize", schedule);
    win.addEventListener("load", schedule);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("submit", onSubmit, true);
    void doc.fonts?.ready.then(schedule);
    api.current = { draw, win, doc };
    draw();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(req);
      cancelAnimationFrame(redraw);
      win.removeEventListener("scroll", onScroll);
      win.removeEventListener("resize", schedule);
      win.removeEventListener("load", schedule);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("submit", onSubmit, true);
      host.remove();
      style.remove();
      api.current = null;
    };
  }, [frame]);

  useEffect(() => {
    api.current?.draw();
  }, [mode, points, reach, focus]);

  /** Scroll the preview to a section without the scroll handler fighting back. */
  const scrollTo = useCallback((id: string) => {
    const a = api.current;
    const el = a?.doc.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    if (!a || !el) return;
    state.current.lockUntil = Date.now() + 900;
    a.win.scrollTo({ top: el.getBoundingClientRect().top + a.win.scrollY, behavior: "smooth" });
  }, []);

  return { attach, scrollTo };
}
