import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { acts, allTickets, day, dayTickets, eur, festival, headliners, href, lastYear, originCities, passes, sceneSrc, stage, tagide } from "@/lib/tagide";
import { Marquee, Ticker } from "@/components/tagide/marquee";
import { Photo } from "@/components/tagide/photo";
import { Poster } from "@/components/tagide/poster";
import { Ribbon, Spark } from "@/components/tagide/ribbon";
import { TicketCard } from "@/components/tagide/ticket-card";
import { SITE } from "@/lib/site";

export default function TagideHome() {
  const { store } = tagide;
  const heads = headliners();
  const headScenes = ["scene-headliner-1", "scene-headliner-2", "scene-headliner-3"];
  const strip = ["scene-lastyear-1", "scene-lastyear-2", "scene-lastyear-3", "scene-lastyear-4", "scene-lastyear-5"];

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: store.name,
      url: `${SITE}/tagide`,
      logo: `${SITE}/tagide/logo.svg`,
      description: store.description,
      email: festival.email,
      telephone: festival.phone,
      address: { "@type": "PostalAddress", streetAddress: festival.address[0], addressLocality: "Lisboa", postalCode: "1990-096", addressCountry: "PT" },
    },
    {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name: `${store.name} 2027`,
      description: store.tagline,
      startDate: festival.start,
      endDate: festival.end,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      url: `${SITE}/tagide`,
      image: `${SITE}${sceneSrc("scene-hero-1") ?? ""}`,
      location: {
        "@type": "Place",
        name: festival.venue,
        address: { "@type": "PostalAddress", streetAddress: festival.address[0], addressLocality: "Lisboa", postalCode: "1990-096", addressCountry: "PT" },
      },
      organizer: { "@type": "Organization", name: store.name, url: `${SITE}/tagide` },
      performer: acts.map((a) => ({ "@type": "MusicGroup", name: a.name, url: `${SITE}${href.act(a.slug)}`, genre: a.genre })),
      offers: allTickets().map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: t.price,
        priceCurrency: "EUR",
        url: `${SITE}${href.ticket(t)}`,
        availability: "https://schema.org/InStock",
        validFrom: "2026-10-12",
      })),
    },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />

      {/* Hero */}
      <section className="relative flex overflow-hidden lg:min-h-[72svh]">
        <Ribbon className="absolute inset-0 h-full w-full" />
        <div className="tg-container relative flex flex-col justify-center pb-10 pt-12 sm:pt-16 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="tg-label tg-rise text-tg-orange">
                {festival.edition} · {festival.datesLong} · {festival.venue}, {festival.city}
              </p>
              <h1 className="tg-display tg-rise tg-rise-2 mt-5 text-[64px] sm:text-[96px] lg:whitespace-nowrap lg:text-[clamp(72px,7vw,112px)]">
                Three
                <br />
                nights on
                <br />
                the river
              </h1>
              <div className="tg-rise tg-rise-3 mt-8 flex flex-wrap items-center gap-3">
                <Link href={href.tickets} className="tg-btn bg-tg-orange px-7 py-4 text-[16px] text-white hover:bg-tg-orange-deep">
                  {festival.phase.name} tickets from {eur(passes()[0].price)}
                  <ArrowRight className="size-4" strokeWidth={2.5} />
                </Link>
                <Link href={href.lineup} className="tg-btn border-2 border-tg-ink bg-transparent px-7 py-[14px] text-[16px] text-tg-ink hover:bg-tg-ink hover:text-tg-cream">
                  Full lineup
                </Link>
              </div>
            </div>
            <div className="relative lg:pb-6">
              <p className="max-w-md text-[17px] leading-relaxed text-tg-ink-soft">
                Four stages on the north bank of the Tagus, 57 acts, a campsite under the bridge, and a city that stays up late. Most of the crowd flies in; the rest
                walks down from Oriente.
              </p>
              <div className="mt-8 grid grid-cols-4 gap-2 sm:max-w-md">
                {["scene-hero-1", "scene-hero-2", "scene-hero-3", "scene-hero-4"].map((s, i) => (
                  <div key={s} className={i % 2 === 0 ? "aspect-[3/4] translate-y-3 overflow-hidden rounded-xl" : "aspect-[3/4] overflow-hidden rounded-xl"}>
                    <Photo src={sceneSrc(s)} alt="" priority={i < 2} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Ticker
        items={[
          `${festival.phase.name} on sale until ${festival.phase.until}`,
          `Lineup announced ${festival.lineupAnnounced}`,
          "57 acts, 4 stages, 3 nights",
          "Campo Tejo opens Thursday 10 June at noon",
          "Free shuttle from Oriente every 5 minutes",
          "Travel packages from Madrid, London, Berlin and São Paulo",
        ]}
      />

      {/* Headliners + grounds */}
      <section className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="relative border-b-2 border-tg-ink bg-tg-cream px-4 py-14 sm:px-6 lg:border-b-0 lg:border-r-2 lg:px-12 lg:py-20">
          <Spark className="absolute right-10 top-10 size-6 text-tg-ink" />
          <Spark className="absolute left-[45%] top-[52%] size-4 text-tg-orange" />
          <Spark className="absolute bottom-24 right-[18%] size-5 text-tg-lilac-deep" />
          <h2 className="tg-display text-[48px] sm:text-[64px]">
            This year&apos;s
            <br />
            headliners
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-tg-ink-soft">One each night on the Tejo stage, with the bridge lit behind them. Fifty-four more acts across the other three stages.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {heads.map((a, i) => (
              <Link key={a.slug} href={href.act(a.slug)} className="group">
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border-2 border-tg-ink bg-tg-cream-deep">
                  <Photo src={sceneSrc(headScenes[i])} alt="" className="transition-transform duration-700 group-hover:scale-[1.04]" />
                  <span className="absolute left-3 top-3 rounded-full bg-tg-cream px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]">
                    {day(a.day).short} · {stage(a.stage).name}
                  </span>
                  <span className="tg-display absolute inset-x-3 bottom-3 rounded-full bg-tg-ink px-4 py-2.5 text-center text-[17px] text-tg-cream group-hover:bg-tg-orange">
                    {a.name}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <Link href={href.lineup} className="tg-btn bg-tg-orange px-8 text-white hover:bg-tg-orange-deep">
              Full lineup
            </Link>
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-tg-mute">2027 lineup</span>
          </div>
        </div>

        <div className="relative overflow-hidden bg-tg-lilac px-4 py-14 sm:px-6 lg:px-12 lg:py-20">
          <h2 className="tg-display text-[48px] text-tg-cream sm:text-[64px]">
            Explore
            <br />
            the grounds
          </h2>
          <div className="mt-10 rounded-[26px] border-2 border-tg-ink bg-tg-cream p-5 sm:p-7">
            <h3 className="text-[20px] font-extrabold">Find your way around</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-tg-ink-soft">
              The Tejo stage sits on the river. The Ponte tent is by the east gate, the Armazém is the warehouse on the west side, and the Jardim is the garden between
              them. Campo Tejo is a five-minute walk north. The shuttle drops you at the river gate.
            </p>
            <div className="mt-5 aspect-[16/10] overflow-hidden rounded-2xl border-2 border-tg-ink">
              <Photo src={sceneSrc("scene-grounds")} alt="Parque Tejo from above at golden hour" />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <Link href={href.grounds} className="tg-btn bg-tg-orange text-white hover:bg-tg-orange-deep">
                Explore around
              </Link>
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-tg-mute">Parque Tejo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Poster */}
      <section className="tg-container pt-20 lg:pt-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="tg-display text-[56px] sm:text-[80px]">Who&apos;s playing</h2>
          <Link href={href.lineup} className="flex items-center gap-1.5 text-[15px] font-bold hover:text-tg-orange">
            Running order by stage <ArrowUpRight className="size-4" strokeWidth={2.5} />
          </Link>
        </div>
        <Poster className="mt-10" />
        <p className="mt-8 text-[13px] font-semibold text-tg-mute">Names are sized by billing, not by set time. Subject to change; set times on each act&apos;s page and in the app from May.</p>
      </section>

      {/* Tickets */}
      <section className="mt-24 bg-tg-orange py-16 text-tg-ink lg:py-24">
        <div className="tg-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="tg-display text-[56px] text-white sm:text-[80px]">Tickets</h2>
            <p className="max-w-sm text-[15px] font-semibold leading-relaxed text-white">
              {festival.phase.name} until {festival.phase.until}. {festival.phase.next}. Day tickets {eur(dayTickets()[0].price)}.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {passes().map((p, i) => (
              <TicketCard key={p.id} product={p} tone={i === 1 ? "ink" : "cream"} />
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={href.tickets} className="tg-btn bg-tg-ink text-tg-cream hover:bg-black">
              All tickets and travel packages
            </Link>
            <span className="text-[14px] font-semibold text-white">Under 16s free · Payment in instalments · Official resale opens in March</span>
          </div>
        </div>
      </section>

      {/* Last year */}
      <section className="tg-container pt-20 lg:pt-28">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <h2 className="tg-display text-[48px] sm:text-[72px]">Last year, in their words</h2>
          <span className="tg-display rounded-xl bg-tg-lilac px-5 py-2 text-[40px] sm:text-[56px]">2026</span>
        </div>
        <div className="mt-10 grid border-2 border-tg-ink md:grid-cols-2">
          {lastYear.map((q, i) => (
            <figure
              key={q.name}
              className={
                "flex flex-col justify-between border-tg-ink p-8 md:[&:nth-child(2n)]:border-l-2 [&:not(:nth-last-child(-n+1))]:border-b-2 md:[&:not(:nth-last-child(-n+2))]:border-b-2 " +
                (i === 1 || i === 4 ? "bg-tg-orange text-white" : "bg-tg-cream")
              }
            >
              <div>
                <figcaption className="tg-display text-[28px]">{q.name}</figcaption>
                <blockquote className={"mt-3 text-[15px] leading-relaxed " + (i === 1 || i === 4 ? "text-white/90" : "text-tg-ink-soft")}>{q.quote}</blockquote>
              </div>
              <p className={"mt-6 text-[13px] font-semibold italic " + (i === 1 || i === 4 ? "text-white/85" : "text-tg-mute")}>
                Came from {q.from} · {q.saw}
              </p>
            </figure>
          ))}
        </div>
      </section>

      {/* Photo strip */}
      <section className="relative mt-16 overflow-hidden py-10">
        <div className="flex justify-center gap-2 px-4">
          {strip.map((s, i) => (
            <div
              key={s}
              className="aspect-[4/5] w-[150px] shrink-0 overflow-hidden rounded-xl border-2 border-tg-ink sm:w-[200px] lg:w-[240px]"
              style={{ transform: `rotate(${[-6, 4, -3, 5, -4][i]}deg) translateY(${[6, -4, 8, -2, 4][i]}px)` }}
            >
              <Photo src={sceneSrc(s)} alt="" />
            </div>
          ))}
        </div>
        <div className="tg-display absolute left-1/2 top-1/2 flex size-[108px] -translate-x-1/2 -translate-y-1/2 rotate-[-12deg] items-center justify-center rounded-full bg-tg-orange text-[26px] text-white shadow-[0_8px_0_#121212]" aria-hidden="true">
          2026
        </div>
      </section>

      {/* Marquee bands */}
      <section className="relative mt-10 overflow-hidden py-16" aria-hidden="true">
        <div className="relative h-[420px] sm:h-[520px]">
          <Marquee words={["Music", "Music", "Music"]} className="absolute left-[-5%] top-[8%] w-[110%] rotate-[-4deg] bg-tg-lilac py-3 text-tg-ink" />
          <Marquee words={["River", "River", "River"]} reverse className="absolute left-[-5%] top-[38%] w-[110%] rotate-[3deg] bg-tg-orange py-3 text-tg-ink" />
          <Marquee words={["Lisboa", "Lisboa", "Lisboa"]} className="absolute left-[-5%] top-[68%] w-[110%] rotate-[-3deg] bg-tg-ink py-3 text-tg-cream" />
        </div>
      </section>

      {/* Getting here */}
      <section className="tg-container pt-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <h2 className="tg-display text-[48px] sm:text-[64px]">Getting here</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-tg-ink-soft">
              Parque Tejo is fifteen minutes from the airport and twenty from Oriente by shuttle. Two thirds of last year&apos;s crowd came from outside Portugal; the packages below
              are built around those cities.
            </p>
            <Link href={href.travel} className="tg-btn mt-8 bg-tg-ink text-tg-cream hover:bg-black">
              Travel, camping and hotels
            </Link>
          </div>
          <ul className="divide-y-2 divide-tg-ink border-y-2 border-tg-ink">
            {originCities.map((c) => (
              <li key={c.city} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center sm:gap-4">
                <span className="tg-display text-[26px]">{c.city}</span>
                <span className="text-[14px] font-medium text-tg-ink-soft">{c.how}</span>
                {c.packageSlug ? (
                  <Link href={`${href.tickets}#${c.packageSlug}`} className="text-[13px] font-bold uppercase tracking-[0.06em] text-tg-orange hover:underline">
                    Package {eur(tagide.get(c.packageSlug)!.price)}
                  </Link>
                ) : (
                  <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-tg-mute">Book your own</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
