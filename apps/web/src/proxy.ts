import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

// Published pages and their tracker never touch Clerk: they are anonymous and
// served on brand subdomains.
const isPagesPublic = createRouteMatcher(["/p(.*)", "/api/pages/track", "/api/pages/form"]);

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

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const rewrite = pagesHostRewrite(request);
  if (rewrite) return rewrite;
  if (isPagesPublic(request)) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals, static files, and /embed (anonymous, runs in third-party iframes).
    "/((?!_next|embed|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
