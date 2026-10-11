import { MapPin } from "lucide-react";
import { cafes } from "@/lib/ridgeline";
import { sceneSrc } from "@/lib/ridgeline";
import { Scene } from "./product-image";

const SITE = "http://localhost:3002";

// Shared by /cafes and /locations so both URLs carry the same addresses.
export function CafeList({ title, intro }: { title: string; intro: string }) {
  const jsonLd = cafes.map((c) => ({
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: `Ridgeline Coffee Roasters, ${c.name}`,
    url: `${SITE}/ridgeline/cafes#${c.slug}`,
    telephone: c.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: c.address[0],
      addressLocality: c.city.split(",")[0],
      addressRegion: c.city.split(", ")[1],
      postalCode: c.address[1].split(" ").pop(),
      addressCountry: "US",
    },
    parentOrganization: { "@type": "Organization", name: "Ridgeline Coffee Roasters" },
  }));

  return (
    <main className="rl-container py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="max-w-2xl">
        <h1 className="rl-serif text-[40px] sm:text-[52px]">{title}</h1>
        <p className="mt-4 text-[17px] text-rl-ink-soft">{intro}</p>
      </header>

      <div className="mt-12 space-y-16">
        {cafes.map((c, i) => (
          <article key={c.slug} id={c.slug} className="grid gap-8 scroll-mt-32 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-[4px] bg-rl-sand ${i % 2 ? "lg:order-2" : ""}`}>
              <Scene src={sceneSrc(c.scene)} alt={`${c.name}, ${c.city}`} priority={i === 0} />
              {c.opening && (
                <span className="absolute left-4 top-4 rounded-[3px] bg-rl-rust px-2.5 py-1 text-sm font-semibold text-rl-cream">{c.opening}</span>
              )}
            </div>
            <div className={i % 2 ? "lg:order-1" : ""}>
              <p className="text-sm font-semibold text-rl-rust">{c.neighbourhood}</p>
              <h2 className="rl-serif mt-2 text-[32px]">{c.city}</h2>
              <p className="text-[17px] text-rl-ink-soft">{c.name}</p>
              <p className="mt-5 text-[15px] leading-relaxed">{c.blurb}</p>
              <dl className="mt-6 grid gap-5 border-t border-rl-line pt-6 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Address</dt>
                  <dd className="mt-1 text-rl-ink-soft">
                    <address className="not-italic">
                      {c.address.map((line) => (
                        <span key={line} className="block">{line}</span>
                      ))}
                    </address>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.mapQuery)}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-rl-rust hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="size-3.5" /> Directions
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Hours</dt>
                  <dd className="mt-1 text-rl-ink-soft">
                    {c.hours.map((h) => (
                      <span key={h.days} className="block">
                        {h.days}: {h.open}
                      </span>
                    ))}
                    <span className="mt-2 block">{c.phone}</span>
                  </dd>
                </div>
              </dl>
              {c.opening && (
                <form className="mt-6 flex max-w-sm overflow-hidden rounded-[4px] border border-rl-ink">
                  <input type="email" placeholder="Email for the Austin waitlist" aria-label="Email for the Austin waitlist" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-rl-mute" />
                  <button type="button" className="bg-rl-rust px-5 text-sm font-semibold text-rl-cream hover:bg-rl-rust-deep">Join waitlist</button>
                </form>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
