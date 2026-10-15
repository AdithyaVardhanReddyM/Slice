"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import { CalendarClock, CircleCheck, Loader2, PenLine, TriangleAlert, type LucideIcon } from "lucide-react";
import { api } from "@slice/backend/convex/_generated/api";
import type { Id } from "@slice/backend/convex/_generated/dataModel";
import type { CampaignStatus, EmailItem } from "@slice/backend/convex/emailTypes";
import { cn } from "@/lib/utils";
import { CAMPAIGN_STATUS } from "@/lib/email/labels";
import { itemOf } from "@/lib/email/types";
import { EmailFrame } from "@/components/console/email/email-frame";

/** The brand's items as the renderer reads them; `undefined` while loading. */
export function useBrandItems(brandId: Id<"emailBrands">): EmailItem[] | undefined {
  const rows = useQuery(api.emailItems.list, { brandId });
  return useMemo(() => rows?.map(itemOf), [rows]);
}

/** "Oct 18, 9:00 AM" in the merchant's own time zone. */
export function when(at: number) {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function day(at: number) {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_ICON: Record<CampaignStatus, LucideIcon> = {
  draft: PenLine,
  scheduled: CalendarClock,
  sending: Loader2,
  sent: CircleCheck,
  failed: TriangleAlert,
};

const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: "text-neutral-600",
  scheduled: "text-sky-700",
  sending: "text-amber-700",
  sent: "text-emerald-700",
  failed: "text-red-700",
};

/** A campaign's status as text and an icon; "Scheduled for Oct 18, 9:00 AM" when it has a time. */
export function CampaignStatusLabel({
  status,
  scheduledAt,
  sentAt,
  pill,
  className,
}: {
  status: CampaignStatus;
  scheduledAt?: number;
  sentAt?: number;
  /** Over an image: a white pill instead of bare text. */
  pill?: boolean;
  className?: string;
}) {
  const Icon = STATUS_ICON[status] ?? PenLine;
  const label =
    status === "scheduled" && scheduledAt ? `Scheduled for ${when(scheduledAt)}` : status === "sent" && sentAt && !pill ? `Sent ${day(sentAt)}` : CAMPAIGN_STATUS[status]?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        STATUS_TONE[status],
        pill && "h-6 rounded-full bg-white/95 px-2 text-xs shadow-sm ring-1 ring-black/[0.06] backdrop-blur",
        className,
      )}
    >
      <Icon className={cn(pill ? "size-3" : "size-3.5", status === "sending" && "animate-spin")} />
      {label}
    </span>
  );
}

/**
 * A live render of an email cropped to its box, which scrolls from the header
 * down to the footer while the pointer is over the nearest `group/email`.
 */
export function EmailThumb({ html, className, width = 600 }: { html: string | null; className?: string; width?: number }) {
  "use no memo";
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  // How far the render overhangs its box: the scroll on hover covers exactly that.
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const ro = new ResizeObserver(() => setDistance(Math.max(0, i.offsetHeight - b.clientHeight)));
    ro.observe(b);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className={cn("relative overflow-hidden bg-neutral-100", className)}>
      <div
        ref={inner}
        className="absolute inset-x-0 top-0 transition-transform ease-in-out group-hover/email:translate-y-(--scroll)"
        style={{ "--scroll": `-${distance}px`, transitionDuration: `${Math.min(6000, Math.max(1200, distance * 4))}ms` } as CSSProperties}
      >
        {html && <EmailFrame html={html} width={width} thumbnail />}
      </div>
    </div>
  );
}
