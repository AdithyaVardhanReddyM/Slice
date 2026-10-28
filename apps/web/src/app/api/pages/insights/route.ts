// Writes the plain-language explanation of a built page, section by section.
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { variant_id: "variant" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/insights", rebuilt(req, r.body));
}
