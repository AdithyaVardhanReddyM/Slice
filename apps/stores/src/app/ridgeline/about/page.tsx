import type { Metadata } from "next";
import Link from "next/link";
import { href, sceneSrc } from "@/lib/ridgeline";
import { Scene } from "@/components/ridgeline/product-image";

export const metadata: Metadata = {
  title: "About",
  description: "Ridgeline Coffee Roasters: founded in Portland in 2016, roasting direct-trade coffee in small batches and paying farmers fixed prices agreed every January.",
};

const numbers = [
  { n: "2016", label: "Founded on Alberta Street" },
  { n: "9", label: "Farms and washing stations we buy from directly" },
  { n: "6", label: "Years with our longest partner, Finca La Esperanza" },
  { n: "48 hrs", label: "From roaster to the post office, every bag" },
];

export default function AboutPage() {
  return (
    <main>
      <section className="rl-container grid gap-8 py-10 lg:grid-cols-[1fr_1fr] lg:items-end lg:py-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-rl-rust">About Ridgeline</p>
          <h1 className="rl-serif mt-3 text-[40px] sm:text-[56px]">A small roaster that buys like a big one should</h1>
          <p className="mt-5 text-[17px] text-rl-ink-soft">
            Ridgeline Coffee Roasters was started in 2016 by Maya Lindqvist and Sam Okafor in a 900-square-foot space on
            NE Alberta Street in Portland, Oregon, with a used 5-kilo roaster and one wholesale account. Today we roast on a
            15-kilo Loring in the same building, run cafés in Portland and Seattle, and ship to every state. We still buy
            coffee the way we did in year one: directly, from people we visit, at prices we agree together.
          </p>
        </div>
        <div className="aspect-[4/3] overflow-hidden rounded-[4px] bg-rl-sand">
          <Scene src={sceneSrc("scene-roastery")} alt="The drum roaster mid-batch at the Alberta Street roastery" priority />
        </div>
      </section>

      <section className="rl-container mt-6 grid gap-6 border-y border-rl-line py-10 sm:grid-cols-2 lg:grid-cols-4">
        {numbers.map((x) => (
          <div key={x.label}>
            <p className="rl-serif text-[40px] text-rl-rust">{x.n}</p>
            <p className="mt-1 text-sm text-rl-ink-soft">{x.label}</p>
          </div>
        ))}
      </section>

      <section className="rl-container mt-20 grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
        <div className="aspect-[4/5] overflow-hidden rounded-[4px] bg-rl-sand">
          <Scene src={sceneSrc("scene-farm")} alt="Coffee cherries ripening on a Huila hillside" />
        </div>
        <div className="max-w-xl lg:self-center">
          <h2 className="rl-serif text-[32px] sm:text-[40px]">How we source</h2>
          <div className="mt-6 space-y-5 text-[17px] leading-relaxed text-rl-ink-soft">
            <p>
              We buy from nine farms and washing stations in Colombia, Guatemala, Brazil, Ethiopia, Kenya and Sumatra, and our
              head of sourcing, Dana Whitaker, visits each of them every year. Where we can, we buy the whole harvest, so a
              producer knows in January what the year will bring in.
            </p>
            <p>
              We do not price against the commodity market. Each January we sit down with a producer and agree a fixed price
              based on their costs, their yield and what we can realistically sell the coffee for. In 2026 that averaged 2.3
              times the local market price across our partners. We publish the price we paid on every bag.
            </p>
            <p>
              Quality control is boring and constant. We cup every lot on arrival and every production roast the next morning,
              and anything that drifts from the profile is pulled. We roast light to medium for most coffees because that is
              where the farm shows up in the cup, and darker for the two blends and the decaf espresso that need it.
            </p>
          </div>
          <Link href={href.post("how-we-buy-coffee-in-huila")} className="mt-6 inline-block text-[15px] font-semibold text-rl-rust hover:underline">
            Read how we buy in Huila
          </Link>
        </div>
      </section>

      <section className="rl-container mt-20 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="rl-serif text-[32px]">What we care about</h2>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:col-span-2">
          {[
            ["Freshness you can date", "Every bag carries its roast date. We roast Tuesday to Friday and ship within 48 hours, and nothing sits on a shelf longer than three weeks before we pull it."],
            ["Honest descriptions", "Tasting notes are what three of us agreed on at the cupping table, not a marketing list. If a coffee is simple and sweet, the bag says so."],
            ["Packaging that goes away", "Bags are kraft paper with a compostable liner, boxes are recycled board, and the only plastic is the one-way valve. Café cups are compostable and we discount 50 cents for your own."],
            ["Paying people properly", "Baristas start at $21 an hour plus tips and get health insurance at 25 hours. Roasters and café leads share in profit twice a year."],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-[17px] font-semibold">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-rl-ink-soft">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rl-container mt-20">
        <div className="grid gap-8 rounded-[4px] bg-rl-ink p-8 text-rl-cream sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="rl-serif text-[32px]">Visit the roastery</h2>
            <p className="mt-3 max-w-lg text-rl-cream/75">
              The roaster runs behind glass at the back of the Alberta Street café. Free public cuppings on the first Saturday of every month at 10 am; no need to book.
            </p>
          </div>
          <Link href={href.cafes} className="rounded-[4px] bg-rl-cream px-6 py-3.5 text-[15px] font-semibold text-rl-ink hover:bg-rl-sand">
            Cafés and hours
          </Link>
        </div>
      </section>
    </main>
  );
}
