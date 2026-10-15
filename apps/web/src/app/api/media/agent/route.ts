// Streams a Media studio turn (make the creatives, or edit one) from the agent.
import { proxyStream } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export const maxDuration = 800;

export async function POST(req: Request) {
  const r = await ownedBody(req);
  if ("error" in r) return r.error;
  return proxyStream("/media/agent", rebuilt(req, r.body));
}
