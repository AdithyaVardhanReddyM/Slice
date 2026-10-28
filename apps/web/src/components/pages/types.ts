// Shapes the renderer and the published route exchange with the backend
// (contract: docs/pages-contracts.md, "A. Backend / pages.ts").

import type { FunctionReturnType } from "convex/server";
import type { api } from "@slice/backend/convex/_generated/api";

/** `api.pages.bySlug` result: the brand's public face, the page (no brief) and its version (no trace or insights). */
export type BySlugResult = NonNullable<FunctionReturnType<typeof api.pages.bySlug>>;

/** A version as the published route sees it. */
export type ShownVariant = BySlugResult["variants"][number];

/** `api.pages.resolveVariant` result. */
export interface ResolveResult {
  variantId: string;
  audienceId?: string;
  /** "param" | "lead" | "utm" | "geo" | "cookie" | "quiz" | "default" | "preview" */
  resolvedBy: string;
}

/** What the tracker, the form and the quiz need to attribute events. */
export interface TrackingMeta {
  pageId: string;
  variantId: string;
  resolvedBy: string;
  /** True inside the console preview (`?preview=1`) and on the fixture: no events leave the page. */
  disabled: boolean;
  /** `?city=` / `?country=` overrides from the page URL, forwarded in every batch for local testing. */
  overrides?: { city?: string; country?: string };
}

/** Body of POST /api/pages/track: a TrackBatch plus the geo overrides. */
export type TrackBody = import("@slice/backend/convex/pagesTypes").TrackBatch & {
  overrides?: { city?: string; country?: string };
};

/** Body of POST /api/pages/form. */
export interface FormBody {
  pageId: string;
  variantId: string;
  visitorId: string;
  sessionId: string;
  resolvedBy: string;
  path: string;
  sectionId: string;
  fields: Record<string, string>;
  overrides?: { city?: string; country?: string };
}

/** Cookie that remembers which audience a visitor resolved to: `pg_aud_<pageId>` = `audienceId:how`. */
export function audienceCookieName(pageId: string): string {
  return `pg_aud_${pageId}`;
}

export function parseAudienceCookie(value: string | undefined): { audienceId: string; how: string } | null {
  if (!value) return null;
  const i = value.lastIndexOf(":");
  if (i <= 0) return { audienceId: value, how: "cookie" };
  return { audienceId: value.slice(0, i), how: value.slice(i + 1) || "cookie" };
}
