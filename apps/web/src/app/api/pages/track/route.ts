import type { NextRequest } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import { ingestArgs, readJson, sanitizeBatch } from "@/components/pages/track-server";

// Tracker ingest. Accepts JSON from fetch (application/json) and from
// navigator.sendBeacon (Blob, same content type). Always answers quickly; a
// failed ingest is logged, not surfaced to the visitor.

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body || typeof body !== "object") return new Response("Bad request", { status: 400 });
  const batch = sanitizeBatch(body);
  if (!batch) return new Response("Bad batch", { status: 400 });

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return new Response("Convex not configured", { status: 503 });

  const overrides = (body as { overrides?: { city?: string; country?: string } }).overrides;
  try {
    await fetchMutation(api.pagesEvents.ingest, ingestArgs(batch, req.headers, overrides), { url });
  } catch (err) {
    console.error("[pages/track] ingest failed", err);
    return new Response("Ingest failed", { status: 502 });
  }
  return new Response(null, { status: 204 });
}
