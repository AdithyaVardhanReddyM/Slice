import { NextResponse, type NextRequest } from "next/server";

// Deploy a single store from this app by setting STORE=<slug> (e.g. "tagide"
// on Vercel). The root redirects to that store and every other store's paths
// render its not-found page. Unset locally, so all stores stay reachable.
const only = process.env.STORE?.trim();

export function proxy(request: NextRequest) {
  if (!only) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/") return NextResponse.redirect(new URL(`/${only}`, request.url));
  if (pathname === `/${only}` || pathname.startsWith(`/${only}/`)) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/${only}/not-found-${Date.now()}`, request.url), { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
