import type { Metadata } from "next";
import { faqs, festival, tagide } from "@/lib/tagide";

export const metadata: Metadata = {
  title: "Info and FAQ",
  description: "Gates, ages, what to bring, camping, cashless, access, resale. Everything you need before you come.",
};

export default function InfoPage() {
  return (
    <main className="tg-container pt-12 lg:pt-16">
      <p className="tg-label text-tg-orange">Info · FAQ</p>
      <h1 className="tg-display mt-3 text-[64px] sm:text-[96px]">Good to know</h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <dl className="divide-y-2 divide-tg-ink border-y-2 border-tg-ink">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[18px] font-extrabold">
                {f.q}
                <span className="tg-display text-[28px] leading-none text-tg-orange transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-tg-ink-soft">{f.a}</p>
            </details>
          ))}
        </dl>
        <aside className="h-fit rounded-[26px] border-2 border-tg-ink bg-tg-cream-deep p-8">
          <h2 className="tg-display text-[32px]">About Tágide</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-tg-ink-soft">{tagide.store.description}</p>
          <p className="mt-6 text-[15px] leading-relaxed text-tg-ink-soft">
            The festival is run by a team of thirty in an old sugar warehouse in Marvila, and by about two thousand more for the week it happens. Press, partnerships and access questions
            go to the addresses below.
          </p>
          <div className="mt-6 flex flex-col gap-1 text-[15px] font-bold">
            <a href={`mailto:${festival.email}`} className="hover:text-tg-orange">
              {festival.email}
            </a>
            <a href={`mailto:${festival.press}`} className="hover:text-tg-orange">
              {festival.press}
            </a>
            <a href="mailto:access@tagidefestival.pt" className="hover:text-tg-orange">
              access@tagidefestival.pt
            </a>
            <span>{festival.phone}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
