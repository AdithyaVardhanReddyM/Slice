"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Product, Variant } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";

export function AddToBag({ product, label = "Add to bag" }: { product: Product; label?: string }) {
  const { add } = useCart();
  const [variant, setVariant] = useState<Variant>(product.variants.find((v) => v.inStock) ?? product.variants[0]);
  const [added, setAdded] = useState(false);
  const price = product.price + (variant.priceDelta ?? 0);
  const groupLabel =
    product.category === "Subscriptions" ? "Delivery frequency" : product.variants.length > 1 ? "Size" : undefined;

  return (
    <div>
      {groupLabel && (
        <fieldset>
          <legend className="text-sm font-semibold">{groupLabel}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.inStock}
                onClick={() => setVariant(v)}
                aria-pressed={v.id === variant.id}
                className={cn(
                  "rounded-[4px] border px-4 py-2.5 text-sm transition-colors",
                  v.id === variant.id
                    ? "border-rl-ink bg-rl-ink text-rl-cream"
                    : "border-rl-line bg-transparent hover:border-rl-ink",
                  !v.inStock && "cursor-not-allowed opacity-40 line-through",
                )}
              >
                {v.label}
                {v.priceDelta ? <span className="ml-1.5 opacity-70">+{money(v.priceDelta)}</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-5 flex items-stretch gap-3">
        <button
          type="button"
          onClick={() => {
            add(product, variant);
            setAdded(true);
            setTimeout(() => setAdded(false), 1800);
          }}
          className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[4px] bg-rl-rust px-6 text-[15px] font-semibold text-rl-cream transition-colors hover:bg-rl-rust-deep"
        >
          {added ? (
            <>
              <Check className="size-4" /> Added
            </>
          ) : (
            <>
              {label} <span className="opacity-80">·</span> {money(price)}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
