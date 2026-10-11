import type { Metadata } from "next";
import Link from "next/link";
import { hotels, href, sceneSrc } from "@/lib/saltline";
import { Photo } from "@/components/saltline/photo";

export const metadata: Metadata = {
  title: "About",
  description: "Saltline Hotels: founded in Lisbon in 2019, three small hotels in restored buildings by the water in Lisbon, Copenhagen and Barcelona, Marseille opening spring 2027.",
};

const people = [
  { name: "Helena Marques", role: "Co-founder and chief executive", bio: "Ran a Lisbon design practice for fifteen years and restored the Boavista building before deciding to keep it." },
  { name: "Anders Krogh", role: "Co-founder and head of hotels", bio: "Twenty years in hotels in Copenhagen and London; joined Helena after staying at Lisbon in its first month and refusing to leave." },
  { name: "Inês Carvalho, Sofie Lund, Marc Vila", role: "Chefs", bio: "Each runs their restaurant as their own. They meet twice a year to cook for each other and argue about fish." },
];

export default function AboutPage() {
  return (
    <main>
      <section className="sl-container grid gap-10 pt-10 lg:grid-cols-[1fr_1fr] lg:items-end lg:pt-14">
        <div className="max-w-xl">
          <p className="text-sm text-sl-sea-deep">About Saltline</p>
          <h1 className="sl-serif mt-3 text-[44px] sm:text-[60px]">Three hotels, four cities soon, one idea</h1>
          <p className="mt-6 text-[17px] leading-relaxed text-sl-charcoal-soft">
            Saltline Hotels was founded in Lisbon in 2019 by Helena Marques, an architect, and Anders Krogh, a hotelier, with a single
            restored shipping office and the idea that a hotel should feel like the best house in the neighbourhood rather than a
            building dropped on it. Copenhagen followed in 2021, Barcelona in 2023, and Marseille opens in spring 2027. The company is
            privately owned and based in Lisbon.
          </p>
        </div>
        <div className="aspect-[4/5] overflow-hidden bg-sl-stone sm:aspect-[4/3]">
          <Photo src={sceneSrc("scene-about")} alt="A corridor at Saltline Lisbon in lime plaster and oak" priority />
        </div>
      </section>

      <section className="sl-container mt-24 grid gap-12 lg:grid-cols-3">
        {[
          ["Buildings with a past", "We only take on buildings that have already had a long working life and would otherwise be lost: a shipping office, a bonded warehouse, a merchant's house. We keep what is good, fix what is broken and add as little as possible."],
          ["Small on purpose", "Between 48 and 62 rooms. Enough to run a serious restaurant and a proper team; few enough that the people at the desk know your name and what you drank last night."],
          ["Local by default", "Each restaurant is led by a chef from the city who shops its markets. Furniture is made or found nearby. Experiences are things our team actually do on their days off, with the people they do them with."],
        ].map(([t, b]) => (
          <div key={t}>
            <h2 className="sl-serif text-[30px]">{t}</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-sl-charcoal-soft">{b}</p>
          </div>
        ))}
      </section>

      <section className="mt-24 bg-sl-paper-deep">
        <div className="sl-container py-20">
          <h2 className="sl-serif text-[36px] sm:text-[44px]">The people</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {people.map((p) => (
              <div key={p.name}>
                <p className="text-[17px] font-medium">{p.name}</p>
                <p className="text-sm text-sl-sea-deep">{p.role}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-sl-charcoal-soft">{p.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sl-container mt-24 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <h2 className="sl-serif text-[36px] sm:text-[44px]">How we run them</h2>
        <div className="space-y-5 text-[17px] leading-relaxed text-sl-charcoal-soft">
          <p>
            Rates include breakfast, Wi-Fi, bikes where we have them and the things most hotels charge for by habit. Cancellation is free until 48 hours before arrival. Children are welcome in every tier and stay free under twelve in the suites.
          </p>
          <p>
            Every hotel is heated and cooled with heat pumps, buys electricity from wind or solar contracts, and sends nothing to landfill from the kitchens. We publish each hotel&apos;s energy and water use annually. Staff are paid above the local living wage, and tips are shared across every team including housekeeping.
          </p>
          <p>
            We are a small company and we answer our own emails. Write to hello@saltlinehotels.com or to any of the hotels directly.
          </p>
        </div>
      </section>

      <section className="sl-container mt-24">
        <h2 className="sl-serif text-[36px]">Where we are</h2>
        <ul className="mt-8 grid gap-8 border-t border-sl-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.map((h) => (
            <li key={h.slug}>
              <p className="font-medium">{h.name}</p>
              <address className="mt-1 text-[15px] not-italic text-sl-charcoal-soft">
                {h.address.map((l) => (
                  <span key={l} className="block">{l}</span>
                ))}
              </address>
              <p className="mt-2 text-sm text-sl-mute">{h.opening ?? `Opened ${h.opened}`}</p>
            </li>
          ))}
        </ul>
        <Link href={href.locations} className="mt-8 inline-block text-[15px] font-medium hover:text-sl-sea-deep">
          Directions and contact details
        </Link>
      </section>
    </main>
  );
}
