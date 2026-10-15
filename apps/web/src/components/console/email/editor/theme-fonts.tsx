"use client";

import { googleFontsHref } from "@slice/backend/convex/emailThemes";
import type { EmailTheme } from "@slice/backend/convex/emailTypes";

/** A theme's web fonts, so the canvas and theme cards show the email's real type. */
export function ThemeFonts({ theme }: { theme: EmailTheme | undefined }) {
  const href = theme ? googleFontsHref(theme) : null;
  if (!href) return null;
  // React hoists a stylesheet with a precedence into <head> and loads each URL once.
  return <link rel="stylesheet" href={href} precedence="email-fonts" />;
}
