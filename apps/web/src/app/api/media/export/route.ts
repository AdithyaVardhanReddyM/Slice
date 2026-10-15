// Renders a creative to PNG/JPEG/MP4 and stores the file.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../_lib/guard";

export const maxDuration = 300;

export async function POST(req: Request) {
  const r = await ownedBody(req);
  if ("error" in r) return r.error;
  return proxyJson("/media/export", rebuilt(req, r.body));
}
