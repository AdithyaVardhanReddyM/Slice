// Plans a new page from the merchant's first builder prompt: settings, items and audiences.
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brand_id: "pagesBrand" }, { source_page_id: "page" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/plan", rebuilt(req, r.body));
}
