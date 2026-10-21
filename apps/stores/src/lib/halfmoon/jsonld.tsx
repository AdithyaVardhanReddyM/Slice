// schema.org JSON-LD for the Half Moon Coffee site: the company and its
// roastery café, and each coffee as a Product with an Offer (what brand setup
// reads as the brand's products).

import { SITE } from "@/lib/site";
import { COFFEES, HALFMOON, href, img, type HalfMoonCoffee } from "./site";

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path}`);
const address = { "@type": "PostalAddress", streetAddress: HALFMOON.street, addressLocality: HALFMOON.city, addressRegion: HALFMOON.region, postalCode: HALFMOON.postalCode, addressCountry: HALFMOON.country };

export function organizationJsonLd() {
  return [
    {
      "@type": "Organization",
      "@id": `${SITE}/halfmoon#org`,
      name: HALFMOON.name,
      legalName: HALFMOON.legalName,
      slogan: HALFMOON.tagline,
      url: abs(href.home),
      logo: abs("/halfmoon/logo.png"),
      email: HALFMOON.email,
      foundingDate: String(HALFMOON.founded),
      address,
      sameAs: HALFMOON.socials.map((s) => s.url),
    },
    {
      "@type": "CafeOrCoffeeShop",
      name: `${HALFMOON.name} Roastery`,
      image: abs(img("roastery.jpg")),
      address,
      openingHours: "Mo-Su 07:00-15:00",
      servesCuisine: "Coffee",
      parentOrganization: { "@id": `${SITE}/halfmoon#org` },
    },
  ];
}

export function productJsonLd(c: HalfMoonCoffee) {
  return {
    "@type": "Product",
    name: `${c.name} ${c.kind.toLowerCase()}`,
    description: c.description,
    image: [abs(img(c.image)), abs(img(c.photo))],
    url: abs(href.coffee(c.slug)),
    sku: `HM-${c.slug.toUpperCase()}`,
    category: c.isCan ? "Coffee > Cold brew" : "Coffee > Whole bean",
    brand: { "@type": "Brand", name: HALFMOON.name },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Origin", value: c.origin },
      { "@type": "PropertyValue", name: "Process", value: c.process },
      { "@type": "PropertyValue", name: "Tasting notes", value: c.notes.join(", ") },
      { "@type": "PropertyValue", name: "Size", value: c.size },
    ],
    offers: { "@type": "Offer", price: c.price.toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: abs(href.coffee(c.slug)), seller: { "@id": `${SITE}/halfmoon#org` } },
  };
}

export const homeJsonLd = () => ({ "@graph": [...organizationJsonLd(), ...COFFEES.map(productJsonLd)] });

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...(data as object) }).replace(/</g, "\\u003c") }} />;
}
