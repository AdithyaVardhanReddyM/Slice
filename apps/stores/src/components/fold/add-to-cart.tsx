"use client";

import { useState } from "react";
import { Check, RotateCcw, Truck } from "lucide-react";
import type { Product, Variant } from "@slice/demo-catalogs";
import { cn } from "cn";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { FREE_SHIPPING } from "./cart-drawer";
import { HeartButton } from "./heart-button";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const lowStock = variant && product.variants.filter((v) => v.inStock).length <= 2;

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
      <p className="flex items-baseline gap-3 text-xl">
        {compare !== undefined ? (
          <>
            <span className="font-semibold text-fd-sale">{money(price)}</span>
            <span className="text-base text-fd-mute line-through">{money(compare)}</span>
            <span className="rounded-sm bg-fd-sale px-2 py-0.5 text-xs font-medium text-white">
              −{Math.round((1 - price / compare) * 100)}%
            </span>
          </>
        ) : (
          <span className="font-semibold">{money(price)}</span>
        )}
      </p>
      <p className="mt-1 text-sm text-fd-mute">Taxes included. Free shipping over {money(FREE_SHIPPING)}.</p>

      <div className="mt-6 text-sm">
        <span className="text-fd-mute">Colour: </span>
        <span className="font-medium">{cap(product.attributes.colors[0] ?? "")}</span>
      </div>

      {!single && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <p className={cn("font-medium transition-colors", nudge && "text-fd-sale")}>
              {variant ? (
                <>
                  <span className="font-normal text-fd-mute">{cap(kind)}: </span>
                  {variant.label.replace(/^EU /, "")}
                </>
              ) : (
                `Select a ${kind}`
              )}
            </p>
            <button type="button" className="text-fd-mute underline hover:text-fd-ink">
              Size guide
            </button>
          </div>
          <div className={cn("mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5", nudge && "shake")}>
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.inStock}
                onClick={() => setVariant(v)}
                aria-pressed={variant?.id === v.id}
                className={cn(
                  "relative h-12 rounded-md border text-sm transition-colors",
                  variant?.id === v.id
                    ? "border-fd-ink bg-fd-ink text-white"
                    : v.inStock
                      ? "border-fd-line hover:border-fd-ink"
                      : "cursor-not-allowed border-fd-line bg-fd-mist text-fd-mute/60 line-through",
                )}
              >
                {v.label.replace(/^EU /, "")}
                {v.priceDelta ? <span className="ml-1 text-xs opacity-60">+${v.priceDelta}</span> : null}
              </button>
            ))}
          </div>
          {product.attributes.fit && (
            <p className="mt-3 text-sm text-fd-mute">
              <span className="font-medium text-fd-ink">{cap(product.attributes.fit)} fit.</span>
              {product.attributes.fit === "oversized" && " Size down for a closer cut."}
              {product.attributes.fit === "slim" && " Size up if you're between sizes."}
              {product.attributes.fit === "regular" && " True to size."}
              {product.attributes.fit === "relaxed" && " Roomy through the body; true to size."}
            </p>
          )}
          {lowStock && <p className="mt-2 text-sm font-medium text-fd-sale">Only a few sizes left</p>}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={soldOut}
          onClick={submit}
          className={cn(
            "flex h-14 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors",
            soldOut
              ? "cursor-not-allowed bg-fd-mist text-fd-mute"
              : added
                ? "bg-fd-forest text-white"
                : "bg-fd-ink text-white hover:bg-fd-forest",
          )}
        >
          {added && <Check className="size-5" />}
          {soldOut ? "Sold out" : added ? "Added to bag" : "Add to bag"}
        </button>
        <HeartButton
          productId={product.id}
          className="size-14 shrink-0 rounded-full border border-fd-line hover:border-fd-ink"
        />
      </div>

      <ul className="mt-6 space-y-3 rounded-lg bg-fd-mist p-4 text-sm">
        <li className="flex gap-3">
          <Truck className="size-5 shrink-0 text-fd-forest" strokeWidth={1.6} />
          <span>
            <strong className="font-semibold">Free delivery</strong> on orders over {money(FREE_SHIPPING)}. Ships in 1–2
            business days.
          </span>
        </li>
        <li className="flex gap-3">
          <RotateCcw className="size-5 shrink-0 text-fd-forest" strokeWidth={1.6} />
          <span>
            <strong className="font-semibold">Free returns</strong> within 30 days, unworn with tags.
          </span>
        </li>
      </ul>
    </div>
  );
}
