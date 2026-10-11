import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { hotels, href, rooms, sceneSrc } from "@/lib/saltline";
import { money } from "@/lib/format";
import { Photo } from "@/components/saltline/photo";

export const metadata: Metadata = {
  title: "Hotels",
  description: "Saltline hotels in Lisbon, Copenhagen and Barcelona, with Marseille opening spring 2027. Rooms from $180 a night, breakfast included.",
};

export default function HotelsPage() {
  return (
    <main className="sl-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="sl-serif text-[48px] sm:text-[64px]">The hotels</h1>
        <p className="mt-5 text-[17px] text-sl-charcoal-soft">
          Three open, one on the way. Each is a restored building near the water with its own restaurant, four room tiers from Cosy to a suite, and breakfast included in every rate.
        </p>
      </header>
      <div className="mt-14 space-y-20">
        {hotels.map((h, i) => {
          const from = rooms(h.city).reduce((m, p) => Math.min(m, p.price), Infinity);
          return (
            <article key={h.slug} id={h.slug} className="grid scroll-mt-28 gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
              <div className={`relative aspect-[4/3] overflow-hidden bg-sl-stone ${i % 2 ? "lg:order-2" : ""}`}>
                <Photo src={sceneSrc(h.scene)} alt={h.city} priority={i === 0} />
                {h.opening && <span className="absolute left-4 top-4 bg-sl-paper px-2.5 py-1 text-xs font-medium tracking-wide">{h.opening}</span>}
              </div>
              <div className={`lg:self-center ${i % 2 ? "lg:order-1" : ""}`}>
                <p className="text-sm text-sl-sea-deep">{h.neighbourhood}</p>
                <h2 className="sl-serif mt-2 text-[40px]">{h.name}</h2>
                <p className="mt-4 text-[16px] leading-relaxed text-sl-charcoal-soft">{h.intro}</p>
                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-sl-line pt-5 text-[15px] sm:grid-cols-3">
                  <div>
                    <dt className="text-sl-mute">Rooms</dt>
                    <dd>{h.roomsCount}</dd>
                  </div>
                  <div>
                    <dt className="text-sl-mute">{h.opening ? "Opens" : "Opened"}</dt>
                    <dd>{h.opening ? "Spring 2027" : h.opened}</dd>
                  </div>
                  {Number.isFinite(from) && (
                    <div>
                      <dt className="text-sl-mute">From</dt>
                      <dd>{money(from)} a night</dd>
                    </div>
                  )}
                </dl>
                <address className="mt-5 text-sm not-italic text-sl-mute">{h.address.join(", ")}</address>
                {h.opening ? (
                  <form className="mt-6 flex max-w-sm border-b border-sl-charcoal">
                    <input type="email" placeholder="Email for the Marseille list" aria-label="Email for the Marseille list" className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-sl-mute" />
                    <button type="button" className="text-[14px] font-medium hover:text-sl-sea-deep">Join the list</button>
                  </form>
                ) : (
                  <Link href={href.hotel(h.slug)} className="mt-6 inline-flex items-center gap-1.5 border border-sl-charcoal px-6 py-3 text-[15px] font-medium hover:bg-sl-charcoal hover:text-sl-paper">
                    Rooms, restaurant and neighbourhood <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
