import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { api } from "@slice/backend/convex/_generated/api";
import { LOCAL_ANCESTORS, frameAncestors } from "@slice/backend/convex/widgetHosts";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

// Published pages and their tracker never touch Clerk: they are anonymous and
// served on brand subdomains. /render is the agent's export surface (Playwright).
// slice.js pings from merchant sites, also anonymous, and so does WooCommerce
// posting a merchant's newly approved catalog key.
const isPublic = createRouteMatcher([
  "/p(.*)",
  "/api/pages/track",
  "/api/pages/form",
  "/render(.*)",
  "/api/widget/ping",
  "/api/widget/event",
  "/api/concierge/catalog/woocommerce/callback",
]);

// Host that published pages live under: {brandSlug}.{PAGES_HOST}/{pageSlug}.
// The port is ignored when comparing (pages.localhost:3000 → pages.localhost).
const PAGES_HOST = (process.env.NEXT_PUBLIC_PAGES_HOST ?? "pages.localhost:3000").split(":")[0].toLowerCase();

/** `ridgeline.pages.localhost:3000/austin` → rewrite to `/p/ridgeline/austin`. */
function pagesHostRewrite(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host.endsWith(`.${PAGES_HOST}`)) return null;
  const brand = host.slice(0, host.length - PAGES_HOST.length - 1);
  if (!brand || brand.includes(".")) return null;
  const { pathname } = request.nextUrl;
  // Already-internal paths pass through untouched (assets, tracker, the /p route itself).
  if (pathname.startsWith("/p/") || pathname === "/p" || pathname.startsWith("/api/") || pathname.startsWith("/_next")) return null;
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/p/${brand}` : `/p/${brand}${pathname.replace(/\/+$/, "")}`;
  return NextResponse.rewrite(url);
}

// The concierge renders only inside pages on its store's allowed domains: the
// browser enforces frame-ancestors. Lists are cached briefly per store.
const ancestors = new Map<string, { value: string; at: number }>();
const ANCESTORS_TTL_MS = 15_000;

async function embedFrame(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  let value = LOCAL_ANCESTORS.join(" ");
  const cached = ancestors.get(key);
  if (cached && Date.now() - cached.at < ANCESTORS_TTL_MS) value = cached.value;
  else if (key && url) {
    try {
      value = frameAncestors(await fetchQuery(api.widgetInstall.domains, { key }, { url }));
      ancestors.set(key, { value, at: Date.now() });
    } catch (err) {
      // Closed on failure; local testing keeps working.
      console.error("[embed] allowed domains lookup failed", err);
    }
  }
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors ${value}`);
  return response;
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname.startsWith("/embed")) return embedFrame(request);
  const rewrite = pagesHostRewrite(request);
  if (rewrite) return rewrite;
  if (isPublic(request)) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals, static files, and /embed (handled on its own below).
    "/((?!_next|embed|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // The concierge iframe: anonymous, only for its frame-ancestors header.
    "/embed(.*)",
  ],
};
