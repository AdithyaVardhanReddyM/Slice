"use client";

// The canvas's chrome: the top bar (back, campaign name, panels, spend), the
// zoom control, and the welcome that sits on an empty canvas.

import { useMutation } from "convex/react";
import { ArrowLeft, Clapperboard, Film, Image as ImageIcon, LayoutTemplate, Maximize, Minus, Music, PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { api } from "@slice/backend/convex/_generated/api";
import type { MediaKit, MediaOutput } from "@slice/backend/convex/mediaTypes";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BrandMark } from "../prompt/brand-chip";
import { usePromptPicks } from "../prompt/options";
import { useCanvas } from "./context";
import { SpendPill } from "./spend";

export function TopBar() {
  const { campaign, campaignId, sidebar, setSidebar } = useCanvas();
  const update = useMutation(api.media.update);
  const [name, setName] = useState<string | null>(null);
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.06] bg-white px-2.5">
      <Link href="/dashboard/media" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950">
        <ArrowLeft className="size-4" /> Media
      </Link>
      <span className="text-neutral-300">/</span>
      <input
        value={name ?? campaign.name}
        aria-label="Campaign name"
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
        className="h-8 w-[min(28rem,40vw)] min-w-0 truncate rounded-lg px-2 text-[13px] font-semibold text-neutral-950 outline-none hover:bg-neutral-50 focus:bg-white focus:ring-2 focus:ring-blue-500/40"
      />
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSidebar({ open: !(sidebar.open && sidebar.tab === "assets"), tab: "assets" })}
          className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950", sidebar.open && sidebar.tab === "assets" && "bg-neutral-100 text-neutral-950")}
        >
          <ImageIcon className="size-4" /> Assets
        </button>
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <SpendPill />
      </div>
    </header>
  );
}

export function SidebarToggle() {
  const { sidebar, setSidebar } = useCanvas();
  return (
    <button
      type="button"
      onClick={() => setSidebar({ open: !sidebar.open })}
      aria-label={sidebar.open ? "Hide the panel" : "Show the chat"}
      title={sidebar.open ? "Hide the panel" : "Show the chat"}
      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
    >
      <PanelLeft className="size-4" />
    </button>
  );
}

export function ZoomControl({ zoom }: { zoom: number }) {
  const { board, selected } = useCanvas();
  return (
    <div data-board-ui className="flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_20px_-10px_rgba(0,0,0,0.2)] ring-1 ring-black/[0.07]">
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
  { output: "clip", icon: <Clapperboard />, label: "A 6-second clip", prompt: (b) => `A 6-second opening shot that sells the feeling of ${b}` },
  { output: "video", icon: <Film />, label: "A 15-second ad", prompt: () => "A 15-second story ad: hook, product, end card with the offer" },
  { output: "music", icon: <Music />, label: "A soundtrack", prompt: (b) => `A 30-second instrumental that sounds like ${b}` },
];

/** What an empty canvas says: who it is designing for and a few ways to start. */
export function EmptyHero({ bottom }: { bottom: number }) {
  const { brand, kit, compose } = useCanvas();
  const [, setPicks] = usePromptPicks();
  const name = brand?.name ?? "your brand";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center px-6" style={{ bottom }}>
      <div className="pointer-events-auto flex max-w-2xl flex-col items-center text-center" data-board-ui>
        {brand ? <BrandMark kit={kit as MediaKit} name={brand.name} className="mb-5 h-12 w-20 rounded-xl" /> : null}
        <h1 className="text-[28px] font-medium tracking-[-0.02em] text-neutral-950">What should we make for {name}?</h1>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          {brand ? "Images, posters, clips, video ads and music, in its look and voice. Everything lands here on the canvas." : "Add your brand in the bar below, so everything Slice makes looks and sounds like you."}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setPicks({ output: s.output, ...(s.output === "clip" || s.output === "video" ? { aspect: "9:16" } : {}) });
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
