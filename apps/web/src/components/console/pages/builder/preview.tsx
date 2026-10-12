"use client";

import { AlertCircle, ExternalLink, Globe, Lock, Monitor, RotateCcw, Smartphone, Users } from "lucide-react";
import { forwardRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { profileOf, type Audience, type Variant } from "@/lib/pages/types";
import { brandDomain, previewUrl } from "@/lib/pages/urls";
import { Segmented } from "@/components/console/form";
import { Spinner } from "@/components/console/setup/atoms";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KIND_ICON, coverTiles } from "../taste-cover";

export type Device = "desktop" | "mobile";

/** The default version is the one everyone else sees. */
export const versionLabel = (v: Variant) => (v.audienceId ? v.name : "Everyone");

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
            title={v.doc ? v.name : `${v.name} · not built yet`}
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
    /** What the agent is doing to this version right now, if anything. */
    building?: string | null;
    /** Build (or rebuild) this version; shows the buttons when given. */
    onBuild?: () => void;
    /** Another turn is running, so building is not possible right now. */
    busy?: boolean;
  }
>(function PreviewFrame({ brandSlug, pageSlug, variant, device, reloadKey, className, overlay, onLoad, building, onBuild, busy }, ref) {
  if (!variant) {
    return <div className={cn("flex items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground", className)}>Pick a version to preview.</div>;
  }
  const src = previewUrl(brandSlug, pageSlug, variant._id);
  const empty = !variant.doc;
  const mobile = device === "mobile";
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
              <TooltipContent>Write this version again from scratch</TooltipContent>
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
              {building ? (
                <>
                  <Spinner className="size-5" />
                  <span>{building}</span>
                </>
              ) : variant.status === "failed" ? (
                <>
                  <p className="max-w-sm">
                    The {variant.name} version could not be built{variant.error ? `: ${variant.error}` : "."}
                  </p>
                  {onBuild && (
                    <Button size="sm" variant="outline" onClick={onBuild} disabled={busy}>
                      Try again
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p>{variant.audienceId ? `The ${variant.name} version is not built yet.` : "This version is not built yet."}</p>
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
              key={`${variant._id}-${variant.version}-${reloadKey}`}
              src={src}
              title={`${variant.name} preview`}
              className="size-full border-0"
              onLoad={onLoad}
            />
          )}
          {overlay}
        </div>
      </div>
    </div>
  );
});
