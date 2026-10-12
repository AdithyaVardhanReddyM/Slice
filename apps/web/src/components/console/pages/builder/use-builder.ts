"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postStream } from "@/lib/pages/stream";
import type { Build, PageDoc, Span } from "@/lib/pages/types";

export interface LiveTurn {
  variantId: string;
  kind: "generate" | "edit";
  status: string | null;
  spans: Span[];
  text: string;
  error: string | null;
  /** The merchant message that started it (edit turns). */
  prompt?: string;
}

type HistoryItem = { role: string; text: string; variantId?: string };

function compactHistory(build: Build | null | undefined): HistoryItem[] {
  return (build?.messages ?? []).slice(-12).map((m) => ({ role: m.role, text: m.text, variantId: m.variantId }));
}

/**
 * Drives /api/pages/build turns: one live turn at a time, a queue for
 * "generate all", and a counter the preview iframe keys on so it reloads
 * whenever the agent writes a doc.
 */
export function useBuilder({
  pageId,
  build,
  onStart,
  waitFor,
  model,
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
    async (variantId: string, kind: "generate" | "edit", message?: string) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      onStart?.(variantId);
      setLive({ variantId, kind, status: kind === "generate" ? "Starting" : "Thinking", spans: [], text: "", error: null, prompt: message });
      for await (const ev of postStream(
        "/api/pages/build",
        { page_id: pageId, variant_id: variantId, message: message ?? "", kind, history: compactHistory(buildRef.current), model },
        ctrl.signal,
      )) {
        if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.text } : l));
        else if (ev.type === "span") setLive((l) => (l ? { ...l, spans: [...l.spans, ev.span] } : l));
        else if (ev.type === "text") setLive((l) => (l ? { ...l, text: l.text + ev.delta } : l));
        else if (ev.type === "text_done") setLive((l) => (l ? { ...l, text: ev.text } : l));
        else if (ev.type === "doc") {
          setLastDoc({ variantId, doc: ev.doc });
          setDocVersion((v) => v + 1);
        } else if (ev.type === "error") setLive((l) => (l ? { ...l, error: ev.message, status: null } : l));
        else if (ev.type === "done") {
          setDocVersion((v) => v + 1);
          setLive((l) => (l ? { ...l, status: null, text: ev.text ?? l.text } : l));
        }
      }
      // Give Convex a beat to deliver the persisted message before dropping the live one.
      setTimeout(() => setLive((l) => (l && l.variantId === variantId && !l.error ? null : l)), 800);
    },
    [pageId, onStart, model],
  );

  const generate = useCallback((variantId: string) => runTurn(variantId, "generate"), [runTurn]);

  /** Run turns one after another; the queue shows what is still waiting. */
  const runAll = useCallback(
    async (variantIds: string[], kind: "generate" | "edit", message?: string) => {
      const mine = ++run.current;
      setQueue(variantIds);
      for (const id of variantIds) {
        if (run.current !== mine) return;
        setQueue((q) => q.filter((x) => x !== id));
        if (kind === "generate" && waitFor) {
          onStart?.(id);
          setLive({ variantId: id, kind, status: "Waiting for the audience", spans: [], text: "", error: null, prompt: message });
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
        await runTurn(id, kind, message);
      }
      if (run.current === mine) setQueue([]);
    },
    [runTurn, waitFor, onStart],
  );

  /** Generate every listed variant; `note` is the merchant's ask for these versions. */
  const generateAll = useCallback((variantIds: string[], note?: string) => runAll(variantIds, "generate", note), [runAll]);
  /** The same edit applied to each listed variant in turn. */
  const send = useCallback((variantIds: string | string[], message: string) => runAll(typeof variantIds === "string" ? [variantIds] : variantIds, "edit", message), [runAll]);

  const stop = useCallback(() => {
    run.current++;
    abort.current?.abort();
    setQueue([]);
    setLive(null);
  }, []);

  return { live, queue, docVersion, lastDoc, send, generate, generateAll, stop, busy: !!live && live.status !== null };
}
