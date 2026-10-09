"use client";

import { Heart } from "lucide-react";
import { cn } from "cn";
import { useWishlist } from "@/lib/wishlist";

export function HeartButton({ productId, className, label }: { productId: string; className?: string; label?: boolean }) {
  const { has, toggle } = useWishlist("fold:wishlist");
  const on = has(productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
      className={cn("inline-flex items-center justify-center gap-2 transition-colors", className)}
    >
      <Heart className={cn("size-[18px] transition-transform active:scale-90", on && "fill-fd-ink")} strokeWidth={1.6} />
      {label && <span>{on ? "Saved" : "Save"}</span>}
    </button>
  );
}
