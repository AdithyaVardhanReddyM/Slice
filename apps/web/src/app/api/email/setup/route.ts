// Reads a brand's homepage into its email kit (logo, colours, fonts, voice, footer,
// items). Progress is written to the brand in Convex as it goes; this replies when done.
import { proxyJson } from "../../pages/_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/email/setup", req);
}
