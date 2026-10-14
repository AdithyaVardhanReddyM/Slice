// CRM calls for Pages audiences (HubSpot, Salesforce through Composio): status,
// connect, lists, contacts, push-link. The agent does the Composio work; see
// apps/agent/slice_pages/crm.py.
import { proxyJson } from "../../_lib/proxy";

const ACTIONS = new Set(["status", "connect", "lists", "contacts", "push-link"]);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: `Unknown CRM action ${action}` }, { status: 404 });
  return proxyJson(`/pages/crm/${action}`, req);
}
