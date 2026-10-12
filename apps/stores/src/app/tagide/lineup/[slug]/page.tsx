import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { actBySlug, acts, actsAt, day, dayTickets, eur, festival, href, runningOrder, sameDayOthers, sceneSrc, stage } from "@/lib/tagide";
import { Photo } from "@/components/tagide/photo";
import { TicketCard } from "@/components/tagide/ticket-card";
import { SITE } from "@/lib/site";

export function generateStaticParams() {
  return acts.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tagide/lineup/[slug]">) {
  const { slug } = await params;
  const a = actBySlug(slug);
  if (!a) return { title: "Act" };
  return { title: `${a.name} · ${day(a.day).label} ${a.time}, ${stage(a.stage).full}`, description: a.blurb };
}

export default async function ActPage({ params }: PageProps<"/tagide/lineup/[slug]">) {
  const { slug } = await params;
  const a = actBySlug(slug);
  if (!a) notFound();
  const d = day(a.day);
  const s = stage(a.stage);
  const ticket = dayTickets().find((t) => t.slug.endsWith(a.day === "fri" ? "friday" : a.day === "sat" ? "saturday" : "sunday"));
  const sameStage = runningOrder(actsAt(a.stage, a.day)).filter((x) => x.slug !== a.slug);
  const others = sameDayOthers(a, 4);

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: `${a.name} at ${festival.name}`,
    description: a.blurb,
    startDate: `${d.iso}T${a.time}:00+01:00`,
    url: `${SITE}${href.act(a.slug)}`,
    performer: { "@type": "MusicGroup", name: a.name, genre: a.genre },
    location: { "@type": "Place", name: `${s.full}, ${festival.venue}`, address: { "@type": "PostalAddress", addressLocality: "Lisboa", addressCountry: "PT" } },
    superEvent: { "@type": "MusicEvent", name: `${festival.name} 2027`, url: `${SITE}/tagide` },
    ...(ticket ? { offers: { "@type": "Offer", name: ticket.name, price: ticket.price, priceCurrency: "EUR", url: `${SITE}${href.ticket(ticket)}` } } : {}),
  };

  return (
    <main className="tg-container pt-10 lg:pt-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <Link href={href.lineup} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-tg-ink-soft hover:text-tg-orange">
        <ArrowLeft className="size-4" strokeWidth={2.5} /> Lineup
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="tg-label text-tg-orange">
            {a.tier === 1 ? "Headliner · " : ""}
            {d.label} {d.date} · {s.full} · {a.time}
          </p>
          <h1 className="tg-display mt-4 text-[56px] sm:text-[88px] lg:text-[104px]">{a.name}</h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-tg-ink-soft">{a.blurb}</p>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t-2 border-tg-ink pt-6 sm:grid-cols-4">
            <Meta k="Day" v={`${d.label} ${d.date}`} />
            <Meta k="Stage" v={s.full} />
            <Meta k="Time" v={a.time} />
            <Meta k="From" v={a.origin} />
            <Meta k="Genre" v={a.genre} />
            <Meta k="Stage capacity" v={s.capacity} />
          </dl>
        </div>
        <div className="aspect-[4/5] overflow-hidden rounded-[22px] border-2 border-tg-ink">
          <Photo src={sceneSrc(s.scene)} alt={s.full} />
        </div>
      </div>

      <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="tg-display text-[32px]">
            Also at the {s.name} on {d.label}
          </h2>
          <ol className="mt-5 divide-y divide-tg-line border-y border-tg-line">
            {sameStage.map((x) => (
              <li key={x.slug}>
                <Link href={href.act(x.slug)} className="group grid grid-cols-[52px_1fr] items-baseline gap-3 py-3">
                  <span className="text-[13px] font-bold tabular-nums text-tg-mute">{x.time}</span>
                  <span>
                    <span className="tg-display block text-[20px] group-hover:text-tg-orange">{x.name}</span>
                    <span className="text-[12px] font-semibold text-tg-mute">{x.genre}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <h2 className="tg-display mt-12 text-[32px]">Same night, other stages</h2>
          <p className="mt-5 flex flex-wrap gap-2">
            {others
              .filter((x) => x.stage !== a.stage)
              .map((x) => (
                <Link key={x.slug} href={href.act(x.slug)} className="rounded-full border-2 border-tg-ink px-4 py-2 text-[14px] font-bold hover:bg-tg-ink hover:text-tg-cream">
                  {x.name} · {stage(x.stage).name} {x.time}
                </Link>
              ))}
          </p>
        </div>
        {ticket && (
          <div>
            <h2 className="tg-display text-[32px]">See them for {eur(ticket.price)}</h2>
            <div className="mt-5">
              <TicketCard product={ticket} tone="lilac" />
            </div>
            <p className="mt-4 text-[14px] font-medium text-tg-ink-soft">
              Or the <Link href={href.tickets} className="font-bold text-tg-orange hover:underline">three-day pass</Link> for all of it.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-tg-mute">{k}</dt>
      <dd className="mt-0.5 text-[15px] font-bold">{v}</dd>
    </div>
  );
}
