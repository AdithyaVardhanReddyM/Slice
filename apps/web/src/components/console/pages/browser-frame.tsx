import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The browser-window artwork (page-card.svg, 522×336) with live content laid
 * over it: a domain in the address bar and anything on the hero block. Both
 * slots are positioned in the SVG's own coordinates and sized in `cqw`, so
 * they scale with the frame.
 */
export function BrowserFrame({
  domain,
  hero,
  heroBackground,
  className,
  hoverZoom,
  priority,
  sizes = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw",
}: {
  domain: ReactNode;
  hero?: ReactNode;
  heroBackground?: string;
  className?: string;
  /** Scale the frame up when an ancestor `.group` is hovered. */
  hoverZoom?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const zoom = hoverZoom && "transition-transform duration-300 group-hover:scale-[1.02]";
  return (
    <div className={cn("@container relative aspect-[522/336] overflow-hidden bg-muted", className)}>
      <Image src="/illustrations/page-card.svg" alt="" fill priority={priority} sizes={sizes} className={cn("object-cover", zoom)} />
      <div className={cn("absolute inset-0", zoom)}>
        {/* Address bar: x 186–372, y 75.3–93.1, after the search glyph. */}
        <span
          className="absolute flex items-center truncate text-[2.1cqw] leading-none text-neutral-500"
          style={{ left: "35.6%", width: "35.6%", top: "22.4%", height: "5.3%" }}
        >
          {domain}
        </span>
        {/* Hero block: x 125.6–396.1, y 176.3–263.7. */}
        {hero && (
          <span
            className="absolute flex items-center justify-center overflow-hidden rounded-[1.45cqw] bg-[#ededed]"
            style={{ left: "24.05%", width: "51.83%", top: "52.46%", height: "26.03%", background: heroBackground }}
          >
            {hero}
          </span>
        )}
      </div>
    </div>
  );
}
