// The Python agent's address, and the key the hosted agent checks on every
// request outside /mac (AGENT_API_KEY, the same value on both sides). Both stay
// server-side; the browser only ever talks to this app.

export const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000";

export function agentHeaders(headers: Record<string, string> = { "Content-Type": "application/json" }) {
  const key = process.env.AGENT_API_KEY;
  return key ? { ...headers, "X-Slice-Key": key } : headers;
}
