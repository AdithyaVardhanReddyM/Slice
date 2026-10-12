import type { Metadata } from "next";
import Link from "next/link";
import { eur, festival, href, originCities, sceneSrc, tagide } from "@/lib/tagide";
import { Photo } from "@/components/tagide/photo";

export const metadata: Metadata = {
  title: "Travel and camping",
  description: "Getting to Parque Tejo from the airport, Oriente and the cities most of the crowd flies in from. Campo Tejo, partner hotels and the shuttle.",
};

const hotels = [
  { name: "Hotel Oriente Parque", where: "Oriente, next to the station", price: "from €140 a night", note: "Shuttle stop at the door. The one most packages use." },
  { name: "Riverside Santa Apolónia", where: "Santa Apolónia, on the river", price: "from €165 a night", note: "Ten minutes to the gate by shuttle, fifteen to Alfama on foot." },
  { name: "Pensão Tejo", where: "Marvila, between the warehouses", price: "from €90 a night", note: "Small, loud street, the bars of Marvila downstairs. Book early." },
  { name: "Campo Tejo", where: "North of the site, under the bridge", price: "€50 for the weekend with the pass", note: "Five minutes&apos; walk to the gates. Pre-pitched tents available." },
];

export default function TravelPage() {
  return (
    <main className="tg-container pt-12 lg:pt-16">
      <p className="tg-label text-tg-orange">Travel · camping · hotels</p>
      <h1 className="tg-display mt-3 text-[64px] sm:text-[96px]">Getting here</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div>
          <p className="max-w-xl text-[16px] leading-relaxed text-tg-ink-soft">
            {festival.venue} is on the river in the east of the city, fifteen minutes from the airport and twenty from Oriente station by the free shuttle. Last year two thirds of the crowd
            came from outside Portugal. The travel packages bundle the pass, the flight and a hotel on the shuttle line; everything below is for people doing it themselves.
          </p>
          <h2 className="tg-display mt-12 text-[36px]">From the airport and the city</h2>
          <ul className="mt-5 divide-y-2 divide-tg-ink border-y-2 border-tg-ink">
            <Step k="Airport" v="Metro red line to Oriente, four stops, twelve minutes. Then the shuttle. A taxi to the river gate is about €12." />
            <Step k="Oriente" v="Free festival shuttle every five minutes from 13:00 until an hour after the last set, from the bus station on the east side. On foot: 25 minutes along the river." />
            <Step k="Cais do Sodré and Santa Apolónia" v="Train to Oriente (eight minutes from Santa Apolónia), or the night bus 208 which stops at the river gate until 06:00." />
            <Step k="Driving" v="Don't. There is no public parking at the site. Park at Oriente or the airport and take the shuttle." />
          </ul>
        </div>
        <div className="aspect-[4/5] overflow-hidden rounded-[22px] border-2 border-tg-ink">
          <Photo src={sceneSrc("scene-shuttle")} alt="Oriente station" priority />
        </div>
      </div>

      <section className="mt-20">
        <h2 className="tg-display text-[40px] sm:text-[56px]">From your city</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {originCities.map((c) => {
            const pkg = c.packageSlug ? tagide.get(c.packageSlug) : undefined;
            return (
              <li key={c.city} className="flex flex-col rounded-[22px] border-2 border-tg-ink bg-tg-cream p-6">
                <h3 className="tg-display text-[32px]">{c.city}</h3>
                <p className="mt-2 text-[14px] font-medium leading-relaxed text-tg-ink-soft">{c.how}</p>
                {pkg ? (
                  <Link href={`${href.tickets}#${pkg.slug}`} className="tg-btn mt-auto bg-tg-orange pt-5 text-white hover:bg-tg-orange-deep">
                    {pkg.name.replace("Travel package from", "Package from")} · {eur(pkg.price)}
                  </Link>
                ) : (
                  <span className="mt-auto pt-5 text-[13px] font-bold uppercase tracking-[0.06em] text-tg-mute">Book your own travel</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="aspect-[4/5] overflow-hidden rounded-[22px] border-2 border-tg-ink lg:order-2">
          <Photo src={sceneSrc("scene-camping")} alt="Campo Tejo in the morning" />
        </div>
        <div>
          <h2 className="tg-display text-[40px] sm:text-[56px]">Campo Tejo</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-tg-ink-soft">
            The campsite is in the shade of the Vasco da Gama bridge, five minutes&apos; walk north of the gates. It opens Thursday 10 June at noon and closes Monday at noon. Hot showers,
            lockers, a charging station, 24-hour security, a quiet zone away from the late crowd and a bakery van that gets there before you wake up. Bring your own tent or add a pre-pitched
            one when you buy the pass with camping.
          </p>
          <h2 className="tg-display mt-12 text-[36px]">Where to sleep</h2>
          <ul className="mt-5 divide-y-2 divide-tg-ink border-y-2 border-tg-ink">
            {hotels.map((h) => (
              <li key={h.name} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
                <div>
                  <div className="text-[17px] font-extrabold">{h.name}</div>
                  <div className="text-[13px] font-semibold text-tg-mute">{h.where}</div>
                  <div className="mt-1 text-[14px] text-tg-ink-soft">{h.note}</div>
                </div>
                <div className="text-[13px] font-bold text-tg-orange sm:text-right">{h.price}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function Step({ k, v }: { k: string; v: string }) {
  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[220px_1fr] sm:gap-6">
      <span className="text-[16px] font-extrabold">{k}</span>
      <span className="text-[14px] leading-relaxed text-tg-ink-soft">{v}</span>
    </li>
  );
}
