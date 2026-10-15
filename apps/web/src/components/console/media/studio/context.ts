"use client";

// What every studio panel reads: the campaign, the open creative and its
// working doc, the selection, playback, and the buttons that call the agent
// directly (no chat turn, so no LLM cost).

import { createContext, useContext, type RefObject } from "react";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaDoc, MediaKit } from "@slice/backend/convex/mediaTypes";
import type { ChatComposerHandle } from "@/components/console/email/editor/chat-composer";
import type { Playback } from "../stage";
import type { CreativeDoc } from "./use-doc";
import type { MediaAgent } from "./use-media-agent";

export type Selection = { kind: "none" } | { kind: "layers"; ids: string[] } | { kind: "clip"; id: string } | { kind: "audio"; id: string };

export interface ChatMessage {
  id: string;
  role: "merchant" | "agent";
  at: number;
  text: string;
  attachments?: { url: string; name: string; type: string }[];
  steps?: unknown[];
}

export interface StudioEnv {
  campaignId: Id<"mediaCampaigns">;
  campaign: Doc<"mediaCampaigns">;
  kit: MediaKit | undefined;
  creatives: Doc<"mediaCreatives">[];
  assets: Doc<"mediaAssets">[];
  jobs: Doc<"mediaJobs">[];
  messages: ChatMessage[];
  creative: Doc<"mediaCreatives"> | null;
  setCreative: (id: Id<"mediaCreatives">) => void;
  doc: MediaDoc | null;
  editor: CreativeDoc;
  selection: Selection;
  select: (s: Selection) => void;
  playback: Playback;
  agent: MediaAgent;
  composer: RefObject<ChatComposerHandle | null>;
  /** Run a studio action on the agent. Saves pending edits first. Resolves to ok. */
  act: (action: string, args: Record<string, unknown>, label: string) => Promise<boolean>;
  /** Actions running, by label. */
  pending: string[];
  /** Point the chat at something: switches to the chat tab and adds a pill. */
  ask: (block: { id: string; label: string; type: string; text: string }) => void;
}

export const StudioContext = createContext<StudioEnv | null>(null);

export function useStudio() {
  const env = useContext(StudioContext);
  if (!env) throw new Error("useStudio outside the Media studio");
  return env;
}
