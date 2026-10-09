"use client";

import Link from "next/link";
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
    <main className="px-4 sm:px-8">
      <header className="flex items-end justify-between gap-6 pb-10 pt-14 lg:pt-20">
        <h1 className="didone text-8xl sm:text-9xl">
          your <em>bag</em>
        </h1>
        <p className="tag pb-3 text-fog">
          {count} {count === 1 ? "piece" : "pieces"}
        </p>
      </header>
      <hr className="crease" />

      {lines.length === 0 ? (
        <div className="py-32 text-center">
          <p className="didone text-5xl italic text-bone-2">Nothing folded in yet.</p>
          <Link href={href.shop()} className="tag mt-8 inline-block rounded-full bg-bone px-6 py-3.5 text-night hover:bg-signal">
            Shop everything
          </Link>
        </div>
      ) : (
        <div className="grid gap-12 pt-10 lg:grid-cols-[1fr_400px] lg:gap-20">
          <ul className="space-y-8">
            {lines.map((l) => (
              <li key={l.key} className="grid grid-cols-[7.5rem_1fr] gap-6 border-b border-seam pb-8 sm:grid-cols-[9rem_1fr]">
                <Link href={href.product(l.product.slug)} className="aspect-[3/4] overflow-hidden bg-night-3">
                  <ProductImage product={l.product} sizes="144px" />
                </Link>
                <div className="flex flex-col">
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="tag">{l.product.brand}</p>
                      <Link href={href.product(l.product.slug)} className="didone mt-2 block text-3xl hover:italic">
                        {l.product.name}
                      </Link>
                      <p className="mt-2 text-sm text-fog">
                        Size {l.variant.label} · {money(linePrice(l))}
                      </p>
                    </div>
                    <p className="text-lg tabular-nums">{money(linePrice(l) * l.qty)}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <Stepper qty={l.qty} onChange={(n) => setQty(l.key, n)} />
                    <button type="button" onClick={() => remove(l.key)} className="tag text-fog hover:text-signal">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="lg:sticky lg:top-[calc(var(--fold-header)+1.5rem)] lg:self-start">
            <div className="bg-night-2 p-6 sm:p-8">
              <h2 className="tag text-fog">Order summary</h2>
              <dl className="mt-6 space-y-3 text-sm">
                <Row label="Subtotal" value={money(subtotal)} />
                <Row label="Shipping" value={shipping === 0 ? "Free" : money(shipping)} />
                <Row label="Estimated tax" value={money(tax)} />
              </dl>
              <hr className="crease my-6" />
              <div className="flex items-baseline justify-between">
                <span className="tag">Total</span>
                <span className="didone text-5xl tabular-nums">{money(subtotal + shipping + tax)}</span>
              </div>
              <button
                type="button"
                onClick={() => alert("Demo store: checkout is not wired up.")}
                className="tag mt-8 flex h-14 w-full items-center justify-between rounded-full bg-bone px-7 text-night transition-colors hover:bg-signal"
              >
                <span>Check out</span>
                <span>→</span>
              </button>
              <p className="mt-4 text-xs text-fog">Demo storefront. No payment is taken.</p>
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
      <dt className="text-fog">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
