// Pages and Email requests spend the agent's model and Qloo budget on a merchant's
// brand, so (like Media's, see api/media/_lib/guard.ts) they only pass when the
// signed-in merchant owns every record the body names. The Convex reads used
// here are not owner-scoped (published pages read them anonymously), so the
// brand's `owner` is compared with the Clerk user here. Demo brands are copied
// into each account, so every copy has its viewer as owner.

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";

/**
 * What a body field names. `brand` is a Pages or an Email brand: the CRM and
 * image tools serve both consoles.
 */
type Kind = "pagesBrand" | "emailBrand" | "brand" | "page" | "variant" | "audience" | "upload" | "campaign" | "list";
type Fields = Record<string, Kind>;

// Each lookup answers the owning brand; a wrong table's id fails Convex's validator and reads as unknown.
const missing = () => null;
const pagesBrandOwner = async (id: string) => (await fetchQuery(api.pagesBrands.get, { id: id as Id<"pagesBrands"> }).catch(missing))?.owner;
const emailBrandOwner = async (id: string) => (await fetchQuery(api.emailBrands.get, { id: id as Id<"emailBrands"> }).catch(missing))?.owner;

async function ownerOf(kind: Kind, id: string): Promise<string | undefined> {
  switch (kind) {
    case "pagesBrand":
      return pagesBrandOwner(id);
    case "emailBrand":
      return emailBrandOwner(id);
    case "brand":
      return (await pagesBrandOwner(id)) ?? emailBrandOwner(id);
    case "page": {
      const found = await fetchQuery(api.pages.get, { id: id as Id<"pages"> }).catch(missing);
      return found ? pagesBrandOwner(found.page.brandId) : undefined;
    }
    case "variant": {
      const variant = await fetchQuery(api.pages.variant, { id: id as Id<"pagesVariants"> }).catch(missing);
      return variant ? pagesBrandOwner(variant.brandId) : undefined;
    }
    case "audience": {
      const audience = await fetchQuery(api.pagesAudiences.get, { id: id as Id<"pagesAudiences"> }).catch(missing);
      return audience ? pagesBrandOwner(audience.brandId) : undefined;
    }
    case "upload": {
      const upload = await fetchQuery(api.pagesUploads.get, { id: id as Id<"pagesUploads"> }).catch(missing);
      return upload ? pagesBrandOwner(upload.brandId) : undefined;
    }
    case "campaign": {
      const campaign = await fetchQuery(api.emailCampaigns.get, { id: id as Id<"emailCampaigns"> }).catch(missing);
      return campaign ? emailBrandOwner(campaign.brandId) : undefined;
    }
    case "list": {
      const list = await fetchQuery(api.emailLists.get, { id: id as Id<"emailLists"> }).catch(missing);
      return list ? emailBrandOwner(list.brandId) : undefined;
    }
  }
}

/**
 * Reads the body and passes it when the signed-in merchant owns what it names:
 * every `required` field (an id), and each id in the `optional` fields that are
 * there (an id or a list of ids).
 */
export async function ownedBody(req: Request, required: Fields, optional: Fields = {}): Promise<{ body: string } | { error: Response }> {
  const { userId } = await auth();
  if (!userId) return { error: Response.json({ error: "Sign in first" }, { status: 401 }) };
  const body = await req.text();
  let fields: Record<string, unknown>;
  try {
    fields = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { error: Response.json({ error: "Expected a JSON body" }, { status: 400 }) };
  }
  if (!fields || typeof fields !== "object") return { error: Response.json({ error: "Expected a JSON body" }, { status: 400 }) };

  const refs: { field: string; kind: Kind; id: string }[] = [];
  for (const [field, kind] of Object.entries(required)) {
    const id = fields[field];
    if (typeof id !== "string" || !id) return { error: Response.json({ error: `${field} is required` }, { status: 400 }) };
    refs.push({ field, kind, id });
  }
  for (const [field, kind] of Object.entries(optional)) {
    const value = fields[field];
    if (value === undefined || value === null) continue;
    const ids = Array.isArray(value) ? value : [value];
    if (!ids.every((id): id is string => typeof id === "string" && !!id)) return { error: Response.json({ error: `${field} must be ids` }, { status: 400 }) };
    refs.push(...ids.map((id) => ({ field, kind, id })));
  }

  const owners = await Promise.all(refs.map((r) => ownerOf(r.kind, r.id)));
  const foreign = refs.find((_, i) => owners[i] !== userId);
  if (foreign) return { error: Response.json({ error: `Unknown ${foreign.field}` }, { status: 404 }) };
  return { body };
}

/** The same request with the body already read. */
export const rebuilt = (req: Request, body: string) => new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
