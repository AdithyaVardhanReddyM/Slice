import Link from "next/link";
import { BellRing, CalendarCheck, Search, Smartphone } from "lucide-react";
import { londonMinutes, londonToday, nearestTimes, showingDay } from "@/lib/covers/booking";
import { COVERS_AREAS, COVERS_COLLECTIONS, COVERS_EDITORS, COVERS_RESTAURANTS, editorsNotes, href, newOnCovers, photo, priceLabel, restaurantBySlug } from "@/lib/covers/site";
import { JsonLd, organizationJsonLd, restaurantJsonLd } from "@/lib/covers/jsonld";
import { AreaRow, CollectionTile, EditorAvatar, NoteCard, SectionHead } from "@/components/covers/blocks";
import { Rail } from "@/components/covers/rail";
import { RestaurantCard } from "@/components/covers/restaurant-card";
import { SearchBar } from "@/components/covers/search-bar";
import { SITE } from "@/lib/site";

const tonight = ["the-palomar", "smoking-goat", "sessions-arts-club", "padella", "hoppers-soho", "the-barbary", "bubala", "berenjak-soho", "quo-vadis", "darjeeling-express"];
const notes = ["brat", "kiln", "the-wolseley", "noble-rot", "rochelle-canteen", "brawn"];

// Free tables move through the evening, so the page is rebuilt every few minutes.
export const revalidate = 300;

const pick = (slugs: string[]) => slugs.map((s) => restaurantBySlug(s)!).filter(Boolean);

export default function CoversHome() {
  const today = londonToday();
  const { day, after, tonight: isTonight } = showingDay(today, londonMinutes());
  const when = isTonight ? {} : { date: day };
  const hero = restaurantBySlug("clos-maggiore")!;
  const rail = pick(tonight);
  const noted = editorsNotes().filter((r) => notes.includes(r.slug)).sort((a, b) => notes.indexOf(a.slug) - notes.indexOf(b.slug));
  const fresh = newOnCovers();
  const phone = pick(["kiln", "the-palomar", "hoppers-soho"]);

  const jsonld = {
    "@graph": [
      organizationJsonLd(),
      {
        "@type": "ItemList",
        name: isTonight ? "Tables tonight" : "Tables tomorrow",
        url: `${SITE}${href.home}`,
        itemListElement: rail.map((r, i) => ({ "@type": "ListItem", position: i + 1, item: restaurantJsonLd(r) })),
      },
    ],
  };

  return (
    <main>
      <JsonLd data={jsonld} />

      {/* Hero */}
      <section className="px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[24px] bg-(--cv-ink)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo(hero, 1800)} alt={hero.photo.alt} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-(--cv-ink)/50" />
          <div className="cv-container relative flex min-h-[600px] flex-col justify-end pb-6 pt-24 sm:pb-8 lg:min-h-[640px] lg:pb-10">
            <h1 className="cv-display max-w-3xl text-[44px] text-white sm:text-[60px] lg:text-[76px]">Book London&apos;s best tables.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-white/90 sm:text-[19px]">
              {COVERS_RESTAURANTS.length} restaurants we&apos;d send a friend to, from Soho counter seats to Mayfair dining rooms. Pick a time and the table&apos;s yours.
            </p>
            <SearchBar className="mt-8 max-w-[1100px]" />
            <Link href={href.restaurant(hero.slug)} className="mt-5 hidden self-end text-[13px] text-white/75 hover:text-white lg:block">
              {hero.name}, {hero.neighbourhood}
            </Link>
          </div>
        </div>
      </section>

      {/* Tables tonight */}
      <section className="cv-container pt-16 sm:pt-20">
        <Rail
          label={isTonight ? "Tables tonight" : "Tables tomorrow"}
          head={
            <SectionHead
              title={isTonight ? "Tables tonight" : "Tables tomorrow"}
              text={isTonight ? "Free tables for two this evening. Tap a time and it's yours." : "Tonight's done; here's tomorrow evening for two. Tap a time and it's yours."}
              link={{ label: "All restaurants", to: href.restaurants }}
            />
          }
        >
          {rail.map((r) => (
            <RestaurantCard key={r.slug} r={r} times={nearestTimes(r, day, 2, undefined, 3, after)} query={{ ...when, party: 2 }} />
          ))}
        </Rail>
      </section>

      {/* Collections */}
      <section className="cv-container pt-20 sm:pt-24">
        <SectionHead title="Collections" text="Lists our editors keep up to date, so you never have to start from a blank search box." link={{ label: "All collections", to: href.collections }} />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {COVERS_COLLECTIONS.map((c) => (
            <CollectionTile key={c.id} c={c} />
          ))}
        </div>
      </section>

      {/* Editors' notes */}
      <section id="editors" className="mt-20 scroll-mt-20 bg-(--cv-muted) py-20 sm:mt-24 sm:py-24">
        <div className="cv-container">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <SectionHead title="Editors' notes" text="Rosa, Kwame and Hattie eat out most nights of the week. When they know the table to ask for or the dish to order first, it goes on the restaurant's page." />
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {COVERS_EDITORS.map((e) => (
                <li key={e.id} className="flex items-center gap-2.5">
                  <EditorAvatar id={e.id} />
                  <span className="text-[14px] leading-tight">
                    <span className="block font-semibold">{e.name}</span>
                    <span className="text-(--cv-mute)">{e.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="cv-scroll -mx-5 mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-3">
            {noted.map((r) => (
              <NoteCard key={r.slug} r={r} className="w-[84%] shrink-0 snap-start md:w-auto" />
            ))}
          </div>
        </div>
      </section>

      {/* Areas */}
      <section className="cv-container pt-20 sm:pt-24">
        <SectionHead title="Eat by area" text="From Redchurch Street to Peckham, the neighbourhoods we know best." link={{ label: "All areas", to: href.areas }} />
        <div className="mt-8 grid gap-x-8 gap-y-2 md:grid-cols-2">
          {COVERS_AREAS.map((a) => (
            <AreaRow key={a.id} a={a} className="-mx-2" />
          ))}
        </div>
      </section>

      {/* New on Covers */}
      <section className="cv-container pt-20 sm:pt-24">
        <SectionHead title="New on Covers" text="Restaurants that joined in the last few weeks. Tables are open now." link={{ label: "All restaurants", to: href.restaurants }} />
        <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {fresh.map((r) => (
            <RestaurantCard key={r.slug} r={r} times={nearestTimes(r, day, 2, undefined, 3, after)} query={{ ...when, party: 2 }} />
          ))}
        </div>
      </section>

      {/* How Covers works */}
      <section id="how" className="cv-container scroll-mt-20 pt-20 sm:pt-24">
        <SectionHead title="How Covers works" />
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { icon: Search, title: "Find a table", text: "Search by area, day and party size, or start from a collection. Every restaurant on Covers is one we'd book ourselves." },
            { icon: CalendarCheck, title: "Book in two taps", text: "Pick a time and the table's yours. There's no booking fee, and most restaurants don't ask for a card." },
            { icon: BellRing, title: "Turn up hungry", text: "We'll remind you the day before. If plans change, cancel in the app and the table goes to someone else." },
          ].map((s, i) => (
            <li key={s.title} className="cv-card p-6 sm:p-7">
              <span className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-(--cv-primary-tint) text-(--cv-accent)">
                  <s.icon className="size-[22px]" strokeWidth={1.9} />
                </span>
                <span className="text-[14px] font-medium text-(--cv-mute)">Step {i + 1}</span>
              </span>
              <h3 className="cv-title mt-5 text-[21px]">{s.title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-(--cv-ink-soft)">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* App */}
      <section id="app" className="cv-container scroll-mt-20 py-20 sm:py-24">
        <div className="grid overflow-hidden rounded-[24px] bg-(--cv-ink) text-white lg:grid-cols-[1.1fr_1fr]">
          <div className="px-6 py-12 sm:px-12 sm:py-16 lg:py-20">
            <h2 className="cv-display text-[34px] sm:text-[44px]">Your table, in your pocket.</h2>
            <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/80">
              Book, move and cancel in the Covers app, keep a list of places to try, and read the editors&apos; notes on the way there.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="cv-btn bg-white text-(--cv-ink) hover:bg-(--cv-bg)">
                <Smartphone className="size-[18px]" strokeWidth={2} /> Get it for iPhone
              </button>
              <button type="button" className="cv-btn shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.35)] hover:shadow-[inset_0_0_0_1.5px_white]">
                <Smartphone className="size-[18px]" strokeWidth={2} /> Get it for Android
              </button>
            </div>
            <p className="mt-5 text-[14px] text-white/55">Free on iOS and Android. Booking on the website works just as well.</p>
          </div>

          <div className="relative hidden h-[460px] sm:block lg:h-auto">
            <div className="absolute left-1/2 top-12 w-[300px] -translate-x-1/2 rounded-[46px] bg-black p-[10px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/15">
              <div className="h-[560px] overflow-hidden rounded-[36px] bg-(--cv-bg) text-(--cv-ink)">
                <div className="flex items-center justify-between px-5 pb-3 pt-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/covers/logo.svg" alt="" width={172} height={40} className="h-6 w-auto" />
                  <EditorAvatar id="rosa" className="size-7 text-[11px]" />
                </div>
                <div className="px-5">
                  <p className="cv-title text-[20px]">{isTonight ? "Tonight" : "Tomorrow"}, 2 people</p>
                  <p className="text-[12.5px] text-(--cv-mute)">Soho, around 19:30</p>
                </div>
                <ul className="mt-4 space-y-3 px-3">
                  {phone.map((r) => (
                    <li key={r.slug} className="rounded-[16px] bg-white p-2.5 shadow-[0_0_0_1px_rgb(27_26_24/0.06)]">
                      <div className="flex gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo(r, 200)} alt="" loading="lazy" className="size-14 shrink-0 rounded-[10px] object-cover" />
                        <div className="min-w-0">
                          <p className="cv-title truncate text-[15px]">{r.name}</p>
                          <p className="truncate text-[12px] text-(--cv-mute)">
                            {r.cuisine}, {priceLabel(r.price)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        {nearestTimes(r, day, 2, undefined, 3, after).map((t) => (
                          <span key={t} className="flex-1 rounded-full bg-(--cv-primary) py-1.5 text-center text-[12px] font-semibold text-(--cv-on-primary) tabular-nums">
                            {t}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
