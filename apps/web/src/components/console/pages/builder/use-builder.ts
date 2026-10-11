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
}: {
  pageId: Id<"pages">;
  build: Build | null | undefined;
  /** Called when a turn begins, so the UI can follow the version being built. */
  onStart?: (variantId: string) => void;
}) {
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [docVersion, setDocVersion] = useState(0);
  const [lastDoc, setLastDoc] = useState<{ variantId: string; doc: PageDoc } | null>(null);
  const abort = useRef<AbortController | null>(null);
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
        { page_id: pageId, variant_id: variantId, message: message ?? "", kind, history: compactHistory(buildRef.current) },
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
    [pageId, onStart],
  );

  const send = useCallback((variantId: string, message: string) => runTurn(variantId, "edit", message), [runTurn]);
  const generate = useCallback((variantId: string) => runTurn(variantId, "generate"), [runTurn]);

  /** Generate every listed variant, one after another. */
  const generateAll = useCallback(
    async (variantIds: string[]) => {
      setQueue(variantIds);
      for (const id of variantIds) {
        setQueue((q) => q.filter((x) => x !== id));
        await runTurn(id, "generate");
      }
      setQueue([]);
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setQueue([]);
    setLive(null);
  }, []);

  return { live, queue, docVersion, lastDoc, send, generate, generateAll, stop, busy: !!live && live.status !== null };
}
