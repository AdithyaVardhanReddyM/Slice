// NDJSON reader for the Pages agent routes (/api/pages/intake and
// /api/pages/build). Same shape as the concierge's stream.ts: POST, then yield
// one parsed event per line as they arrive.

import type { PageDoc } from "@slice/backend/convex/pagesTypes";
import type { Span } from "./types";

export type PagesAgentEvent =
  | { type: "status"; text: string }
  | { type: "span"; span: Span }
  | { type: "text"; delta: string }
  | { type: "text_done"; text: string }
  | { type: "doc"; doc: PageDoc }
  | { type: "error"; message: string }
  | { type: "done"; messageId?: string; text?: string; trace?: Span[]; [k: string]: unknown };

export async function* postStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<PagesAgentEvent> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    yield { type: "error", message: `Request failed (${String(err)})` };
    return;
  }
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => ({}));
    yield { type: "error", message: detail.error ?? `Request failed (${res.status})` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (line: string): PagesAgentEvent | null => {
    try {
      return JSON.parse(line) as PagesAgentEvent;
    } catch {
      return null;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const ev = parse(line);
      if (ev) yield ev;
    }
  }
  if (buffer.trim()) {
    const ev = parse(buffer.trim());
    if (ev) yield ev;
  }
}

/** POST JSON and return the parsed body, or throw with the server's message. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
