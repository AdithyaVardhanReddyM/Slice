// Re-captures a brand's homepage (screenshot, markup, photos, anatomy) for the builder.
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brand_id: "pagesBrand" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/capture", rebuilt(req, r.body));
}
