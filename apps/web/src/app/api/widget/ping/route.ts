import type { NextRequest } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";

// slice.js calls this once per shopper session from the merchant's page. The
// host comes from the browser's Origin header, not the body. The script sends
// text/plain so the request stays "simple" and needs no CORS preflight.

const cors = (origin: string | null): Record<string, string> =>
  origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let host: string | null = null;
  try {
    host = origin ? new URL(origin).hostname : null;
  } catch {
    host = null;
  }
  let body: { key?: unknown; page?: unknown; version?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    /* falls through to the check below */
  }
  if (!host || typeof body.key !== "string" || !body.key)
    return new Response("Bad request", { status: 400, headers: cors(origin) });

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url)
    return new Response("Convex not configured", {
      status: 503,
      headers: cors(origin),
    });

  try {
    const result = await fetchMutation(
      api.widgetInstall.ping,
      {
        key: body.key,
        host,
        page: typeof body.page === "string" ? body.page : "/",
        version: typeof body.version === "string" ? body.version : "",
      },
      { url },
    );
    return Response.json(result, { headers: cors(origin) });
  } catch (err) {
    console.error("[widget/ping] failed", err);
    return new Response("Ping failed", { status: 502, headers: cors(origin) });
  }
}
