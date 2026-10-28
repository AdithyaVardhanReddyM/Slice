// Streams a Pages builder turn (generate or edit) from the agent.
import { proxyStream } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { page_id: "page", variant_id: "variant" });
  if ("error" in r) return r.error;
  return proxyStream("/pages/build", rebuilt(req, r.body));
}
