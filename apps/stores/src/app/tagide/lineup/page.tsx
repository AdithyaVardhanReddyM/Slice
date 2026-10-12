import type { Metadata } from "next";
import Link from "next/link";
import { actsAt, days, festival, href, runningOrder, sceneSrc, stages } from "@/lib/tagide";
import { Photo } from "@/components/tagide/photo";
import { Poster } from "@/components/tagide/poster";

export const metadata: Metadata = {
  title: "Lineup 2027",
  description: `57 acts across four stages, ${festival.datesLong}. Running order by stage and day.`,
};

export default function LineupPage() {
  return (
    <main className="tg-container pt-12 lg:pt-16">
      <p className="tg-label text-tg-orange">
        Lineup · announced {festival.lineupAnnounced}
      </p>
      <h1 className="tg-display mt-3 text-[64px] sm:text-[96px]">Who&apos;s playing</h1>
      <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-tg-ink-soft">
        Fifty-seven acts, four stages, three nights. The poster first (names sized by billing, not by set time), then the running order for every stage. Set times are provisional until the app goes live in May.
      </p>

      <Poster className="mt-12" />

      <nav className="mt-16 flex flex-wrap gap-2" aria-label="Days">
        {days.map((d) => (
          <a key={d.id} href={`#${d.id}`} className="tg-btn border-2 border-tg-ink bg-transparent text-tg-ink hover:bg-tg-ink hover:text-tg-cream">
            {d.label} {d.date}
          </a>
        ))}
      </nav>

      {days.map((d) => (
        <section key={d.id} id={d.id} className="mt-14 scroll-mt-24">
          <div className="flex items-baseline justify-between border-b-4 border-tg-ink pb-3">
            <h2 className="tg-display text-[40px] sm:text-[56px]">{d.label}</h2>
            <span className="tg-label text-tg-mute">{d.date} 2027</span>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {stages.map((s) => (
              <div key={s.id}>
                <div className="aspect-[16/10] overflow-hidden rounded-xl border-2 border-tg-ink">
                  <Photo src={sceneSrc(s.scene)} alt={s.full} />
                </div>
                <h3 className="tg-display mt-4 text-[24px]">{s.full}</h3>
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-tg-mute">{s.hours}</p>
                <ol className="mt-4 divide-y divide-tg-line border-y border-tg-line">
                  {runningOrder(actsAt(s.id, d.id)).map((a) => (
                    <li key={a.slug}>
                      <Link href={href.act(a.slug)} className="group grid grid-cols-[52px_1fr] items-baseline gap-3 py-2.5">
                        <span className="text-[13px] font-bold tabular-nums text-tg-mute">{a.time}</span>
                        <span>
                          <span className={"tg-display block transition-colors group-hover:text-tg-orange " + (a.tier === 1 ? "text-[24px]" : a.tier === 2 ? "text-[20px]" : "text-[16px]")}>{a.name}</span>
                          <span className="text-[12px] font-semibold text-tg-mute">
                            {a.genre} · {a.origin}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
