// Media requests spend the merchant's generation budget, so unlike the Pages
// and Email proxies they only pass when the signed-in merchant owns the
// campaign (checked through Convex with their own token).

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";

export async function ownedBody(req: Request): Promise<{ body: string } | { error: Response }> {
  const body = await req.text();
  let campaignId: unknown;
  try {
    campaignId = (JSON.parse(body) as { campaignId?: unknown }).campaignId;
  } catch {
    return { error: Response.json({ error: "Expected a JSON body" }, { status: 400 }) };
  }
  if (typeof campaignId !== "string" || !campaignId) return { error: Response.json({ error: "campaignId is required" }, { status: 400 }) };
  const { userId, getToken } = await auth();
  if (!userId) return { error: Response.json({ error: "Sign in first" }, { status: 401 }) };
  const token = await getToken({ template: "convex" });
  const campaign = await fetchQuery(api.media.get, { id: campaignId as Id<"mediaCampaigns"> }, { token: token ?? undefined }).catch(() => null);
  if (!campaign) return { error: Response.json({ error: "Unknown campaign" }, { status: 404 }) };
  return { body };
}

/** The same request with the body already read. */
export const rebuilt = (req: Request, body: string) => new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body });

/** A brand setup request passes when the signed-in merchant owns the brand. */
export async function ownedBrandBody(req: Request): Promise<{ body: string } | { error: Response }> {
  const body = await req.text();
  let brandId: unknown;
  try {
    brandId = (JSON.parse(body) as { brandId?: unknown }).brandId;
  } catch {
    return { error: Response.json({ error: "Expected a JSON body" }, { status: 400 }) };
  }
  if (typeof brandId !== "string" || !brandId) return { error: Response.json({ error: "brandId is required" }, { status: 400 }) };
  const { userId, getToken } = await auth();
  if (!userId) return { error: Response.json({ error: "Sign in first" }, { status: 401 }) };
  const token = await getToken({ template: "convex" });
  const brand = await fetchQuery(api.mediaBrands.get, { id: brandId as Id<"mediaBrands"> }, { token: token ?? undefined }).catch(() => null);
  if (!brand) return { error: Response.json({ error: "Unknown brand" }, { status: 404 }) };
  return { body };
}
