"use client";

// Chrome the rail's panels share: the header with its close button, and the
// small group labels inside them.

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEditorEnv } from "./context";

export function PanelHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const { setPanel } = useEditorEnv();
  return (
    <div className="flex shrink-0 items-start gap-2 px-4 pt-3.5 pb-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-7 font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs leading-5 text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
      <Button variant="ghost" size="icon-sm" onClick={() => setPanel(null)} aria-label="Close panel" className="-mr-1 text-neutral-500">
        <X />
      </Button>
    </div>
  );
}

export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-xs font-medium text-neutral-500", className)}>{children}</h3>;
}
