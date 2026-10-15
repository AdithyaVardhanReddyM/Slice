import Link from "next/link";
import { href } from "@/lib/covers/site";

export default function NotFound() {
  return (
    <main className="cv-container flex min-h-[60svh] flex-col items-center justify-center py-24 text-center">
      <p className="text-[15px] font-semibold text-(--cv-accent)">Page not found</p>
      <h1 className="cv-display mt-3 text-[40px] sm:text-[54px]">This table&apos;s been cleared.</h1>
      <p className="mt-4 max-w-md text-[17px] leading-relaxed text-(--cv-ink-soft)">
        The page you were after isn&apos;t on Covers any more. Every restaurant we book is in Restaurants, and the collections are a good place to start.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={href.restaurants} className="cv-btn cv-btn-primary">
          Find a table
        </Link>
        <Link href={href.collections} className="cv-btn cv-btn-outline">
          Browse collections
        </Link>
      </div>
    </main>
  );
}
