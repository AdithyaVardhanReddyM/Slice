import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, href, posts, sceneSrc } from "@/lib/ridgeline";
import { Scene } from "@/components/ridgeline/product-image";

export const metadata: Metadata = {
  title: "Journal",
  description: "Notes from Ridgeline Coffee Roasters: sourcing trips, brewing guides and café news.",
};

export default function JournalPage() {
  const [lead, ...rest] = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <main className="rl-container py-10">
      <header className="max-w-2xl">
        <h1 className="rl-serif text-[40px] sm:text-[52px]">Journal</h1>
        <p className="mt-4 text-[17px] text-rl-ink-soft">Sourcing trips, brewing guides and news from the cafés. A post or two a month, written by the people who did the thing.</p>
      </header>

      <Link href={href.post(lead.slug)} className="group mt-12 grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="aspect-[4/3] overflow-hidden rounded-[4px] bg-rl-sand">
          <Scene src={sceneSrc(lead.scene)} alt="" priority className="transition-transform duration-700 group-hover:scale-[1.03]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-rl-rust">{formatDate(lead.date)} · {lead.readingTime}</p>
          <h2 className="rl-serif mt-3 text-[32px] sm:text-[40px] group-hover:text-rl-rust">{lead.title}</h2>
          <p className="mt-4 text-[17px] text-rl-ink-soft">{lead.standfirst}</p>
          <p className="mt-4 text-sm text-rl-mute">{lead.author}</p>
        </div>
      </Link>

      <div className="mt-16 grid gap-10 border-t border-rl-line pt-12 sm:grid-cols-2">
        {rest.map((p) => (
          <Link key={p.slug} href={href.post(p.slug)} className="group block">
            <div className="aspect-[3/2] overflow-hidden rounded-[4px] bg-rl-sand">
              <Scene src={sceneSrc(p.scene)} alt="" className="transition-transform duration-700 group-hover:scale-[1.03]" />
            </div>
            <p className="mt-4 text-sm font-semibold text-rl-rust">{formatDate(p.date)} · {p.readingTime}</p>
            <h2 className="rl-serif mt-2 text-[26px] group-hover:text-rl-rust">{p.title}</h2>
            <p className="mt-2 text-[15px] text-rl-ink-soft">{p.standfirst}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
