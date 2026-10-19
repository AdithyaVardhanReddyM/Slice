// Reads a brand's website into its Media guidelines (logo, colours, fonts, voice, imagery,
// products, photos). Progress is written to the brand in Convex as it goes; this replies when done.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBrandBody, rebuilt } from "../_lib/guard";

export const maxDuration = 180;

export async function POST(req: Request) {
  const r = await ownedBrandBody(req);
  if ("error" in r) return r.error;
  return proxyJson("/media/brand", rebuilt(req, r.body));
}
