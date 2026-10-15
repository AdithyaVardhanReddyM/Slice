import Link from "next/link";
import { ArrowRight, Clock, MapPin, Package, Truck } from "lucide-react";
import { FOLIO_BOOKS, FOLIO_EVENTS, FOLIO_SECTIONS, FOLIO_SHOP, bookBySlug, booksIn, dateParts, eventPhoto, href, newArrivals, photos, roleText, staff, staffPicks, type FolioEvent } from "@/lib/folio/shop";
import { JsonLd, bookJsonLd, eventJsonLd, storeJsonLd } from "@/lib/folio/jsonld";
import { BookCard } from "@/components/folio/book-card";
import { Cover } from "@/components/folio/cover";
import { NewsletterForm } from "@/components/folio/signup";
import { SITE } from "@/lib/site";

export default function FolioHome() {
  const arrivals = newArrivals();
  const picks = staffPicks();
  const clubPick = bookBySlug("small-things-like-these")!;
  const nextPick = bookBySlug("the-bee-sting")!;
  const debut = FOLIO_EVENTS.find((e) => e.slug === "debut-night")!;
  const others = FOLIO_EVENTS.filter((e) => e.slug !== "debut-night");

  const jsonld = {
    "@graph": [
      storeJsonLd(),
      {
        "@type": "ItemList",
        name: "New on our shelves",
        url: `${SITE}${href.newArrivals}`,
        itemListElement: arrivals.map((b, i) => ({ "@type": "ListItem", position: i + 1, item: bookJsonLd(b) })),
      },
      {
        "@type": "ItemList",
        name: "Staff picks",
        url: `${SITE}${href.staffPicks}`,
        itemListElement: picks.map((b, i) => ({ "@type": "ListItem", position: i + 1, item: bookJsonLd(b) })),
      },
      ...FOLIO_EVENTS.map(eventJsonLd),
    ],
  };

  return (
    <main>
      <JsonLd data={jsonld} />

      {/* Hero */}
      <section className="ff-container grid gap-12 pb-20 pt-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-16 lg:pt-16">
        <div>
          <p className="ff-label">Independent booksellers on Court Street since {FOLIO_SHOP.founded}</p>
          <h1 className="ff-display mt-4 text-[42px] text-(--ff-green) sm:text-[54px] lg:text-[62px]">Good books, picked by people who read them.</h1>
          <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-(--ff-ink-soft)">
            Folio &amp; Fern is a neighborhood bookshop in Carroll Gardens, Brooklyn: fourteen thousand books, a reading room in the back and six booksellers who will happily talk you into one more. Come in to browse, or order online
            for pickup and delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={href.newArrivals} className="ff-btn ff-btn-primary">
              Shop new arrivals
            </Link>
            <Link href={href.events} className="ff-btn ff-btn-outline">
              See what&apos;s on
            </Link>
          </div>
          <ul className="mt-10 grid gap-5 border-t border-(--ff-line) pt-6 text-[15px] leading-snug text-(--ff-ink-soft) sm:grid-cols-3">
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-(--ff-terracotta)" strokeWidth={1.75} />
              <span>
                <strong className="block font-semibold text-(--ff-ink)">Open every day</strong>
                Till 8pm, 9pm Fri and Sat
              </span>
            </li>
            <li className="flex gap-3">
              <Package className="mt-0.5 size-5 shrink-0 text-(--ff-terracotta)" strokeWidth={1.75} />
              <span>
                <strong className="block font-semibold text-(--ff-ink)">Pick up in an hour</strong>
                Order online, collect at the counter
              </span>
            </li>
            <li className="flex gap-3">
              <Truck className="mt-0.5 size-5 shrink-0 text-(--ff-terracotta)" strokeWidth={1.75} />
              <span>
                <strong className="block font-semibold text-(--ff-ink)">Free Brooklyn delivery</strong>
                On orders over $40
              </span>
            </li>
          </ul>
        </div>

        <div className="relative pb-8 lg:pb-0">
          <div className="aspect-[4/3] overflow-hidden rounded-[14px] lg:aspect-[5/6]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.shopReading.src} alt={photos.shopReading.alt} fetchPriority="high" className="h-full w-full object-cover" />
          </div>
          <Link
            href={href.bookClub}
            className="absolute -bottom-2 left-4 flex w-[min(320px,calc(100%-2rem))] items-center gap-4 rounded-[12px] bg-(--ff-card) p-4 shadow-[0_18px_40px_-18px_rgb(30_42_34/0.45)] ring-1 ring-(--ff-line) transition-transform hover:-translate-y-0.5 lg:-left-8 lg:bottom-10"
          >
            <Cover book={clubPick} className="w-14 shrink-0" />
            <span>
              <span className="ff-label block">October book club pick</span>
              <span className="ff-title mt-0.5 block text-[17px]">{clubPick.title}</span>
              <span className="mt-0.5 block text-[14px] text-(--ff-mute)">Thu, Oct 22 · 7pm · Reading room</span>
            </span>
          </Link>
        </div>
      </section>

      {/* New arrivals */}
      <section id="new" className="ff-container scroll-mt-32 pb-20">
        <SectionHead label="Just unpacked" title="New on our shelves" text="Fresh stock and new paperbacks from this month's deliveries." link={{ label: "Browse all books", to: href.books }} />
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-7">
          {arrivals.map((b, i) => (
            <BookCard key={b.slug} book={b} priority={i < 4} />
          ))}
        </div>
      </section>

      {/* Sections */}
      <section className="ff-container pb-20">
        <SectionHead label="Browse the shop" title="Find your shelf" text={`${FOLIO_BOOKS.length} books on the site, and thousands more in the shop. Ask us for anything; special orders usually arrive in two or three days.`} />
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {FOLIO_SECTIONS.map((s) => {
            const books = booksIn(s.id).slice(0, 3);
            return (
              <Link
                key={s.id}
                href={href.section(s.id)}
                className="group relative flex h-44 flex-col overflow-hidden rounded-[12px] border border-(--ff-line) bg-(--ff-card) p-4 transition-colors hover:border-(--ff-green) sm:h-52 sm:p-5"
              >
                <span className="ff-title text-[18px] sm:text-[20px]">{s.name}</span>
                <span className="mt-0.5 text-[14px] text-(--ff-mute)">{booksIn(s.id).length} books</span>
                <span className="absolute -bottom-3 right-3 flex items-end transition-transform group-hover:-translate-y-1.5 sm:right-5">
                  {books.map((b, i) => (
                    <Cover key={b.slug} book={b} className={i === 0 ? "w-[54px] sm:w-[68px]" : "-ml-4 w-[54px] sm:w-[68px]"} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Staff picks */}
      <section id="staff-picks" className="scroll-mt-32 bg-(--ff-paper-2) py-20">
        <div className="ff-container">
          <SectionHead
            label="From behind the counter"
            title="Staff picks"
            text="Our booksellers write these on cards and tuck them into the shelves. Here they are without the thumbtacks."
            link={{ label: "All books", to: href.books }}
          />
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {picks.map((b) => {
              const who = staff(b.staffNote.by);
              return (
                <article key={b.slug} className="flex gap-5 rounded-[12px] border-t-[3px] border-t-(--ff-terracotta) bg-(--ff-card) p-5 shadow-[0_1px_2px_rgb(30_42_34/0.08)]">
                  <Link href={href.book(b.slug)} className="w-[92px] shrink-0 pt-1" aria-label={b.title}>
                    <Cover book={b} className="w-full" />
                  </Link>
                  <div className="flex min-w-0 flex-col">
                    <p className="ff-label">{who.name.split(" ")[0]} recommends</p>
                    <h3 className="ff-title mt-1 text-[19px]">
                      <Link href={href.book(b.slug)} className="hover:underline hover:underline-offset-4">
                        {b.title}
                      </Link>
                    </h3>
                    <p className="text-[14.5px] text-(--ff-ink-soft)">{b.author}</p>
                    <blockquote className="mt-3 text-[15.5px] leading-relaxed">&ldquo;{b.staffNote.text}&rdquo;</blockquote>
                    <p className="mt-auto pt-3 text-[14.5px]">
                      <span className="font-semibold">{b.price}</span>
                      <span className="text-(--ff-mute)"> · {who.name}, {roleText(who.role)}</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Events */}
      <section id="events" className="ff-container scroll-mt-32 py-20">
        <SectionHead label="In the reading room" title="What's on" text="Readings, book clubs and Story Hour. Everything is free unless it says otherwise." link={{ label: "All events", to: href.events }} />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <article className="overflow-hidden rounded-[14px] bg-(--ff-card) ring-1 ring-(--ff-line)">
            <div className="aspect-[16/9] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos.authorTalk.src} alt={photos.authorTalk.alt} loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="p-6 sm:p-8">
              <p className="ff-label">
                {debut.date} · {debut.time}
              </p>
              <h3 className="ff-display mt-2 text-[30px]">{debut.title}</h3>
              <p className="mt-3 text-[16.5px] leading-relaxed text-(--ff-ink-soft)">{debut.description}</p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                {debut.readers?.map((r) => (
                  <li key={r.name} className="rounded-[10px] bg-(--ff-paper) p-3.5">
                    <span className="block text-[15px] font-semibold">{r.name}</span>
                    <span className="ff-title block text-[15px] text-(--ff-green)">{r.book}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Link href={href.event(debut.slug)} className="ff-btn ff-btn-primary">
                  Save a seat
                </Link>
                <span className="text-[15px] text-(--ff-mute)">{debut.price}</span>
              </div>
            </div>
          </article>

          <ol className="flex flex-col divide-y divide-(--ff-line) border-y border-(--ff-line)">
            {others.map((e) => (
              <EventRow key={e.slug} e={e} />
            ))}
          </ol>
        </div>
      </section>

      {/* Book club */}
      <section className="bg-(--ff-green) text-(--ff-paper)">
        <div className="ff-container grid gap-10 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-20">
          <div className="aspect-[4/3] overflow-hidden rounded-[14px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.bookClub.src} alt={photos.bookClub.alt} loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-(--ff-terracotta-tint)">The Folio &amp; Fern Book Club</p>
            <h2 className="ff-display mt-3 text-[36px] sm:text-[44px]">One book a month, one long table, plenty of tea.</h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-(--ff-paper)/85">
              We meet in the reading room on the fourth Thursday of the month. Anyone can come; members get 10% off each pick and first seats at author events. Our science fiction club, Other Worlds, meets the second Tuesday.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                { label: "October", when: "Thursday, October 22", book: clubPick },
                { label: "November", when: "Thursday, November 19", book: nextPick },
              ].map((m) => (
                <Link key={m.label} href={href.book(m.book.slug)} className="flex items-center gap-4 rounded-[12px] bg-(--ff-paper)/8 p-3.5 ring-1 ring-(--ff-paper)/15 transition-colors hover:bg-(--ff-paper)/12">
                  <Cover book={m.book} className="w-12 shrink-0" />
                  <span>
                    <span className="block text-[13.5px] text-(--ff-paper)/70">{m.label}</span>
                    <span className="ff-title block text-[17px]">{m.book.title}</span>
                    <span className="block text-[13.5px] text-(--ff-paper)/70">{m.when}</span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={href.bookClub} className="ff-btn ff-btn-light">
                Join the book club
              </Link>
              <Link href={href.event("other-worlds")} className="ff-btn border-[1.5px] border-(--ff-paper)/50 text-(--ff-paper) hover:bg-(--ff-paper)/10">
                Other Worlds club
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="ff-container grid scroll-mt-32 gap-10 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
        <div className="aspect-[4/3] overflow-hidden rounded-[14px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos.storefront.src} alt={photos.storefront.alt} loading="lazy" className="h-full w-full object-cover" />
        </div>
        <div>
          <p className="ff-label">Visit</p>
          <h2 className="ff-display mt-2 text-[36px] text-(--ff-green) sm:text-[42px]">Come in and browse</h2>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-(--ff-ink-soft)">
            Look for the green door on Court Street, two blocks from the F and G at Carroll Street. The kids&apos; corner is at the front, the reading room is at the back, and the cat is usually in the window.
          </p>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div className="flex gap-3">
              <MapPin className="mt-1 size-5 shrink-0 text-(--ff-terracotta)" strokeWidth={1.75} />
              <address className="text-[16px] not-italic leading-relaxed">
                {FOLIO_SHOP.street}
                <br />
                {FOLIO_SHOP.city}, {FOLIO_SHOP.region} {FOLIO_SHOP.postalCode}
                <br />
                <a href={`tel:${FOLIO_SHOP.phone.replace(/[^\d+]/g, "")}`} className="ff-link">
                  {FOLIO_SHOP.phone}
                </a>
              </address>
            </div>
            <div className="flex gap-3">
              <Clock className="mt-1 size-5 shrink-0 text-(--ff-terracotta)" strokeWidth={1.75} />
              <dl className="text-[16px] leading-relaxed">
                {FOLIO_SHOP.hours.map((h) => (
                  <div key={h.short} className="flex gap-3">
                    <dt className="w-[4.5rem] shrink-0 text-(--ff-ink-soft)">{h.short}</dt>
                    <dd>{h.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`mailto:${FOLIO_SHOP.email}`} className="ff-btn ff-btn-outline">
              Email the shop
            </a>
            <Link href={href.event("story-hour")} className="ff-btn text-(--ff-green) hover:bg-(--ff-paper-2)">
              Saturday Story Hour <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section id="newsletter" className="ff-container scroll-mt-32 pb-20">
        <div className="grid gap-8 rounded-[16px] bg-(--ff-green-tint) px-6 py-10 sm:px-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16 lg:px-14 lg:py-12">
          <div>
            <h2 className="ff-display text-[32px] text-(--ff-green) sm:text-[38px]">The Fern Letter</h2>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-(--ff-ink-soft)">
              New arrivals, staff picks and the events calendar, every other Friday. Written by the booksellers, and never more than a five-minute read.
            </p>
          </div>
          <div className="w-full lg:w-[440px]">
            <NewsletterForm tone="light" />
            <p className="mt-3 text-[13.5px] text-(--ff-mute)">We never share your address. Unsubscribe any time.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHead({ label, title, text, link }: { label: string; title: string; text?: string; link?: { label: string; to: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="max-w-2xl">
        <p className="ff-label">{label}</p>
        <h2 className="ff-display mt-2 text-[34px] text-(--ff-green) sm:text-[40px]">{title}</h2>
        {text && <p className="mt-2 text-[17px] text-(--ff-ink-soft)">{text}</p>}
      </div>
      {link && (
        <Link href={link.to} className="inline-flex items-center gap-1.5 text-[15.5px] font-semibold text-(--ff-green) hover:underline hover:underline-offset-4">
          {link.label} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function EventRow({ e }: { e: FolioEvent }) {
  const d = dateParts(e);
  const photo = eventPhoto(e);
  return (
    <li>
      <Link href={href.event(e.slug)} className="group grid grid-cols-[64px_1fr] gap-5 py-5 sm:grid-cols-[64px_1fr_auto]">
        <span className="flex h-[68px] flex-col items-center justify-center rounded-[10px] bg-(--ff-card) ring-1 ring-(--ff-line)">
          <span className="text-[13px] font-semibold text-(--ff-terracotta-deep)">{d.month}</span>
          <span className="ff-title text-[26px] leading-none">{d.day}</span>
        </span>
        <span className="min-w-0">
          <span className="text-[14px] text-(--ff-mute)">
            {e.kind} · {d.weekday} {e.time}
            {e.recurring ? ` · ${e.recurring}` : ""}
          </span>
          <span className="ff-title mt-0.5 block text-[19px] group-hover:underline group-hover:underline-offset-4">{e.title}</span>
          <span className="mt-1 line-clamp-2 text-[15px] leading-snug text-(--ff-ink-soft)">{e.description}</span>
        </span>
        {photo && (
          <span className="hidden h-[68px] w-[96px] overflow-hidden rounded-[8px] sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </span>
        )}
      </Link>
    </li>
  );
}
