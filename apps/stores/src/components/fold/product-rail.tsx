"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Horizontal carousel with arrow buttons; swipe/scroll also works.
export function ProductRail({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  // Which arrows make sense: none at rest until measured, then by position.
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft < 8,
      end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
    });
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el)
      el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <div className="relative">
      <ul
        ref={ref}
        aria-label={label}
        onScroll={measure}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 sm:scroll-px-6 sm:px-6 lg:gap-6 lg:scroll-px-10 lg:px-10"
      >
        {children}
      </ul>
      {([-1, 1] as const)
        .filter((dir) => (dir < 0 ? !edges.start : !edges.end))
        .map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => scroll(dir)}
            aria-label={dir < 0 ? "Scroll back" : "Scroll forward"}
            className={`absolute top-[38%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-fd-ink shadow-md ring-1 ring-black/5 transition hover:scale-105 lg:flex ${dir < 0 ? "left-4" : "right-4"}`}
          >
            {dir < 0 ? (
              <ChevronLeft className="size-5" />
            ) : (
              <ChevronRight className="size-5" />
            )}
          </button>
        ))}
    </div>
  );
}

export function RailItem({ children }: { children: ReactNode }) {
  return (
    <li className="w-[46vw] shrink-0 snap-start sm:w-[30vw] lg:w-[calc((100%-4*1.5rem)/4.4)] xl:w-[calc((100%-5*1.5rem)/5.4)]">
      {children}
    </li>
  );
}
