import { cn } from "cn";
import type { FolioBook } from "@/lib/stackhouse/shop";

/** A book cover at its own proportions, with a soft table shadow. */
export function Cover({ book, className, priority }: { book: Pick<FolioBook, "cover" | "title" | "author">; className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={book.cover}
      alt={`${book.title} by ${book.author}, cover`}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={cn("ff-cover", className)}
    />
  );
}

/** A cover standing at the bottom of a paper tile; any proportions fit. */
export function CoverTile({ book, className, priority, inset = "px-[16%] pb-[10%] pt-[10%]" }: { book: Pick<FolioBook, "cover" | "title" | "author">; className?: string; priority?: boolean; inset?: string }) {
  return (
    <span className={cn("relative block aspect-[4/5] rounded-[10px] bg-(--ff-paper-2) transition-colors", className)}>
      <span className={cn("absolute inset-0 flex items-end justify-center", inset)}>
        <Cover book={book} priority={priority} className="max-h-full max-w-full" />
      </span>
    </span>
  );
}
