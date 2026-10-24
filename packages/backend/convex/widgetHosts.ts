// Which sites may run a store's concierge. Shared by the Convex functions and
// the web app's proxy, which turns a store's list into a frame-ancestors header.

/** Local development hosts always work, so a merchant can test before going live. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  );
}

/**
 * "https://Shop.Example.com/path" → "shop.example.com". Allows "*.example.com"
 * for every subdomain. Null when it isn't a hostname.
 */
export function normalizeHost(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return /^(\*\.)?(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** An empty list means the merchant hasn't restricted anything yet. */
export function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  if (isLocalHost(h) || allowed.length === 0) return true;
  return allowed.some((a) =>
    a.startsWith("*.") ? h.endsWith(a.slice(1)) : h === a,
  );
}

/** Frame ancestors every store gets: the app itself and local development. */
export const LOCAL_ANCESTORS = [
  "'self'",
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://*.localhost:*",
];

/** The frame-ancestors sources for a store's allowed hosts. */
export function frameAncestors(allowed: string[]): string {
  if (allowed.length === 0) return "*";
  return [...LOCAL_ANCESTORS, ...allowed.map((a) => `https://${a}`)].join(" ");
}
