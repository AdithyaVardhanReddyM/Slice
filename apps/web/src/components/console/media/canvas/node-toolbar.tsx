"use client";

// The bar that floats over what is selected on the canvas: open it in its
// editor, ask the agent about it, see why it was made, and the quick moves for
// its kind (more takes of an image, animate it, continue a clip, make a poster
// from it), each priced before it runs. Studio buttons call the models
// directly; only "Ask" starts a chat turn.

import { useMutation } from "convex/react";
import { Clapperboard, Copy, Download, FastForward, Layers2, LayoutTemplate, Loader2, MessageSquareText, MoreHorizontal, Pencil, RefreshCw, Scaling, Trash2, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import { FORMATS, FORMAT_KEYS, VIDEO_MODELS, imageModel, veoSeconds, videoModel, type FormatPreset, type MediaDoc } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { usd, usePromptPicks } from "../prompt/options";
import { useCanvas } from "./context";
import type { BoardNode } from "./model";
import { WhyButton } from "./why";

const btn = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-neutral-100 [&_svg]:size-4 [&_svg]:shrink-0";

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />;

function Tool({ icon, label, onClick, disabled, busy, title }: { icon: ReactNode; label?: string; onClick: () => void; disabled?: boolean; busy?: boolean; title?: string }) {
  return (
    <button type="button" className={btn} onClick={onClick} disabled={disabled || busy} title={title ?? label}>
      {busy ? <Loader2 className="animate-spin" /> : icon}
      {label && <span>{label}</span>}
    </button>
  );
}

/** Nearest aspect a model can make for an image of this shape. */
const aspectOf = (w?: number, h?: number) => {
  const r = (w ?? 1) / (h ?? 1);
  return r < 0.7 ? "9:16" : r < 0.9 ? "4:5" : r < 1.2 ? "1:1" : "16:9";
};

function AnimatePopover({ node }: { node: BoardNode }) {
  const { act, pending } = useCanvas();
  const [picks] = usePromptPicks();
  const a = node.asset!;
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(6);
  const [model, setModel] = useState(picks.videoModel);
  const [open, setOpen] = useState(false);
  const m = videoModel(model);
  const secs = veoSeconds(seconds, m.hd);
  const busy = pending.includes(`animate:${a._id}`);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={btn} title="Turn it into a video clip">
        {busy ? <Loader2 className="animate-spin" /> : <Clapperboard />}
        <span>Animate</span>
      </PopoverTrigger>
      <PopoverContent side="bottom" sideOffset={8} className="w-80 gap-3 p-3.5">
        <p className="text-sm font-semibold">Animate this image</p>
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="What moves: slow push-in, steam rising, people walk past, candles flicker"
          className="w-full resize-none rounded-lg bg-neutral-50 px-2.5 py-2 text-sm ring-1 ring-black/[0.08] outline-none focus:bg-white focus:ring-blue-500"
        />
        <div className="flex items-center gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md bg-neutral-50 px-2 text-xs ring-1 ring-black/[0.08] outline-none">
            {VIDEO_MODELS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="flex rounded-md bg-neutral-100 p-0.5">
            {[4, 6, 8].map((s) => (
              <button key={s} type="button" disabled={m.hd && s !== 8} onClick={() => setSeconds(s)} className={cn("h-7 w-9 rounded-[5px] text-xs font-medium text-neutral-600 disabled:opacity-40", secs === s && "bg-white text-neutral-950 shadow-sm")}>
                {s}s
              </button>
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            ≈ {usd(m.perSecond * secs)} · {m.label}
          </span>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void act("make_clip", { prompt: prompt.trim() || "Bring the picture to life with a slow, natural camera move; keep everything in it true.", aspect: aspectOf(a.w, a.h) === "16:9" ? "16:9" : "9:16", seconds: secs, image: a.url, model, near: a._id }, `animate:${a._id}`);
            }}
          >
            <Clapperboard /> Animate
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MoreMenu({ node }: { node: BoardNode }) {
  const { remove, campaign } = useCanvas();
  const duplicate = useMutation(api.media.duplicate);
  const resize = useMutation(api.media.resize);
  const c = node.creative;
  const doc = c?.doc as MediaDoc | undefined;
  const missing = doc ? FORMAT_KEYS.filter((f) => f !== doc.format && (doc.kind === "poster" || FORMATS[f].video)) : [];
  void campaign;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(btn, "px-2")} aria-label="More">
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {c && (
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void duplicate({ id: c._id })}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            {missing.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Scaling /> Resize to
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <DropdownMenuLabel>A copy laid out for (free)</DropdownMenuLabel>
                  {missing.map((f: FormatPreset) => (
                    <DropdownMenuItem key={f} onClick={() => void resize({ id: c._id, formats: [f] })}>
                      <span className="flex-1">{FORMATS[f].label}</span>
                      <span className="text-xs text-muted-foreground">
                        {FORMATS[f].w}×{FORMATS[f].h}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => remove([node.key])}>
          {c ? <Trash2 /> : <X />} {c ? "Delete" : node.kind === "pending" ? "Dismiss" : "Remove from canvas"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NodeToolbar({ rect }: { rect: { x: number; y: number; w: number; h: number } }) {
  const { nodes, selected, openFocus, compose, act, pending, download, remove, sendPrompt, sidebar } = useCanvas();
  const dismiss = useMutation(api.media.dismissJob);
  const [downloading, setDownloading] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, room: 0 });
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    // The board (the toolbar's positioned ancestor) bounds it; its direct parent is display: contents.
    const read = () => setSize({ w: el.offsetWidth, room: (el.offsetParent as HTMLElement | null)?.clientWidth ?? 0 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sel = nodes.filter((n) => selected.includes(n.key));
  if (!sel.length) return null;
  const one = sel.length === 1 ? sel[0] : null;
  const above = rect.y > 84;
  // Centred over the selection, but kept inside the canvas (clear of the sidebar).
  const minLeft = (sidebar.open ? 400 : 0) + 10;
  const left = size.w && size.room ? Math.min(Math.max(rect.x + rect.w / 2 - size.w / 2, minLeft), size.room - size.w - 10) : rect.x + rect.w / 2 - size.w / 2;

  let body: ReactNode;
  if (!one) {
    body = (
      <>
        <span className="px-2 text-[13px] font-medium text-neutral-500">{sel.length} selected</span>
        <Sep />
        <Tool icon={<MessageSquareText />} label="Ask" onClick={() => compose("")} />
        <Tool icon={<Trash2 />} label="Remove" onClick={() => remove(sel.map((n) => n.key))} />
      </>
    );
  } else if (one.kind === "pending") {
    const j = one.job!;
    const failed = j.status === "failed";
    const retry = () => {
      const args = j.kind === "image" ? ["make_image", { prompt: j.prompt ?? "", aspect: j.aspect ?? "1:1", model: j.model }] : j.kind === "video" ? ["make_clip", { prompt: j.prompt ?? "", aspect: j.aspect ?? "9:16", model: j.model }] : j.kind === "music" ? ["make_music", { prompt: j.prompt ?? "", model: j.model }] : null;
      if (!args) return;
      void dismiss({ id: j._id as Id<"mediaJobs"> });
      void act(args[0] as string, args[1] as Record<string, unknown>, `retry:${j._id}`);
    };
    body = failed ? (
      <>
        <Tool icon={<RefreshCw />} label="Try again" onClick={retry} busy={pending.includes(`retry:${j._id}`)} disabled={!["image", "video", "music"].includes(j.kind)} />
        <Tool icon={<X />} label="Dismiss" onClick={() => void dismiss({ id: j._id as Id<"mediaJobs"> })} />
      </>
    ) : (
      <span className="flex items-center gap-1.5 px-2 text-[13px] text-neutral-500">
        <Loader2 className="size-3.5 animate-spin" /> Generating · lands here when ready
      </span>
    );
  } else {
    const a = one.asset;
    const c = one.creative;
    body = (
      <>
        <Tool icon={<Pencil />} label={c ? "Edit" : "Open"} onClick={() => openFocus(one.key)} />
        <Tool icon={<MessageSquareText />} label="Ask" onClick={() => compose("")} title="Ask Slice about it (it is attached to the prompt)" />
        {c && <WhyButton creative={c} className={btn} />}
        {one.kind === "image" && a && (
          <>
            <Sep />
            <Tool
              icon={<Layers2 />}
              label="More takes"
              title={`Two more takes on ${imageModel(a.model).label} (≈ ${usd(imageModel(a.model).price * 2)})`}
              busy={pending.includes(`takes:${a._id}`)}
              onClick={() => void act("make_image", { prompt: a.prompt ? `${a.prompt} (another take of image 1: same subject and look, a different moment and framing)` : "Another take of image 1: same subject and look, a different moment and framing", aspect: aspectOf(a.w, a.h), count: 2, reference_urls: [a.url], model: a.model && a.model.includes("image") ? a.model : undefined, near: a._id }, `takes:${a._id}`)}
            />
            <AnimatePopover node={one} />
            <Tool icon={<LayoutTemplate />} label="Poster" title="Design a poster around it" onClick={() => sendPrompt("Design a poster around this image, in our brand.", { output: "poster" })} />
          </>
        )}
        {one.kind === "clip" && a && (
          <>
            <Sep />
            <Tool icon={<FastForward />} label="Extend" title={`Continue it for 6 s from its last frame (≈ ${usd(videoModel(undefined).perSecond * 6)})`} busy={pending.includes(`extend:${a._id}`)} onClick={() => void act("extend_clip", { asset_id: a._id, seconds: 6 }, `extend:${a._id}`)} />
          </>
        )}
        <Sep />
        <Tool
          icon={<Download />}
          busy={downloading}
          title={c ? "Export and download" : "Download"}
          onClick={async () => {
            setDownloading(true);
            try {
              await download(one);
            } finally {
              setDownloading(false);
            }
          }}
        />
        <MoreMenu node={one} />
      </>
    );
  }

  return (
    <div
      ref={bar}
      className={cn("absolute z-20 flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_30px_-10px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.07]", !size.w && "invisible")}
      style={{ left, top: above ? rect.y - 72 : rect.y + rect.h + 12 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {body}
    </div>
  );
}
