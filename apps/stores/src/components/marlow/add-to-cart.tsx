"use client";

import { useState } from "react";
import type { Product } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { swatch } from "@/lib/swatches";

export function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  // Default to the base-priced option (Queen, not Twin) when it's in stock.
  const firstAvailable =
    product.variants.find((v) => v.inStock && !v.priceDelta) ??
    product.variants.find((v) => v.inStock) ??
    product.variants[0];
  const [variant, setVariant] = useState(firstAvailable);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const price = product.price + (variant.priceDelta ?? 0);
  const compare =
    product.compareAtPrice !== undefined
      ? product.compareAtPrice + (variant.priceDelta ?? 0)
      : undefined;

  // Variants that are colors get swatches; sizes/finishes get text.
  const looksLikeColor = product.variants.every(
    (v) => !/\b(twin|full|queen|king|small|medium|large|\d)/i.test(v.label),
  );

  const submit = () => {
    add(product, variant, qty);
    // Tells slice.js (if installed) that this product is taste evidence.
    window.dispatchEvent(new CustomEvent("slice:track", { detail: { type: "cart", id: product.id } }));
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="display-wide text-4xl tabular-nums">
          {compare !== undefined && (
            <span className="mr-3 text-xl text-mute line-through">{money(compare)}</span>
          )}
          <span className={cn(compare !== undefined && "text-cobalt")}>{money(price)}</span>
        </p>
        <p className="mono text-mute">
          {variant.label}
          {!variant.inStock && " · sold out"}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {product.variants.map((v) =>
          looksLikeColor ? (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v)}
              title={v.label}
              aria-label={v.label}
              aria-pressed={v.id === variant.id}
              className={cn(
                "relative size-9 border transition",
                v.id === variant.id ? "border-ink ring-1 ring-ink ring-offset-2 ring-offset-chalk" : "border-ink/20 hover:border-ink",
                !v.inStock && "opacity-40 after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-10 after:-translate-x-1/2 after:-rotate-45 after:bg-ink",
              )}
              style={{ background: swatch(v.label) }}
            />
          ) : (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v)}
              aria-pressed={v.id === variant.id}
              className={cn(
                "mono border px-3 py-2 transition-colors",
                v.id === variant.id ? "border-ink bg-ink text-chalk" : "border-ink/30 hover:border-ink",
                !v.inStock && "text-mute line-through",
              )}
            >
              {v.label}
              {v.priceDelta ? (
                <span className="ml-1.5 opacity-60">
                  {v.priceDelta > 0 ? "+" : "−"}
                  {money(Math.abs(v.priceDelta))}
                </span>
              ) : null}
            </button>
          ),
        )}
      </div>

      <div className="mt-6 flex border border-ink">
        <div className="flex items-stretch border-r border-ink">
          <button type="button" className="mono px-4 hover:bg-stone" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">
            −
          </button>
          <span className="mono-lg grid w-8 place-items-center">{qty}</span>
          <button type="button" className="mono px-4 hover:bg-stone" onClick={() => setQty(qty + 1)} aria-label="Increase">
            +
          </button>
        </div>
        <button
          type="button"
          disabled={!variant.inStock}
          onClick={submit}
          className={cn(
            "mono flex flex-1 items-center justify-between px-5 py-4 transition-colors",
            variant.inStock
              ? added
                ? "bg-cobalt text-chalk"
                : "bg-ink text-chalk hover:bg-cobalt"
              : "cursor-not-allowed bg-stone text-mute",
          )}
        >
          <span>{added ? "Added to bag" : variant.inStock ? "Add to bag" : "Sold out"}</span>
          <span>{money(price * qty)}</span>
        </button>
      </div>

      <ul className="mono mt-5 space-y-1.5 text-mute">
        <li>Free shipping over $75 · ships in 3–5 business days</li>
        <li>100-day returns, we arrange the pickup</li>
        <li>Made-to-order pieces ship in 4–6 weeks</li>
      </ul>
    </div>
  );
}
