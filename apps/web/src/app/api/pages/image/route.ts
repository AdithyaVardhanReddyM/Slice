// Image picker: Pexels search or a generated image, as ImageRef[].
import { proxyJson } from "../_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { brand_id: "brand" });
  if ("error" in r) return r.error;
  return proxyJson("/pages/image", rebuilt(req, r.body));
}
