// Re-captures a brand's homepage (screenshot, markup, photos, anatomy) for the builder.
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/capture", req);
}
