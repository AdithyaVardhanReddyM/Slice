// Image picker: Pexels search or a generated image, as ImageRef[].
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/image", req);
}
