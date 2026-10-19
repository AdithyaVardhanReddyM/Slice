import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Media card artwork (media-card.svg, 522×336: people building a phone
 * screen of posters and clips) with live content in two of the screen's
 * placeholders: the campaign's latest picture in the top one, the brand's
 * logo in the bottom one. Slots are positioned in the SVG's own coordinates,
 * a hair larger than the dashed boxes so their outlines don't show.
 */
export function MediaFrame({ cover, logo, logoBackground, className, hoverZoom, priority, sizes = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw" }: { cover?: ReactNode; logo?: ReactNode; logoBackground?: string; className?: string; hoverZoom?: boolean; priority?: boolean; sizes?: string }) {
  const zoom = hoverZoom && "transition-transform duration-300 group-hover:scale-[1.02]";
  return (
    <div className={cn("@container relative aspect-[522/336] overflow-hidden bg-muted", className)}>
      <Image src="/illustrations/media-card.svg" alt="" fill priority={priority} sizes={sizes} className={cn("object-cover", zoom)} />
      <div className={cn("absolute inset-0", zoom)}>
        {/* Top placeholder: x 219.5–302.5, y 122–151. */}
        {cover && (
          <span className="absolute overflow-hidden rounded-[0.9cqw] bg-white" style={{ left: "41.8%", width: "16.4%", top: "35.9%", height: "9.5%" }}>
            {cover}
          </span>
        )}
        {/* Bottom placeholder: x 219.5–302.5, y 247–276. */}
        {logo && (
          <span className="absolute flex items-center justify-center overflow-hidden rounded-[0.9cqw] bg-white" style={{ left: "41.8%", width: "16.4%", top: "73.1%", height: "9.5%", background: logoBackground }}>
            {logo}
          </span>
        )}
      </div>
    </div>
  );
}
