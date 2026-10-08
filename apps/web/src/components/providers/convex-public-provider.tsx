"use client";

import type { ReactNode } from "react";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convex";

/** Unauthenticated Convex client for shoppers inside the embedded widget. */
export function ConvexPublicProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
