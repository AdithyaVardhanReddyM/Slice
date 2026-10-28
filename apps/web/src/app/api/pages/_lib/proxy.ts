// Shared proxy helpers for the agent routes (Pages and Email). The agent's address stays
// server-side; the console only ever talks to this app.

import { AGENT_URL, agentHeaders } from "@/lib/agent";

const offline = (err: unknown) =>
  Response.json(
    { error: `The Slice agent is offline (${String(err)}). Start it with pnpm --filter @slice/agent dev.` },
    { status: 502 },
  );

/** Forward a JSON POST and stream the agent's NDJSON back unchanged. */
export async function proxyStream(path: string, req: Request) {
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}${path}`, {
      method: "POST",
      headers: agentHeaders(),
      body,
      // @ts-expect-error Node fetch supports duplex streaming.
      duplex: "half",
    });
  } catch (err) {
    return offline(err);
  }
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json({ error: `Agent responded ${upstream.status}${text ? `: ${text.slice(0, 300)}` : ""}` }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Forward a JSON POST and return the agent's JSON reply. */
export async function proxyJson(path: string, req: Request) {
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}${path}`, {
      method: "POST",
      headers: agentHeaders(),
      body,
    });
  } catch (err) {
    return offline(err);
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    return Response.json({ error: `Agent responded ${upstream.status}${text ? `: ${text.slice(0, 300)}` : ""}` }, { status: 502 });
  }
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
