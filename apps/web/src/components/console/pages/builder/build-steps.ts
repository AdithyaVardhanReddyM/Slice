"use client";

// How an agent turn reads in the chat and on the canvas: a generate turn as a
// fixed list of phases (so the merchant sees what is left), an edit turn as
// its steps in order. Plus the small clocks and the typewriter that keep a
// long turn visibly moving.

import { useEffect, useRef, useState } from "react";
import type { BuildStep, StepPreview } from "@/lib/pages/stream";
import type { Draft } from "./use-builder";

export type ToolStep = Extract<BuildStep, { kind: "tool" }>;
export type ThoughtStep = Extract<BuildStep, { kind: "thought" }>;

export interface Phase {
  id: string;
  label: string;
  tools: string[];
}

/** What a generate turn does, in order (builder.py's HOW TO GENERATE). */
export const GENERATE_PHASES: Phase[] = [
  { id: "taste", label: "Reading the audience's taste", tools: ["get_audience_detail", "qloo_places", "qloo_culture", "qloo_search", "qloo_insights", "google_search"] },
  { id: "brand", label: "Studying the brand's homepage", tools: ["get_brand_site", "fetch_reference", "describe_image"] },
  { id: "items", label: "Ranking the items by taste fit", tools: ["pick_items"] },
  { id: "imagery", label: "Gathering photographs", tools: ["search_images", "generate_image"] },
  { id: "write", label: "Writing the page", tools: ["write_page", "get_page"] },
  { id: "review", label: "Checking it against the homepage", tools: ["review_page", "edit_page"] },
  { id: "explain", label: "Explaining the choices", tools: ["explain_page"] },
];

export type PhaseStatus = "pending" | "active" | "done" | "skipped" | "failed";

export interface PhaseView {
  phase: Phase;
  status: PhaseStatus;
  tools: ToolStep[];
  /** Reasoning that led into this phase's first call. */
  thoughts: ThoughtStep[];
  /** Start (ms into the turn) and length, from its calls. */
  t?: number;
  ms?: number;
}

export interface PhaseRead {
  phases: PhaseView[];
  /** The agent is thinking between calls: show this after phase `thinkingAfter` (-1 = before the first). */
  thinking: ThoughtStep | null;
  thinkingAfter: number;
}

const phaseOf = (name: string) => GENERATE_PHASES.findIndex((p) => p.tools.includes(name));

/** Groups a generate turn's steps into its phases. `live` while the turn runs. */
export function readPhases(steps: BuildStep[], live: boolean): PhaseRead {
  const views: PhaseView[] = GENERATE_PHASES.map((phase) => ({ phase, status: "pending", tools: [], thoughts: [] }));
  let waiting: ThoughtStep[] = [];
  for (const s of steps) {
    if (s.kind === "thought") waiting.push(s);
    else if (s.kind === "tool") {
      const i = phaseOf(s.name);
      if (i < 0) continue;
      views[i].thoughts.push(...waiting);
      views[i].tools.push(s);
      waiting = [];
    }
  }
  const frontier = views.reduce((m, v, i) => (v.tools.length ? i : m), -1);
  for (const [i, v] of views.entries()) {
    if (v.tools.length) {
      const running = v.tools.some((t) => t.status === "running");
      v.status = running ? "active" : v.tools.every((t) => t.status === "failed") ? "failed" : "done";
      const start = Math.min(...v.tools.map((t) => t.t ?? 0));
      const end = Math.max(...v.tools.map((t) => (t.t ?? 0) + (t.ms ?? 0)));
      v.t = start;
      v.ms = running ? undefined : Math.max(0, end - start);
    } else if (i < frontier || !live) v.status = "skipped";
  }
  const anyRunning = views.some((v) => v.status === "active");
  const lastThought = waiting[waiting.length - 1] ?? null;
  // A finished turn's closing thoughts belong to its last phase.
  if (!live && waiting.length && frontier >= 0) views[frontier].thoughts.push(...waiting);
  return { phases: views, thinking: live && !anyRunning ? lastThought : null, thinkingAfter: frontier };
}

/** "12s", "1m 04s". */
export function clock(ms: number | undefined): string {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** How long a finished turn took, from its steps' timings. */
export function turnLength(steps: BuildStep[]): number {
  return steps.reduce((m, s) => Math.max(m, (s.t ?? 0) + ("ms" in s ? (s.ms ?? 0) : 0)), 0);
}

/** Date.now(), ticking every `every` ms while `on`. */
export function useNow(on: boolean, every = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [on, every]);
  return now;
}

/**
 * Reveals `text` a few characters at a time while `on`, so chunks that arrive
 * in bursts read as a steady stream. Catches up faster the further behind it is.
 */
export function useTypewriter(text: string, on: boolean, perSecond = 120): string {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const length = text.length;
  useEffect(() => {
    if (!on) return;
    if (shownRef.current > length) {
      shownRef.current = 0;
    }
    if (shownRef.current >= length) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const behind = length - shownRef.current;
      shownRef.current = Math.min(length, shownRef.current + Math.max(1, Math.round((perSecond + behind * 3) * dt)));
      setShown(shownRef.current);
      if (shownRef.current < length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [length, on, perSecond]);
  return on ? text.slice(0, shown) : text;
}

/** Plain reasoning text: Gemini's summaries come with **bold** headings. */
export const cleanThought = (text: string) => text.replace(/\*\*/g, "").trim();

/** "lineup-by-day" → "Lineup by day". */
export const sectionLabel = (id: string) => {
  const words = id.replace(/^p-/, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
};

/** The sections written so far, in order, from the streaming markup. */
export function draftSections(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/data-section\s*=\s*["']([^"']+)["']/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/gi;

/** The distinct colours the page's stylesheet declares so far (its palette), up to `limit`. */
export function draftColors(css: string, limit = 8): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(COLOR)) {
    const c = m[0].toLowerCase().replace(/\s+/g, " ");
    // Near-transparent overlays are not part of the palette.
    if (/,\s*0?\.[0-2]\d*\s*\)|\/\s*0?\.[0-2]/.test(c)) continue;
    if (!out.includes(c)) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** The font families the stylesheet names so far (excluding generic families and kit variables). */
export function draftFonts(draft: Draft | null | undefined): string[] {
  const out = (draft?.fonts ?? []).map((f) => f.split(":")[0].trim()).filter(Boolean);
  for (const m of (draft?.css ?? "").matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (first && !first.startsWith("var(") && !/^(serif|sans-serif|monospace|inherit|system-ui|cursive)$/i.test(first) && !out.includes(first)) out.push(first);
  }
  return out.slice(0, 3);
}

/** Everything the turn has gathered so far (photos, Qloo faces, taste words), for the canvas. */
export function ingredients(steps: BuildStep[]): Required<Pick<StepPreview, "images" | "faces" | "chips">> {
  const images: string[] = [];
  const faces: { name: string; image: string }[] = [];
  const chips: string[] = [];
  for (const s of steps) {
    if (s.kind !== "tool" || !s.preview) continue;
    // Item names are for the chat; the canvas's words are taste tags.
    if (s.name === "get_audience_detail" || s.name.startsWith("qloo_")) for (const c of s.preview.chips ?? []) if (!chips.includes(c)) chips.push(c);
    if (s.name === "review_page") continue;
    for (const i of s.preview.images ?? []) if (!images.includes(i)) images.push(i);
    for (const f of s.preview.faces ?? []) if (!faces.some((x) => x.image === f.image)) faces.push(f);
  }
  return { images, faces, chips };
}
