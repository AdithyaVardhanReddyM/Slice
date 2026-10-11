import type { Metadata } from "next";
import { href, offers } from "@/lib/saltline";
import Link from "next/link";
import { ItemCard } from "@/components/saltline/item-card";

export const metadata: Metadata = {
  title: "Offers",
  description: "Current offers at Saltline Hotels: four nights for the price of three in winter, Lisbon in January, a Copenhagen design weekend and early summer on the Barcelona roof.",
};

export default function OffersPage() {
  return (
    <main className="sl-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="sl-serif text-[48px] sm:text-[64px]">Offers</h1>
        <p className="mt-5 text-[17px] text-sl-charcoal-soft">
          Four ways to stay for less or get more, built around the months and the things we most want to show people. Every offer includes breakfast and can be booked through the plan-your-stay form.
        </p>
      </header>
      <div className="mt-12 grid gap-x-6 gap-y-14 sm:grid-cols-2">
        {offers().map((p, i) => (
          <ItemCard key={p.id} product={p} aspect="aspect-[4/3]" sizes="(min-width: 640px) 50vw, 100vw" priority={i < 2} />
        ))}
      </div>
      <p className="mt-16 border-t border-sl-line pt-8 text-[15px] text-sl-mute">
        Offers cannot be combined and are subject to availability. Members of our letters list hear about new ones first.{" "}
        <Link href={href.plan()} className="text-sl-charcoal underline">Ask us about dates</Link>.
      </p>
    </main>
  );
}
