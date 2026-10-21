"use client";

// Drives /api/media/agent turns (slice_media/routes.py): one live turn per
// conversation with its steps, as the Email chat does. Everything the agent
// makes lands in Convex (and so on the canvas) by itself, so the stream only
// tells the chat what is happening. Conversations: the canvas chat; a toolbar
// maker's thread, with the spot it was placed in; and each item's own, run by
// the item agent (slice_media/item.py), which changes only that poster, video,
// image or clip.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  { id: "make", label: "Generating on the canvas", tools: ["make_image", "make_clip", "make_music", "edit_image", "edit_clip", "extend_clip", "change_image", "remake_image", "change_clip", "remake_clip"] },
  { id: "write", label: "Designing", tools: ["write_creative", "edit_creative", "resize_creative", "rename_campaign"] },
  { id: "video", label: "Shooting video, music and voice", tools: ["add_shots", "regenerate_shot", "edit_shot", "extend_shot", "add_music", "add_voiceover"] },
  { id: "review", label: "Reviewing", tools: ["review_creative", "export_creative"] },
];

export const MEDIA_COPY: TurnCopy = {
  generating: "Making it",
  editing: "Working on it",
  wrote: "Made it",
  worked: "Worked on it",
  writeTools: ["write_creative", "edit_creative", "resize_creative", "add_shots", "make_image", "make_clip", "make_music", "edit_image", "edit_clip", "change_image", "remake_image", "change_clip", "remake_clip"],
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

/** What an editor's own agent works on: the open creative or version, and its conversation's id. */
export type ItemRef = { kind: "creative" | "asset"; id: string; thread: string };

type HistoryItem = { role: string; text: string };

/** A toolbar maker's spot on the canvas, in board units, sent with its thread's turns until something lands in it. */
export interface MakerSpot {
  x: number;
  y: number;
  w: number;
  aspect: string;
  kind: "image" | "poster" | "video";
}

/** One turn to run, with the conversation it belongs to. */
interface TurnRequest {
  kind: "generate" | "edit" | "prompt";
  message: string;
  history: HistoryItem[];
  attachments?: Attachment[];
  selection?: MediaSelection;
  options?: PromptRequest;
  nodes?: CanvasNodeRef[];
  /** An item's own agent. */
  item?: ItemRef;
  /** A maker's thread, and its spot. */
  thread?: string;
  spot?: MakerSpot;
  beforeTurn?: () => Promise<void>;
}

/**
 * Every conversation's live turn, keyed by thread: the canvas chat ("campaign"), each maker's
 * thread and each item's, so one can run while you start another.
 */
export function useAgentPool({ campaignId, model }: { campaignId: Id<"mediaCampaigns">; model?: string }) {
  const [lives, setLives] = useState<Record<string, MediaLiveTurn>>({});
  const aborts = useRef(new Map<string, AbortController>());

  const update = useCallback((key: string, fn: (l: MediaLiveTurn) => MediaLiveTurn | null) => {
    setLives((all) => {
      const cur = all[key];
      if (!cur) return all;
      const next = fn(cur);
      if (next === cur) return all;
      const out = { ...all };
      if (next) out[key] = next;
      else delete out[key];
      return out;
    });
  }, []);

  const run = useCallback(
    async (key: string, r: TurnRequest) => {
      aborts.current.get(key)?.abort();
      const ctrl = new AbortController();
      aborts.current.set(key, ctrl);
      const setLive = (fn: (l: MediaLiveTurn) => MediaLiveTurn | null) => update(key, fn);
      setLives((all) => ({ ...all, [key]: { kind: r.kind === "generate" ? "generate" : "edit", status: r.kind === "generate" ? "Starting" : "Thinking", spans: [], steps: [], text: "", error: null, startedAt: Date.now(), prompt: r.message, attachments: r.attachments ?? [], written: 0, baseCount: r.history.length } }));
      await r.beforeTurn?.();
      if (ctrl.signal.aborted) {
        // Cancelled before it was sent; unless a newer turn took over, nothing is running.
        if (aborts.current.get(key) === ctrl) setLive(() => null);
        return;
      }
      const target = r.kind === "edit" ? r.item : undefined;
      const body = { campaignId, kind: target ? "item" : r.kind, message: r.message, history: r.history.slice(-12), attachments: r.attachments ?? [], selection: r.selection, model, ...(target ? { item: target } : {}), ...(r.options ? { options: r.options } : {}), ...(r.nodes?.length ? { nodes: r.nodes } : {}), ...(r.thread ? { thread: r.thread } : {}), ...(r.spot ? { spot: r.spot } : {}) };
      try {
        for await (const raw of postStream("/api/media/agent", body, ctrl.signal)) {
          const ev = raw as unknown as EmailAgentEvent;
          if (ev.type === "status") setLive((l) => ({ ...l, status: ev.text }));
          else if (ev.type === "span") setLive((l) => ({ ...l, spans: [...l.spans, ev.span as Span] }));
          else if (ev.type === "thought" || ev.type === "tool_call" || ev.type === "question") setLive((l) => ({ ...l, steps: withStep(l.steps, ev, l.startedAt) }));
          else if (ev.type === "tool_result") setLive((l) => ({ ...l, steps: withStep(l.steps, ev, l.startedAt), written: l.written + (ev.name === "write_creative" && ev.ok !== false ? 1 : 0) }));
          else if (ev.type === "text") setLive((l) => ({ ...l, text: l.text + ev.delta, steps: withStep(l.steps, ev, l.startedAt) }));
          else if (ev.type === "text_done") setLive((l) => ({ ...l, text: ev.text, steps: withStep(l.steps, ev, l.startedAt) }));
          else if (ev.type === "error") setLive((l) => ({ ...l, error: ev.message, status: null }));
          else if (ev.type === "done") setLive((l) => ({ ...l, status: null, text: ev.text ?? l.text, steps: (ev.steps as BuildStep[] | undefined) ?? l.steps }));
        }
      } catch (err) {
        // Stopping a turn aborts its stream; anything else is shown in the chat.
        if (ctrl.signal.aborted) return;
        setLive((l) => ({ ...l, error: (err as Error).message || "The connection to the agent dropped", status: null }));
        return;
      }
      if (ctrl.signal.aborted) return;
      setLive((l) => (l.status !== null && !l.error ? { ...l, status: null } : l));
      setTimeout(() => setLive((l) => (!l.error && l.status === null && aborts.current.get(key) === ctrl ? null : l)), 1200);
    },
    [campaignId, model, update],
  );

  const stop = useCallback(
    (key: string) => {
      aborts.current.get(key)?.abort();
      aborts.current.delete(key);
      update(key, () => null);
    },
    [update],
  );
  const dismissError = useCallback((key: string) => update(key, (l) => (l.error ? null : l)), [update]);

  useEffect(() => {
    const all = aborts.current;
    return () => all.forEach((c) => c.abort());
  }, []);

  return useMemo(() => ({ lives, run, stop, dismissError, busy: Object.values(lives).some((l) => l.status !== null && !l.error) }), [lives, run, stop, dismissError]);
}

export type AgentPool = ReturnType<typeof useAgentPool>;

/** One conversation's agent: its live turn, and the ways to start one in it. */
export interface MediaAgent {
  live: MediaLiveTurn | null;
  busy: boolean;
  /** A turn from a prompt bar (the canvas chat, or a maker's thread). */
  prompt: (message: string, attachments: Attachment[], options: PromptRequest, nodes: CanvasNodeRef[]) => Promise<void>;
  /** A turn for an item's own agent. */
  send: (message: string, attachments?: Attachment[], selection?: MediaSelection) => Promise<void>;
  stop: () => void;
  dismissError: () => void;
}

/** The agent of the conversation `key` (the context is read when a turn starts). */
export function agentOf(pool: AgentPool, key: string, ctx: { history: HistoryItem[]; item?: ItemRef; thread?: string; spot?: MakerSpot; beforeTurn?: () => Promise<void> }): MediaAgent {
  const live = pool.lives[key] ?? null;
  return {
    live,
    busy: !!live && live.status !== null && !live.error,
    prompt: (message, attachments, options, nodes) => pool.run(key, { kind: "prompt", message, attachments, options, nodes, history: ctx.history, thread: ctx.thread, spot: ctx.spot }),
    send: (message, attachments = [], selection) => pool.run(key, { kind: "edit", message, attachments, selection, item: ctx.item, history: ctx.history, beforeTurn: ctx.beforeTurn }),
    stop: () => pool.stop(key),
    dismissError: () => pool.dismissError(key),
  };
}

/** One studio button run by the agent without a chat turn (no LLM cost). */
export async function mediaAction<T extends Record<string, unknown> = Record<string, unknown>>(campaignId: string, action: string, args: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; estimate?: number }> {
  try {
    return (await postJson("/api/media/action", { campaignId, action, args })) as T & { ok: boolean; error?: string; estimate?: number };
  } catch (err) {
    return { ok: false, error: (err as Error).message } as T & { ok: boolean; error?: string };
  }
}
