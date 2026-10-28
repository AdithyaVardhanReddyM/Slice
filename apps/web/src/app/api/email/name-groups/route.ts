// Short human names (and audience briefs) for a contact list's taste groups.
import { proxyJson } from "../../pages/_lib/proxy";
import { ownedBody, rebuilt } from "../../pages/_lib/guard";

export async function POST(req: Request) {
  const r = await ownedBody(req, { listId: "list" });
  if ("error" in r) return r.error;
  return proxyJson("/email/name-groups", rebuilt(req, r.body));
}
