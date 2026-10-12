import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { callAgent, convexToken, readId } from "@/lib/pages/server";

// Writes a page's taste-segment variants (apps/agent/slice_agent/pages/generate.py).
// The agent writes progress to Convex as it goes; the editor watches the page doc.

export const maxDuration = 300;

export async function POST(req: Request) {
  const token = await convexToken();
  if (!token) return Response.json({ ok: false, error: "Sign in first" }, { status: 401 });
  const pageId = await readId(req, "pageId");
  if (!pageId) return Response.json({ ok: false, error: "pageId required" }, { status: 400 });
  const found = await fetchQuery(api.pages.get, { id: pageId as Id<"pages"> }, { token }).catch(() => null);
  if (!found) return Response.json({ ok: false, error: "Page not found" }, { status: 404 });
  return callAgent("/pages/generate", { page_id: pageId });
}
