// Streams a Pages builder turn (generate or edit) from the agent.
import { proxyStream } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyStream("/pages/build", req);
}
