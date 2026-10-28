// Turns the audience builder's "describe them" sentence into conditions (agent, Qloo-resolved).
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brand_id: "pagesBrand" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/audience-parse", rebuilt(req, r.body));
}
