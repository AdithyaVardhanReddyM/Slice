// Email themes: the brand theme derived from an EmailKit, the preset themes
// the editor offers, and the colour and font helpers the renderer and the
// editor share. Plain TypeScript (no Convex imports, no DOM): it runs in
// Convex, in Next server and client components and in the browser.

import type { ColorRef, EmailDoc, EmailFont, EmailKit, EmailTheme } from "./emailTypes";

/* Colours ------------------------------------------------------------------ */

export const COLOR_TOKENS = ["surface", "backdrop", "primary", "accent", "muted", "text", "border"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const isColorToken = (v: unknown): v is ColorToken => typeof v === "string" && (COLOR_TOKENS as readonly string[]).includes(v);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i;
const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", transparent: "#00000000" };

/** A literal CSS colour this module can read: hex, rgb()/rgba(), white, black. */
export function isColorValue(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return HEX_RE.test(s) || RGB_RE.test(s) || s in NAMED;
}

/** A theme token or a literal colour. */
export const isColorRef = (v: unknown): v is ColorRef => isColorToken(v) || isColorValue(v);

/** [r, g, b] 0..255, or null when unreadable. Alpha is ignored. */
export function parseColor(c: string | undefined): [number, number, number] | null {
  if (!c) return null;
  let s = c.trim().toLowerCase();
  if (s in NAMED) s = NAMED[s];
  if (HEX_RE.test(s)) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((x) => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = RGB_RE.exec(s);
  if (m) return [Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3])];
  return null;
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Normalised "#rrggbb" for any readable colour (fallback when unreadable). */
export function normalizeHex(c: string | undefined, fallback: string): string {
  const rgb = parseColor(c);
  return rgb ? toHex(rgb) : fallback;
}

/** a → b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a) ?? [0, 0, 0];
  const y = parseColor(b) ?? [255, 255, 255];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** WCAG relative luminance, 0..1. */
export function luminance(c: string): number {
  const rgb = parseColor(c);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isDark = (c: string) => luminance(c) < 0.4;

/** Two colours that read as the same fill (a button on a band of its own colour). */
export function sameColor(a: string | undefined, b: string | undefined): boolean {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return false;
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 14;
}

/** The colour a ref points at in this theme; undefined when unset or unreadable. */
export function resolveColor(ref: ColorRef | undefined, theme: EmailTheme): string | undefined {
  if (!ref) return undefined;
  if (isColorToken(ref)) return theme.colors[ref];
  return isColorValue(ref) ? ref.trim() : undefined;
}

/** The best of `candidates` on `fill`: the first that reaches 4.5:1, else the highest contrast. */
function readableOn(fill: string, candidates: string[]): string {
  for (const c of candidates) if (contrast(c, fill) >= 4.5) return c;
  return [...candidates, "#111111", "#ffffff"].sort((a, b) => contrast(b, fill) - contrast(a, fill))[0];
}

/** Readable text colour on that fill. Tokens use their "on" colour unless it fails contrast. */
export function onColor(ref: ColorRef | undefined, theme: EmailTheme): string {
  const c = theme.colors;
  const fill = resolveColor(ref, theme) ?? c.surface;
  const preferred: Record<ColorToken, string> = {
    surface: c.text,
    backdrop: c.text,
    muted: c.text,
    border: c.text,
    primary: c.onPrimary,
    accent: c.onAccent,
    text: c.surface,
  };
  const first = ref && isColorToken(ref) ? preferred[ref] : undefined;
  // A theme's own pairing (onAccent on accent) stands at 3:1, the large-text
  // bar: band text is mostly headings and buttons, and white on a mid-tone
  // brand colour reads better than the near-black that would reach 4.5.
  if (first && contrast(first, fill) >= 3) return first;
  return readableOn(fill, first ? [first, c.text, c.surface] : [c.text, c.surface]);
}

/** Text for a brand fill: the light colour on mid and dark fills when it reaches 3.3:1, else the more readable one. */
function pickOn(fill: string, light: string, dark: string): string {
  const cl = contrast(light, fill);
  const cd = contrast(dark, fill);
  if (luminance(fill) < 0.3 && cl >= 3.3) return light;
  if (Math.max(cl, cd) >= 4.5) return cl >= cd ? light : dark;
  return readableOn(fill, [light, dark]);
}

/** Secondary text on a fill: the readable colour softened toward the fill. */
export function mutedOn(ref: ColorRef | undefined, theme: EmailTheme): string {
  const fill = resolveColor(ref, theme) ?? theme.colors.surface;
  const fg = onColor(ref, theme);
  const soft = mix(fg, fill, 0.32);
  return contrast(soft, fill) >= 4.5 ? soft : mix(fg, fill, 0.18);
}

/** Link colour on a fill: the theme primary when it reads there, else the text colour. */
export function linkOn(ref: ColorRef | undefined, theme: EmailTheme): string {
  const fill = resolveColor(ref, theme) ?? theme.colors.surface;
  return contrast(theme.colors.primary, fill) >= 3 ? theme.colors.primary : onColor(ref, theme);
}

/* Fonts -------------------------------------------------------------------- */

/** CSS font-family with the fallback stack. Single quotes only (it goes inside style="..."). */
export function fontStack(f: EmailFont): string {
  const family = (f.family || "").replace(/["';]/g, "").trim();
  const fallback = (f.fallback || "Arial, Helvetica, sans-serif").replace(/["]/g, "'").replace(/[;{}<>]/g, "").trim();
  if (!family) return fallback;
  if (fallback.toLowerCase().includes(family.toLowerCase())) return fallback;
  const name = /^[a-z-]+$/i.test(family) ? family : `'${family}'`;
  return `${name}, ${fallback}`;
}

/** One stylesheet URL per Google font, so one bad family can't block the other. */
export function googleFontsHrefs(theme: EmailTheme): string[] {
  const seen = new Map<string, Set<number>>();
  for (const f of [theme.fonts.heading, theme.fonts.body]) {
    if (!f.google || !f.family?.trim()) continue;
    const w = seen.get(f.family) ?? new Set<number>();
    for (const x of f.weights ?? []) if (Number.isFinite(x)) w.add(Math.round(x));
    seen.set(f.family, w);
  }
  return [...seen].map(([family, weights]) => {
    const name = encodeURIComponent(family.trim()).replace(/%20/g, "+");
    // Without known weights ask for the family alone: asking for a weight the
    // family lacks makes Google answer 400 for the whole stylesheet.
    const axis = weights.size ? `:wght@${[...weights].sort((a, b) => a - b).join(";")}` : "";
    return `https://fonts.googleapis.com/css2?family=${name}${axis}&display=swap`;
  });
}

/** One stylesheet URL for both fonts (the editor loads it once), or null when neither is a Google font. */
export function googleFontsHref(theme: EmailTheme): string | null {
  const hrefs = googleFontsHrefs(theme);
  if (!hrefs.length) return null;
  const families = hrefs.map((h) => /family=([^&]+)/.exec(h)?.[1]).filter(Boolean);
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

/** Weight headings use: the heaviest the heading font ships up to 700 (display serifs often ship only 400). */
export function headingWeight(theme: EmailTheme): number {
  const w = (theme.fonts.heading.weights ?? []).filter((x) => x <= 700);
  return w.length ? Math.max(...w) : 700;
}

/** Bold weight in the body font. */
export function bodyBold(theme: EmailTheme): number {
  const w = (theme.fonts.body.weights ?? []).filter((x) => x >= 500 && x <= 700);
  return w.length ? Math.max(...w) : 700;
}

const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

const font = (family: string, fallback: string, weights: number[]): EmailFont => ({ family, fallback, google: true, weights });

/* Presets ------------------------------------------------------------------ */

type Palette = EmailTheme["colors"];

function preset(
  id: string,
  name: string,
  heading: EmailFont,
  body: EmailFont,
  colors: Palette,
  radius: number,
  shape: EmailTheme["button"]["shape"],
  uppercase = false,
): EmailTheme {
  return { id, name, colors, fonts: { heading, body }, radius, button: { shape, uppercase }, width: 600 };
}

export const THEME_PRESETS: EmailTheme[] = [
  preset(
    "ink",
    "Ink",
    font("Inter", SANS, [400, 600, 700]),
    font("Inter", SANS, [400, 600, 700]),
    {
      backdrop: "#efefec",
      surface: "#ffffff",
      text: "#141414",
      muted: "#f3f2ee",
      primary: "#141414",
      onPrimary: "#ffffff",
      accent: "#f6d64a",
      onAccent: "#141414",
      border: "#e2e0da",
    },
    4,
    "square",
  ),
  preset(
    "paper",
    "Paper",
    font("Fraunces", SERIF, [400, 600]),
    font("Inter", SANS, [400, 600]),
    {
      backdrop: "#ece4d4",
      surface: "#fbf8f1",
      text: "#2b2520",
      muted: "#f2ebdd",
      primary: "#2b2520",
      onPrimary: "#fbf8f1",
      accent: "#e3d3b4",
      onAccent: "#2b2520",
      border: "#e2d8c6",
    },
    8,
    "rounded",
  ),
  preset(
    "forest",
    "Forest",
    font("DM Serif Display", SERIF, [400]),
    font("DM Sans", SANS, [400, 500, 700]),
    {
      backdrop: "#e4eae2",
      surface: "#fbfaf6",
      text: "#1c2a21",
      muted: "#edf1ea",
      primary: "#1f4d36",
      onPrimary: "#f6f1e4",
      accent: "#e2b65a",
      onAccent: "#1c2a21",
      border: "#d6ddd2",
    },
    10,
    "rounded",
  ),
  preset(
    "sunset",
    "Sunset",
    font("Playfair Display", SERIF, [400, 700]),
    font("Lato", SANS, [400, 700]),
    {
      backdrop: "#f3e3d4",
      surface: "#fffaf4",
      text: "#3a2119",
      muted: "#fbece0",
      primary: "#b24f2e",
      onPrimary: "#fff8f1",
      accent: "#f0c49b",
      onAccent: "#3a2119",
      border: "#ecd6c4",
    },
    14,
    "pill",
  ),
  preset(
    "ocean",
    "Ocean",
    font("Space Grotesk", SANS, [400, 500, 700]),
    font("Inter", SANS, [400, 600]),
    {
      backdrop: "#e1ebf1",
      surface: "#ffffff",
      text: "#0f2a4a",
      muted: "#eaf3f6",
      primary: "#0f2a4a",
      onPrimary: "#ffffff",
      accent: "#2bb5aa",
      onAccent: "#06232e",
      border: "#d3e1e8",
    },
    6,
    "rounded",
  ),
  preset(
    "mono",
    "Mono",
    font("IBM Plex Sans", SANS, [400, 600, 700]),
    font("IBM Plex Sans", SANS, [400, 600, 700]),
    {
      backdrop: "#e9e9e9",
      surface: "#ffffff",
      text: "#1e1e1e",
      muted: "#f2f2f2",
      primary: "#2b2b2b",
      onPrimary: "#ffffff",
      accent: "#d9d9d9",
      onAccent: "#1e1e1e",
      border: "#dadada",
    },
    0,
    "square",
    true,
  ),
  preset(
    "blush",
    "Blush",
    font("Cormorant Garamond", SERIF, [500, 600, 700]),
    font("Karla", SANS, [400, 500, 700]),
    {
      backdrop: "#f6e6e9",
      surface: "#fffbfb",
      text: "#3d1f29",
      muted: "#fbeef0",
      primary: "#9e3d5c",
      onPrimary: "#ffffff",
      accent: "#f4d3da",
      onAccent: "#4a1e2c",
      border: "#efd3d9",
    },
    16,
    "pill",
  ),
  preset(
    "midnight",
    "Midnight",
    font("Syne", SANS, [500, 600, 700]),
    font("Inter", SANS, [400, 600]),
    {
      backdrop: "#0a0f20",
      surface: "#121a33",
      text: "#e9ecf5",
      muted: "#1b2546",
      primary: "#8fa2ff",
      onPrimary: "#0a0f20",
      accent: "#f2c14e",
      onAccent: "#121a33",
      border: "#2a355c",
    },
    12,
    "rounded",
  ),
];

/** The theme a doc starts with when nothing else is known. */
export const DEFAULT_THEME: EmailTheme = THEME_PRESETS[0];

export const themePreset = (id: string): EmailTheme | undefined => THEME_PRESETS.find((t) => t.id === id);

/* Brand theme --------------------------------------------------------------- */

const RADIUS_PX: Record<EmailKit["radius"], number> = { none: 0, sm: 6, md: 12, lg: 20 };

function kitFont(f: EmailFont | undefined, fallback: EmailFont): EmailFont {
  if (!f?.family) return { ...fallback };
  return {
    family: f.family,
    fallback: f.fallback || fallback.fallback,
    google: !!f.google,
    ...(f.weights?.length ? { weights: f.weights } : {}),
  };
}

/** The brand's theme (id "brand") from its kit; Ink's palette and fonts when there is no kit. */
export function themeFromKit(kit: EmailKit | undefined): EmailTheme {
  if (!kit) return { ...DEFAULT_THEME, id: "brand", name: "Brand" };
  const k = kit.colors ?? ({} as EmailKit["colors"]);
  const d = DEFAULT_THEME.colors;
  const background = normalizeHex(k.background, d.surface);
  const surface = normalizeHex(k.surface || k.background, background);
  let text = normalizeHex(k.foreground, d.text);
  if (contrast(text, surface) < 4.5) text = readableOn(surface, [text, "#141414", "#ffffff"]);
  const primary = normalizeHex(k.primary, text);
  let onPrimary = normalizeHex(k.primaryForeground, "#ffffff");
  if (contrast(onPrimary, primary) < 3) onPrimary = pickOn(primary, isDark(surface) ? text : surface, isDark(surface) ? surface : text);
  const accent = normalizeHex(k.accent, mix(primary, surface, 0.75));
  const onAccent = pickOn(accent, isDark(surface) ? text : surface, isDark(surface) ? surface : text);
  // The client canvas behind the card: a step darker than the brand background
  // (lighter on dark brands), so the card edge reads without a border.
  const backdrop = isDark(background) ? mix(background, "#000000", 0.35) : mix(background, "#000000", 0.05);
  let muted = normalizeHex(k.muted, mix(surface, text, 0.05));
  // A kit "muted" that is really a text grey (some sites call it that) makes a
  // heavy band; soften it to a fill.
  if (contrast(muted, surface) > 1.6) muted = mix(surface, muted, 0.15);
  const border = mix(muted, text, 0.12);
  return {
    id: "brand",
    name: "Brand",
    colors: { backdrop, surface, text, muted, primary, onPrimary, accent, onAccent, border },
    fonts: {
      heading: kitFont(kit.fonts?.heading, DEFAULT_THEME.fonts.heading),
      body: kitFont(kit.fonts?.body, DEFAULT_THEME.fonts.body),
    },
    radius: RADIUS_PX[kit.radius] ?? 8,
    button: { shape: kit.buttonStyle ?? "rounded", uppercase: !!kit.uppercaseLabels },
    width: 600,
  };
}

/** The doc with a new theme. Tokens follow it; fixed hex colours in blocks stay. */
export function applyTheme(doc: EmailDoc, theme: EmailTheme): EmailDoc {
  return { ...doc, theme: { ...theme, width: theme.width || doc.theme?.width || 600 } };
}
