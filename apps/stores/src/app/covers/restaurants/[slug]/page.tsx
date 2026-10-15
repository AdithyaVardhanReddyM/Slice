import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowUpRight, ChevronRight, MapPin, UtensilsCrossed } from "lucide-react";
import { COVERS_RESTAURANTS, areaById, collectionById, editor, href, mapsUrl, moreLike, photo, priceLabel, restaurantBySlug, splitAddress } from "@/lib/covers/site";
import { JsonLd, restaurantJsonLd } from "@/lib/covers/jsonld";
import { EditorAvatar } from "@/components/covers/blocks";
import { BookingSkeleton, BookingWidget } from "@/components/covers/booking";
import { RestaurantCard } from "@/components/covers/restaurant-card";

export function generateStaticParams() {
  return COVERS_RESTAURANTS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/covers/restaurants/[slug]">) {
  const { slug } = await params;
  const r = restaurantBySlug(slug);
  if (!r) return { title: "Restaurant" };
  return {
    title: `${r.name}, ${r.neighbourhood}`,
    description: `Book a table at ${r.name}: ${r.cuisine.toLowerCase()} in ${r.neighbourhood}. ${r.description}`,
    openGraph: { images: [{ url: photo(r, 1200), alt: r.photo.alt }] },
  };
}

export default async function RestaurantPage({ params }: PageProps<"/covers/restaurants/[slug]">) {
  const { slug } = await params;
  const r = restaurantBySlug(slug);
  if (!r) notFound();
  const area = areaById(r.area)!;
  const collections = r.collections.map((c) => collectionById(c)!);
  const note = r.note ? { ...r.note, who: editor(r.note.by) } : null;
  const more = moreLike(r, 4);
  const { street, postalCode } = splitAddress(r.address);
  const where = area.name.startsWith(r.neighbourhood) ? area.name : `${r.neighbourhood}, ${area.name}`;

  return (
    <main className="pb-24">
      <JsonLd data={restaurantJsonLd(r)} />
      <div className="cv-container pt-6 sm:pt-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[14px] text-(--cv-mute)">
          <Link href={href.restaurants} className="hover:text-(--cv-ink)">
            Restaurants
          </Link>
          <ChevronRight className="size-3.5" />
          <Link href={href.area(area.id)} className="hover:text-(--cv-ink)">
            {area.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-(--cv-ink-soft)">{r.name}</span>
        </nav>

        <div className="mt-5 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Photo and the essentials */}
          <div>
            <div className="aspect-[4/3] overflow-hidden rounded-[20px] bg-(--cv-muted) sm:aspect-[16/10]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(r, 1200)} alt={r.photo.alt} fetchPriority="high" className="h-full w-full object-cover" />
            </div>
            <div className="mt-7">
              {r.isNew && <span className="mb-3 inline-block rounded-full bg-(--cv-primary) px-2.5 py-1 text-[12.5px] font-semibold leading-none text-(--cv-on-primary)">New on Covers</span>}
              <h1 className="cv-display text-[40px] sm:text-[54px]">{r.name}</h1>
              <p className="mt-2 text-[17px] text-(--cv-ink-soft)">
                {r.cuisine} · {r.neighbourhood} · <span className="font-semibold text-(--cv-ink)">{priceLabel(r.price)}</span>
              </p>
              <p className="mt-5 max-w-2xl text-[18px] leading-relaxed">{r.description}</p>
            </div>
          </div>

          {/* Booking: beside everything on desktop, straight after the intro on a phone */}
          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="lg:sticky lg:top-[92px]">
              <Suspense fallback={<BookingSkeleton />}>
                <BookingWidget r={{ slug: r.slug, price: r.price, collections: r.collections }} name={r.name} />
              </Suspense>
              <a href={mapsUrl(r)} target="_blank" rel="noopener" className="cv-card mt-4 flex items-start gap-3 p-5 transition-shadow hover:shadow-[0_0_0_1px_var(--cv-ink)]">
                <MapPin className="mt-0.5 size-5 shrink-0 text-(--cv-accent)" strokeWidth={1.9} />
                <span className="min-w-0 flex-1 text-[15px] leading-snug">
                  <span className="block font-semibold">{street}</span>
                  <span className="block font-semibold">London {postalCode}</span>
                  <span className="mt-1 block text-(--cv-mute)">{where}</span>
                  <span className="mt-2 inline-flex items-center gap-1 font-semibold text-(--cv-accent)">
                    Open in Google Maps <ArrowUpRight className="size-3.5" />
                  </span>
                </span>
              </a>
            </div>
          </div>

          {/* What to order, the editor's note, where it is */}
          <div className="lg:col-start-1">
            <section aria-labelledby="cv-dishes" className="border-t border-(--cv-line) pt-8">
              <h2 id="cv-dishes" className="cv-title text-[24px]">
                What to order
              </h2>
              <ol className="mt-5 grid gap-3 sm:grid-cols-3">
                {r.dishes.map((d, i) => (
                  <li key={d} className="cv-card flex items-start gap-3 p-4 sm:flex-col sm:gap-4 sm:p-5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--cv-primary-tint) text-[14px] font-semibold text-(--cv-ink)">{i + 1}</span>
                    <span className="cv-title pt-1.5 text-[17px] leading-snug sm:pt-0">{d}</span>
                  </li>
                ))}
              </ol>
            </section>

            {note && (
              <figure className="mt-8 rounded-[20px] bg-(--cv-muted) p-6 sm:p-8">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-(--cv-accent)">
                  <UtensilsCrossed className="size-4" strokeWidth={2} /> Editor&apos;s note
                </p>
                <blockquote className="cv-title mt-3 text-[22px] leading-snug sm:text-[26px]">&ldquo;{note.text}&rdquo;</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <EditorAvatar id={note.by} />
                  <span className="text-[14.5px] leading-tight">
                    <span className="block font-semibold">{note.who.name}</span>
                    <span className="text-(--cv-mute)">{note.who.role}, Covers</span>
                  </span>
                </figcaption>
              </figure>
            )}

            <section aria-labelledby="cv-lists" className="mt-10 border-t border-(--cv-line) pt-8">
              <h2 id="cv-lists" className="cv-title text-[24px]">
                On these lists
              </h2>
              <ul className="mt-5 flex flex-wrap gap-2">
                {collections.map((c) => (
                  <li key={c.id}>
                    <Link href={href.collection(c.id)} className="cv-chip">
                      {c.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={href.area(area.id)} className="cv-chip">
                    More in {area.name}
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <section aria-labelledby="cv-more" className="mt-20">
          <h2 id="cv-more" className="cv-display text-[30px] sm:text-[36px]">
            More like this
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 lg:grid-cols-4">
            {more.map((m) => (
              <RestaurantCard key={m.slug} r={m} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
