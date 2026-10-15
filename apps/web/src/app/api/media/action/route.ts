// One studio button (regenerate a shot, edit it, add music...) run by the agent without a chat turn.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export const maxDuration = 120;

export async function POST(req: Request) {
  const r = await ownedBody(req);
  if ("error" in r) return r.error;
  return proxyJson("/media/action", rebuilt(req, r.body));
}
