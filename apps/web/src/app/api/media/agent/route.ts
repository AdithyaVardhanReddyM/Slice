// Streams a Media studio turn (make the creatives, or edit one) from the agent.
import { proxyStream } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

// Vercel Hobby allows at most 300 s per request (Pro: 800).
export const maxDuration = 300;

export async function POST(req: Request) {
  const r = await ownedBody(req);
  if ("error" in r) return r.error;
  return proxyStream("/media/agent", rebuilt(req, r.body));
}
