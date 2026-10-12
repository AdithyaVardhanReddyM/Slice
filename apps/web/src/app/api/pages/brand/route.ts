import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { callAgent, convexToken, readId } from "@/lib/pages/server";

// Reads the merchant's website into a brand kit (apps/agent/slice_agent/pages/brand.py).
// The agent writes progress to Convex as it goes; the page watches the brand doc.

export const maxDuration = 300;

export async function POST(req: Request) {
  const token = await convexToken();
  if (!token) return Response.json({ ok: false, error: "Sign in first" }, { status: 401 });
  const brandId = await readId(req, "brandId");
  if (!brandId) return Response.json({ ok: false, error: "brandId required" }, { status: 400 });
  const brand = await fetchQuery(api.brands.get, { id: brandId as Id<"brands"> }, { token }).catch(() => null);
  if (!brand) return Response.json({ ok: false, error: "Brand not found" }, { status: 404 });
  return callAgent("/pages/brand", { brand_id: brandId });
}
