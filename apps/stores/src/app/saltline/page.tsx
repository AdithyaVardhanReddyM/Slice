import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { experiences, formatDate, hotels, href, offers, openHotels, posts, saltline, sceneSrc } from "@/lib/saltline";
import { money } from "@/lib/format";
import { ItemCard } from "@/components/saltline/item-card";
import { Photo } from "@/components/saltline/photo";

const SITE = "http://localhost:3002";

export default function SaltlineHome() {
  const { store } = saltline;
  const picks = experiences().filter((p) => p.bestseller || p.new).slice(0, 4);
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: `${SITE}/saltline`,
    logo: `${SITE}/saltline/logo.svg`,
    description: store.description,
    foundingDate: "2019",
    address: { "@type": "PostalAddress", streetAddress: "Rua da Boavista 74", addressLocality: "Lisboa", postalCode: "1200-068", addressCountry: "PT" },
    subOrganization: openHotels.map((h) => ({
      "@type": "Hotel",
      name: h.name,
      url: `${SITE}${href.hotel(h.slug)}`,
      address: { "@type": "PostalAddress", streetAddress: h.address[0], addressLocality: h.city, postalCode: h.address[1].split(" ")[0], addressCountry: h.country },
    })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />

      {/* Hero */}
      <section className="sl-container pt-10 lg:pt-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <div className="max-w-lg">
            <h1 className="sl-serif text-[48px] sm:text-[64px] lg:text-[72px]">Small hotels by the water</h1>
            <p className="mt-6 text-[17px] leading-relaxed text-sl-charcoal-soft">
              Three restored buildings in Lisbon, Copenhagen and Barcelona, each a few minutes from the sea, each with a
              restaurant worth the trip and a team who will plan your days if you let them. Marseille follows in spring 2027.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={href.hotels} className="bg-sl-charcoal px-7 py-3.5 text-[15px] font-medium text-sl-paper hover:bg-sl-sea-deep">
                The hotels
              </Link>
              <Link href={href.plan()} className="border border-sl-charcoal px-7 py-3.5 text-[15px] font-medium hover:bg-sl-charcoal hover:text-sl-paper">
                Plan your stay
              </Link>
            </div>
          </div>
          <div className="aspect-[4/5] overflow-hidden bg-sl-stone sm:aspect-[4/3]">
            <Photo src={sceneSrc("scene-home-hero")} alt="A Saltline bedroom in morning light, shutters half open onto the sea" priority />
          </div>
        </div>
      </section>

      {/* Hotels */}
      <section className="sl-container mt-28">
        <div className="flex items-end justify-between gap-6">
          <h2 className="sl-serif text-[36px] sm:text-[44px]">Four cities, one way of doing things</h2>
          <Link href={href.hotels} className="hidden shrink-0 items-center gap-1.5 text-[15px] hover:text-sl-sea-deep sm:flex">
            All hotels <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {hotels.map((h, i) => (
            <Link key={h.slug} href={h.opening ? `${href.hotels}#${h.slug}` : href.hotel(h.slug)} className="group block">
              <div className="relative aspect-[3/4] overflow-hidden bg-sl-stone">
                <Photo src={sceneSrc(h.scene)} alt={h.city} priority={i === 0} className="transition-transform duration-[1200ms] group-hover:scale-[1.04]" />
                {h.opening && (
                  <span className="absolute left-4 top-4 bg-sl-paper px-2.5 py-1 text-xs font-medium tracking-wide">{h.opening}</span>
                )}
              </div>
              <h3 className="sl-serif mt-5 text-[30px]">{h.city}</h3>
              <p className="mt-1 text-sm text-sl-mute">{h.neighbourhood}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-sl-charcoal-soft">{h.intro.split(". ")[0]}.</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Manifesto */}
      <section className="mt-28 bg-sl-paper-deep">
        <div className="sl-container grid gap-10 py-20 lg:grid-cols-[1fr_1fr] lg:gap-20 lg:py-28">
          <h2 className="sl-serif max-w-md text-[36px] sm:text-[48px]">The building first, then everything that happens in it</h2>
          <div className="space-y-5 text-[17px] leading-relaxed text-sl-charcoal-soft lg:pt-3">
            <p>
              We do not build hotels. We find buildings that have already had a long life, a shipping office, a customs warehouse, a
              merchant&apos;s townhouse, and give them another one. The rooms are quiet, the beds are very good, and the restaurant is run by
              someone from the city who shops its markets in the morning.
            </p>
            <p>
              Each hotel has between 48 and 62 rooms, which is small enough that the team knows who you are by the second morning, and a
              short list of experiences that only make sense in that city: a harbour swim in Copenhagen, a surf morning out of Lisbon, a
              Sunday vermouth on a Barcelona roof.
            </p>
            <Link href={href.about} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-sl-charcoal hover:text-sl-sea-deep">
              About Saltline <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* Experiences */}
      <section className="sl-container mt-28">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="sl-serif text-[36px] sm:text-[44px]">Days we can arrange</h2>
            <p className="mt-2 text-sl-mute">Twelve experiences across the three cities, led by the people who run them.</p>
          </div>
          <Link href={href.experiences} className="hidden shrink-0 items-center gap-1.5 text-[15px] hover:text-sl-sea-deep sm:flex">
            All experiences <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
          {picks.map((p) => (
            <ItemCard key={p.id} product={p} sizes="(min-width: 1024px) 25vw, 50vw" />
          ))}
        </div>
      </section>

      {/* Offers */}
      <section className="sl-container mt-28">
        <h2 className="sl-serif text-[36px] sm:text-[44px]">Offers</h2>
        <ul className="mt-8 divide-y divide-sl-line border-y border-sl-line">
          {offers().map((p) => (
            <li key={p.id}>
              <Link href={href.product(p)} className="group grid gap-2 py-6 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8">
                <div>
                  <h3 className="sl-serif text-[28px] group-hover:text-sl-sea-deep">{p.name}</h3>
                  <p className="mt-1 max-w-2xl text-[15px] text-sl-charcoal-soft">{p.details[0]}. {p.details[2]}.</p>
                </div>
                <p className="text-[15px] text-sl-mute sm:text-right">
                  From <span className="text-sl-charcoal">{money(p.price)}</span>
                  <span className="block text-sm">for two</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Journal */}
      <section className="sl-container mt-28">
        <div className="flex items-end justify-between gap-6">
          <h2 className="sl-serif text-[36px] sm:text-[44px]">Journal</h2>
          <Link href={href.journal} className="hidden shrink-0 items-center gap-1.5 text-[15px] hover:text-sl-sea-deep sm:flex">
            All posts <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-3">
          {posts.map((post) => (
            <Link key={post.slug} href={href.post(post.slug)} className="group block">
              <div className="aspect-[4/3] overflow-hidden bg-sl-stone">
                <Photo src={sceneSrc(post.scene)} alt="" className="transition-transform duration-[1200ms] group-hover:scale-[1.04]" />
              </div>
              <p className="mt-4 text-sm text-sl-mute">{formatDate(post.date)}</p>
              <h3 className="sl-serif mt-1 text-[28px] group-hover:text-sl-sea-deep">{post.title}</h3>
              <p className="mt-2 text-[15px] text-sl-charcoal-soft">{post.standfirst}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
