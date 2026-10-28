// Asks the agent to name the clusters of a CSV upload.
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { upload_id: "upload" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/name-clusters", rebuilt(req, r.body));
}
