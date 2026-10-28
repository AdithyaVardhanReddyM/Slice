// Starts writing each taste group's and each person's version of a campaign; the agent
// replies with the total at once and reports progress on the campaign in Convex.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../../pages/_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { campaignId: "campaign" });
  if ("error" in r) return r.error;
  return proxyJson("/email/personalise", rebuilt(req, r.body));
}
