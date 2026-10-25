import type { NextRequest } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";

// slice.js reports what the shopper does around the concierge: opening it,
// opening one of its picks, adding a pick to the cart. Sent with sendBeacon
// (text/plain, so no CORS preflight) because a pick click navigates away.

const TYPES = new Set(["open", "click", "cart"]);

const cors = (origin: string | null): Record<string, string> =>
  origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let body: { key?: unknown; sessionId?: unknown; type?: unknown; id?: unknown } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    /* falls through to the check below */
  }
  const { key, sessionId, type, id } = body;
  if (
    typeof key !== "string" ||
    !key ||
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof type !== "string" ||
    !TYPES.has(type) ||
    (type !== "open" && (typeof id !== "string" || !id))
  )
    return new Response("Bad request", { status: 400, headers: cors(origin) });

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url)
    return new Response("Convex not configured", {
      status: 503,
      headers: cors(origin),
    });

  try {
    await fetchMutation(
      api.conversations.track,
      {
        key: key.slice(0, 64),
        sessionId: sessionId.slice(0, 64),
        type: type as "open" | "click" | "cart",
        ...(typeof id === "string" ? { productId: id.slice(0, 200) } : {}),
      },
      { url },
    );
    return new Response(null, { status: 204, headers: cors(origin) });
  } catch (err) {
    console.error("[widget/event] failed", err);
    return new Response("Event failed", { status: 502, headers: cors(origin) });
  }
}
