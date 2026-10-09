"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { linePrice, useCart } from "@/lib/cart";
import { href } from "@/lib/fold";
import { money } from "@/lib/format";
import { FREE_SHIPPING, Stepper } from "@/components/fold/cart-drawer";
import { ProductImage } from "@/components/fold/product-image";

export default function CartPage() {
  const { lines, setQty, remove, subtotal, count } = useCart();
  const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : 10;
  const tax = Math.round(subtotal * 0.08875);

  return (
    <main className="fd-container pt-10">
      <h1 className="text-3xl font-semibold tracking-[-0.02em] sm:text-[40px]">Shopping bag</h1>
      <p className="mt-2 text-[15px] text-fd-mute">
        {count} {count === 1 ? "item" : "items"}
      </p>

      {lines.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg font-semibold">Your bag is empty</p>
          <p className="mt-1 text-sm text-fd-mute">New pieces land every week.</p>
          <Link href={href.newIn} className="mt-6 inline-block rounded-full bg-fd-ink px-6 py-3 text-sm font-semibold text-white hover:bg-fd-forest">
            Shop new in
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-16">
          <ul className="divide-y divide-fd-line border-y border-fd-line">
            {lines.map((l) => (
              <li key={l.key} className="grid grid-cols-[6.5rem_1fr] gap-5 py-6 sm:grid-cols-[8rem_1fr]">
                <Link href={href.product(l.product.slug)} className="aspect-[3/4] overflow-hidden bg-fd-mist">
                  <ProductImage product={l.product} sizes="128px" />
                </Link>
                <div className="flex flex-col">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="text-[15px] font-semibold">{l.product.brand}</p>
                      <Link href={href.product(l.product.slug)} className="text-[15px] text-fd-ink-2 hover:underline">
                        {l.product.name}
                      </Link>
                      <p className="mt-2 text-sm text-fd-mute">Size: {l.variant.label}</p>
                      <p className="text-sm text-fd-mute">Colour: {l.product.attributes.colors[0]}</p>
                    </div>
                    <p className="text-[15px] font-semibold">{money(linePrice(l) * l.qty)}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-5 pt-4">
                    <Stepper qty={l.qty} onChange={(n) => setQty(l.key, n)} />
                    <button type="button" onClick={() => remove(l.key)} className="text-sm text-fd-mute underline hover:text-fd-ink">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="lg:sticky lg:top-[calc(var(--fold-header)+1.5rem)] lg:self-start">
            <div className="rounded-lg bg-fd-mist p-6">
              <h2 className="text-lg font-semibold">Order summary</h2>
              <dl className="mt-5 space-y-3 text-[15px]">
                <Row label="Subtotal" value={money(subtotal)} />
                <Row label="Shipping" value={shipping === 0 ? "Free" : money(shipping)} />
                <Row label="Estimated tax" value={money(tax)} />
              </dl>
              <div className="mt-5 flex items-baseline justify-between border-t border-fd-line pt-5">
                <span className="text-[15px] font-semibold">Total</span>
                <span className="text-xl font-semibold">{money(subtotal + shipping + tax)}</span>
              </div>
              <button
                type="button"
                onClick={() => alert("Demo store: checkout is not wired up.")}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-fd-ink text-[15px] font-semibold text-white hover:bg-fd-forest"
              >
                <Lock className="size-4" /> Checkout securely
              </button>
              <p className="mt-3 text-center text-xs text-fd-mute">Demo storefront. No payment is taken.</p>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-fd-ink-2">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
