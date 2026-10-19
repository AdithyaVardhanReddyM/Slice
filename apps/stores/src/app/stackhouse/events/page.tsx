import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Ticket } from "lucide-react";
import { FOLIO_EVENTS, bookBySlug, dateParts, eventPhoto, href, lowerFirst } from "@/lib/stackhouse/shop";
import { JsonLd, eventJsonLd } from "@/lib/stackhouse/jsonld";
import { Cover } from "@/components/stackhouse/cover";
import { RsvpForm } from "@/components/stackhouse/signup";

export const metadata: Metadata = {
  title: "Events",
  description: "Book clubs, author readings, poetry nights and Saturday Story Hour in the reading room at Stackhouse Books, Carroll Gardens.",
};

export default function EventsPage() {
  return (
    <main className="pb-20">
      <JsonLd data={{ "@graph": FOLIO_EVENTS.map(eventJsonLd) }} />
      <div className="border-b border-(--ff-line) bg-(--ff-paper-2)">
        <div className="ff-container py-12">
          <h1 className="ff-display text-[42px] text-(--ff-green) sm:text-[52px]">What&apos;s on</h1>
          <p className="mt-2 max-w-2xl text-[17px] text-(--ff-ink-soft)">
            Everything happens in the reading room at the back of the shop, which seats about forty. Events are free unless they say otherwise; saving a seat helps us put out enough chairs (and wine).
          </p>
        </div>
      </div>

      <div className="ff-container mt-12 flex flex-col gap-8">
        {FOLIO_EVENTS.map((e) => {
          const d = dateParts(e);
          const photo = eventPhoto(e);
          const book = e.bookSlug ? bookBySlug(e.bookSlug) : undefined;
          return (
            <article key={e.slug} id={e.slug} className="grid scroll-mt-32 overflow-hidden rounded-[14px] bg-(--ff-card) ring-1 ring-(--ff-line) lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <div className="relative min-h-[220px] bg-(--ff-paper-2)">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.src} alt={photo.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                ) : book ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    <Cover book={book} className="max-h-full w-[140px]" />
                  </div>
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-(--ff-green-tint)">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/stackhouse/mark.svg" alt="" className="size-24 rounded-[20px]" />
                  </div>
                )}
                <span className="absolute left-4 top-4 flex h-[72px] w-[64px] flex-col items-center justify-center rounded-[10px] bg-(--ff-card) shadow-sm">
                  <span className="text-[13px] font-semibold text-(--ff-terracotta-deep)">{d.month}</span>
                  <span className="ff-title text-[28px] leading-none">{d.day}</span>
                </span>
              </div>
              <div className="p-6 sm:p-8">
                <p className="ff-label">
                  {e.kind}
                  {e.recurring ? `, ${lowerFirst(e.recurring)}` : ""}
                </p>
                <h2 className="ff-display mt-2 text-[30px] text-(--ff-green)">{e.title}</h2>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[15px] text-(--ff-ink-soft)">
                  <li className="flex items-center gap-2">
                    <Clock className="size-4 text-(--ff-terracotta)" strokeWidth={1.75} />
                    {e.date}, {e.time}
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4 text-(--ff-terracotta)" strokeWidth={1.75} />
                    {e.place}
                  </li>
                  <li className="flex items-center gap-2">
                    <Ticket className="size-4 text-(--ff-terracotta)" strokeWidth={1.75} />
                    {e.price}
                  </li>
                </ul>
                <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed">{e.description}</p>
                {e.readers && (
                  <ul className="mt-5 grid gap-3 sm:grid-cols-3">
                    {e.readers.map((r) => (
                      <li key={r.name} className="rounded-[10px] bg-(--ff-paper) p-4">
                        <span className="block text-[15px] font-semibold">{r.name}</span>
                        <span className="ff-title block text-[16px] text-(--ff-green)">{r.book}</span>
                        <span className="mt-1 block text-[14.5px] leading-snug text-(--ff-ink-soft)">{r.line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {book && (
                  <p className="mt-4 text-[15px] text-(--ff-ink-soft)">
                    On the table:{" "}
                    <Link href={href.book(book.slug)} className="ff-link font-semibold text-(--ff-green)">
                      {book.title}
                    </Link>{" "}
                    by {book.author}, {book.price}
                  </p>
                )}
                {e.host && <p className="mt-1 text-[15px] text-(--ff-mute)">Hosted by {e.host}</p>}
                <div className="mt-6 max-w-2xl">
                  <RsvpForm slug={e.slug} title={e.title} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
