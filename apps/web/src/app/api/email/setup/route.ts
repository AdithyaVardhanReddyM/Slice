// Reads a brand's homepage into its email kit (logo, colours, fonts, voice, footer,
// items). Progress is written to the brand in Convex as it goes; this replies when done.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../../pages/_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brandId: "emailBrand" });
  if ("error" in r) return r.error;
  return proxyJson("/email/setup", rebuilt(req, r.body));
}
