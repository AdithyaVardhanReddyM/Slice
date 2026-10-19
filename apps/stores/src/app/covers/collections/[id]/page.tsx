import Link from "next/link";
import { notFound } from "next/navigation";
import { londonMinutes, londonToday, nearestTimes, showingDay } from "@/lib/covers/booking";
import { COVERS_COLLECTIONS, collectionById, collectionCover, countLabel, href, inCollection, photo } from "@/lib/covers/site";
import { JsonLd, restaurantJsonLd } from "@/lib/covers/jsonld";
import { CollectionTile, LandingHead, MoreLink } from "@/components/covers/blocks";
import { RestaurantCard } from "@/components/covers/restaurant-card";
import { SITE } from "@/lib/site";

// Free tables move through the evening, so pages are rebuilt every few minutes.
export const revalidate = 300;

export function generateStaticParams() {
  return COVERS_COLLECTIONS.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/covers/collections/[id]">) {
  const c = collectionById((await params).id);
  if (!c) return { title: "Collection" };
  const cover = collectionCover(c.id);
  return { title: c.name, description: `${c.blurb} ${countLabel(inCollection(c.id).length)} in London to book on Covers.`, openGraph: { images: [{ url: photo(cover, 1200), alt: cover.photo.alt }] } };
}

export default async function CollectionPage({ params }: PageProps<"/covers/collections/[id]">) {
  const c = collectionById((await params).id);
  if (!c) notFound();
  const { day, after, tonight } = showingDay(londonToday(), londonMinutes());
  const list = inCollection(c.id);
  const others = COVERS_COLLECTIONS.filter((o) => o.id !== c.id).slice(0, 4);

  return (
    <main className="pb-24">
      <JsonLd data={{ "@type": "ItemList", name: c.name, url: `${SITE}${href.collection(c.id)}`, itemListElement: list.map((r, i) => ({ "@type": "ListItem", position: i + 1, item: restaurantJsonLd(r) })) }} />
      <LandingHead crumb={{ label: "Collections", to: href.collections }} title={c.name} text={c.blurb} meta={`${countLabel(list.length)}, with free tables for two ${tonight ? "tonight" : "tomorrow"} below`} cover={collectionCover(c.id)}>
        <Link href={href.search({ collection: c.id })} className="cv-btn cv-btn-primary mt-7">
          Search this list by date
        </Link>
      </LandingHead>

      <section className="cv-container mt-12" aria-label={c.name}>
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r, i) => (
            <RestaurantCard key={r.slug} r={r} times={nearestTimes(r, day, 2, undefined, 3, after)} query={tonight ? { party: 2 } : { date: day, party: 2 }} priority={i < 3} />
          ))}
        </div>
      </section>

      <section className="cv-container mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="cv-display text-[28px] sm:text-[34px]">More collections</h2>
          <MoreLink label="All collections" to={href.collections} />
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {others.map((o) => (
            <CollectionTile key={o.id} c={o} />
          ))}
        </div>
      </section>
    </main>
  );
}
