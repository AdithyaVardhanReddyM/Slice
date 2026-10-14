import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared look for the two client consoles (a Concierge widget, a Pages brand):
// a white sidebar whose current item is an ink pill, beside a warm grey content
// area holding white tiles, the same language as the console home.

/** SidebarMenuButton: roomy, rounded, ink when current. */
export const navButtonClass =
  "h-9 gap-2.5 rounded-xl px-3 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 data-active:bg-neutral-900 data-active:font-medium data-active:text-white data-active:shadow-sm [&_svg]:size-[18px]";

/** SidebarMenuBadge beside a navButton: readable on the ink pill too. */
export const navBadgeClass =
  "top-2! right-2.5 text-neutral-500 peer-data-active/menu-button:text-white/70";

export const navGroupLabelClass = "px-3 text-xs font-medium text-neutral-500";

/** The client switcher at the top of the sidebar. */
export const switcherClass =
  "h-14 rounded-2xl bg-white px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.07] hover:bg-neutral-50 data-popup-open:bg-neutral-50";

/** SidebarInset: the grey content area, rounded inside the white frame. */
export const insetClass =
  "bg-canvas md:peer-data-[variant=inset]:rounded-[22px] md:peer-data-[variant=inset]:shadow-none";

/** The sticky top bar inside the content area. */
export const topbarClass =
  "sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-black/[0.04] bg-canvas/85 px-4 backdrop-blur-md sm:px-6 md:rounded-t-[22px]";

/** Top bar link or button: a small white pill. */
export const topbarPillClass =
  "h-9 rounded-full bg-white px-3.5 font-normal text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.06] hover:bg-neutral-50 hover:text-neutral-950";

/** Wordmark plus the service the console belongs to. */
export function ServiceMark({
  wordmark,
  service,
}: {
  wordmark: ReactNode;
  service: string;
}) {
  return (
    <span className="flex items-center gap-2.5 px-2 pt-2">
      {wordmark}
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
        {service}
      </span>
    </span>
  );
}

/** The console's page width and padding, shared by every screen that wants the home's rhythm. */
export function ConsolePage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1320px] px-4 pt-8 pb-16 sm:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
