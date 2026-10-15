import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { FOLIO_BOOKS, FOLIO_SECTIONS, booksIn, href, searchBooks } from "@/lib/stackhouse/shop";
import { BookCard } from "@/components/stackhouse/book-card";

export const metadata: Metadata = {
  title: "Books",
  description: "Browse Stackhouse Books by shelf: literary and translated fiction, sci-fi and fantasy, crime, ideas, poetry, cookbooks, and kids' books.",
};

export default async function BooksPage({ searchParams }: PageProps<"/stackhouse/books">) {
  const { q: raw } = await searchParams;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const results = q ? searchBooks(q) : [];

  return (
    <main className="pb-20">
      <div className="border-b border-(--ff-line) bg-(--ff-paper-2)">
        <div className="ff-container py-12">
          <h1 className="ff-display text-[42px] text-(--ff-green) sm:text-[52px]">Books</h1>
          <p className="mt-2 max-w-2xl text-[17px] text-(--ff-ink-soft)">
            {FOLIO_BOOKS.length} books online, thousands more on the shelves. Can&apos;t find it? We can order almost anything in print, usually in two or three days.
          </p>
          <form action={href.books} className="relative mt-6 flex max-w-xl gap-2" role="search">
            <label htmlFor="ff-books-q" className="sr-only">
              Search books
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-(--ff-mute)" strokeWidth={2} />
            <input id="ff-books-q" name="q" type="search" defaultValue={q} placeholder="Title, author or a mood, like 'cozy'" className="ff-input flex-1 pl-10" />
            <button type="submit" className="ff-btn ff-btn-primary">
              Search
            </button>
          </form>
          <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2">
            {FOLIO_SECTIONS.map((s) => (
              <Link key={s.id} href={href.section(s.id)} className="rounded-full border border-(--ff-line) bg-(--ff-card) px-3.5 py-1.5 text-[14.5px] font-semibold text-(--ff-ink-soft) hover:border-(--ff-green) hover:text-(--ff-green)">
                {s.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {q ? (
        <section className="ff-container pt-12">
          <h2 className="ff-title text-[26px]">
            {results.length} {results.length === 1 ? "book" : "books"} for &ldquo;{q}&rdquo;
          </h2>
          {results.length === 0 && (
            <p className="mt-3 text-[17px] text-(--ff-ink-soft)">
              Nothing on the site yet. Call us on the shop phone or{" "}
              <Link href={href.books} className="ff-link">
                browse every shelf
              </Link>
              ; we can probably get it in.
            </p>
          )}
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-7">
            {results.map((b) => (
              <BookCard key={b.slug} book={b} />
            ))}
          </div>
        </section>
      ) : (
        FOLIO_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="ff-container scroll-mt-32 pt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-(--ff-line) pb-3">
              <h2 className="ff-display text-[30px] text-(--ff-green)">{s.name}</h2>
              <p className="text-[15.5px] text-(--ff-mute)">{s.blurb}</p>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-7">
              {booksIn(s.id).map((b) => (
                <BookCard key={b.slug} book={b} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
