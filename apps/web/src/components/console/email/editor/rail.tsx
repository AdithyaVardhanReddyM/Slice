"use client";

// The icon rail on the left of the builder (AI Chat, Add, Themes,
// Personalise, Layers; Help at the bottom) and the one panel it opens. Panels
// stay mounted once opened, so a half-written message or a scroll position
// survives switching between them.

import { CircleHelp, Layers, MessagesSquare, Palette, Plus, UserStar, type LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/console/setup/atoms";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddPanel } from "./add-panel";
import { ChatPanel } from "./chat-panel";
import { useEditorEnv, type PanelId } from "./context";
import { LayersPanel } from "./layers-panel";
import { isMac } from "./model";
import { PersonalisePanel } from "./personalise-panel";
import { ThemesPanel } from "./themes-panel";

const ITEMS: { id: PanelId; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "AI Chat", icon: MessagesSquare },
  { id: "add", label: "Add", icon: Plus },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "personalise", label: "Personalise", icon: UserStar },
  { id: "layers", label: "Layers", icon: Layers },
];

function RailButton({ label, icon: Icon, active, badge, className, ...props }: ComponentProps<"button"> & { label: string; icon: LucideIcon; active?: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cn("group flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] leading-4 font-medium text-neutral-600 outline-none", className)}
    >
      <span
        className={cn(
          "relative flex size-10 items-center justify-center rounded-xl transition-colors group-focus-visible:ring-2 group-focus-visible:ring-neutral-900/30",
          active ? "bg-neutral-900 text-white shadow-sm" : "group-hover:bg-neutral-100 group-hover:text-neutral-950",
        )}
      >
        <Icon className="size-[19px]" />
        {badge}
      </span>
      <span className={cn("transition-colors", active ? "text-neutral-950" : "group-hover:text-neutral-950")}>{label}</span>
    </button>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-neutral-600">{label}</span>
      <kbd className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-sans text-[11px] text-neutral-700">{keys}</kbd>
    </div>
  );
}

function Help() {
  const mod = isMac() ? "⌘" : "Ctrl ";
  return (
    <Popover>
      <PopoverTrigger render={<RailButton label="Help" icon={CircleHelp} />} />
      <PopoverContent side="right" align="end" sideOffset={8} className="w-72 gap-3 p-3.5">
        <div>
          <p className="text-sm font-medium">Building an email</p>
          <p className="mt-1 text-xs leading-5 text-neutral-600">
            Ask the AI chat for anything, or edit by hand: click to select, double-click text to type, drag the handles to move things. Changes save as you go.
          </p>
        </div>
        <div className="border-t pt-2">
          <Shortcut keys={`${mod}Z`} label="Undo" />
          <Shortcut keys={`⇧ ${mod}Z`} label="Redo" />
          <Shortcut keys={`${mod}D`} label="Duplicate" />
          <Shortcut keys="Delete" label="Remove the selection" />
          <Shortcut keys="Enter" label="Type in the selected text" />
          <Shortcut keys="Esc" label="Clear the selection" />
          <Shortcut keys="H / V" label="Hand and select tools" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Rail() {
  const { panel, setPanel, agent } = useEditorEnv();
  return (
    <nav aria-label="Builder tools" className="flex w-[76px] shrink-0 flex-col items-center gap-1 bg-white pt-1 pb-3">
      {ITEMS.map((it) => (
        <RailButton
          key={it.id}
          label={it.label}
          icon={it.icon}
          active={panel === it.id}
          onClick={() => setPanel(panel === it.id ? null : it.id)}
          badge={
            it.id === "chat" && agent.busy && panel !== "chat" ? (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/10">
                <Spinner className="size-3 text-neutral-700" />
              </span>
            ) : undefined
          }
        />
      ))}
      <div className="flex-1" />
      <Help />
    </nav>
  );
}

const PANELS: Record<PanelId, () => ReactNode> = {
  chat: () => <ChatPanel />,
  add: () => <AddPanel />,
  themes: () => <ThemesPanel />,
  personalise: () => <PersonalisePanel />,
  layers: () => <LayersPanel />,
};

export function PanelHost() {
  const { panel } = useEditorEnv();
  // The chat is always mounted: "Edit with AI" writes into its composer from anywhere.
  const [mounted, setMounted] = useState<PanelId[]>(["chat"]);
  if (panel && !mounted.includes(panel)) setMounted([...mounted, panel]);
  return (
    <aside
      aria-label="Builder panel"
      className={cn(
        "flex w-[25rem] shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] 2xl:w-[29rem]",
        !panel && "hidden",
      )}
    >
      {mounted.map((id) => (
        <div key={id} className={cn("flex min-h-0 flex-1 flex-col", id !== panel && "hidden")}>
          {PANELS[id]()}
        </div>
      ))}
    </aside>
  );
}
