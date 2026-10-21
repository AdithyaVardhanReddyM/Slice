import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/knock/header";
import { RestaurantCard } from "@/components/knock/restaurant-card";
import { JsonLd, listJsonLd } from "@/lib/knock/jsonld";
import { AREAS, CATEGORIES, RESTAURANTS, areaById, categoryById, href, img } from "@/lib/knock/site";

export const metadata: Metadata = {
  title: "Restaurants",
  description: `Every kitchen on Knock: ${RESTAURANTS.length} LA restaurants, trucks and counters, from birria in East LA to bagels on Virgil.`,
};

export default async function Restaurants({ searchParams }: PageProps<"/knock/restaurants">) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? categoryById(sp.category) : undefined;
  const area = typeof sp.area === "string" ? areaById(sp.area) : undefined;
  const list = RESTAURANTS.filter((r) => (!category || r.categories.includes(category.id)) && (!area || r.area === area.id));
  const heading = category ? category.name : area ? area.name : "Every kitchen on Knock";

  return (
    <main className="pb-24">
      <JsonLd data={listJsonLd(list)} />
      <div className="kn-container">
        <Header />
      </div>
      <section className="kn-container pt-8">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-(--kn-red)">{area ? "Neighbourhood" : category ? "Craving" : "Restaurants"}</p>
        <h1 className="kn-display mt-3 text-[48px] sm:text-[80px]">{heading}</h1>
        <p className="mt-4 max-w-xl text-[17px] text-(--kn-ink-soft)">
          {area ? area.note + "." : `${list.length} ${list.length === 1 ? "kitchen" : "kitchens"} delivering now. Real times, fees shown up front, and hot or it's on us.`}
        </p>

        <div className="kn-rail -mx-5 mt-8 flex gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-wrap lg:px-0">
          <Link href={href.restaurants} aria-current={!category && !area ? "true" : undefined} className="kn-chip pl-5">
            Everything
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={href.category(c.id)} aria-current={category?.id === c.id ? "true" : undefined} className="kn-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(c.image)} alt="" className="size-[44px] rounded-full object-cover" />
              {c.name}
            </Link>
          ))}
        </div>
        <div className="kn-rail -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-wrap lg:px-0">
          {AREAS.map((a) => (
            <Link key={a.id} href={href.area(a.id)} aria-current={area?.id === a.id ? "true" : undefined} className="kn-pill h-10 text-[14.5px]">
              {a.name}
            </Link>
          ))}
        </div>

        {list.length > 0 ? (
          <div className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r, i) => (
              <RestaurantCard key={r.slug} r={r} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-[28px] bg-(--kn-cream-deep) p-10 text-center">
            <p className="kn-title text-[22px]">Nothing here yet</p>
            <p className="mt-2 text-(--kn-ink-soft)">We&apos;re adding kitchens every week.</p>
            <Link href={href.restaurants} className="kn-btn kn-btn-red mt-6">
              See every kitchen
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
