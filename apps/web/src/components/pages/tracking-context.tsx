"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TrackEvent } from "@slice/backend/convex/pagesTypes";
import type { TrackingMeta } from "./types";

const Ctx = createContext<TrackingMeta | null>(null);

export function TrackingProvider({ value, children }: { value: TrackingMeta; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTracking(): TrackingMeta | null {
  return useContext(Ctx);
}

declare global {
  interface Window {
    /** Installed by <Tracker>; other client components push events through it. */
    __pgTrack?: (event: Omit<TrackEvent, "at"> & { at?: number }) => void;
  }
}

/** Queue an event on the page's tracker (no-op when the tracker is absent or disabled). */
export function pushEvent(event: Omit<TrackEvent, "at"> & { at?: number }) {
  if (typeof window === "undefined") return;
  window.__pgTrack?.(event);
}
