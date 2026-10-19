"use client";

// Drives /api/media/agent turns (slice_media/routes.py): one live turn at a
// time with its steps, as the Email chat does. Everything the agent makes
// lands in Convex (and so on the canvas) by itself, so the stream only tells
// the chat what is happening.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { postStream, postJson, type BuildStep } from "@/lib/pages/stream";
import type { Span } from "@/lib/pages/types";
import type { Attachment } from "@/components/console/pages/builder/attachments";
import { withStep, type EmailAgentEvent, type EmailLiveTurn } from "@/components/console/email/editor/use-email-agent";
import type { Phase, TurnCopy } from "@/components/console/email/editor/turn-card";

export interface MediaSelection {
  creativeId?: string;
  layerIds?: string[];
  clipId?: string;
  time?: number;
}

export type MediaLiveTurn = Omit<EmailLiveTurn, "blocks"> & { written: number };

export const MEDIA_PHASES: Phase[] = [
  { id: "read", label: "Reading the audience's taste", tools: ["get_audience"] },
  { id: "taste", label: "Finding cultural hooks with Qloo", tools: ["qloo_search", "qloo_insights", "save_concepts"] },
  { id: "imagery", label: "Choosing and generating imagery", tools: ["search_images", "generate_image"] },
  { id: "make", label: "Generating on the canvas", tools: ["make_image", "make_clip", "make_music", "edit_image", "edit_clip", "extend_clip"] },
  { id: "write", label: "Designing", tools: ["write_creative", "edit_creative", "resize_creative", "rename_campaign"] },
  { id: "video", label: "Shooting video, music and voice", tools: ["add_shots", "regenerate_shot", "edit_shot", "extend_shot", "add_music", "add_voiceover"] },
  { id: "review", label: "Reviewing", tools: ["review_creative", "export_creative"] },
];

export const MEDIA_COPY: TurnCopy = {
  generating: "Making it",
  editing: "Working on it",
  wrote: "Made it",
  worked: "Worked on it",
  writeTools: ["write_creative", "edit_creative", "resize_creative", "add_shots", "make_image", "make_clip", "make_music", "edit_image", "edit_clip"],
};

/** What the prompt bar sends with a turn. */
export interface PromptRequest {
  output: string;
  imageModel?: string;
  videoModel?: string;
  musicModel?: string;
  aspect?: string;
  count?: number;
  audienceId?: string;
  check?: boolean;
}

export type CanvasNodeRef = { kind: "creative" | "asset"; id: string };

type HistoryItem = { role: string; text: string };

export function useMediaAgent({ campaignId, history, model, beforeTurn }: { campaignId: Id<"mediaCampaigns">; history: HistoryItem[]; model?: string; beforeTurn?: () => Promise<void> }) {
  const [live, setLive] = useState<MediaLiveTurn | null>(null);
  const abort = useRef<AbortController | null>(null);
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const run = useCallback(
    async (kind: "generate" | "edit" | "prompt", message: string, attachments: Attachment[] = [], selection?: MediaSelection, extra?: { options?: PromptRequest; nodes?: CanvasNodeRef[] }) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLive({ kind: kind === "generate" ? "generate" : "edit", status: kind === "generate" ? "Starting" : "Thinking", spans: [], steps: [], text: "", error: null, startedAt: Date.now(), prompt: message, attachments, written: 0, baseCount: historyRef.current.length });
      await beforeTurn?.();
      if (ctrl.signal.aborted) {
        // Cancelled before it was sent; unless a newer turn took over, nothing is running.
        if (abort.current === ctrl) setLive(null);
        return;
      }
      const body = { campaignId, kind, message, history: historyRef.current.slice(-12), attachments, selection, model, ...(extra?.options ? { options: extra.options } : {}), ...(extra?.nodes?.length ? { nodes: extra.nodes } : {}) };
      try {
        for await (const raw of postStream("/api/media/agent", body, ctrl.signal)) {
          const ev = raw as unknown as EmailAgentEvent;
          if (ev.type === "status") setLive((l) => (l ? { ...l, status: ev.text } : l));
          else if (ev.type === "span") setLive((l) => (l ? { ...l, spans: [...l.spans, ev.span as Span] } : l));
          else if (ev.type === "thought" || ev.type === "tool_call" || ev.type === "question") setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev, l.startedAt) } : l));
          else if (ev.type === "tool_result") setLive((l) => (l ? { ...l, steps: withStep(l.steps, ev, l.startedAt), written: l.written + (ev.name === "write_creative" && ev.ok !== false ? 1 : 0) } : l));
          else if (ev.type === "text") setLive((l) => (l ? { ...l, text: l.text + ev.delta, steps: withStep(l.steps, ev, l.startedAt) } : l));
          else if (ev.type === "text_done") setLive((l) => (l ? { ...l, text: ev.text, steps: withStep(l.steps, ev, l.startedAt) } : l));
          else if (ev.type === "error") setLive((l) => (l ? { ...l, error: ev.message, status: null } : l));
          else if (ev.type === "done") setLive((l) => (l ? { ...l, status: null, text: ev.text ?? l.text, steps: (ev.steps as BuildStep[] | undefined) ?? l.steps } : l));
        }
      } catch (err) {
        // Stopping a turn aborts its stream; anything else is shown in the chat.
        if (ctrl.signal.aborted) return;
        setLive((l) => (l ? { ...l, error: (err as Error).message || "The connection to the agent dropped", status: null } : l));
        return;
      }
      if (ctrl.signal.aborted) return;
      setLive((l) => (l && l.status !== null && !l.error ? { ...l, status: null } : l));
      setTimeout(() => setLive((l) => (l && !l.error && l.status === null ? null : l)), 1200);
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
    generate: (message = "") => run("generate", message),
    send: (message: string, attachments?: Attachment[], selection?: MediaSelection) => run("edit", message, attachments, selection),
    /** A turn from the canvas prompt bar. */
    prompt: (message: string, attachments: Attachment[], options: PromptRequest, nodes: CanvasNodeRef[]) => run("prompt", message, attachments, undefined, { options, nodes }),
    stop,
    dismissError: () => setLive((l) => (l?.error ? null : l)),
  };
}

export type MediaAgent = ReturnType<typeof useMediaAgent>;

/** One studio button run by the agent without a chat turn (no LLM cost). */
export async function mediaAction<T extends Record<string, unknown> = Record<string, unknown>>(campaignId: string, action: string, args: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; estimate?: number }> {
  try {
    return (await postJson("/api/media/action", { campaignId, action, args })) as T & { ok: boolean; error?: string; estimate?: number };
  } catch (err) {
    return { ok: false, error: (err as Error).message } as T & { ok: boolean; error?: string };
  }
}
