"use client";

import { AlertCircle, ExternalLink, Globe, Lock, Monitor, RotateCcw, Smartphone, Users } from "lucide-react";
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { profileOf, type Audience, type Brand, type Variant } from "@/lib/pages/types";
import { brandDomain, previewUrl } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KIND_ICON, coverTiles } from "../taste-cover";
import { BuildCanvas, type CanvasMode } from "./build-canvas";
import { draftSections, sectionLabel, type ToolStep } from "./build-steps";
import type { LiveTurn } from "./use-builder";
import { isHtmlDoc } from "@slice/backend/convex/pagesTypes";

export type Device = "desktop" | "mobile";

/** The page has edits the merchant made by hand in the visual editor. */
const handEdited = (v: Variant) => isHtmlDoc(v.doc) && Object.keys(v.doc.hand?.elements ?? {}).length > 0;

/** Who a version is for: its audiences' names ("Berlin + Under 25s"), or everyone. */
export const versionLabel = (v: Variant) => (v.name && v.name !== "Default" ? v.name : "Everyone");

/** An audience's face: its top Qloo pick, else its kind icon. */
export function AudienceFace({ audience, className }: { audience: Audience; className?: string }) {
  const [broken, setBroken] = useState(false);
  const image = coverTiles(profileOf(audience), 1)[0]?.image;
  const Icon = KIND_ICON[audience.kind] || Users;
  return (
    <span className={cn("flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-neutral-800 text-white/80 ring-2 ring-background", className)}>
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className="size-3" />
      )}
    </span>
  );
}

/** Who the page is built for: its audiences' faces and names, or Everyone. */
export function AudienceStrip({ audiences, working, className, bare }: { audiences: Audience[]; working?: boolean; className?: string; bare?: boolean }) {
  const label = audiences.length ? audiences.map((a) => a.name).join(" + ") : "Everyone";
  return (
    <div className={cn("inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-xl border bg-background pr-3 pl-1.5 text-sm shadow-xs", className)} title={`Built for ${label}`}>
      {working ? (
        <span className="flex size-5 items-center justify-center">
          <Spinner className="size-3.5" />
        </span>
      ) : audiences.length ? (
        <span className="flex shrink-0 -space-x-1.5">
          {audiences.slice(0, 3).map((a) => (
            <AudienceFace key={a._id} audience={a} />
          ))}
        </span>
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-foreground/5 text-muted-foreground">
          <Globe className="size-3.5" />
        </span>
      )}
      {!bare && <span className="text-muted-foreground">For</span>}
      <span className={cn("min-w-0 truncate", !bare && "font-medium")}>{label}</span>
    </div>
  );
}

/** The version's face: the audience's top Qloo pick, the globe for the default. */
function VersionAvatar({ variant, audience, working }: { variant: Variant; audience?: Audience; working: boolean }) {
  const [broken, setBroken] = useState(false);
  const base = "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px]";
  if (working) {
    return (
      <span className={base}>
        <Spinner className="size-3.5" />
      </span>
    );
  }
  if (variant.status === "failed") {
    return (
      <span className={cn(base, "text-destructive")}>
        <AlertCircle className="size-3.5" />
      </span>
    );
  }
  if (!variant.audienceId) {
    return (
      <span className={cn(base, "bg-foreground/5 text-muted-foreground")}>
        <Globe className="size-3.5" />
      </span>
    );
  }
  const image = coverTiles(profileOf(audience), 1)[0]?.image;
  const Icon = (audience && KIND_ICON[audience.kind]) || Users;
  return (
    <span className={cn(base, "bg-neutral-800 text-white/80", !variant.doc && "opacity-50 grayscale")}>
      {image && !broken ? (
        // Qloo images come from many hosts; next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <Icon className="size-3" />
      )}
    </span>
  );
}

export function VariantTabs({
  variants,
  activeId,
  onSelect,
  liveId,
  queued,
  audiences,
}: {
  variants: Variant[];
  activeId: string | null;
  onSelect: (id: string) => void;
  liveId?: string | null;
  queued?: string[];
  /** For each version's picture; without them audience versions show their kind icon. */
  audiences?: Audience[];
}) {
  return (
    <div role="tablist" className="scrollbar-thin flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border bg-background p-1 shadow-xs">
      {variants.map((v) => {
        const active = v._id === activeId;
        const working = v._id === liveId || !!queued?.includes(v._id);
        const audience = audiences?.find((a) => a._id === v.audienceId);
        return (
          <button
            key={v._id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(v._id)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-2 rounded-lg pr-3 pl-1.5 text-sm transition-colors",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            title={v.doc ? v.name : `${v.name} (not built yet)`}
          >
            <VersionAvatar variant={v} audience={audience} working={working} />
            <span className="max-w-40 truncate">{versionLabel(v)}</span>
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

/**
 * What the canvas shows for a turn: the sketch before there is anything to
 * show (or while a rebuild's styles stream), the draft while write_page
 * streams markup, and presence over a page that exists. The draft stays up
 * after the page is written until the saved page has loaded behind it.
 */
function canvasFor(live: LiveTurn | null | undefined, empty: boolean, pageLoaded: boolean, settled: boolean): { mode: CanvasMode | null; label: string | null; scanning: boolean; settle: boolean } {
  const working = !!live && live.status !== null && !live.handoff && !live.error;
  if (!live || !working) return { mode: null, label: null, scanning: false, settle: false };
  const tools = live.steps.filter((s): s is ToolStep => s.kind === "tool");
  const write = tools.filter((t) => t.name === "write_page").pop();
  const wrote = write?.status === "done";
  const running = tools.filter((t) => t.status === "running").pop();
  const html = live.draft?.html.trim() ?? "";
  const sections = draftSections(html);
  if (html && !(wrote && settled && pageLoaded && !empty)) {
    const last = sections[sections.length - 1];
    return { mode: "draft", label: wrote ? "Opening the page" : last ? `Writing the ${sectionLabel(last).toLowerCase()}` : "Writing the page", scanning: false, settle: wrote };
  }
  const label = running?.label ?? (live.steps.length ? "Thinking" : live.status);
  if (live.draft && !html && !wrote) return { mode: "sketch", label: "Choosing colours and type", scanning: false, settle: false };
  if (empty || (live.kind === "generate" && !wrote)) return { mode: "sketch", label, scanning: false, settle: false };
  return { mode: "presence", label, scanning: running?.name === "review_page", settle: false };
}

export const PreviewFrame = forwardRef<
  HTMLIFrameElement,
  {
    brand: Brand;
    pageSlug: string;
    variant: Variant | null;
    device: Device;
    reloadKey: number;
    className?: string;
    overlay?: ReactNode;
    onLoad?: () => void;
    /** The agent's turn on this page, if one is running: drives the build canvas. */
    live?: LiveTurn | null;
    /** Build (or rebuild) the page; shows the buttons when given. */
    onBuild?: () => void;
    /** Another turn is running, so building is not possible right now. */
    busy?: boolean;
  }
>(function PreviewFrame({ brand, pageSlug, variant, device, reloadKey, className, overlay, onLoad, live, onBuild, busy }, ref) {
  const brandSlug = brand.slug;
  const key = variant ? `${variant._id}-${variant.version}-${reloadKey}` : "";
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // The written page gets a moment to scroll the draft back up before it takes over.
  const write = live?.steps.filter((s): s is ToolStep => s.kind === "tool" && s.name === "write_page").pop();
  const wroteAt = write?.status === "done" ? (write.t ?? 0) : null;
  const [settledAt, setSettledAt] = useState<number | null>(null);
  useEffect(() => {
    if (wroteAt === null) return;
    const id = setTimeout(() => setSettledAt(wroteAt), 1100);
    return () => clearTimeout(id);
  }, [wroteAt]);
  if (!variant) {
    return <div className={cn("flex items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground", className)}>Nothing to preview yet.</div>;
  }
  const src = previewUrl(brandSlug, pageSlug, variant._id);
  const empty = !variant.doc;
  const mobile = device === "mobile";
  const canvas = canvasFor(live, empty, loadedKey === key, wroteAt !== null && settledAt === wroteAt);
  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-xl border bg-background shadow-xs", className)}>
      <div className="grid h-10 shrink-0 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-2 border-b px-2">
        <span />
        <span className="flex h-6 min-w-0 items-center justify-center gap-1.5 rounded-md bg-muted px-3 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          <span className="truncate">
            {brandDomain(brandSlug)}/{pageSlug}
          </span>
        </span>
        <span className="flex items-center justify-end gap-0.5">
          {onBuild && !empty && (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="xs" onClick={onBuild} disabled={busy} />}>
                <RotateCcw data-icon="inline-start" /> Rebuild
              </TooltipTrigger>
              <TooltipContent>{handEdited(variant) ? "Write the page again from scratch (your hand edits go with it)" : "Write the page again from scratch"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" nativeButton={false} render={<a href={src} target="_blank" rel="noreferrer" aria-label="Open in a new tab" />} />}>
              <ExternalLink />
            </TooltipTrigger>
            <TooltipContent>Open in a new tab</TooltipContent>
          </Tooltip>
        </span>
      </div>
      <div className={cn("relative flex min-h-0 flex-1 justify-center overflow-hidden", mobile && "bg-muted/50 py-4")}>
        <div className={cn("relative h-full bg-background transition-[width] duration-300", mobile ? "w-[390px] overflow-hidden rounded-[1.75rem] shadow-sm ring-1 ring-foreground/10" : "w-full")}>
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              {canvas.mode ? null : variant.status === "failed" ? (
                <>
                  <p className="max-w-sm">
                    The page could not be built{variant.error ? `: ${variant.error}` : "."}
                  </p>
                  {onBuild && (
                    <Button size="sm" variant="outline" onClick={onBuild} disabled={busy}>
                      Try again
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p>This page is not built yet.</p>
                  {onBuild && (
                    <Button size="sm" onClick={onBuild} disabled={busy}>
                      Build it now
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <iframe
              ref={ref}
              key={key}
              src={src}
              title={`${variant.name} preview`}
              className="size-full border-0"
              onLoad={() => {
                setLoadedKey(key);
                onLoad?.();
              }}
            />
          )}
          {canvas.mode && live && (
            <BuildCanvas
              mode={canvas.mode}
              brand={brand}
              steps={live.steps}
              draft={live.draft}
              label={canvas.label}
              startedAt={live.startedAt}
              scanning={canvas.scanning}
              settle={canvas.settle}
              className={cn(mobile && "rounded-[1.75rem]")}
            />
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
});
