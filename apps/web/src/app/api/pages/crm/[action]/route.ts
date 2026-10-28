// CRM calls for Pages audiences (HubSpot, Salesforce through Composio): status,
// connect, lists, contacts, push-link. The agent does the Composio work; see
// apps/agent/slice_pages/crm.py.
import { proxyJson } from "../../_lib/proxy";
import { ownedBody, rebuilt } from "../../_lib/guard";

const ACTIONS = new Set(["status", "connect", "lists", "contacts", "push-link"]);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: `Unknown CRM action ${action}` }, { status: 404 });
  // push-link names the personal page's audience; the rest name a Pages or an Email brand.
  const r = await ownedBody(req, action === "push-link" ? { audience_id: "audience" } : { brand_id: "brand" });
  if ("error" in r) return r.error;
  return proxyJson(`/pages/crm/${action}`, rebuilt(req, r.body));
}
