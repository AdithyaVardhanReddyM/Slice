// Starts writing each person's version of a people campaign; the agent replies with the
// total at once and reports progress on the campaign in Convex.
import { proxyJson } from "../../pages/_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/email/personalise", req);
}
