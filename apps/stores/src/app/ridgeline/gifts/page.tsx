import type { Metadata } from "next";
import { gifts } from "@/lib/ridgeline";
import { ProductCard } from "@/components/ridgeline/product-card";

export const metadata: Metadata = {
  title: "Gift sets",
  description: "Coffee gift sets from Ridgeline: tasting boxes, a pour-over starter kit, an espresso bundle and a camp coffee kit. Hand-written card on request.",
};

export default function GiftsPage() {
  return (
    <main className="rl-container py-10">
      <header className="max-w-2xl">
        <h1 className="rl-serif text-[40px] sm:text-[52px]">Gift sets</h1>
        <p className="mt-4 text-[17px] text-rl-ink-soft">
          Four sets we put together ourselves, packed in recycled boxes with paper padding. Add a hand-written card at checkout
          and we will roast the coffee the day before it ships. Order by December 18 for delivery before the 25th.
        </p>
      </header>
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {gifts().map((p) => (
          <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
        ))}
      </div>
      <section className="mt-20 grid gap-6 rounded-[4px] border border-rl-line bg-rl-cream-deep p-8 sm:grid-cols-3">
        <div>
          <h2 className="text-[15px] font-semibold">Gift cards</h2>
          <p className="mt-2 text-sm text-rl-ink-soft">From $25, delivered by email in minutes or on a printed card in the mail. Redeemable online and at every café.</p>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Gift a subscription</h2>
          <p className="mt-2 text-sm text-rl-ink-soft">Prepay three, six or twelve deliveries of any plan. The recipient chooses grind and frequency when they redeem.</p>
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Corporate orders</h2>
          <p className="mt-2 text-sm text-rl-ink-soft">Twenty sets or more get a volume price and a branded card. Email wholesale@ridgelinecoffee.com.</p>
        </div>
      </section>
    </main>
  );
}
