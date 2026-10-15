// schema.org JSON-LD for the Covers site: the app's company (Organization +
// WebSite) and each restaurant (Restaurant, with its address, pin and cuisine).

import { SITE } from "@/lib/site";
import { COVERS_APP, areaById, href, photo, priceLabel, splitAddress, type CoversRestaurant } from "./site";

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path}`);

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": `${SITE}/covers#org`,
    name: COVERS_APP.name,
    legalName: COVERS_APP.legalName,
    slogan: COVERS_APP.tagline,
    url: abs(href.home),
    logo: abs("/covers/logo.png"),
    email: COVERS_APP.email,
    foundingDate: String(COVERS_APP.founded),
    address: {
      "@type": "PostalAddress",
      streetAddress: COVERS_APP.street,
      addressLocality: COVERS_APP.city,
      postalCode: COVERS_APP.postalCode,
      addressCountry: COVERS_APP.country,
    },
    sameAs: COVERS_APP.socials.map((s) => s.url),
  };
}

export function restaurantJsonLd(r: CoversRestaurant) {
  const { street, postalCode } = splitAddress(r.address);
  return {
    "@type": "Restaurant",
    name: r.name,
    description: r.description,
    url: abs(href.restaurant(r.slug)),
    image: photo(r, 1200),
    servesCuisine: r.cuisine,
    priceRange: priceLabel(r.price),
    acceptsReservations: true,
    address: { "@type": "PostalAddress", streetAddress: street, addressLocality: "London", postalCode, addressCountry: "GB" },
    geo: { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lon },
    areaServed: areaById(r.area)?.name,
    keywords: r.tags.join(", "),
    potentialAction: {
      "@type": "ReserveAction",
      target: abs(href.restaurant(r.slug)),
      provider: { "@id": `${SITE}/covers#org` },
    },
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...(data as object) }).replace(/</g, "\\u003c") }} />;
}
