"use client";

import Link from "next/link";
import { linePrice, useCart } from "@/lib/cart";
import { productHref } from "@/lib/catalog";
import { money } from "@/lib/format";
import { ProductImage } from "@/components/marlow/product-image";
import { catalogNumber } from "@/components/marlow/product-card";

export default function CartPage() {
  const { lines, setQty, remove, subtotal, count } = useCart();
  const shipping = subtotal >= 75 || subtotal === 0 ? 0 : 12;
  const tax = Math.round(subtotal * 0.0875);

  return (
    <main>
      <header className="flex items-end justify-between border-b border-ink px-4 pb-6 pt-10 sm:px-6">
        <h1 className="display text-8xl">Bag</h1>
        <p className="mono text-mute">{count} {count === 1 ? "item" : "items"}</p>
      </header>

      {lines.length === 0 ? (
        <div className="px-4 py-32 text-center sm:px-6">
          <p className="display text-6xl">Empty</p>
          <Link href="/marlow" className="mono mt-6 inline-block text-cobalt link-rule">
            Back to the catalog →
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px]">
          <ul className="divide-y divide-rule border-b border-ink lg:border-b-0 lg:border-r">
            {lines.map((l) => (
              <li key={l.key} className="grid grid-cols-[7rem_1fr] gap-5 px-4 py-5 sm:px-6">
                <Link href={productHref(l.product.slug)} className="aspect-[4/5] overflow-hidden bg-stone">
                  <ProductImage product={l.product} sizes="112px" />
                </Link>
                <div className="flex flex-col">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="mono text-mute">№ {catalogNumber(l.product)}</p>
                      <Link href={productHref(l.product.slug)} className="mt-1 block text-base font-medium link-rule hover:decoration-ink">
                        {l.product.name}
                      </Link>
                      <p className="mono mt-1 text-mute">{l.variant.label} · {money(linePrice(l))} each</p>
                    </div>
                    <p className="display-wide text-2xl tabular-nums">{money(linePrice(l) * l.qty)}</p>
                  </div>
                  <div className="mono mt-auto flex items-center justify-between pt-4">
                    <div className="flex border border-ink">
                      <button type="button" className="px-3 py-1.5 hover:bg-stone" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Decrease">
                        −
                      </button>
                      <span className="grid w-8 place-items-center border-x border-ink">{l.qty}</span>
                      <button type="button" className="px-3 py-1.5 hover:bg-stone" onClick={() => setQty(l.key, l.qty + 1)} aria-label="Increase">
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

          <aside className="lg:sticky lg:top-[5.5rem] lg:self-start">
            <h2 className="mono border-b border-rule px-4 py-4 text-mute sm:px-6">Summary</h2>
            <dl className="divide-y divide-rule">
              <Row label="Subtotal" value={money(subtotal)} />
              <Row label="Shipping" value={shipping === 0 ? "Free" : money(shipping)} />
              <Row label="Estimated tax" value={money(tax)} />
            </dl>
            <div className="flex items-baseline justify-between border-y border-ink px-4 py-4 sm:px-6">
              <span className="mono">Total</span>
              <span className="display-wide text-3xl tabular-nums">{money(subtotal + shipping + tax)}</span>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <button
                type="button"
                className="mono flex w-full justify-between bg-ink px-5 py-4 text-chalk hover:bg-cobalt"
                onClick={() => alert("Demo store: checkout is not wired up.")}
              >
                <span>Checkout</span>
                <span>→</span>
              </button>
              <p className="mono mt-3 text-mute">Demo storefront. No payment is taken.</p>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mono flex justify-between px-4 py-3 sm:px-6">
      <dt className="text-mute">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
