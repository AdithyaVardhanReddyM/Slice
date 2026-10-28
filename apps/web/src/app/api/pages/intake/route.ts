// Streams the brand intake (crawl → kit → brief → Qloo) from the Pages agent.
import { proxyStream } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brand_id: "pagesBrand" });
  if ("error" in r) return r.error;
  return proxyStream("/pages/intake", rebuilt(req, r.body));
}
