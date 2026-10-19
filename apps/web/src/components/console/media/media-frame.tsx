import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Media card artwork (media-card.svg, 522×336: people building a phone
 * screen of posters and clips) with the brand's logo in the screen's bottom
 * placeholder. No pictures go on it. The slot is positioned in the SVG's own
 * coordinates, a hair larger than the dashed box so its outline doesn't show.
 */
export function MediaFrame({ logo, logoBackground, className, hoverZoom, priority, sizes = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw" }: { logo?: ReactNode; logoBackground?: string; className?: string; hoverZoom?: boolean; priority?: boolean; sizes?: string }) {
  const zoom = hoverZoom && "transition-transform duration-300 group-hover:scale-[1.02]";
  return (
    <div className={cn("@container relative aspect-[522/336] overflow-hidden bg-muted", className)}>
      <Image src="/illustrations/media-card.svg" alt="" fill priority={priority} sizes={sizes} className={cn("object-cover", zoom)} />
      {/* Bottom placeholder: x 219.5–302.5, y 247–276. */}
      {logo && (
        <div className={cn("absolute inset-0", zoom)}>
          <span className="absolute flex items-center justify-center overflow-hidden rounded-[0.9cqw] bg-white" style={{ left: "41.8%", width: "16.4%", top: "73.1%", height: "9.5%", background: logoBackground }}>
            {logo}
          </span>
        </div>
      )}
    </div>
  );
}
