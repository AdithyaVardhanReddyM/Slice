import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { href, plans, sceneSrc } from "@/lib/ridgeline";
import { money } from "@/lib/format";
import { ProductImage, Scene } from "@/components/ridgeline/product-image";

export const metadata: Metadata = {
  title: "Subscriptions",
  description: "Three coffee subscription plans from Ridgeline: Roaster's Choice, House Favourite and Espresso at Home. Free shipping, pause or cancel any time.",
};

const faqs = [
  { q: "When does my first bag ship?", a: "On the next roast day after you order. We roast Tuesday to Friday, so at most you wait four days. Every bag ships within 48 hours of roasting." },
  { q: "Can I change the coffee or the frequency?", a: "Yes, from your account page at any time before a delivery is roasted. Switch plans, swap the bag, go from weekly to monthly, or pause for a holiday." },
  { q: "Is shipping really free?", a: "On every subscription delivery, to all 50 states. One-off orders ship free over $40." },
  { q: "Whole bean or ground?", a: "Your choice, and you can change it. We grind for drip, pour-over, espresso, French press or cold brew. Whole bean stays fresher longer." },
];

export default function SubscriptionsPage() {
  const list = plans();
  return (
    <main>
      <section className="rl-container grid gap-8 py-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-rl-rust">Subscriptions</p>
          <h1 className="rl-serif mt-3 text-[40px] sm:text-[56px]">Fresh coffee on a schedule you set</h1>
          <p className="mt-5 text-[17px] text-rl-ink-soft">
            Pick a plan, pick a frequency, and we roast your bag the day before it ships. Free shipping on every delivery.
            Pause, skip or cancel from your account with one click; there is no minimum.
          </p>
        </div>
        <div className="aspect-[5/4] overflow-hidden rounded-[4px] bg-rl-sand">
          <Scene src={sceneSrc("scene-subscriptions")} alt="Ridgeline coffee bags on a shelf" priority />
        </div>
      </section>

      <section className="rl-container mt-8 grid gap-6 lg:grid-cols-3">
        {list.map((p) => (
          <article key={p.id} className="flex flex-col overflow-hidden rounded-[4px] border border-rl-line bg-rl-cream-deep">
            <Link href={href.product(p)} className="aspect-[4/3] overflow-hidden bg-rl-sand">
              <ProductImage product={p} sizes="(min-width: 1024px) 33vw, 100vw" />
            </Link>
            <div className="flex flex-1 flex-col p-6">
              {p.bestseller && <span className="mb-3 w-fit rounded-[3px] bg-rl-rust px-2 py-1 text-xs font-semibold text-rl-cream">Most popular</span>}
              <h2 className="rl-serif text-[28px]">{p.name}</h2>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">
                {money(p.price)} <span className="font-normal text-rl-mute">per delivery, shipping included</span>
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-rl-ink-soft">{p.description}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.details.slice(0, 4).map((d) => (
                  <li key={d} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-rl-moss" /> {d}
                  </li>
                ))}
              </ul>
              <Link
                href={href.product(p)}
                className="mt-6 inline-flex h-12 items-center justify-center rounded-[4px] bg-rl-ink text-[15px] font-semibold text-rl-cream hover:bg-rl-rust"
              >
                Choose {p.name}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rl-container mt-24 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <h2 className="rl-serif text-[32px]">Questions people ask before they subscribe</h2>
        <dl className="divide-y divide-rl-line border-y border-rl-line">
          {faqs.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="text-[17px] font-semibold">{f.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-rl-ink-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
