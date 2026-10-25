// A widget's store connection: Shopify through Composio, WooCommerce over its
// REST API. The agent does the platform work (apps/agent/slice_catalog); this
// passes a request on only when the signed-in merchant owns the widget, and
// fills in the addresses the platforms send the merchant (and WooCommerce its
// key) back to, so the browser never chooses them.
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@slice/backend/convex/_generated/api";
import { appOrigin } from "@/lib/app-origin";
import { proxyJson } from "../../../pages/_lib/proxy";

const ACTIONS = new Set(["status", "connect", "woo-keys", "sync", "disconnect"]);

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ACTIONS.has(action)) return Response.json({ error: `Unknown catalog action ${action}` }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const widgetKey = str(body.widgetKey);
  if (!widgetKey) return Response.json({ error: "widgetKey is required" }, { status: 400 });

  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ error: "Sign in first" }, { status: 401 });
  const token = await getToken({ template: "convex" });
  const owned = await fetchQuery(api.catalogConnections.forWidget, { key: widgetKey }, { token: token ?? undefined }).catch(() => null);
  if (!owned) return Response.json({ error: "Unknown widget" }, { status: 404 });

  // WooCommerce only posts keys to https, so local dev sets SLICE_PUBLIC_URL to a tunnel.
  const origin = process.env.SLICE_PUBLIC_URL?.replace(/\/+$/, "") || (await appOrigin());
  const platform = str(body.platform);
  const payload = {
    widget_key: widgetKey,
    platform,
    shop: str(body.shop),
    site: str(body.site),
    consumer_key: str(body.consumerKey),
    consumer_secret: str(body.consumerSecret),
    ...(action === "connect"
      ? {
          callback_url: `${origin}/api/concierge/catalog/woocommerce/callback`,
          return_url: `${origin}/store-connected?platform=${platform ?? ""}`,
        }
      : {}),
  };
  return proxyJson(
    `/concierge/catalog/${action}`,
    new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  );
}
