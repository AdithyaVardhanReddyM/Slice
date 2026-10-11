import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, hotel, href, posts, sceneSrc } from "@/lib/saltline";
import { Photo } from "@/components/saltline/photo";

export const metadata: Metadata = {
  title: "Journal",
  description: "Notes from the Saltline hotels: the best month for Lisbon, the Copenhagen cold-water habit, how our Barcelona chef shops the Boqueria.",
};

export default function JournalPage() {
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <main className="sl-container py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="sl-serif text-[48px] sm:text-[64px]">Journal</h1>
        <p className="mt-5 text-[17px] text-sl-charcoal-soft">Letters from the four cities, written by the people who run the hotels. One or two a month.</p>
      </header>
      <div className="mt-14 space-y-16">
        {sorted.map((p, i) => (
          <Link key={p.slug} href={href.post(p.slug)} className="group grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className={`aspect-[4/3] overflow-hidden bg-sl-stone ${i % 2 ? "lg:order-2" : ""}`}>
              <Photo src={sceneSrc(p.scene)} alt="" priority={i === 0} className="transition-transform duration-[1200ms] group-hover:scale-[1.04]" />
            </div>
            <div className={i % 2 ? "lg:order-1" : ""}>
              <p className="text-sm text-sl-mute">
                {hotel(p.hotel)?.city} · {formatDate(p.date)} · {p.readingTime}
              </p>
              <h2 className="sl-serif mt-3 text-[36px] sm:text-[44px] group-hover:text-sl-sea-deep">{p.title}</h2>
              <p className="mt-4 text-[17px] text-sl-charcoal-soft">{p.standfirst}</p>
              <p className="mt-4 text-sm text-sl-mute">{p.author}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
