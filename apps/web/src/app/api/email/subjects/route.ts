// Five subject line and preheader options for a campaign, each with its angle.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../../pages/_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { campaignId: "campaign" });
  if ("error" in r) return r.error;
  return proxyJson("/email/subjects", rebuilt(req, r.body));
}
