"use client";

// What every part of the campaign editor reads: the brand and campaign, the
// editor state, the agent, the brand's items, the open panel and a few
// cross-panel actions ("Edit with AI" puts a block into the chat composer).

import { createContext, useContext, type RefObject } from "react";
import type { EmailItem, EmailTheme, Personalization } from "@slice/backend/convex/emailTypes";
import type { EmailAudience, EmailBrand, EmailCampaign } from "@/lib/email/types";
import type { EmailAgent } from "./use-email-agent";
import type { EmailEditor } from "./use-email-editor";
import type { ChatComposerHandle } from "./chat-composer";
import type { Selection } from "./model";

export type PanelId = "chat" | "add" | "themes" | "personalise" | "layers";

export interface ChatMessage {
  id: string;
  role: "merchant" | "agent";
  at: number;
  text: string;
  trace?: unknown[];
  steps?: unknown[];
  attachments?: { url: string; name: string; type: string }[];
  blocks?: { id: string; label: string; type: string }[];
}

/** Showing one person's version on the canvas (Personalise → Preview as). */
export interface PreviewAs {
  contactId: string;
  name: string;
  merge: Record<string, string | undefined>;
  personalization: Personalization | null;
  /** Their version was written against an older doc. */
  stale: boolean;
}

export interface EditorEnv {
  brand: EmailBrand;
  campaign: EmailCampaign;
  editor: EmailEditor;
  agent: EmailAgent;
  theme: EmailTheme;
  items: EmailItem[];
  itemMap: Record<string, EmailItem>;
  audience: EmailAudience | null;
  messages: ChatMessage[];
  panel: PanelId | null;
  setPanel: (p: PanelId | null) => void;
  composer: RefObject<ChatComposerHandle | null>;
  /** Put the selection into the chat composer as a pill and open the chat. */
  editWithAI: (sel: Selection) => void;
  previewAs: PreviewAs | null;
  setPreviewAs: (p: PreviewAs | null) => void;
}

const Ctx = createContext<EditorEnv | null>(null);

export const EditorProvider = Ctx.Provider;

export function useEditorEnv(): EditorEnv {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditorEnv must be used inside the campaign editor");
  return v;
}
