import Link from "next/link";
import { href } from "@/lib/stackhouse/shop";

export default function NotFound() {
  return (
    <main className="ff-container flex min-h-[60svh] flex-col items-center justify-center py-24 text-center">
      <p className="ff-label">Page not found</p>
      <h1 className="ff-display mt-3 text-[40px] text-(--ff-green) sm:text-[52px]">This one seems to be checked out.</h1>
      <p className="mt-4 max-w-md text-[17px] text-(--ff-ink-soft)">The page you were after isn&apos;t on our shelves any more. Everything we stock is in Books, and the booksellers are a phone call away.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={href.books} className="ff-btn ff-btn-primary">
          Browse books
        </Link>
        <Link href={href.home} className="ff-btn ff-btn-outline">
          Back to the shop
        </Link>
      </div>
    </main>
  );
}
