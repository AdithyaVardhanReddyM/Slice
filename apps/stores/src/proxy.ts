import { NextResponse, type NextRequest } from "next/server";

// Deploy a single store from this app by setting STORE=<slug> (e.g. "tagide"
// on Vercel), or a few with a comma list ("marlow,fold"). The root redirects to
// the first and every other store's paths render its not-found page. Unset
// locally, so all stores stay reachable.
const only = (process.env.STORE ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function proxy(request: NextRequest) {
  if (!only.length) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/") return NextResponse.redirect(new URL(`/${only[0]}`, request.url));
  if (only.some((s) => pathname === `/${s}` || pathname.startsWith(`/${s}/`))) return NextResponse.next();
  return NextResponse.rewrite(new URL(`/${only[0]}/not-found-${Date.now()}`, request.url), { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
