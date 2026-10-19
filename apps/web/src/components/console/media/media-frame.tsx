import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Media card artwork (media-card.svg, 522×336: people building a phone
 * screen of posters and clips), shown as it is: nothing is laid over it.
 */
export function MediaFrame({ className, hoverZoom, priority, sizes = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw" }: { className?: string; hoverZoom?: boolean; priority?: boolean; sizes?: string }) {
  return (
    <div className={cn("relative aspect-[522/336] overflow-hidden bg-muted", className)}>
      <Image src="/illustrations/media-card.svg" alt="" fill priority={priority} sizes={sizes} className={cn("object-cover", hoverZoom && "transition-transform duration-300 group-hover:scale-[1.02]")} />
    </div>
  );
}
