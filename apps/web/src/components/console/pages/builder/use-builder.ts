"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { TOOL_LABEL, postStream, type BuildStep, type PagesAgentEvent } from "@/lib/pages/stream";
import type { Build, PageDoc, Span } from "@/lib/pages/types";
import type { Attachment } from "./attachments";
import type { PickedElement } from "./visual/picker";

/** write_page's arguments as the model writes them: the page appears in the canvas while it streams. */
export interface Draft {
  css: string;
  html: string;
  fonts: string[];
}

export interface LiveTurn {
  variantId: string;
  /** "plan" is the new-page planner (questions, then the setup), before a page exists. */
  kind: "generate" | "edit" | "plan";
  status: string | null;
  spans: Span[];
  /** The turn so far: thoughts, tool steps and text, in order. */
  steps: BuildStep[];
  text: string;
  error: string | null;
  /** When the turn began (Date.now()); steps' `t` count from here. */
  startedAt: number;
  /** The page being written right now, if write_page is streaming. */
  draft?: Draft | null;
  /** The merchant message that started it (edit turns). */
  prompt?: string;
  attachments?: Attachment[];
  /** Elements the merchant picked on the page for it. */
  elements?: PickedElement[];
  /** Set while the console sets up a new page the agent asked for (shown under the reply). */
  handoff?: string;
}

export const newTurn = (fields: Pick<LiveTurn, "variantId" | "kind" | "status"> & Partial<LiveTurn>): LiveTurn => ({
  spans: [],
  steps: [],
  text: "",
  error: null,
  startedAt: Date.now(),
  ...fields,
});

/** A thought or reply that is still open ends where the next step begins. */
function closeLast(steps: BuildStep[], t: number): BuildStep[] {
  const last = steps[steps.length - 1];
  if (!last || (last.kind !== "thought" && last.kind !== "text") || last.ms !== undefined) return steps;
  return [...steps.slice(0, -1), { ...last, ms: Math.max(0, t - (last.t ?? t)) }];
}

/** Append to the live turn's timeline, merging consecutive thought and text deltas. */
function withStep(steps: BuildStep[], ev: PagesAgentEvent, startedAt: number): BuildStep[] {
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
    const label = ev.label ?? TOOL_LABEL[ev.name] ?? ev.name.replace(/_/g, " ");
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

type Mention = { id: string; name: string };

type HistoryItem = { role: string; text: string; variantId?: string };

function compactHistory(build: Build | null | undefined): HistoryItem[] {
  return (build?.messages ?? []).slice(-12).map((m) => ({ role: m.role, text: m.text, variantId: m.variantId }));
}

/** What the merchant changed by hand since the builder last replied: one line per change. */
function handEditsSince(build: Build | null | undefined): string[] {
  const messages = build?.messages ?? [];
  let i = messages.length;
  while (i > 0 && messages[i - 1].role !== "agent") i--;
  return messages.slice(i).filter((m) => m.role === "edit").flatMap((m) => m.text.split("\n").filter(Boolean));
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
    async (variantId: string, kind: "generate" | "edit", message?: string, attachments?: Attachment[], mentions?: Mention[], elements?: PickedElement[]) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      onStart?.(variantId);
      let newPage: { request: string; audienceIds: string[] } | null = null;
      setLive(newTurn({ variantId, kind, status: kind === "generate" ? "Starting" : "Thinking", prompt: message, attachments, elements }));
      for await (const ev of postStream(
        "/api/pages/build",
        {
          page_id: pageId,
          variant_id: variantId,
          message: message ?? "",
          kind,
          history: compactHistory(buildRef.current),
          model,
          attachments: attachments ?? [],
          mentions: mentions ?? [],
          hand_edits: handEditsSince(buildRef.current),
          elements: (elements ?? []).map(({ label, tag, section, text, html, id }) => ({ label, tag, section, text, html, ...(id ? { id } : {}) })),
        },
        ctrl.signal,
      )) {
        if (ev.type === "new_page") newPage = { request: ev.request, audienceIds: ev.audienceIds ?? [] };
        if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.text } : l));
        else if (ev.type === "span") setLive((l) => (l ? { ...l, spans: [...l.spans, ev.span] } : l));
        else if (ev.type === "thought" || ev.type === "tool_call" || ev.type === "tool_result" || ev.type === "question") setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "text") setLive((l) => (l ? { ...l, text: l.text + ev.delta, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "text_done") setLive((l) => (l ? { ...l, text: ev.text, steps: withStep(l.steps, ev, l.startedAt) } : l));
        else if (ev.type === "draft_start") setLive((l) => (l ? { ...l, draft: { css: "", html: "", fonts: [] } } : l));
        else if (ev.type === "draft") {
          setLive((l) => {
            if (!l) return l;
            const d = l.draft ?? { css: "", html: "", fonts: [] };
            return { ...l, draft: { css: d.css + (ev.css ?? ""), html: d.html + (ev.html ?? ""), fonts: ev.fonts ?? d.fonts } };
          });
        } else if (ev.type === "doc") {
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
    async (variantIds: string[], kind: "generate" | "edit", message?: string, attachments?: Attachment[], mentions?: Mention[], elements?: PickedElement[]) => {
      const mine = ++run.current;
      setQueue(variantIds);
      for (const id of variantIds) {
        if (run.current !== mine) return;
        setQueue((q) => q.filter((x) => x !== id));
        if (kind === "generate" && waitFor) {
          onStart?.(id);
          setLive(newTurn({ variantId: id, kind, status: "Waiting for the audience", prompt: message, attachments }));
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
        await runTurn(id, kind, message, attachments, mentions, elements);
      }
      if (run.current === mine) setQueue([]);
    },
    [runTurn, waitFor, onStart],
  );

  /** Generate the listed variants (a page has one); `note` is the merchant's ask. */
  const generateAll = useCallback((variantIds: string[], note?: string, attachments?: Attachment[]) => runAll(variantIds, "generate", note, attachments), [runAll]);
  /** An edit to the page's version; `mentions` are the audiences the merchant @mentioned, `elements` what they picked on the page. */
  const send = useCallback(
    (variantId: string, message: string, attachments?: Attachment[], mentions?: Mention[], elements?: PickedElement[]) => runAll([variantId], "edit", message, attachments, mentions, elements),
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
