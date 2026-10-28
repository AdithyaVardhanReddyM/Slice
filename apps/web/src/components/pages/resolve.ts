// Server-only helpers for the published route: load the page, pick the
// variant, read overrides. Resolution order lives in the backend
// (api.pages.resolveVariant); this file prepares its inputs and applies the
// preview / forced-variant short-circuits that only the renderer knows about.

import { connection } from "next/server";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { RoutingRules, VariantDoc } from "@slice/backend/convex/pagesTypes";
import { DEFAULT_ROUTING } from "@slice/backend/convex/pagesTypes";
import { type BySlugResult, type ResolveResult, type ShownVariant, audienceCookieName, parseAudienceCookie } from "./types";

export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/** One fetch shared by generateMetadata and the page render. */
export const loadPage = cache(async (brandSlug: string, pageSlug: string): Promise<BySlugResult | null> => {
  // The Convex client draws a request id, which Next treats as an unstable
  // value unless the render is already request-time.
  await connection();
  if (!CONVEX_URL) return null;
  return await fetchQuery(api.pages.bySlug, { brandSlug, pageSlug }, { url: CONVEX_URL });
});

export interface Resolution {
  variant: ShownVariant | null;
  doc: VariantDoc | null;
  resolved: ResolveResult;
  preview: boolean;
  /** Set when the server resolved via a signal the cookie should remember (param, lead, utm, geo). */
  remember: boolean;
  /** Show the quiz bar: default resolution, quiz configured, no cookie. */
  showQuiz: boolean;
  overrides?: { city?: string; country?: string };
}

export interface RequestSignals {
  sp: SearchParams;
  cookie?: string;
  headers: Headers;
}

const REMEMBER = new Set(["param", "lead", "utm", "geo"]);

export async function resolveRequest(data: BySlugResult, { sp, cookie, headers }: RequestSignals): Promise<Resolution> {
  const { page, variants } = data;
  const routing: RoutingRules = { ...DEFAULT_ROUTING, ...((page.routing as Partial<RoutingRules> | undefined) ?? {}) };
  const preview = first(sp.preview) === "1";
  const forced = first(sp.v);
  const city = first(sp.city);
  const country = first(sp.country)?.toUpperCase();
  const overrides = city || country ? { city, country } : undefined;

  const defaultVariant = variants.find((v) => v._id === page.defaultVariantId) ?? variants.find((v) => !v.audienceId) ?? variants[0] ?? null;
  const docOf = (v: ShownVariant | null | undefined): VariantDoc | null => (v?.doc && typeof v.doc === "object" ? (v.doc as VariantDoc) : null);

  /* ?v= forces a variant (console preview), read with the page on this request. */
  if (forced) {
    const variant = variants.find((v) => v._id === forced) ?? null;
    return {
      variant,
      doc: docOf(variant) ?? docOf(defaultVariant),
      resolved: { variantId: variant?._id ?? defaultVariant?._id ?? "", audienceId: variant?.audienceId, resolvedBy: "preview" },
      preview: true,
      remember: false,
      showQuiz: false,
      overrides,
    };
  }

  /* Draft without ?preview=1 is not served (the page handles 404). */
  if (preview) {
    return {
      variant: defaultVariant,
      doc: docOf(defaultVariant),
      resolved: { variantId: defaultVariant?._id ?? "", audienceId: defaultVariant?.audienceId, resolvedBy: "preview" },
      preview: true,
      remember: false,
      showQuiz: false,
      overrides,
    };
  }

  /* Live resolution. */
  const parsedCookie = parseAudienceCookie(cookie);
  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (k.startsWith("utm_") && val) utm[k.slice(4)] = val;
  }
  const geoCity = city ?? decodeHeader(headers.get("x-vercel-ip-city"));
  const geoCountry = country ?? decodeHeader(headers.get("x-vercel-ip-country"))?.toUpperCase();

  let resolved: ResolveResult = { variantId: defaultVariant?._id ?? "", audienceId: undefined, resolvedBy: "default" };
  if (CONVEX_URL) {
    try {
      resolved = (await fetchQuery(
        api.pages.resolveVariant,
        {
          brandSlug: data.brand.slug,
          pageSlug: page.slug,
          param: first(sp[routing.paramKey ?? "a"]),
          lead: first(sp[routing.leadKey ?? "g"]),
          utm: Object.keys(utm).length ? utm : undefined,
          city: geoCity,
          country: geoCountry,
          // An explicit ?city= / ?country= override is a fresh test visit: it
          // beats whatever an earlier visit stored.
          cookieAudienceId: parsedCookie && parsedCookie.how !== "quiz" && !city && !first(sp.country) ? parsedCookie.audienceId : undefined,
          quizAudienceId: parsedCookie && parsedCookie.how === "quiz" && !city && !first(sp.country) ? parsedCookie.audienceId : undefined,
        },
        { url: CONVEX_URL },
      )) as ResolveResult;
    } catch {
      /* fall through to the default variant */
    }
  }

  let variant = variants.find((v) => v._id === resolved.variantId) ?? defaultVariant;
  let doc = docOf(variant);
  if (!doc && variant !== defaultVariant) {
    // The chosen variant has no document yet: serve the default rather than nothing.
    variant = defaultVariant;
    doc = docOf(defaultVariant);
    resolved = { ...resolved, variantId: defaultVariant?._id ?? resolved.variantId };
  }

  const hasQuiz = Boolean(page.quiz && (page.quiz as { questions?: unknown[] }).questions?.length) && routing.quiz !== false;
  return {
    variant,
    doc,
    resolved,
    preview: false,
    remember: REMEMBER.has(resolved.resolvedBy) && Boolean(resolved.audienceId),
    showQuiz: resolved.resolvedBy === "default" && hasQuiz && !parsedCookie,
    overrides,
  };
}

function decodeHeader(v: string | null): string | undefined {
  if (!v) return undefined;
  try {
    return decodeURIComponent(v).trim() || undefined;
  } catch {
    return v.trim() || undefined;
  }
}

export { audienceCookieName };
