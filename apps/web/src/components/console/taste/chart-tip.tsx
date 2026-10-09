"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pointer-following tooltip for the heatmap. Attach `ref` to a `relative`
 * container and call `show(e, data)` from cells.
 */
export function useChartTip<T>() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; data: T } | null>(
    null,
  );
  const show = (e: MouseEvent, data: T) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // Keep the tooltip (max 256px wide, centered on x) inside the container.
    const half = Math.min(128, box.width / 2);
    const x = Math.min(Math.max(e.clientX - box.left, half), box.width - half);
    setTip({ x, y: e.clientY - box.top, data });
  };
  const hide = () => setTip(null);
  return { ref, tip, show, hide };
}

/** Styled to match the shadcn chart tooltip. */
export function ChartTip({
  x,
  y,
  children,
  className,
}: {
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-30 grid w-max max-w-64 -translate-x-1/2 -translate-y-full gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm",
        className,
      )}
      style={{ left: x, top: y - 12 }}
    >
      {children}
    </div>
  );
}

/** Label/value line inside a ChartTip. */
export function TipRow({
  label,
  value,
  swatch,
}: {
  label: ReactNode;
  value: ReactNode;
  swatch?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {swatch && (
          <span
            className="size-2.5 rounded-sm"
            style={{ background: swatch }}
          />
        )}
        {label}
      </span>
      <span className="num font-medium text-foreground">{value}</span>
    </div>
  );
}
