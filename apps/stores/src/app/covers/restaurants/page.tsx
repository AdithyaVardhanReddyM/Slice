import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DEFAULT_PARTY, DEFAULT_TIME, londonMinutes, londonToday, longDate, nearestTimes, parseBooking, showingDay, type BookingQuery } from "@/lib/covers/booking";
import { COVERS_AREAS, COVERS_COLLECTIONS, COVERS_RESTAURANTS, areaById, collectionById, countLabel, filterRestaurants, href, priceLabel, type Filters } from "@/lib/covers/site";
import { ChipRow } from "@/components/covers/chip-row";
import { RestaurantCard } from "@/components/covers/restaurant-card";
import { SearchBar } from "@/components/covers/search-bar";

type Params = Awaited<PageProps<"/covers/restaurants">["searchParams"]>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function readFilters(sp: Params): Filters {
  const price = Number(first(sp.price));
  return {
    area: areaById(first(sp.area) ?? "")?.id,
    collection: collectionById(first(sp.collection) ?? "")?.id,
    price: price >= 1 && price <= 4 ? price : undefined,
  };
}

function heading({ area, collection }: Filters) {
  const a = area ? areaById(area) : undefined;
  const c = collection ? collectionById(collection) : undefined;
  if (a && c) return { title: `${c.name} in ${a.name}`, text: c.blurb };
  if (c) return { title: c.name, text: c.blurb };
  if (a) return { title: `Restaurants in ${a.name}`, text: a.blurb };
  return { title: "Restaurants in London", text: `All ${COVERS_RESTAURANTS.length} restaurants on Covers, with the next free tables at each.` };
}

export async function generateMetadata({ searchParams }: PageProps<"/covers/restaurants">): Promise<Metadata> {
  const { title, text } = heading(readFilters(await searchParams));
  return { title, description: text };
}

export default async function RestaurantsPage({ searchParams }: PageProps<"/covers/restaurants">) {
  const sp = await searchParams;
  const today = londonToday();
  const now = londonMinutes();
  const filters = readFilters(sp);
  const booking = parseBooking(sp, today);
  const searched = !!(booking.date || booking.party || booking.time);
  const party = booking.party ?? DEFAULT_PARTY;
  const date = booking.date ?? showingDay(today, now).day;
  const after = date === today ? now + 30 : -1;
  const time = booking.time ?? DEFAULT_TIME;
  const list = filterRestaurants(filters);
  const { title, text } = heading(filters);
  const query: BookingQuery = searched ? booking : {};
  const link = (patch: Filters) => href.search({ ...filters, ...booking, ...patch });

  return (
    <main className="pb-24">
      <div className="border-b border-(--cv-line) bg-white">
        <div className="cv-container pb-8 pt-10 sm:pt-12">
          <nav aria-label="Breadcrumb" className="text-[14px] text-(--cv-mute)">
            <Link href={href.home} className="hover:text-(--cv-ink)">
              Covers
            </Link>
            <span className="px-2">/</span>
            <Link href={href.restaurants} className="hover:text-(--cv-ink)">
              Restaurants
            </Link>
          </nav>
          <h1 className="cv-display mt-3 text-[36px] sm:text-[48px]">{title}</h1>
          <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-(--cv-ink-soft)">{text}</p>
          <SearchBar
            key={`${filters.area}|${booking.date}|${booking.party}|${booking.time}`}
            variant="compact"
            initial={{ area: filters.area, date: booking.date, party: booking.party, time: booking.time }}
            keep={{ collection: filters.collection, price: filters.price }}
            className="mt-7"
          />
        </div>
      </div>

      <div className="cv-container mt-8 space-y-3">
        <FilterRow label="Area" active={filters.area ?? ""}>
          <Chip to={link({ area: undefined })} on={!filters.area}>
            All areas
          </Chip>
          {COVERS_AREAS.map((a) => (
            <Chip key={a.id} to={link({ area: a.id })} on={filters.area === a.id}>
              {a.name}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Collection" active={filters.collection ?? ""}>
          <Chip to={link({ collection: undefined })} on={!filters.collection}>
            Any
          </Chip>
          {COVERS_COLLECTIONS.map((c) => (
            <Chip key={c.id} to={link({ collection: c.id })} on={filters.collection === c.id}>
              {c.name}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Price" active={String(filters.price ?? "")}>
          <Chip to={link({ price: undefined })} on={!filters.price}>
            Any
          </Chip>
          {[1, 2, 3, 4].map((p) => (
            <Chip key={p} to={link({ price: p })} on={filters.price === p}>
              {priceLabel(p)}
            </Chip>
          ))}
        </FilterRow>
      </div>

      <section className="cv-container mt-10" aria-label="Results">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-(--cv-line) pb-4">
          <p className="text-[16px]">
            <span className="font-semibold">{countLabel(list.length)}</span>
            <span className="text-(--cv-mute)">
              {" "}
              with free tables for {party}, {date === today ? "today" : longDate(date)}, around {time}
            </span>
          </p>
          {(filters.area || filters.collection || filters.price) && (
            <Link href={href.search(booking)} className="text-[15px] font-semibold text-(--cv-accent) hover:underline hover:underline-offset-4">
              Clear filters
            </Link>
          )}
        </div>

        {list.length > 0 ? (
          <div className="mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r, i) => (
              <RestaurantCard key={r.slug} r={r} times={nearestTimes(r, date, party, time, 4, after)} query={date === today ? query : { ...query, date }} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="cv-title text-[22px]">Nothing matches all of those.</p>
            <p className="mt-2 text-[16px] text-(--cv-ink-soft)">Try another price or area, or start again from everything.</p>
            <Link href={href.search(booking)} className="cv-btn cv-btn-primary mt-6">
              Show all restaurants
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function FilterRow({ label, active, children }: { label: string; active: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
      <span className="shrink-0 text-[14px] font-semibold text-(--cv-ink-soft) lg:w-24 lg:pt-2">{label}</span>
      <ChipRow active={active}>{children}</ChipRow>
    </div>
  );
}

function Chip({ to, on, children }: { to: string; on: boolean; children: ReactNode }) {
  return (
    <Link href={to} scroll={false} aria-current={on ? "true" : undefined} className="cv-chip">
      {children}
    </Link>
  );
}
