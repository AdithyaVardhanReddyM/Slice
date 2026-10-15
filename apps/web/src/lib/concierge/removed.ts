// Concierge widgets are still mock data, so a deleted widget is remembered in a
// cookie and left out wherever widgets are listed. Client-safe: the server reads
// it through `removed-server.ts`, the sidebar switcher through `document.cookie`.

export const REMOVED_WIDGETS_COOKIE = "slice-removed-widgets";

/** The deleted widget ids in a cookie value. */
export function parseRemoved(value: string | undefined): string[] {
  if (!value) return [];
  return decodeURIComponent(value).split(",").filter(Boolean);
}

/** The same, read from a `document.cookie` string. */
export function removedFromCookieHeader(header: string): string[] {
  const pair = header
    .split("; ")
    .find((c) => c.startsWith(`${REMOVED_WIDGETS_COOKIE}=`));
  return parseRemoved(pair?.slice(REMOVED_WIDGETS_COOKIE.length + 1));
}
