import type { Metadata } from "next";
import Link from "next/link";
import { actsAt, href, posterOrder, sceneSrc, stages } from "@/lib/tagide";
import { GroundsMap } from "@/components/tagide/grounds-map";
import { Photo } from "@/components/tagide/photo";

export const metadata: Metadata = {
  title: "The grounds",
  description: "Parque Tejo: the four stages, the campsite, the gates, food and water. A site plan and what happens where.",
};

export default function GroundsPage() {
  return (
    <main className="tg-container pt-12 lg:pt-16">
      <p className="tg-label text-tg-orange">Parque Tejo · site plan</p>
      <h1 className="tg-display mt-3 text-[64px] sm:text-[96px]">The grounds</h1>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-tg-ink-soft">
        A long park on the river, with the Vasco da Gama bridge at the east end. The stages are a ten-minute walk apart at most, the food court is in the middle, and the campsite is just north
        of the site. Water points at every stage, lockers at every gate.
      </p>
      <div className="mt-10 overflow-hidden rounded-[26px] border-2 border-tg-ink">
        <GroundsMap />
      </div>

      <section className="mt-16 grid gap-6 md:grid-cols-2">
        {stages.map((s) => {
          const top = posterOrder(actsAt(s.id)).slice(0, 5);
          return (
            <article key={s.id} className="flex flex-col overflow-hidden rounded-[22px] border-2 border-tg-ink bg-tg-cream">
              <div className="aspect-[16/9] overflow-hidden border-b-2 border-tg-ink">
                <Photo src={sceneSrc(s.scene)} alt={s.full} />
              </div>
              <div className="p-6">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="tg-display text-[34px]">{s.full}</h2>
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-tg-mute">{s.capacity}</span>
                </div>
                <p className="mt-1 text-[12px] font-bold uppercase tracking-[0.08em] text-tg-orange">{s.hours}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-tg-ink-soft">{s.blurb}</p>
                <p className="mt-4 flex flex-wrap gap-2">
                  {top.map((a) => (
                    <Link key={a.slug} href={href.act(a.slug)} className="rounded-full border-2 border-tg-ink px-3 py-1.5 text-[13px] font-bold hover:bg-tg-ink hover:text-tg-cream">
                      {a.name}
                    </Link>
                  ))}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-16 grid gap-8 rounded-[26px] bg-tg-lilac p-8 md:grid-cols-3 lg:p-12">
        <Fact k="Food" v="Twenty-two stands in the food court and at each stage, half of them Lisbon restaurants. Always a vegan option, always a €6 plate." />
        <Fact k="Water and bars" v="Free water at every stage and gate. Bars take the wristband only; top up online or at any bar." />
        <Fact k="Access" v="Raised platforms at all four stages, boarded paths, accessible toilets, an accessible shuttle from Oriente. Carers come free." />
      </section>
    </main>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <h3 className="tg-display text-[28px]">{k}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-tg-ink-soft">{v}</p>
    </div>
  );
}
