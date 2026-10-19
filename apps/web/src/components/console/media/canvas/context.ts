"use client";

// What every part of the canvas workspace reads: the campaign's live data,
// the nodes and selection, the open focus editor, the agent, and the actions
// that call the models directly (studio buttons: no chat turn, no LLM cost).

import { createContext, useContext, type RefObject } from "react";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaKit } from "@slice/backend/convex/mediaTypes";
import type { BoardHandle } from "./board";
import type { BoardNode, NodeKey } from "./model";
import type { MediaAgent } from "./use-media-agent";

export interface ChatMessage {
  id: string;
  role: "merchant" | "agent";
  at: number;
  text: string;
  attachments?: { url: string; name: string; type: string }[];
  steps?: unknown[];
}

export type SidebarTab = "chat" | "assets";

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
  agent: MediaAgent;
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
  /** Send a prompt-bar turn now, with the current picks and selection. */
  sendPrompt: (text: string, overrides?: { output?: string }) => void;
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
