// schema.org JSON-LD for the Knock site: the company (Organization + WebSite),
// each restaurant it delivers from (Restaurant with its menu), and the week's
// trending dishes (Product offers), which brand setup reads as items.

import { SITE } from "@/lib/site";
import { KNOCK, TRENDING, areaById, dishOf, href, img, type KnockRestaurant } from "./site";

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE}${path}`);

export function organizationJsonLd() {
  return {
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/knock#org`,
        name: KNOCK.name,
        legalName: KNOCK.legalName,
        slogan: KNOCK.tagline,
        url: abs(href.home),
        logo: abs("/knock/logo.png"),
        email: KNOCK.email,
        foundingDate: String(KNOCK.founded),
        areaServed: "Los Angeles, CA",
        address: { "@type": "PostalAddress", streetAddress: KNOCK.street, addressLocality: KNOCK.city, addressRegion: KNOCK.region, postalCode: KNOCK.postalCode, addressCountry: KNOCK.country },
        sameAs: KNOCK.socials.map((s) => s.url),
      },
      { "@type": "WebSite", name: KNOCK.name, url: abs(href.home), publisher: { "@id": `${SITE}/knock#org` } },
    ],
  };
}

export function restaurantJsonLd(r: KnockRestaurant) {
  const [street, rest] = r.address.split(/, (.+)/);
  const area = areaById(r.area);
  return {
    "@type": "Restaurant",
    name: r.name,
    description: r.blurb,
    url: abs(href.restaurant(r.slug)),
    image: abs(img(r.image)),
    servesCuisine: r.cuisine,
    address: { "@type": "PostalAddress", streetAddress: street, addressLocality: rest?.split(",")[0] ?? "Los Angeles", addressRegion: "CA", addressCountry: "US" },
    areaServed: area?.name,
    aggregateRating: { "@type": "AggregateRating", ratingValue: r.rating, reviewCount: r.reviews },
    hasMenu: {
      "@type": "Menu",
      hasMenuItem: r.menu.map((d) => ({ "@type": "MenuItem", name: d.name, description: d.description, offers: { "@type": "Offer", price: d.price.toFixed(2), priceCurrency: "USD" } })),
    },
    potentialAction: { "@type": "OrderAction", target: abs(href.restaurant(r.slug)), deliveryMethod: "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet" },
  };
}

/** Homepage: the company, the restaurants shown, and the trending dishes as products. */
export function homeJsonLd(shown: KnockRestaurant[]) {
  const org = organizationJsonLd()["@graph"];
  return {
    "@graph": [
      ...org,
      ...shown.map((r) => restaurantJsonLd(r)),
      ...TRENDING.map((t) => {
        const { r, dish } = dishOf(t);
        return {
          "@type": "Product",
          name: dish.name,
          description: `${dish.description}. From ${r.name}, ${areaById(r.area)?.name}.`,
          image: abs(img(t.image)),
          brand: { "@type": "Brand", name: r.name },
          url: abs(href.restaurant(r.slug)),
          offers: { "@type": "Offer", price: dish.price.toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", seller: { "@id": `${SITE}/knock#org` } },
        };
      }),
    ],
  };
}

export function listJsonLd(list: KnockRestaurant[]) {
  return {
    "@type": "ItemList",
    name: "Restaurants on Knock",
    itemListElement: list.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: abs(href.restaurant(r.slug)), name: r.name })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...(data as object) }).replace(/</g, "\\u003c") }} />;
}
