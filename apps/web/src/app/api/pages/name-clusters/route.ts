// Asks the agent to name the clusters of a CSV upload.
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/name-clusters", req);
}
