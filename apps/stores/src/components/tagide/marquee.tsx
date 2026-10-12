import { cn } from "cn";

export function Marquee({
  words,
  className,
  reverse,
  speedClass,
}: {
  words: string[];
  className?: string;
  reverse?: boolean;
  speedClass?: string;
}) {
  const row = Array.from({ length: 4 }, () => words).flat();
  return (
    <div className={cn("overflow-hidden whitespace-nowrap", className)} aria-hidden="true">
      <div className={cn("tg-marquee-track", speedClass)} data-reverse={reverse ? "" : undefined}>
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0">
            {row.map((w, i) => (
              <span key={i} className="tg-display px-6 text-[64px] leading-none sm:text-[88px]">
                {w}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The thin black information ticker under the hero. */
export function Ticker({ items }: { items: string[] }) {
  return (
    <div className="overflow-hidden bg-tg-ink text-tg-cream" aria-label="Announcements">
      <div className="tg-marquee-track" style={{ animationDuration: "40s" }}>
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {items.map((t, i) => (
              <span key={i} className="flex items-center gap-6 py-3 pl-6 text-[13px] font-semibold uppercase tracking-[0.08em]">
                {t}
                <span className="size-1.5 rounded-full bg-tg-orange" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
