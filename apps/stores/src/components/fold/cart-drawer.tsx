"use client";

import Link from "next/link";
import { useEffect } from "react";
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
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Bag">
      <button type="button" className="fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Close bag" />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-night-2 text-bone">
        <div className="flex items-baseline justify-between px-6 pb-4 pt-6">
          <h2 className="didone text-5xl italic">
            your bag <span className="tag ml-1 align-middle not-italic text-fog">{count}</span>
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="tag hover:text-signal">
            Close
          </button>
        </div>
        <hr className="crease" />

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center px-6">
            <p className="didone text-4xl italic text-bone-2">Nothing folded in yet.</p>
            <p className="mt-3 text-sm text-fog">Start with what just came in.</p>
            <Link
              href={href.shop()}
              onClick={() => setOpen(false)}
              className="tag mt-8 w-fit rounded-full bg-bone px-6 py-3.5 text-night hover:bg-signal"
            >
              Shop everything
            </Link>
          </div>
        ) : (
          <>
            <div className="px-6 py-4">
              <p className="tag text-fog">
                {remaining > 0 ? `${money(remaining)} away from free shipping` : "Free shipping on this order"}
              </p>
              <div className="mt-2.5 h-[3px] w-full rounded-full bg-night-3">
                <div
                  className="h-full rounded-full bg-signal transition-all duration-500"
                  style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING) * 100)}%` }}
                />
              </div>
            </div>
            <ul className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
              {lines.map((l) => (
                <li key={l.key} className="flex gap-4">
                  <Link
                    href={href.product(l.product.slug)}
                    onClick={() => setOpen(false)}
                    className="h-32 w-24 shrink-0 overflow-hidden bg-night-3"
                  >
                    <ProductImage product={l.product} sizes="96px" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tag">{l.product.brand}</p>
                        <p className="mt-1 truncate text-sm text-bone-2">{l.product.name}</p>
                        <p className="mt-1 text-xs text-fog">Size {l.variant.label}</p>
                      </div>
                      <p className="text-sm tabular-nums">{money(linePrice(l) * l.qty)}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <Stepper qty={l.qty} onChange={(n) => setQty(l.key, n)} />
                      <button type="button" onClick={() => remove(l.key)} className="tag text-fog hover:text-signal">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-seam px-6 pb-6 pt-5">
              <div className="flex items-baseline justify-between">
                <p className="tag text-fog">Subtotal</p>
                <p className="didone text-4xl tabular-nums">{money(subtotal)}</p>
              </div>
              <p className="mt-1 text-xs text-fog">Taxes and shipping calculated at checkout.</p>
              <Link
                href={href.cart}
                onClick={() => setOpen(false)}
                className="tag mt-5 flex w-full items-center justify-between rounded-full bg-bone px-6 py-4 text-night transition-colors hover:bg-signal"
              >
                <span>View bag &amp; check out</span>
                <span>→</span>
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function Stepper({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-full border border-seam text-sm">
      <button type="button" className="px-3 py-1 text-fog hover:text-bone" onClick={() => onChange(qty - 1)} aria-label="Decrease quantity">
        −
      </button>
      <span className="w-5 text-center tabular-nums">{qty}</span>
      <button type="button" className="px-3 py-1 text-fog hover:text-bone" onClick={() => onChange(qty + 1)} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}
