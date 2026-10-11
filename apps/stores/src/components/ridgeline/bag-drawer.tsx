"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { linePrice, useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { href } from "@/lib/ridgeline";
import { ProductImage } from "./product-image";

export const FREE_SHIPPING = 40;

export function BagDrawer() {
  const { open, setOpen, lines, setQty, remove, subtotal } = useCart();

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
    <div className="fixed inset-0 z-50 fade-in" role="dialog" aria-modal="true" aria-label="Your bag">
      <button type="button" aria-label="Close bag" onClick={() => setOpen(false)} className="absolute inset-0 bg-rl-ink/40" />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-rl-cream text-rl-ink shadow-2xl">
        <div className="flex items-center justify-between border-b border-rl-line px-6 py-4">
          <h2 className="rl-serif text-2xl">Your bag</h2>
          <button type="button" onClick={() => setOpen(false)} className="-mr-2 p-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="rl-serif text-2xl">Nothing in here yet</p>
            <p className="mt-2 text-sm text-rl-mute">Fresh roasts ship within 48 hours.</p>
            <Link
              href={href.coffee}
              onClick={() => setOpen(false)}
              className="mt-6 rounded-[4px] bg-rl-ink px-6 py-3 text-sm font-semibold text-rl-cream hover:bg-rl-rust"
            >
              Shop coffee
            </Link>
          </div>
        ) : (
          <>
            <p className="bg-rl-cream-deep px-6 py-3 text-sm text-rl-ink-soft">
              {remaining > 0 ? (
                <>
                  Add <strong>{money(remaining)}</strong> more for free shipping.
                </>
              ) : (
                <strong>Your order ships free.</strong>
              )}
            </p>
            <ul className="flex-1 divide-y divide-rl-line overflow-y-auto px-6">
              {lines.map((l) => (
                <li key={l.key} className="flex gap-4 py-5">
                  <Link
                    href={href.product(l.product)}
                    onClick={() => setOpen(false)}
                    className="h-28 w-22 shrink-0 overflow-hidden rounded-[4px] bg-rl-sand"
                  >
                    <ProductImage product={l.product} sizes="88px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="rl-serif text-[17px] leading-snug">{l.product.name}</p>
                        <p className="mt-1 text-sm text-rl-mute">{l.variant.label}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">{money(linePrice(l) * l.qty)}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex h-9 items-center rounded-[4px] border border-rl-line">
                        <button type="button" className="grid h-full w-9 place-items-center" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Decrease quantity">
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                        <button type="button" className="grid h-full w-9 place-items-center" onClick={() => setQty(l.key, l.qty + 1)} aria-label="Increase quantity">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <button type="button" onClick={() => remove(l.key)} className="text-sm text-rl-mute underline hover:text-rl-ink">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-rl-line px-6 pb-6 pt-4">
              <div className="flex items-baseline justify-between text-[15px]">
                <p>Subtotal</p>
                <p className="font-semibold tabular-nums">{money(subtotal)}</p>
              </div>
              <p className="mt-1 text-sm text-rl-mute">Shipping and tax calculated at checkout.</p>
              <button
                type="button"
                className="mt-4 flex h-12 w-full items-center justify-center rounded-[4px] bg-rl-rust text-[15px] font-semibold text-rl-cream hover:bg-rl-rust-deep"
              >
                Checkout
              </button>
              <button type="button" onClick={() => setOpen(false)} className="mt-2 h-11 w-full text-sm font-medium underline">
                Keep shopping
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
