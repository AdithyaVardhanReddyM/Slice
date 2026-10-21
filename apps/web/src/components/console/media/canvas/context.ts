"use client";

// What every part of the canvas workspace reads: the campaign's live data,
// the nodes and selection, the open focus editor, the conversations (the
// sidebar's follows the selection), and the actions that call the models
// directly (studio buttons: no chat turn, no LLM cost).

import { createContext, useContext, type RefObject } from "react";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaKit } from "@slice/backend/convex/mediaTypes";
import type { Attachment } from "@/components/console/pages/builder/attachments";
import type { BoardHandle } from "./board";
import type { BoardNode, MakerKind, NodeKey, SidebarThread } from "./model";
import type { AgentPool, MediaAgent } from "./use-media-agent";

export interface ChatMessage {
  id: string;
  role: "merchant" | "agent";
  at: number;
  text: string;
  attachments?: { url: string; name: string; type: string }[];
  steps?: unknown[];
}

export type SidebarTab = "chat" | "assets";

/** The chat and assets sidebar's width; the canvas keeps clear of it while it is open. */
export const SIDEBAR_W = 420;

/** What a drag on the canvas does: select and move, or pan. */
export type CanvasTool = "select" | "hand";

export interface CanvasEnv {
  campaignId: Id<"mediaCampaigns">;
  campaign: Doc<"mediaCampaigns">;
  brand: Doc<"mediaBrands"> | null;
  kit: MediaKit | undefined;
  creatives: Doc<"mediaCreatives">[];
  assets: Doc<"mediaAssets">[];
  jobs: Doc<"mediaJobs">[];
  messages: ChatMessage[];
  nodes: BoardNode[];
  selected: NodeKey[];
  select: (keys: NodeKey[]) => void;
  /** The node open in its focus editor. */
  focus: NodeKey | null;
  openFocus: (key: NodeKey) => void;
  closeFocus: () => void;
  /** Every conversation's live turn (the canvas chat, makers' threads, items' own). */
  agents: AgentPool;
  /** The conversation in the sidebar: an item's own when one is selected, a maker's thread for its spot, else the canvas chat. */
  thread: SidebarThread;
  threadMessages: ChatMessage[];
  /** Its saved messages have arrived (switching threads loads them). */
  threadLoaded: boolean;
  /** The sidebar conversation's agent. */
  agent: MediaAgent;
  /** Send in the sidebar's conversation (the prompt bar, and answers to the agent's questions). */
  send: (text: string, attachments?: Attachment[]) => void;
  /** A toolbar maker: its spot on the canvas, opened in the sidebar for the first prompt. */
  make: (kind: MakerKind) => void;
  /** Make something from a node at once, in its own spot beside it. */
  makeFrom: (kind: MakerKind, text: string, from: BoardNode) => void;
  board: RefObject<BoardHandle | null>;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  sidebar: { open: boolean; tab: SidebarTab };
  setSidebar: (s: { open: boolean; tab?: SidebarTab }) => void;
  /** Audience the next prompts are for ("all" for everyone). */
  audienceId: string;
  setAudienceId: (id: string) => void;
  /** Run a studio action on the agent (no chat turn). Resolves to ok. */
  act: (action: string, args: Record<string, unknown>, label: string) => Promise<boolean>;
  /** Actions running, by label. */
  pending: string[];
  notify: (text: string, tone?: "ok" | "bad") => void;
  /** Ask the prompt bar to take this text (and focus). */
  compose: (text: string) => void;
  /** Put the cursor in the prompt bar, keeping what is typed. */
  focusPrompt: () => void;
  /** Upload files into the library and onto the canvas, the first centred on `at` (else the view). */
  placeFiles: (files: File[], at?: { x: number; y: number }) => Promise<void>;
  /** Delete or take off the canvas, after asking when it can't be undone. */
  remove: (keys: NodeKey[]) => void;
  /** Download a node's file (exports posters and videos first). */
  download: (node: BoardNode) => Promise<void>;
}

export const CanvasContext = createContext<CanvasEnv | null>(null);

export function useCanvas() {
  const env = useContext(CanvasContext);
  if (!env) throw new Error("useCanvas outside the Media canvas");
  return env;
}
