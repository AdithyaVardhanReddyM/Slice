import { cn } from "cn";

/**
 * A striped wavy band: one thick lilac stroke with a dashed cream stroke on
 * top, so the dashes read as stripes that follow the curve.
 */
export function Ribbon({ className, color = "#cdb9ee", stripe = "#f4eee2", width = 120 }: { className?: string; color?: string; stripe?: string; width?: number }) {
  // Runs off both edges of the box, so no end of the band is ever visible.
  const d = "M-80 330 C 180 60, 380 600, 640 330 S 1080 60, 1380 330";
  return (
    <svg viewBox="0 0 1300 660" className={cn("pointer-events-none select-none", className)} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
      <path d={d} fill="none" stroke={stripe} strokeWidth={width} strokeDasharray="7 18" />
    </svg>
  );
}

/** A small decorative star, the kind festival posters scatter around. */
export function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden="true">
      <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="currentColor" />
    </svg>
  );
}
