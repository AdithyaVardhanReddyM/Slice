import type { Metadata } from "next";
import Link from "next/link";
import { dayTickets, eur, faqs, festival, href, passes, travelPackages } from "@/lib/tagide";
import { TicketCard } from "@/components/tagide/ticket-card";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tickets",
  description: `Three-day passes from ${eur(passes()[0].price)}, day tickets, VIP and travel packages. ${festival.phase.name} until ${festival.phase.until}.`,
};

export default function TicketsPage() {
  const all = [...passes(), ...dayTickets(), ...travelPackages()];
  const jsonld = all.map((t) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: t.name,
    description: t.description,
    sku: t.id,
    category: t.subcategory,
    image: t.images[0] ? `${SITE}${t.images[0]}` : undefined,
    url: `${SITE}${href.ticket(t)}`,
    brand: { "@type": "Brand", name: festival.name },
    offers: { "@type": "Offer", price: t.price, priceCurrency: "EUR", availability: "https://schema.org/InStock", url: `${SITE}${href.ticket(t)}` },
  }));

  return (
    <main className="tg-container pt-12 lg:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <p className="tg-label text-tg-orange">
        {festival.phase.name} · until {festival.phase.until}
      </p>
      <h1 className="tg-display mt-3 text-[64px] sm:text-[96px]">Tickets</h1>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-tg-ink-soft">
        Three-day passes, day tickets and packages with the flight and hotel done for you. {festival.phase.next}. Everything is cashless on the wristband, under 16s come free, and you can
        pay in instalments on anything over €150.
      </p>

      <Section title="Festival passes" blurb="All three nights, all four stages. The pass most people buy, with or without the campsite.">
        {passes().map((p, i) => (
          <TicketCard key={p.id} product={p} tone={i === 1 ? "ink" : "cream"} detailed />
        ))}
      </Section>

      <Section title="Day tickets" blurb="One night only. Gates at 16:00 on Friday, 14:00 at the weekend; no re-entry after 02:00.">
        {dayTickets().map((p) => (
          <TicketCard key={p.id} product={p} tone="lilac" detailed />
        ))}
      </Section>

      <Section title="Travel packages" blurb="Pass, flights and hotel on the shuttle line, booked together through our travel partner. Prices per person sharing.">
        {travelPackages().map((p, i) => (
          <TicketCard key={p.id} product={p} tone={i % 2 === 1 ? "ink" : "cream"} detailed />
        ))}
      </Section>

      <section className="mt-20 rounded-[26px] border-2 border-tg-ink bg-tg-cream-deep p-8 lg:p-12">
        <h2 className="tg-display text-[36px]">Good to know</h2>
        <dl className="mt-6 grid gap-6 md:grid-cols-2">
          {faqs.slice(0, 4).map((f) => (
            <div key={f.q}>
              <dt className="text-[16px] font-extrabold">{f.q}</dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-tg-ink-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
        <Link href={href.info} className="tg-btn mt-8 bg-tg-ink text-tg-cream hover:bg-black">
          All questions
        </Link>
      </section>
    </main>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-tg-ink pb-3">
        <h2 className="tg-display text-[40px] sm:text-[48px]">{title}</h2>
        <p className="max-w-md text-[14px] font-medium text-tg-ink-soft">{blurb}</p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
