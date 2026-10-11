import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { experiences, hotel, href, openHotels, posts, rooms, sceneSrc, tierRank } from "@/lib/saltline";
import { money } from "@/lib/format";
import { ItemCard } from "@/components/saltline/item-card";
import { Photo } from "@/components/saltline/photo";

const SITE = "http://localhost:3002";

export function generateStaticParams() {
  return openHotels.map((h) => ({ city: h.slug }));
}

export async function generateMetadata({ params }: PageProps<"/saltline/hotels/[city]">) {
  const { city } = await params;
  const h = hotel(city);
  return { title: h?.name ?? "Hotel", description: h?.intro };
}

export default async function HotelPage({ params }: PageProps<"/saltline/hotels/[city]">) {
  const { city } = await params;
  const h = hotel(city);
  if (!h || h.opening) notFound();
  const tiers = rooms(h.city).sort((a, b) => tierRank(a) - tierRank(b));
  const exps = experiences(h.city);
  const post = posts.find((p) => p.hotel === h.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: h.name,
    url: `${SITE}${href.hotel(h.slug)}`,
    telephone: h.phone,
    email: h.email,
    numberOfRooms: h.roomsCount,
    address: { "@type": "PostalAddress", streetAddress: h.address[0], addressLocality: h.city, postalCode: h.address[1].split(" ")[0], addressCountry: h.country },
    parentOrganization: { "@type": "Organization", name: "Saltline Hotels" },
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="sl-container pt-10 lg:pt-14">
        <p className="text-sm text-sl-sea-deep">{h.neighbourhood}</p>
        <h1 className="sl-serif mt-3 text-[48px] sm:text-[64px] lg:text-[76px]">{h.name}</h1>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
          <div className="aspect-[4/3] overflow-hidden bg-sl-stone sm:aspect-[16/10]">
            <Photo src={sceneSrc(h.scene)} alt={h.city} priority />
          </div>
          <div className="lg:self-end">
            <p className="text-[17px] leading-relaxed text-sl-charcoal-soft">{h.intro}</p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-sl-line pt-5 text-[15px]">
              <div>
                <dt className="text-sl-mute">Address</dt>
                <dd>
                  <address className="not-italic">
                    {h.address.map((l) => (
                      <span key={l} className="block">{l}</span>
                    ))}
                  </address>
                </dd>
              </div>
              <div>
                <dt className="text-sl-mute">Contact</dt>
                <dd>
                  <span className="block">{h.phone}</span>
                  <span className="block">{h.email}</span>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.mapQuery)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-sl-sea-deep hover:underline">
                    <MapPin className="size-3.5" strokeWidth={1.5} /> Directions
                  </a>
                </dd>
              </div>
            </dl>
            <Link href={href.plan({ hotel: h.slug })} className="mt-6 inline-block bg-sl-charcoal px-7 py-3.5 text-[15px] font-medium text-sl-paper hover:bg-sl-sea-deep">
              Check availability
            </Link>
          </div>
        </div>
      </section>

      {/* Rooms */}
      <section id="rooms" className="sl-container mt-24 scroll-mt-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="sl-serif text-[36px] sm:text-[44px]">Rooms</h2>
            <p className="mt-2 text-sl-mute">Four tiers, from {money(tiers[0].price)} a night. Breakfast at {h.restaurant.name} included in every rate.</p>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
          {tiers.map((p, i) => (
            <ItemCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" priority={i < 2} />
          ))}
        </div>
      </section>

      {/* Restaurant */}
      <section id="restaurant" className="mt-28 bg-sl-paper-deep scroll-mt-24">
        <div className="sl-container grid gap-10 py-20 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div className="lg:self-center">
            <p className="text-sm text-sl-sea-deep">The restaurant</p>
            <h2 className="sl-serif mt-3 text-[44px] sm:text-[56px]">{h.restaurant.name}</h2>
            <p className="mt-5 text-[17px] leading-relaxed text-sl-charcoal-soft">{h.restaurant.blurb}</p>
            <p className="mt-5 text-[15px] text-sl-mute">{h.restaurant.hours}</p>
            <Link href={href.plan({ hotel: h.slug, interest: `Dinner at ${h.restaurant.name}` })} className="mt-6 inline-block border border-sl-charcoal px-6 py-3 text-[15px] font-medium hover:bg-sl-charcoal hover:text-sl-paper">
              Reserve a table
            </Link>
          </div>
          <div className="aspect-[4/3] overflow-hidden bg-sl-stone lg:aspect-[5/4]">
            <Photo src={sceneSrc(h.restaurant.scene)} alt={`${h.restaurant.name}, the restaurant at ${h.name}`} />
          </div>
        </div>
      </section>

      {/* Building + neighbourhood */}
      <section id="neighbourhood" className="sl-container mt-28 grid gap-14 lg:grid-cols-[1fr_1.2fr] lg:gap-20 scroll-mt-24">
        <div>
          <h2 className="sl-serif text-[36px] sm:text-[44px]">The building</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-sl-charcoal-soft">{h.building}</p>
        </div>
        <div>
          <h2 className="sl-serif text-[36px] sm:text-[44px]">The neighbourhood</h2>
          <dl className="mt-5 divide-y divide-sl-line border-y border-sl-line">
            {h.neighbourhoodNotes.map((n) => (
              <div key={n.title} className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-medium">{n.title}</dt>
                <dd className="text-[15px] leading-relaxed text-sl-charcoal-soft">{n.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Experiences here */}
      <section className="sl-container mt-28">
        <div className="flex items-end justify-between gap-6">
          <h2 className="sl-serif text-[36px] sm:text-[44px]">Experiences in {h.city}</h2>
          <Link href={href.experiences} className="hidden shrink-0 items-center gap-1.5 text-[15px] hover:text-sl-sea-deep sm:flex">
            All experiences <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
          {exps.map((p) => (
            <ItemCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
          ))}
        </div>
      </section>

      {post && (
        <section className="sl-container mt-28">
          <Link href={href.post(post.slug)} className="group grid gap-8 border-t border-sl-line pt-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div className="aspect-[4/3] overflow-hidden bg-sl-stone">
              <Photo src={sceneSrc(post.scene)} alt="" className="transition-transform duration-[1200ms] group-hover:scale-[1.04]" />
            </div>
            <div>
              <p className="text-sm text-sl-mute">From the journal</p>
              <h2 className="sl-serif mt-2 text-[36px] group-hover:text-sl-sea-deep">{post.title}</h2>
              <p className="mt-3 max-w-xl text-[16px] text-sl-charcoal-soft">{post.standfirst}</p>
            </div>
          </Link>
        </section>
      )}
    </main>
  );
}
