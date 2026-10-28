// Asks the agent to write an audience brief; the result lands on the audience doc.
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { audience_id: "audience" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/audience-brief", rebuilt(req, r.body));
}
