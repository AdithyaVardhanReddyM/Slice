"use client";

// Drives /api/email/build turns: one live turn at a time, its timeline
// (thoughts, tool steps, text, a question) as the chat shows it, and the doc
// versions it writes. The canvas does not need the stream's doc events: it
// follows the campaign through Convex, which the agent saves section by
// section.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postStream, type BuildStep, type Question, type StepPreview } from "@/lib/pages/stream";
import type { Span } from "@/lib/pages/types";
import type { Attachment } from "@/components/console/pages/builder/attachments";

/** The email agent's events (slice_mail/routes.py), the same protocol as /pages/build. */
export type EmailAgentEvent =
  | { type: "start"; messageId?: string }
  | { type: "status"; text: string }
  | { type: "span"; span: Span }
  | { type: "thought"; delta: string }
  | { type: "text"; delta: string }
  | { type: "text_done"; text: string }
  | { type: "tool_call"; name: string; label?: string; args?: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary?: string; problems?: string[] | null; preview?: StepPreview }
  | { type: "question"; question: Question }
  | { type: "doc"; version: number }
  | { type: "error"; message: string }
  | { type: "done"; messageId?: string; text?: string; trace?: Span[]; steps?: BuildStep[]; docVersion?: number };

/** A block the merchant pointed the agent at ("Edit with AI"). */
export interface PickedBlock {
  id: string;
  label: string;
  type: string;
  text: string;
}

export interface EmailLiveTurn {
  kind: "generate" | "edit";
  status: string | null;
  spans: Span[];
  steps: BuildStep[];
  text: string;
  error: string | null;
  startedAt: number;
  prompt?: string;
  attachments?: Attachment[];
  blocks?: PickedBlock[];
  /** Sections written so far this turn (add_section calls that finished). */
  written: number;
  /** Messages in the conversation when the turn began: more means it has been saved. */
  baseCount: number;
}

/** What each tool is doing, in the merchant's words, when the agent did not say. */
export const EMAIL_TOOL_LABEL: Record<string, string> = {
  get_brand: "Reading the brand",
  get_audience: "Reading the audience's taste",
  get_email: "Reading the email",
  start_email: "Setting up the subject line",
  add_section: "Writing a section",
  edit_email: "Editing the email",
  pick_items: "Ranking the catalogue by taste fit",
  list_items: "Looking through the catalogue",
  search_images: "Finding photographs",
  qloo_search: "Looking up on Qloo",
  qloo_insights: "Asking Qloo",
  ask_merchant: "Asking you a question",
  review_email: "Checking it on desktop and phone",
};

/** A thought or reply that is still open ends where the next step begins. */
function closeLast(steps: BuildStep[], t: number): BuildStep[] {
  const last = steps[steps.length - 1];
  if (!last || (last.kind !== "thought" && last.kind !== "text") || last.ms !== undefined) return steps;
  return [...steps.slice(0, -1), { ...last, ms: Math.max(0, t - (last.t ?? t)) }];
}

/** Append an event to the turn's timeline, merging consecutive thought and text deltas. */
export function withStep(steps: BuildStep[], ev: EmailAgentEvent, startedAt: number): BuildStep[] {
  const last = steps[steps.length - 1];
  const t = Date.now() - startedAt;
  if (ev.type === "thought") {
    if (last?.kind === "thought") return [...steps.slice(0, -1), { ...last, text: last.text + ev.delta }];
    return [...closeLast(steps, t), { kind: "thought", text: ev.delta, t }];
  }
  if (ev.type === "text") {
    if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text: last.text + ev.delta }];
    return [...closeLast(steps, t), { kind: "text", text: ev.delta, t }];
  }
  if (ev.type === "text_done") {
    if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text: ev.text }];
    return [...closeLast(steps, t), { kind: "text", text: ev.text, t }];
  }
  if (ev.type === "tool_call") {
    const label = ev.label ?? EMAIL_TOOL_LABEL[ev.name] ?? ev.name.replace(/_/g, " ");
    return [...closeLast(steps, t), { kind: "tool", name: ev.name, label, status: "running", t }];
  }
  if (ev.type === "tool_result") {
    const i = steps.map((s) => s.kind === "tool" && s.name === ev.name && s.status === "running").lastIndexOf(true);
    if (i < 0) return steps;
    const step = steps[i] as Extract<BuildStep, { kind: "tool" }>;
    const summary = ev.summary || (ev.problems?.length ? ev.problems[0] : undefined);
    const next: BuildStep = { ...step, status: ev.ok === false ? "failed" : "done", summary, preview: ev.preview, ms: Math.max(0, t - (step.t ?? t)) };
    return [...steps.slice(0, i), next, ...steps.slice(i + 1)];
  }
  if (ev.type === "question") return [...closeLast(steps, t), { kind: "question", question: ev.question, t }];
  return steps;
}

type HistoryItem = { role: string; text: string };

export function useEmailAgent({
  campaignId,
  history,
  model,
  beforeTurn,
}: {
  campaignId: Id<"emailCampaigns">;
  /** The persisted conversation, newest last. */
  history: HistoryItem[];
  model?: string;
  /** Runs before every turn (save the merchant's edits so the agent reads them). */
  beforeTurn?: () => Promise<void>;
}) {
  const [live, setLive] = useState<EmailLiveTurn | null>(null);
  const abort = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const run = useCallback(
    async (kind: "generate" | "edit", message: string, attachments: Attachment[] = [], blocks: PickedBlock[] = []) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLive({ kind, status: kind === "generate" ? "Starting" : "Thinking", spans: [], steps: [], text: "", error: null, startedAt: Date.now(), prompt: message, attachments, blocks, written: 0, baseCount: historyRef.current.length });
      await beforeTurn?.();
      if (ctrl.signal.aborted) return;
      const body = {
        campaignId,
        kind,
        message,
        history: historyRef.current.slice(-12).map(({ role, text }) => ({ role, text })),
        attachments,
        blocks,
        model,
      };
      for await (const raw of postStream("/api/email/build", body, ctrl.signal)) {
        const ev = raw as unknown as EmailAgentEvent;
        if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.text } : l));
        else if (ev.type === "span") setLive((l) => (l ? { ...l, spans: [...l.spans, ev.span] } : l));
        else if (ev.type === "thought" || ev.type === "tool_call" || ev.type === "question") setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "tool_result")
          setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev, l.startedAt), written: l.written + (ev.name === "add_section" && ev.ok !== false ? 1 : 0) } : l));
        else if (ev.type === "text") setLive((l) => (l ? { ...l, text: l.text + ev.delta, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "text_done") setLive((l) => (l ? { ...l, text: ev.text, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "error") setLive((l) => (l ? { ...l, error: ev.message, status: null } : l));
        else if (ev.type === "done") setLive((l) => (l ? { ...l, status: null, text: ev.text ?? l.text } : l));
      }
      if (ctrl.signal.aborted) return;
      // A stream that ended without "done" (a dropped connection) still ends the turn.
      setLive((l) => (l && l.status !== null && !l.error ? { ...l, status: null } : l));
      // Give Convex a beat to deliver the persisted message before dropping the live one.
      setTimeout(() => setLive((l) => (l && !l.error && l.status === null ? null : l)), 900);
    },
    [campaignId, model, beforeTurn],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setLive(null);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  return {
    live,
    busy: !!live && live.status !== null && !live.error,
    generate: (message: string) => run("generate", message),
    send: (message: string, attachments?: Attachment[], blocks?: PickedBlock[]) => run("edit", message, attachments, blocks),
    stop,
    dismissError: () => setLive((l) => (l?.error ? null : l)),
  };
}

export type EmailAgent = ReturnType<typeof useEmailAgent>;
