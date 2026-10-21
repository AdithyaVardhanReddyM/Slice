import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, MapPin, Plus, Star, Truck } from "lucide-react";
import { Header } from "@/components/knock/header";
import { RestaurantCard } from "@/components/knock/restaurant-card";
import { JsonLd, restaurantJsonLd } from "@/lib/knock/jsonld";
import { RESTAURANTS, areaById, etaLabel, feeLabel, href, img, money, moreLike, restaurantBySlug, reviewsLabel } from "@/lib/knock/site";

export function generateStaticParams() {
  return RESTAURANTS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/knock/restaurants/[slug]">) {
  const { slug } = await params;
  const r = restaurantBySlug(slug);
  if (!r) return { title: "Restaurant" };
  return {
    title: `${r.name} delivery`,
    description: `Order ${r.name} (${r.cuisine.toLowerCase()}, ${areaById(r.area)?.name}) on Knock. ${r.blurb}`,
    openGraph: { images: [{ url: img(r.image), alt: r.imageAlt }] },
  };
}

export default async function RestaurantPage({ params }: PageProps<"/knock/restaurants/[slug]">) {
  const { slug } = await params;
  const r = restaurantBySlug(slug);
  if (!r) notFound();
  const area = areaById(r.area)!;
  const more = moreLike(r, 3);

  return (
    <main className="pb-24">
      <JsonLd data={restaurantJsonLd(r)} />
      <div className="kn-container">
        <Header />
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 pt-2 text-[14.5px] text-(--kn-ink-soft)">
          <Link href={href.restaurants} className="hover:text-(--kn-ink)">
            Restaurants
          </Link>
          <ChevronRight className="size-3.5" />
          <Link href={href.area(area.id)} className="hover:text-(--kn-ink)">
            {area.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-(--kn-ink)">{r.name}</span>
        </nav>

        <div className="relative mt-5 overflow-hidden rounded-[32px] bg-(--kn-ink) sm:rounded-[40px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img(r.image)} alt={r.imageAlt} fetchPriority="high" className="aspect-[4/3] h-full w-full object-cover sm:aspect-[21/9]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            {r.offer && <span className="kn-display inline-block rounded-full bg-(--kn-yellow) px-4 py-2 text-[14px] text-(--kn-ink)">{r.offer}</span>}
            <h1 className="kn-display mt-4 text-[40px] text-white sm:text-[72px]">{r.name}</h1>
            <p className="mt-2 text-[16px] text-white/85">
              {r.cuisine} in {area.name}
            </p>
          </div>
        </div>
      </div>

      <section className="kn-container mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="max-w-2xl text-[18px] leading-relaxed">{r.blurb}</p>
          <h2 className="kn-display mt-12 text-[32px] sm:text-[40px]">Menu</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {r.menu.map((d) => (
              <li key={d.name} className="flex flex-col rounded-[22px] border-[1.25px] border-(--kn-ink) bg-(--kn-surface) p-5">
                {d.popular && <span className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-(--kn-red)">Most ordered</span>}
                <h3 className="kn-title text-[18px]">{d.name}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-(--kn-ink-soft)">{d.description}</p>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="text-[16px] font-bold">{money(d.price)}</span>
                  <button type="button" className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-(--kn-ink) bg-(--kn-yellow) shadow-[0_2px_0_var(--kn-ink)]" aria-label={`Add ${d.name}`}>
                    <Plus className="size-5" strokeWidth={2.4} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="h-fit rounded-[28px] bg-(--kn-yellow) p-7 lg:sticky lg:top-6">
          <ul className="space-y-3 text-[15.5px]">
            <li className="flex items-center gap-3">
              <Star className="size-5 fill-(--kn-ink)" strokeWidth={0} />
              <span>
                <b>{r.rating.toFixed(1)}</b> from {reviewsLabel(r.reviews)} orders
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Clock className="size-5" strokeWidth={2} />
              {etaLabel(r)} to most of LA
            </li>
            <li className="flex items-center gap-3">
              <Truck className="size-5" strokeWidth={2} />
              {feeLabel(r.fee)}
            </li>
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0" strokeWidth={2} />
              {r.address}
            </li>
          </ul>
          <Link href={href.restaurant(r.slug)} className="kn-btn kn-btn-red mt-7 w-full">
            Start your order
          </Link>
          <p className="mt-4 text-center text-[13.5px] text-(--kn-ink-soft)">Hot or it&apos;s on us.</p>
        </aside>
      </section>

      <section className="kn-container pt-24">
        <h2 className="kn-display text-[32px] sm:text-[40px]">You might also like</h2>
        <div className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((o) => (
            <RestaurantCard key={o.slug} r={o} />
          ))}
        </div>
      </section>
    </main>
  );
}
