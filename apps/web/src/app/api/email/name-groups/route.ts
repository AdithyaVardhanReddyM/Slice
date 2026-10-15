// Short human names (and audience briefs) for a contact list's taste groups.
import { proxyJson } from "../../pages/_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/email/name-groups", req);
}
