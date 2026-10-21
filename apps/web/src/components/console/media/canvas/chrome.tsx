"use client";

// The canvas's chrome, floating on the canvas (there is no header): top left,
// back to the campaigns, the campaign's name and the panel toggle (this group
// moves into the sidebar's head while the sidebar is open, with the brand);
// top right, spend and Assets; the zoom control; and the welcome that sits
// on an empty canvas.

import { useMutation } from "convex/react";
import { ArrowLeft, Clapperboard, Film, Image as ImageIcon, LayoutTemplate, Loader2, Maximize, Minus, PanelLeft, PanelLeftClose, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactElement, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaKit, MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandChip, BrandMark } from "../prompt/brand-chip";
import { usePromptPicks } from "../prompt/options";
import { useCanvas } from "./context";
import { SpendPill } from "./spend";

/** The white surface every floating control on the canvas sits on. */
export const FLOAT = "rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.07]";

const iconButton = "relative flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 [&_svg]:size-4";

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200" />;

function Tip({ label, side = "bottom", children }: { label: string; side?: "bottom" | "right"; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function BackButton() {
  return (
    <Tip label="All campaigns">
      <Link href="/dashboard/media" aria-label="All campaigns" className={iconButton}>
        <ArrowLeft />
      </Link>
    </Tip>
  );
}

/** The campaign's name, renamed in place; `fit` sizes it to the words. */
function CampaignName({ fit, className }: { fit?: boolean; className?: string }) {
  const { campaign, campaignId } = useCanvas();
  const update = useMutation(api.media.update);
  const [name, setName] = useState<string | null>(null);
  return (
    <input
      value={name ?? campaign.name}
      aria-label="Campaign name"
      title="Rename"
      onChange={(e) => setName(e.target.value)}
      onFocus={(e) => {
        setName(campaign.name);
        e.currentTarget.select();
      }}
      onBlur={() => {
        const n = name?.trim();
        if (n && n !== campaign.name) void update({ id: campaignId, name: n });
        setName(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setName(null);
          e.currentTarget.blur();
        }
      }}
      className={cn(fit && "field-sizing-content", "h-8 min-w-12 truncate rounded-lg px-2 text-sm font-semibold text-neutral-950 outline-none hover:bg-neutral-100 focus:bg-white focus:ring-2 focus:ring-blue-500/40", className)}
    />
  );
}

function PanelToggle() {
  const { sidebar, setSidebar, agent } = useCanvas();
  const label = sidebar.open ? "Hide the panel" : "Show the chat";
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} onClick={() => setSidebar({ open: !sidebar.open })} className={iconButton}>
        {sidebar.open ? <PanelLeftClose /> : <PanelLeft />}
        {!sidebar.open && agent.busy && <Loader2 className="absolute -top-0.5 -right-0.5 size-3! animate-spin rounded-full bg-white text-neutral-500" />}
      </button>
    </Tip>
  );
}

/** Top left of the canvas while the sidebar is closed. */
export function CanvasCorner() {
  return (
    <div data-board-ui className={cn(FLOAT, "flex h-10 items-center p-1")}>
      <BackButton />
      <Divider />
      <CampaignName fit className="max-w-[min(24rem,36vw)]" />
      <Divider />
      <PanelToggle />
    </div>
  );
}

/** The same group at the top of the open sidebar, with the brand beside the name. */
export function SidebarHead() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-0.5 px-2.5">
      <BackButton />
      <BrandChip compact side="bottom" />
      <CampaignName className="min-w-0 flex-1" />
      <PanelToggle />
    </div>
  );
}

/** Top right of the canvas: what it has cost, and the asset library. */
export function CanvasTopRight() {
  const { sidebar, setSidebar } = useCanvas();
  const on = sidebar.open && sidebar.tab === "assets";
  return (
    <div data-board-ui className={cn(FLOAT, "flex h-10 items-center p-1")}>
      <SpendPill />
      <Divider />
      <button
        type="button"
        onClick={() => setSidebar({ open: !on, tab: "assets" })}
        className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950", on && "bg-neutral-100 text-neutral-950")}
      >
        <ImageIcon className="size-4 text-neutral-500" /> Assets
      </button>
    </div>
  );
}

export function ZoomControl({ zoom }: { zoom: number }) {
  const { board, selected } = useCanvas();
  return (
    <div data-board-ui className={cn(FLOAT, "flex items-center gap-0.5 p-1")}>
      <button type="button" aria-label="Zoom out" onClick={() => board.current?.zoomBy(1 / 1.25)} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Minus className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="h-7 min-w-14 rounded-md px-1.5 text-xs font-medium text-neutral-700 tabular-nums hover:bg-neutral-100 data-popup-open:bg-neutral-100">{Math.round(zoom * 100)}%</DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-52">
          <DropdownMenuItem onClick={() => board.current?.fit(undefined, { maxZoom: 1.5 })}>
            Zoom to fit <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!selected.length} onClick={() => board.current?.fit(selected, { maxZoom: 2 })}>
            Zoom to selection <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {[0.25, 0.5, 1, 2].map((z) => (
            <DropdownMenuItem key={z} onClick={() => board.current?.zoomTo(z)}>
              {z * 100}% {z === 1 && <DropdownMenuShortcut>⌘0</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" aria-label="Zoom in" onClick={() => board.current?.zoomBy(1.25)} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Plus className="size-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-neutral-200" />
      <button type="button" aria-label="Zoom to fit" title="Zoom to fit (⇧1)" onClick={() => board.current?.fit(undefined, { maxZoom: 1.5 })} className="flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
        <Maximize className="size-3.5" />
      </button>
    </div>
  );
}

const STARTERS: { output: MediaOutput; icon: ReactNode; label: string; prompt: (brand: string) => string }[] = [
  { output: "image", icon: <ImageIcon />, label: "A hero image", prompt: (b) => `A hero photograph for ${b}: our product in its best setting, warm and inviting` },
  { output: "poster", icon: <LayoutTemplate />, label: "A launch poster", prompt: () => "A poster for this week's offer, with a clear call to action" },
  { output: "video", icon: <Film />, label: "A 15-second ad", prompt: () => "A 15-second story ad: hook, product, end card with the offer" },
  { output: "video", icon: <Clapperboard />, label: "A 6-second moment", prompt: (b) => `A 6-second video of one shot that sells the feeling of ${b}` },
];

/** What an empty canvas says: who it is designing for and a few ways to start. */
export function EmptyHero({ left, bottom }: { left: number; bottom: number }) {
  const { brand, kit, compose } = useCanvas();
  const [, setPicks] = usePromptPicks();
  const name = brand?.name ?? "your brand";
  return (
    <div className="pointer-events-none absolute top-0 right-0 flex flex-col items-center justify-center px-6 transition-[left] duration-500" style={{ left, bottom }}>
      <div className="pointer-events-auto flex max-w-2xl flex-col items-center text-center" data-board-ui>
        {brand ? <BrandMark kit={kit as MediaKit} name={brand.name} className="mb-5 h-12 w-20 rounded-xl" /> : null}
        <h1 className="text-[28px] font-medium tracking-[-0.02em] text-neutral-950">What should we make for {name}?</h1>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {brand ? "Images, posters and video ads with music and voice, in its look and voice. Everything lands here on the canvas." : "Add your brand in the bar below, so everything Slice makes looks and sounds like you."}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setPicks({ output: s.output, ...(s.output === "video" ? { aspect: "9:16" } : {}) });
                compose(s.prompt(name));
              }}
              className="flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-medium text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.07] transition-colors hover:bg-neutral-50 hover:text-neutral-950 [&_svg]:size-4 [&_svg]:text-neutral-500"
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
