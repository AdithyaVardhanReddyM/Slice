"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** A row of cards that scrolls sideways, with arrows on larger screens. */
export function Rail({ head, children, label }: { head: ReactNode; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft < 8;
    const end = el.scrollLeft + el.clientWidth > el.scrollWidth - 8;
    if (start !== edges.start || end !== edges.end) setEdges({ start, end });
  };
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.75, behavior: "smooth" });

  return (
    <div>
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 flex-1">{head}</div>
        <div className="hidden shrink-0 gap-2 md:flex">
          <button type="button" onClick={() => go(-1)} disabled={edges.start} aria-label="Scroll back" className="grid size-11 place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--cv-line)] transition hover:shadow-[inset_0_0_0_1px_var(--cv-ink)] disabled:opacity-40 disabled:hover:shadow-[inset_0_0_0_1px_var(--cv-line)]">
            <ChevronLeft className="size-5" strokeWidth={1.9} />
          </button>
          <button type="button" onClick={() => go(1)} disabled={edges.end} aria-label="Scroll on" className="grid size-11 place-items-center rounded-full bg-white shadow-[inset_0_0_0_1px_var(--cv-line)] transition hover:shadow-[inset_0_0_0_1px_var(--cv-ink)] disabled:opacity-40 disabled:hover:shadow-[inset_0_0_0_1px_var(--cv-line)]">
            <ChevronRight className="size-5" strokeWidth={1.9} />
          </button>
        </div>
      </div>
      <div ref={ref} onScroll={onScroll} role="list" aria-label={label} className="cv-scroll -mx-5 mt-7 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-1 md:-mx-8 md:scroll-px-8 md:px-8 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {Children.map(children, (child) => (
          <div role="listitem" className="grid w-[78%] shrink-0 snap-start sm:w-[calc((100%-20px)/2)] lg:w-[calc((100%-60px)/4)]">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
