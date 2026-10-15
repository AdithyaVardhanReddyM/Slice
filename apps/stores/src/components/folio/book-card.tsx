import Link from "next/link";
import { cn } from "cn";
import { href, type FolioBook } from "@/lib/folio/shop";
import { AddToBag } from "./bag";
import { CoverTile } from "./cover";

export function BookCard({ book, add = true, priority, className }: { book: FolioBook; add?: boolean; priority?: boolean; className?: string }) {
  return (
    <article className={cn("group flex flex-col", className)}>
      <Link href={href.book(book.slug)} className="block" aria-label={`${book.title} by ${book.author}`}>
        <CoverTile book={book} priority={priority} className="group-hover:bg-(--ff-green-tint)" />
      </Link>
      <div className="mt-3.5 flex flex-1 flex-col">
        <h3 className="ff-title text-[18px]">
          <Link href={href.book(book.slug)} className="hover:text-(--ff-green-2) hover:underline hover:underline-offset-4">
            {book.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-[15px] text-(--ff-ink-soft)">{book.author}</p>
        <p className="mt-1.5 text-[15px]">
          <span className="font-semibold">{book.price}</span>
          <span className="text-(--ff-mute)"> · {book.format}</span>
        </p>
        {add && <AddToBag slug={book.slug} title={book.title} size="sm" variant="outline" className="mt-3 self-start" />}
      </div>
    </article>
  );
}
