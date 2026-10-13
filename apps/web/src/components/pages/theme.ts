// Brand kit → CSS custom properties on the `.pg-root` wrapper, plus the
// Google Fonts stylesheet href. Everything a section needs to look like the
// brand comes through these variables; sections never read the kit directly.

import type { CSSProperties } from "react";
import type { BrandColors, BrandFont, BrandKit } from "@slice/backend/convex/pagesTypes";

/** Corner radius of cards, frames and inputs. */
const RADIUS: Record<BrandKit["radius"], string> = {
  none: "0px",
  sm: "6px",
  md: "12px",
  lg: "20px",
  full: "28px",
};

/** Multiplies the vertical rhythm (section padding, gaps). */
const DENSITY: Record<BrandKit["density"], number> = {
  compact: 0.82,
  regular: 1,
  airy: 1.22,
};

const BUTTON_RADIUS: Record<BrandKit["buttonStyle"], string> = {
  pill: "999px",
  rounded: "var(--pg-radius-sm)",
  square: "0px",
};

/* Colour helpers ---------------------------------------------------------- */

function parseColor(input: string): [number, number, number] | null {
  const s = input.trim();
  const hex = s.match(/^#?([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length < 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** WCAG relative luminance, 0 (black) .. 1 (white). Unknown formats read as mid-grey. */
export function luminance(color: string): number {
  const rgb = parseColor(color);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDark(color: string): boolean {
  return luminance(color) < 0.4;
}

/** The brand's own foreground or background, whichever reads on `bg`. */
function onColor(bg: string, colors: BrandColors): string {
  const fgReads = Math.abs(luminance(bg) - luminance(colors.foreground)) >= Math.abs(luminance(bg) - luminance(colors.background));
  return fgReads ? colors.foreground : colors.background;
}

/* Fonts ------------------------------------------------------------------- */

const GENERIC = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-serif", "ui-sans-serif", "cursive"]);

function fontStack(font: BrandFont): string {
  const family = font.family.trim();
  const quoted = GENERIC.has(family.toLowerCase()) || /^[a-z-]+$/i.test(family) === false ? `"${family}"` : family;
  const fallback = font.fallback?.trim() || "system-ui, sans-serif";
  return `${quoted}, ${fallback}`;
}

/** An extra font with Google's axis syntax, e.g. "Archivo:wdth,wght@125,800;125,900" (an expanded cut of a kit font). */
const AXIS_SPEC = /^([A-Za-z0-9 +]{2,40}):((?:ital|wdth|wght|opsz)(?:,(?:ital|wdth|wght|opsz))*)@([0-9.,;]{1,80})$/;

/** `https://fonts.googleapis.com/css2?...` for the kit's Google fonts (plus `extra` families a page asks for), or null when none. */
export function googleFontsHref(kit: BrandKit, extra?: string[]): string | null {
  const fams = new Map<string, Set<number>>();
  const add = (font: BrandFont, defaults: number[]) => {
    if (font.source !== "google" || !font.family.trim()) return;
    const set = fams.get(font.family) ?? new Set<number>();
    (font.weights?.length ? font.weights : defaults).forEach((w) => set.add(w));
    fams.set(font.family, set);
  };
  add(kit.fonts.heading, [400, 500, 600, 700]);
  add(kit.fonts.body, [400, 500, 600]);
  // Axis specs are passed through as their own family entry; Google merges them with the plain one.
  const axes: string[] = [];
  for (const family of extra ?? []) {
    const name = String(family).trim();
    const spec = AXIS_SPEC.exec(name);
    if (spec) {
      axes.push(`family=${spec[1].trim().replace(/\s+/g, "+")}:${spec[2]}@${spec[3]}`);
      continue;
    }
    if (!/^[A-Za-z0-9 +]{2,40}$/.test(name) || fams.has(name)) continue;
    fams.set(name, new Set([400, 500, 600, 700]));
  }
  if (fams.size === 0 && axes.length === 0) return null;
  const parts = [...fams.entries()].map(([family, weights]) => {
    const name = family.trim().replace(/\s+/g, "+");
    const ws = [...weights].sort((a, b) => a - b).join(";");
    return `family=${name}:wght@${ws}`;
  });
  return `https://fonts.googleapis.com/css2?${[...parts, ...axes].join("&")}&display=swap`;
}

/* Variables --------------------------------------------------------------- */

export type PageVars = CSSProperties & Record<`--pg-${string}`, string>;

/**
 * Build the variable set for `.pg-root`. `overrides` is the variant's
 * `doc.theme` (a few colours swapped within the brand).
 */
export function kitToVars(kit: BrandKit, overrides?: Partial<BrandColors> | null): PageVars {
  const c: BrandColors = { ...kit.colors, ...(overrides ?? {}) };
  const density = DENSITY[kit.density] ?? 1;
  const radius = RADIUS[kit.radius] ?? RADIUS.md;
  const vars: Record<string, string> = {
    // Brand palette (never changes within a page).
    "--pg-brand-bg": c.background,
    "--pg-brand-fg": c.foreground,
    "--pg-brand-primary": c.primary,
    "--pg-brand-primary-fg": c.primaryForeground,
    "--pg-brand-accent": c.accent,
    "--pg-brand-muted": c.muted,
    "--pg-brand-surface": c.surface,
    "--pg-on-accent": onColor(c.accent, c),
    "--pg-on-muted": onColor(c.muted, c),
    "--pg-on-primary": c.primaryForeground || onColor(c.primary, c),
    // Section-scoped roles; section themes re-point these.
    "--pg-bg": c.background,
    "--pg-fg": c.foreground,
    "--pg-primary": c.primary,
    "--pg-primary-fg": c.primaryForeground || onColor(c.primary, c),
    "--pg-accent": c.accent,
    "--pg-muted": c.muted,
    "--pg-surface": c.surface,
    // Shape and rhythm.
    "--pg-radius": radius,
    "--pg-radius-sm": `calc(${radius} * 0.6)`,
    "--pg-radius-lg": `calc(${radius} * 1.5)`,
    "--pg-radius-button": BUTTON_RADIUS[kit.buttonStyle] ?? BUTTON_RADIUS.rounded,
    "--pg-density": String(density),
    // Type.
    "--pg-font-heading": fontStack(kit.fonts.heading),
    "--pg-font-body": fontStack(kit.fonts.body),
    "--pg-label-transform": kit.uppercaseLabels ? "uppercase" : "none",
    "--pg-label-tracking": kit.uppercaseLabels ? "0.1em" : "0.01em",
    "--pg-label-size": kit.uppercaseLabels ? "0.72rem" : "0.8125rem",
  };
  return vars as PageVars;
}

/** `dark` when the brand background is dark, so the header and overlays can adapt. */
export function kitMode(kit: BrandKit): "light" | "dark" {
  return isDark(kit.colors.background) ? "dark" : "light";
}
