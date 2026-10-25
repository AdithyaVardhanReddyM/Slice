// WooCommerce posts the read-only key a merchant just approved on its
// /wc-auth screen here, server to server, so there's no session to check.
// The agent matches it to the widget by the one-time state it sent as
// user_id, and only then stores it. WooCommerce shows the merchant an error
// unless this answers 200.

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${AGENT_URL}/concierge/catalog/woo-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const result = (await res.json()) as { ok?: boolean; error?: string };
    return Response.json(result, { status: res.ok && result.ok ? 200 : 400 });
  } catch (err) {
    return Response.json({ ok: false, error: `The Slice agent is offline (${String(err)})` }, { status: 502 });
  }
}
