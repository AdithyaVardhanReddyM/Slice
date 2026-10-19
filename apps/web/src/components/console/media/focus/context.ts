"use client";

// What the focus editors' panels read: the creative being edited, its working
// doc, what is selected in it, the playhead, and the actions that call the
// models directly (no chat turn).

import { createContext, useContext } from "react";
import type { Doc, Id } from "@slice/backend/convex/_generated/dataModel";
import type { MediaDoc, MediaKit } from "@slice/backend/convex/mediaTypes";
import type { Playback } from "../stage";
import type { CreativeDoc } from "./use-doc";

export type Selection = { kind: "none" } | { kind: "layers"; ids: string[] } | { kind: "clip"; id: string } | { kind: "audio"; id: string };

export interface FocusEnv {
  campaignId: Id<"mediaCampaigns">;
  campaign: Doc<"mediaCampaigns">;
  kit: MediaKit | undefined;
  creatives: Doc<"mediaCreatives">[];
  assets: Doc<"mediaAssets">[];
  jobs: Doc<"mediaJobs">[];
  creative: Doc<"mediaCreatives">;
  doc: MediaDoc;
  editor: CreativeDoc;
  selection: Selection;
  select: (s: Selection) => void;
  playback: Playback;
  /** Run a studio action on the agent (no chat turn). Resolves to ok. */
  act: (action: string, args: Record<string, unknown>, label: string) => Promise<boolean>;
  pending: string[];
  /** Point the Ask bar at something: it names it and takes the caret. */
  ask: (block: { id: string; label: string; type: string; text: string }) => void;
}

export const FocusContext = createContext<FocusEnv | null>(null);

export function useStudio() {
  const env = useContext(FocusContext);
  if (!env) throw new Error("useStudio outside a focus editor");
  return env;
}
