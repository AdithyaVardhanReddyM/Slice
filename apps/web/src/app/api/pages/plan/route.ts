// Plans a new page from the merchant's first builder prompt: settings, items and audiences.
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/plan", req);
}
