import type { CSSProperties } from "react";
import type { Doc } from "@slice/backend/convex/_generated/dataModel";

// Theme helpers for rendered landing pages. Colours and font names were
// scraped from a merchant's site; Convex already sanitised them, and they're
// re-checked here before going into styles or a stylesheet URL.

export type BrandKit = NonNullable<Doc<"brands">["kit"]>;
export type PageSegment = Doc<"pages">["segments"][number];
export type PageSection = PageSegment["sections"][number];

const HEX = /^#[0-9a-f]{6}$/i;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 ]{0,40}$/;

export const hex = (value: string | undefined, fallback: string) =>
  value && HEX.test(value) ? value : fallback;

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `bg`. */
export const readableOn = (bg: string) => (luminance(bg) > 0.42 ? "#111111" : "#ffffff");

export function safeSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("data:image/svg+xml;base64,")) return url;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function safeLink(url: string | undefined, fallback = "#"): string {
  if (!url) return fallback;
  if (url.startsWith("#")) return url;
  return safeSrc(url)?.startsWith("http") ? url : fallback;
}

export const fontName = (name: string | undefined) => (name && FONT.test(name) ? name : undefined);

/** Google Fonts stylesheet for the kit's fonts. Unknown families just 400 and fall back. */
export function fontHref(kit: BrandKit): string | null {
  const families = [...new Set([fontName(kit.fonts.heading), fontName(kit.fonts.body)].filter(Boolean))] as string[];
  if (!families.length) return null;
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

const stack = (name: string | undefined, fallback: string) =>
  name ? `"${name}", ${fallback}` : fallback;

export function themeStyle(kit: BrandKit, accentOverride?: string): CSSProperties {
  const primary = hex(kit.colors.primary, "#111827");
  const accent = hex(accentOverride, hex(kit.colors.accent, primary));
  const bg = hex(kit.colors.background, "#ffffff");
  const text = hex(kit.colors.text, readableOn(bg));
  return {
    "--lp-primary": primary,
    "--lp-on-primary": readableOn(primary),
    "--lp-accent": accent,
    "--lp-on-accent": readableOn(accent),
    "--lp-bg": bg,
    "--lp-text": text,
    "--lp-heading-font": stack(fontName(kit.fonts.heading), "ui-serif, Georgia, serif"),
    "--lp-body-font": stack(fontName(kit.fonts.body), "ui-sans-serif, system-ui, sans-serif"),
    backgroundColor: bg,
    color: text,
    fontFamily: "var(--lp-body-font)",
  } as CSSProperties;
}
