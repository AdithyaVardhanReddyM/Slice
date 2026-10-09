"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { NoWidgets } from "./widget-card";

/** `?empty=1` previews the first-run state while the mock has widgets. */
export function WidgetsView({
  hasWidgets,
  children,
}: {
  hasWidgets: boolean;
  children: ReactNode;
}) {
  const preview = useSearchParams().get("empty") === "1";
  return hasWidgets && !preview ? children : <NoWidgets />;
}
