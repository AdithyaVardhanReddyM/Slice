// Asks the agent to write the taste brief for a freshly built profile. The
// build screen calls this so the first chat turn starts with a brief in hand.

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const upstream = await fetch(`${AGENT_URL}/brief`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json({ ok: false, error: `The concierge is offline (${String(err)})` }, { status: 502 });
  }
}
