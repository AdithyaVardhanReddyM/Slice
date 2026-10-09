"use client";

import Link from "next/link";
import { useEffect } from "react";
import { linePrice, useCart } from "@/lib/cart";
import { productHref } from "@/lib/catalog";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

const FREE_SHIPPING = 75;

export function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, subtotal, count } = useCart();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, setOpen]);

  if (!open) return null;

  const remaining = Math.max(0, FREE_SHIPPING - subtotal);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Bag">
      <button
        type="button"
        className="fade-in absolute inset-0 bg-ink/50"
        onClick={() => setOpen(false)}
        aria-label="Close bag"
      />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-ink bg-chalk">
        <div className="flex items-center justify-between border-b border-ink px-5 py-4">
          <h2 className="display text-4xl">
            Bag <span className="mono ml-2 text-mute">({count})</span>
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="mono hover:text-cobalt">
            Close ✕
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-4 px-5">
            <p className="display text-5xl">Empty</p>
            <p className="text-sm text-mute">Start with the living room. It sets the tone.</p>
            <Link
              href="/marlow/c/living"
              onClick={() => setOpen(false)}
              className="mono bg-ink px-4 py-2.5 text-chalk hover:bg-cobalt"
            >
              Shop living →
            </Link>
          </div>
        ) : (
          <>
            <div className="border-b border-rule px-5 py-3">
              <p className="mono text-mute">
                {remaining > 0 ? `${money(remaining)} to free shipping` : "Free shipping unlocked"}
              </p>
              <div className="mt-2 h-px w-full bg-rule">
                <div
                  className="h-full bg-cobalt transition-all duration-500"
                  style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING) * 100)}%` }}
                />
              </div>
            </div>
            <ul className="flex-1 divide-y divide-rule overflow-y-auto">
              {lines.map((l) => (
                <li key={l.key} className="flex gap-4 px-5 py-4">
                  <Link
                    href={productHref(l.product.slug)}
                    onClick={() => setOpen(false)}
                    className="h-24 w-20 shrink-0 overflow-hidden bg-stone"
                  >
                    <ProductImage product={l.product} sizes="80px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.product.name}</p>
                        <p className="mono mt-1 text-mute">{l.variant.label}</p>
                      </div>
                      <p className="mono-lg">{money(linePrice(l) * l.qty)}</p>
                    </div>
                    <div className="mono mt-auto flex items-center justify-between pt-3">
                      <div className="flex border border-ink">
                        <button type="button" className="px-2.5 py-1 hover:bg-stone" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Decrease quantity">
                          −
                        </button>
                        <span className="grid w-7 place-items-center border-x border-ink">{l.qty}</span>
                        <button type="button" className="px-2.5 py-1 hover:bg-stone" onClick={() => setQty(l.key, l.qty + 1)} aria-label="Increase quantity">
                          +
                        </button>
                      </div>
                      <button type="button" onClick={() => remove(l.key)} className="text-mute hover:text-cobalt">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink px-5 py-4">
              <div className="flex items-baseline justify-between">
                <p className="mono text-mute">Subtotal</p>
                <p className="display-wide text-3xl tabular-nums">{money(subtotal)}</p>
              </div>
              <p className="mono mt-1 text-mute">Shipping and tax at checkout</p>
              <Link
                href="/marlow/cart"
                onClick={() => setOpen(false)}
                className="mono mt-4 flex justify-between bg-ink px-5 py-4 text-chalk hover:bg-cobalt"
              >
                <span>Review bag</span>
                <span>→</span>
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
