"use client";

// The canvas prompt bar: say what to make, for which brand, in what aspect
// ratio, and tune the model behind one settings pill. It sits in a warm tray
// with a gradient edge and a soft glow; the tray's top strip says who it is
// for. Big and centred at the bottom of the canvas to start; once a
// conversation is going it docks into the sidebar (the workspace animates it
// there, and the brand moves up into the sidebar's header) and the chat
// continues above it. It sends into the sidebar's conversation: the canvas
// chat (whatever is selected rides along, so "warmer light on this" lands), a
// maker's spot (its controls shape the spot until the first prompt), or one
// item's own, where it only changes that item.

import { ArrowUp, Paperclip, Square, Type, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useMediaUpload } from "@/lib/media/upload";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { useCanvas } from "../canvas/context";
import type { BoardNode } from "../canvas/model";
import { coverTime } from "../canvas/nodes";
import { STICKY_COLORS, swatch } from "../canvas/shapes";
import { FixedStage } from "../stage";
import type { MediaDoc } from "@slice/backend/convex/mediaTypes";
import { BrandChip } from "./brand-chip";
import { AudiencePill } from "./audience";
import { AspectMenu, OutputMenu, SettingsMenu } from "./menus";
import { promptEstimate, usd, usePromptPicks } from "./options";

export interface PromptBarHandle {
  set(text: string): void;
  focus(): void;
}

/** The bar's edge in the Slice palette: orange at the corners, through amber and yellow to sand. */
export const EDGE = "linear-gradient(125deg, var(--color-brand-orange) 0%, var(--color-brand-amber) 28%, var(--color-brand-yellow) 50%, var(--color-brand-sand) 70%, var(--color-brand-orange) 100%)";
const GLOW = "linear-gradient(125deg, var(--color-brand-orange) 0%, var(--color-brand-amber) 35%, var(--color-brand-yellow) 55%, var(--color-brand-orange) 100%)";
/** The tray around the composer: a warm off-white. */
export const TRAY = "#fff8ee";

type Pending = Attachment & { id: number; pending: boolean; error?: string; preview: string };

const PLACEHOLDER: Record<string, string> = {
  auto: "Describe an image, a poster, a video or a soundtrack to make",
  image: "Describe the image: subject, setting, light, mood",
  poster: "What is the poster for? An offer, a launch, an event",
  clip: "Describe the shot: what moves, the camera, the light",
  video: "What is the video about? Slice plans the shots, text and music",
  music: "Describe the music: genre, mood, tempo, instruments",
};

function Thumb({ node }: { node: BoardNode }) {
  const { kit } = useCanvas();
  // A note or text rides along as its words.
  if (node.kind === "sticky") return <span className="size-5 rounded-[5px] ring-1 ring-black/10 ring-inset" style={{ background: swatch(STICKY_COLORS, node.shape?.color).value }} />;
  if (node.kind === "text")
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-neutral-200 text-neutral-600">
        <Type className="size-3" />
      </span>
    );
  if (node.creative) {
    const doc = node.creative.doc as MediaDoc;
    return (
      <span className="flex size-5 items-center justify-center overflow-hidden rounded-full bg-neutral-200">
        <FixedStage doc={doc} kit={kit} width={(20 * doc.w) / Math.max(doc.w, doc.h)} stillOnly {...(doc.kind === "video" ? { frameAt: coverTime(doc) } : { settled: true })} showPending={false} />
      </span>
    );
  }
  const src = node.asset?.kind === "image" ? node.asset.url : undefined;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-5 rounded-full object-cover" />
  ) : (
    <span className="size-5 rounded-full bg-neutral-200" />
  );
}

export const PromptBar = forwardRef<PromptBarHandle, { docked: boolean; onSent?: () => void; className?: string }>(function PromptBar({ docked, onSent, className }, ref) {
  const { agent, nodes, selected, select, campaignId, thread, send: sendTurn } = useCanvas();
  const [picks, setPicks] = usePromptPicks();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const upload = useMediaUpload(campaignId);
  const busy = agent.busy;
  // What to make is set here for the canvas chat and for a maker's spot until its first prompt; an item's own chat only changes it.
  const shaping = thread.kind === "campaign" || (thread.kind === "draft" && !!thread.node.ghost && !thread.node.ghost.sent);
  const estimate = shaping ? promptEstimate(picks) : null;
  // What goes with a canvas prompt: things made, and notes and text with words in them (not frames or arrows).
  const context = thread.kind === "campaign" ? nodes.filter((n) => selected.includes(n.key) && n.kind !== "pending" && n.kind !== "ghost" && n.kind !== "frame" && n.kind !== "arrow" && (!n.shape || !!n.shape.text?.trim())) : [];

  useImperativeHandle(ref, () => ({
    set: (t: string) => {
      setText(t);
      requestAnimationFrame(() => {
        field.current?.focus();
        field.current?.setSelectionRange(t.length, t.length);
      });
    },
    focus: () => field.current?.focus(),
  }));

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

  const send = () => {
    if (!canSend) return;
    sendTurn(text.trim(), ready.map(({ url, name, type }) => ({ url, name, type })));
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setText("");
    onSent?.();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) {
      e.preventDefault();
      attach(imgs);
    }
  };

  return (
    <div
      className={cn("group/bar relative", className)}
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
      <div className="relative">
        {/* The glow: the edge's colours, blurred out behind the bar; brighter while typing. */}
        <div
          aria-hidden
          className={cn("pointer-events-none absolute transition-[inset,opacity,filter] duration-500", docked ? "-inset-2 rounded-[24px] opacity-25 blur-xl group-focus-within/bar:opacity-45" : "-inset-3 rounded-[34px] opacity-45 blur-2xl group-focus-within/bar:opacity-70")}
          style={{ background: GLOW }}
        />
        {/* The tray: a soft warm card with the gradient edge (a real border: the tray colour fills the padding box, the gradient the border box).
            Its top strip says who it is for, since that changes everything the bar makes; the white composer sits inside, its corners
            the tray's radius less the edge and the padding. */}
        <div className={cn("relative border-[1.5px] border-transparent p-1.5 shadow-[0_12px_32px_-14px_rgba(160,70,0,0.3)] transition-[border-radius] duration-500", docked ? "rounded-[20px]" : "rounded-[26px]")} style={{ background: `linear-gradient(${TRAY}, ${TRAY}) padding-box, ${EDGE} border-box` }}>
          <div className="mb-1.5 flex min-w-0 items-center px-0.5">
            {thread.kind === "item" ? (
              <span className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-orange-100/80 pr-1 pl-1 text-xs font-medium text-orange-950">
                <Thumb node={thread.node} />
                <span className="truncate">Changing {thread.node.name}</span>
                <button type="button" aria-label="Back to the canvas chat" title="Back to the canvas chat" onClick={() => select([])} className="flex size-5 shrink-0 items-center justify-center rounded-full text-orange-900/60 hover:bg-orange-900/10 hover:text-orange-950">
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <AudiencePill />
            )}
          </div>
          <div className={cn("@container flex flex-col bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-6px_rgba(120,60,0,0.12)] ring-1 ring-black/[0.05] transition-[border-radius,padding] duration-500", docked ? "gap-1 rounded-[12.5px] p-2" : "gap-2 rounded-[18.5px] p-2.5")}>
            {(context.length > 0 || files.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
                {context.slice(0, 3).map((n) => (
                  <span key={n.key} className="flex h-7 max-w-52 items-center gap-1.5 rounded-full bg-blue-50 pr-1 pl-1 text-xs font-medium text-blue-900 ring-1 ring-blue-600/10">
                    <Thumb node={n} />
                    <span className="truncate">{n.name}</span>
                    <button type="button" aria-label={`Leave out ${n.name}`} onClick={() => select(selected.filter((k) => k !== n.key))} className="flex size-5 shrink-0 items-center justify-center rounded-full text-blue-700/60 hover:bg-blue-600/10 hover:text-blue-900">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {context.length > 3 && <span className="text-xs text-muted-foreground">+{context.length - 3} more</span>}
                {files.length > 0 && <AttachmentStrip items={files} size="sm" onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />}
              </div>
            )}
            <textarea
              ref={field}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, docked ? 160 : 220)}px`;
              }}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={thread.kind === "item" ? "Describe a change, or ask for a new take" : thread.kind === "draft" ? (shaping ? PLACEHOLDER[picks.output] : "Reply, or tell it what to change") : context.length && context.every((n) => n.shape) ? `Say what to make from ${context.length === 1 ? "this note" : "these notes"}` : context.length ? `Describe the change, or what to make from ${context.length === 1 ? "it" : "them"}` : docked ? "Ask for anything, or a change" : PLACEHOLDER[picks.output]}
              className={cn("w-full resize-none bg-transparent leading-6 text-neutral-950 outline-none placeholder:text-neutral-400", docked ? "min-h-[52px] px-2 pt-1.5 text-sm" : "min-h-[60px] px-2.5 pt-2 text-[15px]")}
            />
            <div className="flex items-center gap-1.5 @max-[480px]:gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 @max-[480px]:gap-1">
                <button type="button" title="Attach images" aria-label="Attach images" onClick={() => fileInput.current?.click()} className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
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
                {!docked && <BrandChip />}
                {shaping && <OutputMenu picks={picks} set={setPicks} />}
                {shaping && <AspectMenu picks={picks} set={setPicks} />}
                {thread.kind !== "item" && <SettingsMenu picks={picks} set={setPicks} />}
              </div>
              {estimate && !docked && (
                <span title={`Estimated at list price: ${estimate.label}`} className="shrink-0 px-1 text-xs text-neutral-400 tabular-nums">
                  ≈ {usd(estimate.usd)}
                </span>
              )}
              {busy ? (
                <button type="button" onClick={agent.stop} aria-label="Stop" title="Stop" className={cn("flex shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700", docked ? "size-8" : "size-9")}>
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={!canSend}
                  aria-label="Send"
                  title={estimate ? `Send, about ${usd(estimate.usd)}` : "Send"}
                  className={cn("flex shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-100 disabled:text-neutral-400", docked ? "size-8" : "size-9")}
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
