"use client";

// The editors' right side: Slice for this one thing. Its own agent
// (slice_media/item.py) and its own conversation, kept per poster or video,
// and per image or clip across its versions. It only changes what is open:
// an edit that keeps the rest, or a completely new take. The tray's top strip
// says what the next request is about (the whole thing, or what is selected
// in it), as the canvas prompt bar's strip says who it is for.

import { useQuery } from "convex/react";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMediaUpload } from "@/lib/media/upload";
import { usePagesModel } from "@/lib/pages/models";
import { SliceMark } from "@/components/console/logo";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { useCanvas, type ChatMessage } from "../canvas/context";
import { useMediaAgent, type ItemRef, type MediaSelection } from "../canvas/use-media-agent";
import { EDGE, TRAY } from "../prompt/prompt-bar";
import { Thread } from "../sidebar/chat";

export type ItemNoun = "poster" | "video" | "image" | "clip";

export interface ItemAgentHandle {
  focus(): void;
  set(text: string): void;
}

/** The editors' right column. */
export const ITEM_AGENT_W = 340;

const SUGGESTIONS: Record<ItemNoun, string[]> = {
  poster: ["Make the headline punchier", "Try a bolder layout", "Use a warmer photo", "Start over with a new idea"],
  video: ["Tighten it to 10 seconds", "More upbeat music", "Add captions for muted feeds", "Re-cut it with a stronger hook"],
  image: ["Warmer, golden-hour light", "A cleaner background", "Remove the people", "A completely new take"],
  clip: ["Make it golden hour", "Add light rain", "A slower camera move", "A completely new take"],
};

const WHAT_IT_DOES: Record<ItemNoun, string> = {
  poster: "Ask for a change to the copy, the picture or the layout, or a fresh take on the whole poster. Select something on the page first to point at it.",
  video: "Ask for a change to a shot, the text, the music or the voice, or a fresh cut of the whole video. Select a shot or a layer first to point at it.",
  image: "Ask for a change (the light, the background, something added or taken out) or a completely new take. Each one lands as a new version beside this one.",
  clip: "Ask for a change (the light, the weather, the camera feel) or a completely new take. Each one lands as a new version beside this one.",
};

type Pending = Attachment & { id: number; pending: boolean; error?: string; preview: string };

export const ItemAgentPanel = forwardRef<
  ItemAgentHandle,
  {
    item: ItemRef;
    noun: ItemNoun;
    /** What is selected inside it, for the tray's strip; clearing it points the request at the whole thing again. */
    target?: { label: string; icon?: ReactNode; onClear: () => void } | null;
    selection?: MediaSelection;
    /** Runs before each turn (the editor saves its working copy). */
    beforeTurn?: () => Promise<void>;
    className?: string;
  }
>(function ItemAgentPanel({ item, noun, target, selection, beforeTurn, className }, ref) {
  const { campaignId, notify } = useCanvas();
  const [model] = usePagesModel();
  const messages = (useQuery(api.media.itemChat, { campaignId, itemId: item.thread }) ?? []) as ChatMessage[];
  const agent = useMediaAgent({ campaignId, history: messages.map((m) => ({ role: m.role, text: m.text })), model, beforeTurn, item });
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const upload = useMediaUpload(campaignId);
  const busy = agent.busy;

  const fill = (t: string) => {
    setText(t);
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(t.length, t.length);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    });
  };
  useImperativeHandle(ref, () => ({ focus: () => field.current?.focus(), set: fill }));

  const attach = (list: FileList | File[] | null) => {
    if (!list) return;
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      const id = nextId.current++;
      const preview = URL.createObjectURL(file);
      setFiles((f) => [...f, { id, url: "", name: file.name, type: file.type, pending: true, preview }]);
      upload(file, { accept: ["image"] })
        .then((a) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, url: a.url ?? "", pending: false } : x))))
        .catch((err: Error) => setFiles((f) => f.map((x) => (x.id === id ? { ...x, pending: false, error: err.message } : x))));
    }
  };

  const ready = files.filter((f) => !f.pending && !f.error && f.url);
  const canSend = !busy && (text.trim().length > 0 || ready.length > 0) && !files.some((f) => f.pending);

  const send = (words = text) => {
    const t = words.trim();
    if (busy || (!t && !ready.length) || files.some((f) => f.pending)) return;
    void agent.send(t, ready.map(({ url, name, type }) => ({ url, name, type })), selection).catch((err: Error) => notify(err.message, "bad"));
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setText("");
    if (field.current) field.current.style.height = "auto";
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) {
      e.preventDefault();
      attach(imgs);
    }
  };

  const empty = (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-neutral-600">{WHAT_IT_DOES[noun]}</p>
      <div className="flex flex-col items-start gap-1.5">
        {SUGGESTIONS[noun].map((s) => (
          <button key={s} type="button" onClick={() => fill(s)} className="rounded-full bg-neutral-100 px-3 py-1.5 text-left text-[13px] text-neutral-700 transition-colors hover:bg-neutral-200/70 hover:text-neutral-950">
            {s}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <aside
      className={cn("flex shrink-0 flex-col border-l border-black/[0.06] bg-white", className)}
      style={{ width: ITEM_AGENT_W }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        attach(e.dataTransfer.files);
      }}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] px-4">
        <SliceMark className="h-3.5" />
        <span className="text-sm font-semibold">Slice</span>
        <span className="truncate text-xs text-neutral-400">for this {noun}</span>
      </div>
      <Thread agent={agent} messages={messages} onAnswer={(t) => send(t)} empty={empty} className="pb-4" />
      <div className="shrink-0 px-3 pt-1 pb-3">
        <div className="rounded-[18px] border-[1.5px] border-transparent p-1.5 shadow-[0_10px_28px_-16px_rgba(160,70,0,0.3)]" style={{ background: `linear-gradient(${TRAY}, ${TRAY}) padding-box, ${EDGE} border-box` }}>
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 px-1 text-xs">
            {target ? (
              <span className="flex h-6 min-w-0 items-center gap-1.5 rounded-full bg-orange-100/80 pr-1 pl-2 font-medium text-orange-950 [&_svg]:size-3.5 [&_svg]:shrink-0">
                {target.icon}
                <span className="truncate">{target.label}</span>
                <button type="button" aria-label="Point at the whole thing again" title={`Back to the whole ${noun}`} onClick={target.onClear} className="flex size-4 shrink-0 items-center justify-center rounded-full text-orange-900/60 hover:bg-orange-900/10 hover:text-orange-950">
                  <X className="!size-3" />
                </button>
              </span>
            ) : (
              <span className="px-1 font-medium text-neutral-500">The whole {noun}</span>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-[11px] bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(120,60,0,0.12)] ring-1 ring-black/[0.05]">
            {files.length > 0 && <AttachmentStrip items={files} size="sm" onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} className="px-1 pt-1" />}
            <textarea
              ref={field}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
              }}
              onPaste={onPaste}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape") e.currentTarget.blur();
              }}
              placeholder={target ? "What should change here?" : "Describe a change, or ask for a new take"}
              className="min-h-[52px] w-full resize-none bg-transparent px-2 pt-1.5 text-sm leading-6 text-neutral-950 outline-none placeholder:text-neutral-400"
            />
            <div className="flex items-center gap-1">
              <button type="button" title="Attach images (a product photo to use)" aria-label="Attach images" onClick={() => fileInput.current?.click()} className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
                <Paperclip className="size-4" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  attach(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="flex-1" />
              {busy ? (
                <button type="button" onClick={agent.stop} aria-label="Stop" title="Stop" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700">
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button type="button" onClick={() => send()} disabled={!canSend} aria-label="Send" title="Send" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-100 disabled:text-neutral-400">
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
});
