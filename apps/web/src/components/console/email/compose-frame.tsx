import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const field = "absolute flex items-center text-[1.75cqw] leading-none text-neutral-800";

/**
 * The compose-window artwork (email-card.svg, 522×336) with live content laid
 * over it: who the email goes to, its subject line and anything on the body.
 * The "To" and "Subject" labels are part of the art, so the values start
 * after them. Every slot is positioned in the SVG's own coordinates and sized
 * in `cqw`, so it scales with the frame.
 */
export function ComposeFrame({
  to,
  subject,
  body,
  bodyBackground,
  className,
  hoverZoom,
  priority,
  sizes = "(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw",
}: {
  to?: ReactNode;
  subject?: ReactNode;
  body?: ReactNode;
  bodyBackground?: string;
  className?: string;
  /** Scale the frame up when an ancestor `.group` is hovered. */
  hoverZoom?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const zoom = hoverZoom && "transition-transform duration-300 group-hover:scale-[1.02]";
  return (
    <div className={cn("@container relative aspect-[522/336] overflow-hidden bg-muted", className)}>
      <Image src="/illustrations/email-card.svg" alt="" fill priority={priority} sizes={sizes} className={cn("object-cover", zoom)} />
      <div className={cn("absolute inset-0", zoom)}>
        {/* To field: x 89–431, y 97.5–117.5; the label ends at x 108. */}
        {to && (
          <span className={field} style={{ left: "21.65%", width: "59.8%", top: "29.02%", height: "5.95%" }}>
            <span className="min-w-0 truncate">{to}</span>
          </span>
        )}
        {/* Subject field: x 90–432, y 123–143; the label ends at x 127. */}
        {subject && (
          <span className={cn(field, "font-medium")} style={{ left: "25.3%", width: "56.1%", top: "36.6%", height: "5.9%" }}>
            <span className="min-w-0 truncate">{subject}</span>
          </span>
        )}
        {/* Body: x 89.2–431, y 148.3–264.2, drawn a hair larger so no grey shows at the edges. */}
        {body && (
          <span
            className="absolute flex items-center justify-center overflow-hidden rounded-[1.7cqw] bg-[#ededed]"
            style={{ left: "16.98%", width: "65.7%", top: "43.98%", height: "34.8%", background: bodyBackground }}
          >
            {body}
          </span>
        )}
      </div>
    </div>
  );
}
