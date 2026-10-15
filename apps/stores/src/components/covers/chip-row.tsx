"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A row of filter chips: one line that scrolls sideways on a phone, wrapping on
 * desktop. On a phone the chosen chip is scrolled into view, so "Soho" isn't
 * hiding off the right-hand edge.
 */
export function ChipRow({ active, children }: { active: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = ref.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = Math.max(0, chip.offsetLeft - 20);
  }, [active]);

  return (
    <div ref={ref} className="cv-scroll relative -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      {children}
    </div>
  );
}
