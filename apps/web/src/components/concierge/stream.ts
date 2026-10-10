import type { AgentEvent, Message, PageContext, Signal } from "./types";

export interface ChatInput {
  sessionId: string;
  storeKey: string;
  profileId: string | null;
  page: PageContext | null;
  message?: string;
  kind: "user" | "open";
  /** Earlier turns, so the agent can rebuild its memory after a restart. */
  history?: Message[];
  /** What the shopper did on the site this visit. */
  signals?: Signal[];
}

/** The transcript as the agent needs it: who said what, and which products were shown. */
function compactHistory(messages: Message[]) {
  return messages
    .filter((m) => !m.streaming && !m.error && (m.text || m.picks?.length))
    .slice(-12)
    .map((m) => ({
      role: m.role,
      text: m.text,
      opener: Boolean(m.openerFor),
      picks: (m.picks ?? []).map((p) => ({ id: p.product.id, name: p.product.name })),
    }));
}

/** POST a turn to /api/concierge and yield the agent's events as they stream in. */
export async function* chatStream(
  input: ChatInput,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/concierge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: input.sessionId,
      store_key: input.storeKey,
      profile_id: input.profileId,
      page: input.page,
      message: input.message ?? "",
      kind: input.kind,
      history: compactHistory(input.history ?? []),
      signals: (input.signals ?? []).slice(-40),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    yield { type: "error", message: detail.error ?? `Request failed (${res.status})` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line) as AgentEvent;
      } catch {
        // A torn line; skip it.
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as AgentEvent;
    } catch {
      /* ignore */
    }
  }
}
