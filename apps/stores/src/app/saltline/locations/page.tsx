import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { hotels, href, sceneSrc } from "@/lib/saltline";
import { Photo } from "@/components/saltline/photo";

export const metadata: Metadata = {
  title: "Locations",
  description: "Addresses, phone numbers and directions for Saltline Lisbon, Copenhagen and Barcelona, and the Marseille hotel opening spring 2027.",
};

const SITE = "http://localhost:3002";

export default function LocationsPage() {
  const jsonLd = hotels
    .filter((h) => !h.opening)
    .map((h) => ({
      "@context": "https://schema.org",
      "@type": "Hotel",
      name: h.name,
      url: `${SITE}${href.hotel(h.slug)}`,
      telephone: h.phone,
      email: h.email,
      address: { "@type": "PostalAddress", streetAddress: h.address[0], addressLocality: h.city, postalCode: h.address[1].split(" ")[0], addressCountry: h.country },
    }));
  return (
    <main className="sl-container py-10 lg:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="max-w-2xl">
        <h1 className="sl-serif text-[48px] sm:text-[64px]">Locations</h1>
        <p className="mt-5 text-[17px] text-sl-charcoal-soft">
          Three hotels open, one opening in spring 2027. Each is within ten minutes&apos; walk of the water and a main station. Head office is at the Lisbon hotel.
        </p>
      </header>
      <div className="mt-14 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
        {hotels.map((h) => (
          <div key={h.slug} id={h.slug}>
            <div className="aspect-[4/5] overflow-hidden bg-sl-stone">
              <Photo src={sceneSrc(h.scene)} alt={h.city} />
            </div>
            <h2 className="sl-serif mt-5 text-[30px]">{h.name}</h2>
            {h.opening && <p className="text-sm text-sl-sea-deep">{h.opening}</p>}
            <address className="mt-3 text-[15px] not-italic leading-relaxed text-sl-charcoal-soft">
              {h.address.map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
            </address>
            <p className="mt-3 text-[15px] text-sl-charcoal-soft">
              <span className="block">{h.phone}</span>
              <span className="block">{h.email}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.mapQuery)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sl-sea-deep hover:underline">
                <MapPin className="size-3.5" strokeWidth={1.5} /> Directions
              </a>
              {!h.opening && (
                <Link href={href.hotel(h.slug)} className="underline hover:text-sl-sea-deep">Hotel page</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
