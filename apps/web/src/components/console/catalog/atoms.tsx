import type { ReactNode } from "react";
import { Badge } from "@/components/console/primitives";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ReadinessTier } from "./model";

/** Product image by URL. ProductThumb needs a full Product; rows only carry the src. */
export function Thumb({
  src,
  size = 32,
  className,
}: {
  src: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative block flex-none overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src && (
        // Merchant-hosted images; next/image would need every merchant CDN allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      )}
    </span>
  );
}

export const TIER_LABEL: Record<ReadinessTier, string> = {
  strong: "Strong",
  good: "Good",
  thin: "Thin",
};

/** Readiness score as a short progress bar with the number beside it. */
export function ReadinessMeter({
  score,
  tier,
  showLabel,
}: {
  score: number;
  tier: ReadinessTier;
  showLabel?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2"
      aria-label={`Taste readiness ${score} of 100, ${TIER_LABEL[tier]}`}
    >
      <Progress value={score} className="w-14" aria-hidden />
      <span className="num w-6 text-sm">{score}</span>
      {(showLabel || tier === "thin") && (
        <Badge tone={tier === "thin" ? "warn" : "neutral"}>
          {TIER_LABEL[tier]}
        </Badge>
      )}
    </span>
  );
}

/** Tint for values Slice inferred; shared with the drawer legend. */
export const INFERRED_CLASS = "bg-primary/10 text-orange-700";

/** Attribute value chip. `inferred` marks values Slice enriched from the description. */
export function ValueChip({
  children,
  inferred,
  className,
}: {
  children: ReactNode;
  inferred?: boolean;
  className?: string;
}) {
  return (
    <Badge
      tone={inferred ? "neutral" : "outline"}
      className={cn(inferred && INFERRED_CLASS, className)}
      title={
        inferred ? "Enriched by Slice from the product description" : undefined
      }
    >
      {children}
    </Badge>
  );
}
