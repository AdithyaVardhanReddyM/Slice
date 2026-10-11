// Where a published page lives. Dev default `pages.localhost:3000` is served
// over http; anything else is https.

export const PAGES_HOST = process.env.NEXT_PUBLIC_PAGES_HOST ?? "pages.localhost:3000";

const isLocal = /localhost|127\.0\.0\.1/.test(PAGES_HOST);

export function publicPageUrl(brandSlug: string, pageSlug: string, query?: Record<string, string>) {
  const q = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
  return `${isLocal ? "http" : "https"}://${brandSlug}.${PAGES_HOST}/${pageSlug}${q}`;
}

export function brandDomain(brandSlug: string) {
  return `${brandSlug}.${PAGES_HOST}`;
}

/** The app-local route the console iframes: forces a variant, disables tracking. */
export function previewUrl(brandSlug: string, pageSlug: string, variantId: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ v: variantId, preview: "1", ...(extra ?? {}) });
  return `/p/${brandSlug}/${pageSlug}?${params.toString()}`;
}

/** Hostname only, for brand cards. */
export function hostOf(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host;
  } catch {
    return url;
  }
}

export function faviconOf(url: string) {
  const host = hostOf(url);
  if (/localhost|127\.0\.0\.1/.test(host)) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}
