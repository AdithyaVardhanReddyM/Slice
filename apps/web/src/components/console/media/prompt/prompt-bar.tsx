"use client";

// The canvas prompt bar: say what to make, for which brand and audience, on
// which models and in what shape. Big and centred at the bottom of the canvas
// to start; once a conversation is going it docks into the sidebar (the
// workspace animates it there) and the chat continues above it. Whatever is
// selected on the canvas rides along, so "warmer light on this" lands.

import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useMediaUpload } from "@/lib/media/upload";
import { AttachmentStrip, type Attachment } from "@/components/console/pages/builder/attachments";
import { useCanvas } from "../canvas/context";
import type { BoardNode } from "../canvas/model";
import { coverTime } from "../canvas/nodes";
import { FixedStage } from "../stage";
import type { MediaDoc } from "@slice/backend/convex/mediaTypes";
import { BrandChip } from "./brand-chip";
import { AspectMenu, AudienceMenu, ModelMenu, OutputMenu } from "./menus";
import { promptEstimate, usd, usePromptPicks } from "./options";

export interface PromptBarHandle {
  set(text: string): void;
  focus(): void;
}

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
  if (node.creative) {
    const doc = node.creative.doc as MediaDoc;
    return (
      <span className="flex size-5 items-center justify-center overflow-hidden rounded bg-neutral-200">
        <FixedStage doc={doc} kit={kit} width={(20 * doc.w) / Math.max(doc.w, doc.h)} stillOnly {...(doc.kind === "video" ? { frameAt: coverTime(doc) } : { settled: true })} showPending={false} />
      </span>
    );
  }
  const src = node.asset?.kind === "image" ? node.asset.url : undefined;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-5 rounded object-cover" />
  ) : (
    <span className="size-5 rounded bg-neutral-200" />
  );
}

export const PromptBar = forwardRef<PromptBarHandle, { docked: boolean; onSent?: () => void; className?: string }>(function PromptBar({ docked, onSent, className }, ref) {
  const { agent, nodes, selected, select, campaignId, audienceId, notify } = useCanvas();
  const [picks, setPicks] = usePromptPicks();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const upload = useMediaUpload(campaignId);
  const busy = agent.busy;
  const estimate = promptEstimate(picks);
  const context = nodes.filter((n) => selected.includes(n.key) && n.kind !== "pending");

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
    const options = {
      output: picks.output,
      imageModel: picks.imageModel,
      videoModel: picks.videoModel,
      musicModel: picks.musicModel,
      aspect: picks.aspect,
      count: picks.output === "image" ? picks.count : 1,
      audienceId,
      check: picks.check,
    };
    const refs = context.filter((n) => n.ref.kind !== "job").map((n) => ({ kind: n.ref.kind as "creative" | "asset", id: n.ref.id }));
    void agent.prompt(text.trim(), ready.map(({ url, name, type }) => ({ url, name, type })), options, refs).catch((err: Error) => notify(err.message, "bad"));
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
      className={cn(
        "@container flex flex-col bg-white ring-1 ring-black/[0.07] transition-[border-radius,box-shadow,padding] duration-500",
        docked ? "gap-2 rounded-2xl p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_-12px_rgba(0,0,0,0.18)]" : "gap-2.5 rounded-[22px] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_24px_60px_-24px_rgba(0,0,0,0.35)]",
        className,
      )}
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
      {(context.length > 0 || files.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {context.slice(0, 3).map((n) => (
            <span key={n.key} className="flex max-w-52 items-center gap-1.5 rounded-lg bg-blue-50 py-1 pr-1 pl-1.5 text-xs font-medium text-blue-800 ring-1 ring-blue-600/15">
              <Thumb node={n} />
              <span className="truncate">{n.name}</span>
              <button type="button" aria-label={`Leave out ${n.name}`} onClick={() => select(selected.filter((k) => k !== n.key))} className="rounded p-0.5 text-blue-700/60 hover:bg-blue-600/10 hover:text-blue-800">
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
          el.style.height = `${Math.min(el.scrollHeight, docked ? 160 : 200)}px`;
        }}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={context.length ? `Describe the change, or what to make from ${context.length === 1 ? "it" : "them"}` : docked ? "Ask for anything, or a change" : PLACEHOLDER[picks.output]}
        className={cn("w-full resize-none bg-transparent px-1.5 leading-6 outline-none placeholder:text-neutral-400", docked ? "min-h-6 text-sm" : "min-h-12 pt-1 text-[15px]")}
      />
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button type="button" title="Attach images" onClick={() => fileInput.current?.click()} className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
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
          <BrandChip />
          <OutputMenu picks={picks} set={setPicks} />
          <ModelMenu picks={picks} set={setPicks} />
          <AspectMenu picks={picks} set={setPicks} />
          <AudienceMenu />
        </div>
        {estimate && (
          <span title={`Estimated at list price: ${estimate.label}`} className="shrink-0 pl-1 text-xs text-neutral-400 tabular-nums @max-[420px]:hidden">
            ≈ {usd(estimate.usd)}
          </span>
        )}
        {busy ? (
          <button type="button" onClick={agent.stop} aria-label="Stop" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-800">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
});
