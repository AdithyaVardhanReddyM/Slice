"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { TOOL_LABEL, postStream, type BuildStep } from "@/lib/pages/stream";
import type { Build, PageDoc, Span } from "@/lib/pages/types";
import type { Attachment } from "./attachments";

export interface LiveTurn {
  variantId: string;
  kind: "generate" | "edit";
  status: string | null;
  spans: Span[];
  /** The turn so far: thoughts, tool steps and text, in order. */
  steps: BuildStep[];
  text: string;
  error: string | null;
  /** The merchant message that started it (edit turns). */
  prompt?: string;
  attachments?: Attachment[];
  /** Set while the console sets up a new page the agent asked for (shown under the reply). */
  handoff?: string;
}

/** Append to the live turn's timeline, merging consecutive thought and text deltas. */
function withStep(steps: BuildStep[], ev: { type: string } & Record<string, unknown>): BuildStep[] {
  const last = steps[steps.length - 1];
  const now = Date.now();
  if (ev.type === "thought") {
    const delta = String(ev.delta ?? "");
    if (last?.kind === "thought") return [...steps.slice(0, -1), { ...last, text: last.text + delta }];
    return [...steps, { kind: "thought", text: delta, ms: now }];
  }
  if (ev.type === "text") {
    const delta = String(ev.delta ?? "");
    if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text: last.text + delta }];
    return [...steps, { kind: "text", text: delta }];
  }
  if (ev.type === "text_done") {
    const text = String(ev.text ?? "");
    if (last?.kind === "text") return [...steps.slice(0, -1), { ...last, text }];
    return [...steps, { kind: "text", text }];
  }
  if (ev.type === "tool_call") {
    const name = String(ev.name ?? "");
    const closed = last?.kind === "thought" && last.ms ? [...steps.slice(0, -1), { ...last, ms: now - last.ms }] : steps;
    return [...closed, { kind: "tool", name, label: String(ev.label ?? TOOL_LABEL[name] ?? name.replace(/_/g, " ")), status: "running", ms: now }];
  }
  if (ev.type === "tool_result") {
    const name = String(ev.name ?? "");
    const i = steps.map((s) => s.kind === "tool" && s.name === name && s.status === "running").lastIndexOf(true);
    if (i < 0) return steps;
    const step = steps[i] as Extract<BuildStep, { kind: "tool" }>;
    const problems = Array.isArray(ev.problems) ? (ev.problems as string[]) : [];
    const summary = typeof ev.summary === "string" && ev.summary ? ev.summary : problems.length ? problems[0] : undefined;
    const next: BuildStep = { ...step, status: ev.ok === false ? "failed" : "done", summary, ms: step.ms ? now - step.ms : undefined };
    return [...steps.slice(0, i), next, ...steps.slice(i + 1)];
  }
  return steps;
}

type Mention = { id: string; name: string };

type HistoryItem = { role: string; text: string; variantId?: string };

function compactHistory(build: Build | null | undefined): HistoryItem[] {
  return (build?.messages ?? []).slice(-12).map((m) => ({ role: m.role, text: m.text, variantId: m.variantId }));
}

/**
 * Drives /api/pages/build turns: one live turn at a time, a queue for
 * turns waiting on it, and a counter the preview iframe keys on so it reloads
 * whenever the agent writes a doc.
 */
export function useBuilder({
  pageId,
  build,
  onStart,
  waitFor,
  model,
  onNewPage,
}: {
  pageId: Id<"pages">;
  build: Build | null | undefined;
  /** Called when a turn begins, so the UI can follow the version being built. */
  onStart?: (variantId: string) => void;
  /**
   * Before a generate turn: resolves true once the version can be built (its
   * audience is compiled), false to skip it with the message it throws. Calls
   * `status` while it waits.
   */
  waitFor?: (variantId: string, status: (text: string) => void, stopped: () => boolean) => Promise<boolean>;
  /** The agent's model for every turn (see lib/pages/models). */
  model?: string;
  /**
   * The agent asked for a separate page (another audience): called once the
   * turn ends, with `status` for the live turn while the page is set up.
   * Rejecting shows the error on the turn.
   */
  onNewPage?: (ask: { request: string; audienceIds: string[] }, status: (text: string) => void) => Promise<void>;
}) {
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [docVersion, setDocVersion] = useState(0);
  const [lastDoc, setLastDoc] = useState<{ variantId: string; doc: PageDoc } | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Bumped by stop(), so a running "generate all" loop knows to end.
  const run = useRef(0);
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  }, [build]);

  const runTurn = useCallback(
    async (variantId: string, kind: "generate" | "edit", message?: string, attachments?: Attachment[], mentions?: Mention[]) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      onStart?.(variantId);
      let newPage: { request: string; audienceIds: string[] } | null = null;
      setLive({ variantId, kind, status: kind === "generate" ? "Starting" : "Thinking", spans: [], steps: [], text: "", error: null, prompt: message, attachments });
      for await (const ev of postStream(
        "/api/pages/build",
        { page_id: pageId, variant_id: variantId, message: message ?? "", kind, history: compactHistory(buildRef.current), model, attachments: attachments ?? [], mentions: mentions ?? [] },
        ctrl.signal,
      )) {
        if (ev.type === "new_page") newPage = { request: ev.request, audienceIds: ev.audienceIds ?? [] };
        if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.text } : l));
        else if (ev.type === "span") setLive((l) => (l ? { ...l, spans: [...l.spans, ev.span] } : l));
        else if (ev.type === "thought" || ev.type === "tool_call" || ev.type === "tool_result") setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev) } : l));
        else if (ev.type === "text") setLive((l) => (l ? { ...l, text: l.text + ev.delta, steps: withStep(l.steps, ev) } : l));
        else if (ev.type === "text_done") setLive((l) => (l ? { ...l, text: ev.text, steps: withStep(l.steps, ev) } : l));
        else if (ev.type === "doc") {
          setLastDoc({ variantId, doc: ev.doc });
          setDocVersion((v) => v + 1);
        } else if (ev.type === "error") setLive((l) => (l ? { ...l, error: ev.message, status: null } : l));
        else if (ev.type === "done") {
          setDocVersion((v) => v + 1);
          setLive((l) => (l ? { ...l, status: null, text: ev.text ?? l.text } : l));
        }
      }
      if (newPage && onNewPage && !ctrl.signal.aborted) {
        const status = (text: string) => setLive((l) => (l && l.variantId === variantId ? { ...l, status: text, handoff: text } : l));
        status("Planning the new page");
        try {
          await onNewPage(newPage, status);
        } catch (err) {
          setLive((l) => (l ? { ...l, status: null, error: `Could not start the new page: ${String((err as Error).message ?? err).replace(/^Error: /, "")}` } : l));
        }
        return;
      }
      // Give Convex a beat to deliver the persisted message before dropping the live one.
      setTimeout(() => setLive((l) => (l && l.variantId === variantId && !l.error ? null : l)), 800);
    },
    [pageId, onStart, model, onNewPage],
  );

  const generate = useCallback((variantId: string) => runTurn(variantId, "generate"), [runTurn]);

  /** Run turns one after another; the queue shows what is still waiting. */
  const runAll = useCallback(
    async (variantIds: string[], kind: "generate" | "edit", message?: string, attachments?: Attachment[], mentions?: Mention[]) => {
      const mine = ++run.current;
      setQueue(variantIds);
      for (const id of variantIds) {
        if (run.current !== mine) return;
        setQueue((q) => q.filter((x) => x !== id));
        if (kind === "generate" && waitFor) {
          onStart?.(id);
          setLive({ variantId: id, kind, status: "Waiting for the audience", spans: [], steps: [], text: "", error: null, prompt: message, attachments });
          let ok = false;
          try {
            ok = await waitFor(id, (text) => setLive((l) => (l && l.variantId === id ? { ...l, status: text } : l)), () => run.current !== mine);
          } catch (err) {
            setLive((l) => (l ? { ...l, status: null, error: String((err as Error).message ?? err) } : l));
            continue;
          }
          if (run.current !== mine) return;
          if (!ok) continue;
        }
        await runTurn(id, kind, message, attachments, mentions);
      }
      if (run.current === mine) setQueue([]);
    },
    [runTurn, waitFor, onStart],
  );

  /** Generate the listed variants (a page has one); `note` is the merchant's ask. */
  const generateAll = useCallback((variantIds: string[], note?: string, attachments?: Attachment[]) => runAll(variantIds, "generate", note, attachments), [runAll]);
  /** An edit to the page's version; `mentions` are the audiences the merchant @mentioned. */
  const send = useCallback(
    (variantId: string, message: string, attachments?: Attachment[], mentions?: Mention[]) => runAll([variantId], "edit", message, attachments, mentions),
    [runAll],
  );

  const stop = useCallback(() => {
    run.current++;
    abort.current?.abort();
    setQueue([]);
    setLive(null);
  }, []);

  return { live, queue, docVersion, lastDoc, send, generate, generateAll, stop, busy: !!live && live.status !== null };
}
