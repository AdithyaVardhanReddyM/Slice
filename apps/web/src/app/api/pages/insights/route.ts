// Writes the plain-language explanation of a built page, section by section.
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/insights", req);
}
