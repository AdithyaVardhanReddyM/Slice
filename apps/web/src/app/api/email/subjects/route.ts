// Five subject line and preheader options for a campaign, each with its angle.
import { proxyJson } from "../../pages/_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/email/subjects", req);
}
