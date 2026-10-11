import type { NextRequest } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { TrackBatch } from "@slice/backend/convex/pagesTypes";
import type { FormBody } from "@/components/pages/types";
import { ingestArgs, readJson, sanitizeBatch } from "@/components/pages/track-server";

// Form section submissions: wrapped as a one-event `form_submit` batch and
// ingested like any other event (the backend also writes a pagesForms row).

export async function POST(req: NextRequest) {
  const body = (await readJson(req)) as Partial<FormBody> | null;
  if (!body || typeof body !== "object") return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (!body.fields || typeof body.fields !== "object") return Response.json({ ok: false, error: "No fields" }, { status: 400 });

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.fields).slice(0, 40)) {
    if (typeof v === "string") fields[k.slice(0, 64)] = v.slice(0, 2000);
  }

  const raw: TrackBatch = {
    pageId: String(body.pageId ?? ""),
    variantId: String(body.variantId ?? ""),
    visitorId: String(body.visitorId ?? ""),
    sessionId: String(body.sessionId ?? ""),
    resolvedBy: String(body.resolvedBy ?? "default"),
    path: String(body.path ?? "/"),
    events: [{ type: "form_submit", at: Date.now(), sectionId: String(body.sectionId ?? "form"), label: String(body.sectionId ?? "form"), data: fields }],
  };
  const batch = sanitizeBatch(raw);
  if (!batch) return Response.json({ ok: false, error: "Bad batch" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return Response.json({ ok: false, error: "Convex not configured" }, { status: 503 });

  try {
    await fetchMutation(api.pagesEvents.ingest, ingestArgs(batch, req.headers, body.overrides), { url });
  } catch (err) {
    console.error("[pages/form] ingest failed", err);
    return Response.json({ ok: false, error: "Ingest failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
