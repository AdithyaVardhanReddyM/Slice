// NDJSON reader for the Pages agent routes (/api/pages/intake and
// /api/pages/build). Same shape as the concierge's stream.ts: POST, then yield
// one parsed event per line as they arrive.

import type { PageDoc } from "@slice/backend/convex/pagesTypes";
import type { Span } from "./types";

export type PagesAgentEvent =
  | { type: "status"; text: string }
  | { type: "span"; span: Span }
  | { type: "thought"; delta: string }
  | { type: "tool_call"; name: string; label?: string; args?: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary?: string; problems?: string[] | null; preview?: StepPreview }
  | { type: "text"; delta: string }
  | { type: "text_done"; text: string }
  | { type: "doc"; doc: PageDoc }
  /** write_page has started streaming its arguments; `draft` events carry them as they are written. */
  | { type: "draft_start" }
  | { type: "draft"; css?: string; html?: string; fonts?: string[] }
  /** The agent asked the merchant a question (ask_merchant); the turn ends on it. */
  | { type: "question"; question: Question }
  /** The agent asked for a separate page (another audience); the console plans and opens it. */
  | { type: "new_page"; request: string; audienceIds: string[] }
  | { type: "error"; message: string }
  | { type: "done"; messageId?: string; text?: string; trace?: Span[]; [k: string]: unknown };

/** What a tool brought back, small enough to show: photos, faces from Qloo, words, review notes. */
export interface StepPreview {
  images?: string[];
  faces?: { name: string; image: string }[];
  chips?: string[];
  notes?: string[];
}

/** An option the planner or the builder offers; `audienceId` / `itemId` draw that audience's face or item's photo. */
export interface QuestionOption {
  label: string;
  detail?: string;
  icon?: string;
  audienceId?: string;
  itemId?: string;
}

export interface Question {
  text: string;
  options: QuestionOption[];
  /** Placeholder for a typed answer; empty when only the options make sense. */
  other?: string;
}

/** The page the planner set up, as the chat recaps it. */
export interface PlanRecap {
  title: string;
  goal: string;
  offer?: string;
  cta: { label: string; href: string };
  itemIds: string[];
  audienceIds: string[];
  /** Audiences the plan creates from plain words (not saved yet when the recap shows). */
  newAudiences?: string[];
}

/**
 * One entry of an agent turn as the chat shows it; persisted on build messages
 * as `steps`. `t` is when it began (ms into the turn), `ms` how long it took.
 */
export type BuildStep =
  | { kind: "thought"; text: string; t?: number; ms?: number }
  | { kind: "tool"; name: string; label: string; status: "running" | "done" | "failed"; summary?: string; preview?: StepPreview; t?: number; ms?: number }
  | { kind: "text"; text: string; t?: number; ms?: number }
  | { kind: "question"; question: Question; t?: number }
  /** The planner's setup of a new page; `confirm` while it waits for the merchant's go-ahead. */
  | { kind: "plan"; plan: PlanRecap; confirm?: boolean; t?: number };

/** What a tool is doing, in the merchant's words, when the agent did not say. */
export const TOOL_LABEL: Record<string, string> = {
  get_brand_site: "Reading the brand's homepage",
  get_audience_detail: "Reading the audience's taste profile",
  qloo_places: "Asking Qloo for places this audience would love",
  qloo_culture: "Asking Qloo for cultural references",
  qloo_insights: "Asking Qloo",
  qloo_search: "Looking up on Qloo",
  pick_items: "Ranking the items by taste fit",
  search_images: "Finding photographs",
  generate_image: "Generating an image",
  fetch_reference: "Reading the reference site",
  describe_image: "Looking at the image",
  google_search: "Searching the web",
  get_page: "Reading the page",
  write_page: "Writing the page",
  edit_page: "Editing the page",
  review_page: "Reviewing the page against the brand's homepage",
  start_new_page: "Starting a new page",
  explain_page: "Writing up why the page is built this way",
  ask_merchant: "Asking you a question",
  remember: "Remembering that",
};

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
