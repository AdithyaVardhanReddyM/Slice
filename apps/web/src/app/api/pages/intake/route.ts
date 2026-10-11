// Streams the brand intake (crawl → kit → brief → Qloo) from the Pages agent.
import { proxyStream } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyStream("/pages/intake", req);
}
