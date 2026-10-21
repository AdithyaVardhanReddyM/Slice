"use client";

// The canvas toolbar, down the left edge: the two ways to work the canvas
// (select, and the hand that pans), your own files onto it, and the five
// things Slice makes, each with a word under it. A maker button places a spot
// for that output on the canvas (in a shape that suits it), opens the spot's
// own conversation in the sidebar and puts the cursor there; it stays lit
// while the bar is set to make it. Nothing runs until you send.

import { Hand, Loader2, MousePointer2, Upload } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { ASPECTS, OUTPUTS, type MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OUTPUT_ICON } from "../prompt/menus";
import { usePromptPicks, type PromptPicks } from "../prompt/options";
import { FLOAT } from "./chrome";
import { useCanvas } from "./context";

/** The strip the toolbar keeps on the left of the canvas (fits and the node toolbar stay clear of it). */
export const TOOLBAR_ROOM = 64;

const MAKERS: MediaOutput[] = ["image", "poster", "video"];

/** Each maker's tooltip. */
const MAKER_TIP: Partial<Record<MediaOutput, string>> = {
  image: "Make an image",
  poster: "Make a poster",
  video: "Make a video ad (any video, with music and voice)",
};

const Sep = () => <span className="my-1 h-px w-5 shrink-0 bg-neutral-200" />;

function ToolButton({ label, hint, keys, active, current, busy, onClick, children }: { label: string; hint?: string; keys?: string; active?: boolean; current?: boolean; busy?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={busy}
            onClick={onClick}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 disabled:pointer-events-none [&_svg]:size-[18px]",
              current && "bg-orange-50 text-orange-800 hover:bg-orange-100/70 hover:text-orange-900",
              active && "bg-neutral-900 text-white hover:bg-neutral-900 hover:text-white",
            )}
          />
        }
      >
        {busy ? <Loader2 className="animate-spin text-neutral-400" /> : children}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className={cn(hint && "flex-col items-start gap-0.5")}>
        <span className="flex items-center gap-2">
          {label}
          {keys && <span className="text-background/60">{keys}</span>}
        </span>
        {hint && <span className="text-background/60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export function CanvasToolbar({ left }: { left: number }) {
  const { tool, setTool, placeFiles, make: place, pending } = useCanvas();
  const [picks, setPicks] = usePromptPicks();
  const input = useRef<HTMLInputElement>(null);

  const make = (o: MediaOutput) => {
    const patch: Partial<PromptPicks> = { output: o };
    // Video models make 9:16 and 16:9 only.
    if (o === "video" && !ASPECTS.find((a) => a.value === picks.aspect)?.video) patch.aspect = "9:16";
    setPicks(patch);
    if (o !== "auto") place(o);
  };

  return (
    <div
      data-board-ui
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation="vertical"
      className={cn(FLOAT, "absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-0.5 p-1 transition-[left] duration-500 ease-[cubic-bezier(0.22,0.8,0.24,1)]")}
      style={{ left }}
    >
      <ToolButton label="Select" keys="V" active={tool === "select"} onClick={() => setTool("select")}>
        <MousePointer2 />
      </ToolButton>
      <ToolButton label="Hand: drag to move around" keys="H or hold Space" active={tool === "hand"} onClick={() => setTool("hand")}>
        <Hand />
      </ToolButton>
      <Sep />
      <ToolButton label="Upload" hint="Images, video clips or music from your computer" busy={pending.includes("upload")} onClick={() => input.current?.click()}>
        <Upload />
      </ToolButton>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void placeFiles(files);
        }}
      />
      <Sep />
      {MAKERS.map((o) => (
        <ToolButton key={o} label={MAKER_TIP[o] ?? OUTPUTS[o].label} hint={OUTPUTS[o].hint} current={picks.output === o} onClick={() => make(o)}>
          {OUTPUT_ICON[o]}
        </ToolButton>
      ))}
    </div>
  );
}
