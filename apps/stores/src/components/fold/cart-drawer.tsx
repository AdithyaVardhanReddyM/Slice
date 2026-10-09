"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { linePrice, useCart } from "@/lib/cart";
import { href } from "@/lib/fold";
import { money } from "@/lib/format";
import { ProductImage } from "./product-image";

export const FREE_SHIPPING = 150;

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
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <button type="button" className="fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close bag" />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-fd-line px-6">
          <h2 className="text-lg font-semibold">
            Shopping bag <span className="font-normal text-fd-mute">({count})</span>
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="-mr-2 p-2" aria-label="Close bag">
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-lg font-semibold">Your bag is empty</p>
            <p className="mt-1 text-sm text-fd-mute">New pieces land every week.</p>
            <Link
              href={href.newIn}
              onClick={() => setOpen(false)}
              className="mt-6 rounded-full bg-fd-ink px-7 py-3 text-sm font-semibold text-white hover:bg-fd-forest"
            >
              Shop new in
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-fd-forest-tint px-6 py-3">
              <p className="text-sm text-fd-forest">
                {remaining > 0 ? (
                  <>
                    You&apos;re <strong>{money(remaining)}</strong> away from free shipping
                  </>
                ) : (
                  <strong>Your order ships free</strong>
                )}
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-fd-forest transition-all duration-500"
                  style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING) * 100)}%` }}
                />
              </div>
            </div>
            <ul className="flex-1 divide-y divide-fd-line overflow-y-auto px-6">
              {lines.map((l) => (
                <li key={l.key} className="flex gap-4 py-5">
                  <Link
                    href={href.product(l.product.slug)}
                    onClick={() => setOpen(false)}
                    className="h-32 w-24 shrink-0 overflow-hidden bg-fd-mist"
                  >
                    <ProductImage product={l.product} sizes="96px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{l.product.brand}</p>
                        <p className="truncate text-sm text-fd-ink-2">{l.product.name}</p>
                        <p className="mt-1 text-sm text-fd-mute">Size: {l.variant.label}</p>
                      </div>
                      <p className="text-sm font-semibold">{money(linePrice(l) * l.qty)}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <Stepper qty={l.qty} onChange={(n) => setQty(l.key, n)} />
                      <button type="button" onClick={() => remove(l.key)} className="text-sm text-fd-mute underline hover:text-fd-ink">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-fd-line px-6 pb-6 pt-4">
              <div className="flex items-baseline justify-between text-[15px]">
                <p>Subtotal</p>
                <p className="font-semibold">{money(subtotal)}</p>
              </div>
              <p className="mt-1 text-sm text-fd-mute">Shipping and taxes calculated at checkout.</p>
              <Link
                href={href.cart}
                onClick={() => setOpen(false)}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-fd-ink text-[15px] font-semibold text-white hover:bg-fd-forest"
              >
                Checkout
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="mt-2 h-11 w-full text-sm font-medium underline">
                Continue shopping
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function Stepper({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="flex h-9 items-center rounded-full border border-fd-line">
      <button type="button" className="grid h-full w-9 place-items-center" onClick={() => onChange(qty - 1)} aria-label="Decrease quantity">
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
      <button type="button" className="grid h-full w-9 place-items-center" onClick={() => onChange(qty + 1)} aria-label="Increase quantity">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
