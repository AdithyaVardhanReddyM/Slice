// Streams an email editor turn (generate or edit) from the agent.
import { proxyStream } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../../pages/_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { campaignId: "campaign" });
  if ("error" in r) return r.error;
  return proxyStream("/email/build", rebuilt(req, r.body));
}
