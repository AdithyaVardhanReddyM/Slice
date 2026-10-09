"use client";

import { useState } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Header actions. Mock only: "Sync now" spins briefly and reports back. */
export function SyncActions({ replaceLabel }: { replaceLabel: string }) {
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");

  const sync = () => {
    setState("syncing");
    window.setTimeout(() => setState("done"), 1400);
  };

  return (
    <>
      <Button variant="outline" onClick={sync} disabled={state === "syncing"}>
        <RefreshCw className={cn(state === "syncing" && "animate-spin")} />
        {state === "syncing"
          ? "Syncing…"
          : state === "done"
            ? "Synced just now"
            : "Sync now"}
      </Button>
      <Button>
        <Upload />
        {replaceLabel}
      </Button>
    </>
  );
}
