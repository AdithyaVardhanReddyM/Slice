import Link from "next/link";
import { notFound } from "next/navigation";
import { londonMinutes, londonToday, nearestTimes, showingDay } from "@/lib/covers/booking";
import { COVERS_AREAS, areaById, areaCover, countLabel, href, inArea, photo } from "@/lib/covers/site";
import { JsonLd, restaurantJsonLd } from "@/lib/covers/jsonld";
import { AreaRow, LandingHead, MoreLink } from "@/components/covers/blocks";
import { RestaurantCard } from "@/components/covers/restaurant-card";
import { SITE } from "@/lib/site";

// Free tables move through the evening, so pages are rebuilt every few minutes.
export const revalidate = 300;

export function generateStaticParams() {
  return COVERS_AREAS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: PageProps<"/covers/areas/[id]">) {
  const a = areaById((await params).id);
  if (!a) return { title: "Area" };
  const cover = areaCover(a.id);
  return { title: `Restaurants in ${a.name}`, description: `${a.blurb} ${countLabel(inArea(a.id).length)} to book on Covers.`, openGraph: { images: [{ url: photo(cover, 1200), alt: cover.photo.alt }] } };
}

export default async function AreaPage({ params }: PageProps<"/covers/areas/[id]">) {
  const a = areaById((await params).id);
  if (!a) notFound();
  const { day, after, tonight } = showingDay(londonToday(), londonMinutes());
  const list = inArea(a.id);
  const neighbourhoods = [...new Set(list.map((r) => r.neighbourhood))];
  const others = COVERS_AREAS.filter((o) => o.id !== a.id);

  return (
    <main className="pb-24">
      <JsonLd data={{ "@type": "ItemList", name: `Restaurants in ${a.name}`, url: `${SITE}${href.area(a.id)}`, itemListElement: list.map((r, i) => ({ "@type": "ListItem", position: i + 1, item: restaurantJsonLd(r) })) }} />
      <LandingHead crumb={{ label: "Areas", to: href.areas }} title={a.name} text={a.blurb} meta={`${countLabel(list.length)} in ${new Intl.ListFormat("en-GB").format(neighbourhoods)}`} cover={areaCover(a.id)}>
        <Link href={href.search({ area: a.id })} className="cv-btn cv-btn-primary mt-7">
          Search {a.name} by date
        </Link>
      </LandingHead>

      <section className="cv-container mt-12" aria-label={`Restaurants in ${a.name}`}>
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r, i) => (
            <RestaurantCard key={r.slug} r={r} times={nearestTimes(r, day, 2, undefined, 3, after)} query={tonight ? { party: 2 } : { date: day, party: 2 }} priority={i < 3} />
          ))}
        </div>
      </section>

      <section className="cv-container mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="cv-display text-[28px] sm:text-[34px]">Other areas</h2>
          <MoreLink label="All restaurants" to={href.restaurants} />
        </div>
        <div className="mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
          {others.map((o) => (
            <AreaRow key={o.id} a={o} className="-mx-2" />
          ))}
        </div>
      </section>
    </main>
  );
}
