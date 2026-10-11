"use client";

import { ExternalLink, Monitor, RotateCw, Smartphone } from "lucide-react";
import { forwardRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Variant } from "@/lib/pages/types";
import { previewUrl } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { Button } from "@/components/ui/button";
import { StatusDot } from "../shared";

export type Device = "desktop" | "mobile";

export function VariantTabs({
  variants,
  activeId,
  onSelect,
  liveId,
  queued,
}: {
  variants: Variant[];
  activeId: string | null;
  onSelect: (id: string) => void;
  liveId?: string | null;
  queued?: string[];
}) {
  return (
    <div role="tablist" className="scrollbar-thin flex items-center gap-1 overflow-x-auto">
      {variants.map((v) => {
        const active = v._id === activeId;
        const working = v._id === liveId;
        const waiting = queued?.includes(v._id);
        return (
          <button
            key={v._id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(v._id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={`${v.name} · ${v.status}${v.version ? ` · v${v.version}` : ""}`}
          >
            <StatusDot status={working ? "building" : waiting ? "building" : v.status} className={cn(active && "ring-2 ring-background/40")} />
            <span className="max-w-40 truncate">{v.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DeviceToggle({ value, onChange }: { value: Device; onChange: (d: Device) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "desktop", label: <Monitor className="size-4" aria-label="Desktop" /> },
        { value: "mobile", label: <Smartphone className="size-4" aria-label="Mobile" /> },
      ]}
    />
  );
}

export const PreviewFrame = forwardRef<
  HTMLIFrameElement,
  {
    brandSlug: string;
    pageSlug: string;
    variant: Variant | null;
    device: Device;
    reloadKey: number;
    className?: string;
    overlay?: ReactNode;
    onLoad?: () => void;
  }
>(function PreviewFrame({ brandSlug, pageSlug, variant, device, reloadKey, className, overlay, onLoad }, ref) {
  const [manual, setManual] = useState(0);
  if (!variant) {
    return <div className={cn("flex items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground", className)}>Pick a version to preview.</div>;
  }
  const src = previewUrl(brandSlug, pageSlug, variant._id);
  const empty = variant.status !== "ready" && !variant.doc;
  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-xl border bg-muted/40", className)}>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b bg-background px-2 text-xs text-muted-foreground">
        <span className="num truncate px-1">{src}</span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => setManual((m) => m + 1)} aria-label="Reload preview">
            <RotateCw />
          </Button>
          <Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={src} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" />}>
            <ExternalLink />
          </Button>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 justify-center overflow-hidden bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgb(0_0_0/0.015)_10px,rgb(0_0_0/0.015)_20px)] p-3">
        <div className={cn("relative h-full bg-background shadow-sm ring-1 ring-foreground/10 transition-[width] duration-300", device === "mobile" ? "w-[390px] rounded-[1.5rem]" : "w-full rounded-lg")}>
          {empty ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              This version has not been generated yet.
            </div>
          ) : (
            <iframe
              ref={ref}
              key={`${variant._id}-${variant.version}-${reloadKey}-${manual}`}
              src={src}
              title={`${variant.name} preview`}
              className={cn("size-full border-0", device === "mobile" ? "rounded-[1.5rem]" : "rounded-lg")}
              onLoad={onLoad}
            />
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
});
