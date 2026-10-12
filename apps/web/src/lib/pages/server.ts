import { auth } from "@clerk/nextjs/server";

// Server-only helpers for /api/pages/*: the merchant's Convex token (to check
// they own what they're asking the agent to work on) and the agent call.

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";

/** The signed-in merchant's Convex JWT, or null when signed out. */
export async function convexToken(): Promise<string | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  return getToken({ template: "convex" });
}

export async function callAgent(path: string, body: unknown): Promise<Response> {
  const secret = process.env.AGENT_SECRET;
  try {
    const upstream = await fetch(`${AGENT_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json({ ok: false, error: `The agent is offline (${String(err)})` }, { status: 502 });
  }
}

export async function readId(req: Request, key: string): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = body?.[key];
  return typeof id === "string" && /^[a-z0-9]{10,64}$/i.test(id) ? id : null;
}
