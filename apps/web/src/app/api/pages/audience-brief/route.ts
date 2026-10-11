// Asks the agent to write an audience brief; the result lands on the audience doc.
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/audience-brief", req);
}
