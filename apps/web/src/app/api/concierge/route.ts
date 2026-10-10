// Streams the agent's NDJSON turn events to the embedded widget. The agent
// server's address stays server-side; the widget only ever talks to this app.

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // @ts-expect-error Node fetch supports duplex streaming.
      duplex: "half",
    });
  } catch (err) {
    return Response.json(
      { error: `The concierge is offline (${String(err)}). Start it with pnpm --filter @slice/agent dev.` },
      { status: 502 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `Agent responded ${upstream.status}` }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
