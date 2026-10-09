"use client";

import { useState } from "react";
import type { Product, Variant } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { FREE_SHIPPING } from "./cart-drawer";

// Size first, like every clothing site: nothing is preselected unless the
// product only comes in one option.
export function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const single = product.variants.length === 1;
  const [variant, setVariant] = useState<Variant | null>(single ? product.variants[0] : null);
  const [nudge, setNudge] = useState(false);
  const [added, setAdded] = useState(false);

  const delta = variant?.priceDelta ?? 0;
  const price = product.price + delta;
  const compare = product.compareAtPrice !== undefined ? product.compareAtPrice + delta : undefined;
  const soldOut = product.variants.every((v) => !v.inStock);
  const first = product.variants[0]?.label ?? "";
  const kind = /^EU /.test(first) ? "size (EU)" : /^W\d/.test(first) ? "waist" : "size";

  const submit = () => {
    if (!variant) {
      setNudge(true);
      setTimeout(() => setNudge(false), 900);
      return;
    }
    add(product, variant);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div>
      <p className="flex items-baseline gap-3 text-2xl tabular-nums">
        {compare !== undefined && <span className="text-lg text-fog line-through">{money(compare)}</span>}
        <span className={cn(compare !== undefined && "text-signal")}>{money(price)}</span>
        {compare !== undefined && (
          <span className="tag rounded-full bg-signal px-2.5 py-1 text-night">
            −{Math.round((1 - price / compare) * 100)}%
          </span>
        )}
      </p>

      {!single && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between">
            <p className={cn("tag transition-colors", nudge ? "text-signal" : "text-fog")}>
              {variant ? `${kind}: ${variant.label.replace(/^EU /, "")}` : `Select ${kind}`}
            </p>
            <button type="button" className="tag text-fog underline-grow hover:text-bone">
              Size guide
            </button>
          </div>
          <div className={cn("mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5", nudge && "shake")}>
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.inStock}
                onClick={() => setVariant(v)}
                aria-pressed={variant?.id === v.id}
                className={cn(
                  "relative h-11 border text-sm tabular-nums transition-colors",
                  variant?.id === v.id
                    ? "border-bone bg-bone text-night"
                    : v.inStock
                      ? "border-seam hover:border-bone"
                      : "cursor-not-allowed border-seam/60 text-fog/60 line-through",
                )}
              >
                {v.label.replace(/^EU /, "")}
                {v.priceDelta ? <span className="ml-1 text-[11px] opacity-60">+{v.priceDelta}</span> : null}
              </button>
            ))}
          </div>
          {product.attributes.fit && (
            <p className="mt-3 text-xs text-fog">
              Fit: <span className="text-bone-2">{product.attributes.fit}</span>
              {product.attributes.fit === "oversized" && " — size down for a closer cut"}
              {product.attributes.fit === "slim" && " — size up if between sizes"}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={soldOut}
        onClick={submit}
        className={cn(
          "tag mt-8 flex h-14 w-full items-center justify-between rounded-full px-7 transition-colors",
          soldOut
            ? "cursor-not-allowed bg-night-3 text-fog"
            : added
              ? "bg-signal text-night"
              : "bg-bone text-night hover:bg-signal",
        )}
      >
        <span>{soldOut ? "Sold out" : added ? "In your bag" : variant ? "Add to bag" : `Select ${kind}`}</span>
        <span className="tabular-nums">{soldOut ? "" : money(price)}</span>
      </button>

      <ul className="mt-6 space-y-2 text-xs text-fog">
        <li>Free shipping over {money(FREE_SHIPPING)}. Ships from Brooklyn in 1–2 days.</li>
        <li>Free returns within 30 days, unworn with tags.</li>
      </ul>
    </div>
  );
}
