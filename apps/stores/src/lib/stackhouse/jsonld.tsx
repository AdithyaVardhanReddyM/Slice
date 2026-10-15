// schema.org JSON-LD for the Stackhouse Books site: the shop (BookStore), each book
// (Book + Product, so product readers pick it up) and each event.

import { SITE } from "@/lib/site";
import { FOLIO_SHOP, href, section, type FolioBook, type FolioEvent } from "./shop";

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path}`);

const postalAddress = {
  "@type": "PostalAddress",
  streetAddress: FOLIO_SHOP.street,
  addressLocality: FOLIO_SHOP.city,
  addressRegion: FOLIO_SHOP.region,
  postalCode: FOLIO_SHOP.postalCode,
  addressCountry: FOLIO_SHOP.country,
};

const days: Record<string, string[]> = {
  "Mon–Thu": ["Monday", "Tuesday", "Wednesday", "Thursday"],
  "Fri–Sat": ["Friday", "Saturday"],
  Sun: ["Sunday"],
};

export function storeJsonLd() {
  return {
    "@type": ["BookStore", "Organization"],
    "@id": `${SITE}/stackhouse#store`,
    name: FOLIO_SHOP.name,
    legalName: FOLIO_SHOP.legalName,
    description: `${FOLIO_SHOP.tagline} New books, handwritten staff picks, a monthly book club, author events and Saturday Story Hour.`,
    url: `${SITE}/stackhouse`,
    logo: abs("/stackhouse/logo.png"),
    image: abs("/stackhouse/photos/storefront.jpg"),
    telephone: FOLIO_SHOP.phone,
    email: FOLIO_SHOP.email,
    foundingDate: String(FOLIO_SHOP.founded),
    address: postalAddress,
    openingHoursSpecification: FOLIO_SHOP.hours.map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: days[h.short], opens: h.open, closes: h.close })),
    sameAs: FOLIO_SHOP.socials.map((s) => s.url),
  };
}

export function bookJsonLd(b: FolioBook) {
  return {
    "@type": ["Book", "Product"],
    name: b.title,
    author: { "@type": "Person", name: b.author },
    description: b.description,
    image: b.cover,
    url: abs(href.book(b.slug)),
    genre: section(b.section).name,
    category: section(b.section).name,
    keywords: b.tags.join(", "),
    datePublished: String(b.year),
    bookFormat: `https://schema.org/${b.format}`,
    offers: {
      "@type": "Offer",
      price: b.price.replace(/[^\d.]/g, ""),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: abs(href.book(b.slug)),
      seller: { "@id": `${SITE}/stackhouse#store` },
    },
  };
}

export function eventJsonLd(e: FolioEvent) {
  return {
    "@type": "Event",
    name: e.title,
    description: e.description,
    startDate: e.startsAt,
    endDate: e.endsAt,
    url: abs(href.event(e.slug)),
    ...(e.photo ? { image: abs(`/stackhouse/photos/${e.photo}.jpg`) } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    isAccessibleForFree: e.price.startsWith("Free"),
    location: { "@type": "Place", name: `${e.place}, ${FOLIO_SHOP.name}`, address: postalAddress },
    organizer: { "@id": `${SITE}/stackhouse#store` },
    ...(e.readers ? { performer: e.readers.map((r) => ({ "@type": "Person", name: r.name })) } : {}),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...(data as object) }).replace(/</g, "\\u003c") }} />;
}
