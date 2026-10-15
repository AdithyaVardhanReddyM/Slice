import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, Package, Truck } from "lucide-react";
import { FOLIO_BOOKS, FOLIO_EVENTS, FOLIO_SHOP, bookBySlug, href, moreLike, roleText, section, staff } from "@/lib/folio/shop";
import { JsonLd, bookJsonLd } from "@/lib/folio/jsonld";
import { AddToBag } from "@/components/folio/bag";
import { BookCard } from "@/components/folio/book-card";
import { Cover } from "@/components/folio/cover";

export function generateStaticParams() {
  return FOLIO_BOOKS.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/folio/books/[slug]">) {
  const { slug } = await params;
  const b = bookBySlug(slug);
  if (!b) return { title: "Book" };
  return { title: `${b.title} by ${b.author}`, description: b.description, openGraph: { images: [{ url: b.cover, alt: `${b.title} cover` }] } };
}

export default async function BookPage({ params }: PageProps<"/folio/books/[slug]">) {
  const { slug } = await params;
  const b = bookBySlug(slug);
  if (!b) notFound();
  const s = section(b.section);
  const note = b.staffNote ? { ...b.staffNote, who: staff(b.staffNote.by) } : null;
  const event = FOLIO_EVENTS.find((e) => e.bookSlug === b.slug);
  const more = moreLike(b, 4);

  return (
    <main className="ff-container pb-20 pt-8">
      <JsonLd data={bookJsonLd(b)} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[14.5px] text-(--ff-mute)">
        <Link href={href.books} className="hover:text-(--ff-green) hover:underline hover:underline-offset-4">
          Books
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={href.section(s.id)} className="hover:text-(--ff-green) hover:underline hover:underline-offset-4">
          {s.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-(--ff-ink-soft)">{b.title}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="flex items-start justify-center rounded-[14px] bg-(--ff-paper-2) px-[14%] py-12 md:sticky md:top-32 md:self-start">
          <Cover book={b} priority className="w-full max-w-[340px]" />
        </div>

        <div>
          <Link href={href.section(s.id)} className="ff-label hover:underline hover:underline-offset-4">
            {s.name}
          </Link>
          <h1 className="ff-display mt-2 text-[38px] text-(--ff-green) sm:text-[48px]">{b.title}</h1>
          <p className="mt-2 text-[19px] text-(--ff-ink-soft)">
            by <span className="font-semibold text-(--ff-ink)">{b.author}</span>
          </p>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-(--ff-line) pt-6">
            <span className="text-[28px] font-semibold">{b.price}</span>
            <span className="text-[16px] text-(--ff-mute)">
              {b.format} · First published {b.year}
              {b.ages ? ` · ${b.ages}` : ""}
            </span>
          </div>
          <p className="mt-3 flex items-center gap-2 text-[15.5px] text-(--ff-green)">
            <Check className="size-4" strokeWidth={2.5} /> In stock at {FOLIO_SHOP.street}. Ready for pickup within the hour.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <AddToBag slug={b.slug} title={b.title} />
            <Link href={href.visit} className="ff-btn ff-btn-outline">
              Visit the shop
            </Link>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-(--ff-ink-soft)">
            <li className="flex items-center gap-2">
              <Truck className="size-4 text-(--ff-terracotta)" strokeWidth={1.75} /> Free Brooklyn delivery over $40
            </li>
            <li className="flex items-center gap-2">
              <Package className="size-4 text-(--ff-terracotta)" strokeWidth={1.75} /> Gift wrapping on request
            </li>
          </ul>

          <p className="mt-8 max-w-2xl text-[18px] leading-relaxed">{b.description}</p>

          {note && (
            <figure className="mt-8 max-w-2xl rounded-[12px] border-t-[3px] border-t-(--ff-terracotta) bg-(--ff-card) p-6 shadow-[0_1px_2px_rgb(30_42_34/0.08)]">
              <p className="ff-label">{note.who.name.split(" ")[0]} recommends</p>
              <blockquote className="ff-title mt-2 text-[21px] leading-snug text-(--ff-ink)">&ldquo;{note.text}&rdquo;</blockquote>
              <figcaption className="mt-3 text-[14.5px] text-(--ff-mute)">
                {note.who.name}, {roleText(note.who.role)}
              </figcaption>
            </figure>
          )}

          {event && (
            <Link href={href.event(event.slug)} className="mt-6 flex max-w-2xl items-center justify-between gap-4 rounded-[12px] bg-(--ff-green-tint) p-5 transition-colors hover:bg-(--ff-green-tint)/70">
              <span>
                <span className="block text-[14px] font-semibold text-(--ff-green)">{event.kind === "Book club" ? "Read it with us" : "At the shop"}</span>
                <span className="ff-title block text-[19px]">{event.title}</span>
                <span className="block text-[14.5px] text-(--ff-ink-soft)">
                  {event.date}, {event.time} · {event.place}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-(--ff-green)" />
            </Link>
          )}

          <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-4 border-t border-(--ff-line) pt-6 text-[15.5px] sm:grid-cols-4">
            <Meta k="Author" v={b.author} />
            <Meta k="Format" v={b.format} />
            <Meta k="First published" v={String(b.year)} />
            <Meta k="Section" v={s.name} />
          </dl>
          <ul className="mt-6 flex max-w-2xl flex-wrap gap-2" aria-label="Topics">
            {b.tags.map((t) => (
              <li key={t}>
                <Link href={href.search(t)} className="inline-block rounded-full border border-(--ff-line) bg-(--ff-card) px-3 py-1 text-[14px] text-(--ff-ink-soft) hover:border-(--ff-green) hover:text-(--ff-green)">
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-20">
        <h2 className="ff-display text-[30px] text-(--ff-green)">If you like this</h2>
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-7">
          {more.map((m) => (
            <BookCard key={m.slug} book={m} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[13.5px] text-(--ff-mute)">{k}</dt>
      <dd className="mt-0.5 font-semibold">{v}</dd>
    </div>
  );
}
