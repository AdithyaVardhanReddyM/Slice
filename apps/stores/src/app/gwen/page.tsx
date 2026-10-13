import Link from "next/link";
import { ArrowRight, ArrowUpRight, BedDouble, Bell, Check, HeartPulse, Lock, Plane, Plus, ShoppingBag, Ticket, Tv, Utensils, Wallet, Zap } from "lucide-react";
import type { Product } from "@slice/demo-catalogs";
import { appFeatures, card, creditsTotal, earn, faq, gwen, href, members, partners, perk, perkCopy, perks, sceneSrc, stats, usd } from "@/lib/gwen";
import { Calculator } from "@/components/gwen/calculator";
import { CardArt } from "@/components/gwen/card-art";
import { Phone } from "@/components/gwen/phone";
import { Photo } from "@/components/gwen/photo";
import { Tilt } from "@/components/gwen/tilt";
import { Notice } from "@/components/gwen/notice";
import { SITE } from "@/lib/site";
import { cn } from "cn";

const perkIcon: Record<string, typeof Utensils> = {
  tables: Utensils,
  "front-row": Ticket,
  stays: BedDouble,
  away: Plane,
  screen: Tv,
  shop: ShoppingBag,
  move: HeartPulse,
};

/** Away reads better with the window seat than with a terminal; the perk keeps its own photo for the catalog. */
const perkPhoto = (p: Product) => (p.slug === "away" ? sceneSrc("scene-window-seat") : p.images[0]);

function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium",
        dark ? "bg-white/[0.07] text-white/70 ring-1 ring-white/10" : "bg-white text-gw-ink/70 ring-1 ring-gw-line",
      )}
    >
      <span className="gw-gold size-1.5 rounded-full" />
      {children}
    </span>
  );
}

export default function GwenHome() {
  const { store } = gwen;
  const all = perks();
  const total = creditsTotal();
  const statement = "Dinner on Thursday. A show on Saturday. Two nights somewhere new. Gwen pays you back for the things you'd do anyway.";

  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: store.name,
      url: `${SITE}/gwen`,
      logo: `${SITE}/gwen/logo.svg`,
      description: store.description,
      email: card.email,
      telephone: card.phone,
      address: { "@type": "PostalAddress", streetAddress: card.address[1], addressLocality: "New York", addressRegion: "NY", postalCode: "10001", addressCountry: "US" },
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      additionalType: "https://schema.org/CreditCard",
      name: card.name,
      description: store.tagline,
      brand: { "@type": "Brand", name: store.name },
      category: "Credit cards",
      url: `${SITE}/gwen`,
      image: `${SITE}/gwen/card.svg`,
      offers: { "@type": "Offer", price: card.annualFee, priceCurrency: "USD", description: "Annual fee", url: `${SITE}${href.apply}` },
    },
    ...all.map((p) => ({
      "@context": "https://schema.org",
      "@type": "Product",
      productID: p.id,
      name: `${p.name}: ${perkCopy[p.slug].value}`,
      description: p.description,
      image: `${SITE}${p.images[0] ?? ""}`,
      brand: { "@type": "Brand", name: card.name },
      category: `Card perks > ${p.subcategory}`,
      url: `${SITE}/gwen#perk-${p.slug}`,
    })),
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />

      {/* Hero ------------------------------------------------------------- */}
      <section className="gw-dawn relative isolate overflow-hidden">
        <Photo src={sceneSrc("scene-sky")} alt="" priority className="absolute inset-0 -z-10 opacity-40 mix-blend-soft-light" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="gw-cloud gw-drift left-[-6%] top-[52%] h-[220px] w-[520px] opacity-90" />
          <div className="gw-cloud gw-drift-slow right-[-8%] top-[30%] h-[260px] w-[600px] opacity-80" />
          <div className="gw-cloud gw-drift left-[30%] top-[78%] h-[200px] w-[700px] opacity-95" />
          <div className="gw-cloud gw-drift-slow right-[18%] top-[86%] h-[180px] w-[520px]" />
        </div>
        {/* The name, big and pale behind the card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[64px] -z-10 select-none text-center font-[family-name:var(--font-gw-display)] text-[32vw] font-semibold leading-[0.8] tracking-[-0.06em] text-white lg:text-[29vw]"
          style={{
            filter: "drop-shadow(0 24px 40px rgb(70 90 150 / 0.22))",
            maskImage: "linear-gradient(180deg, black 15%, rgb(0 0 0 / 0.5) 60%, transparent 95%)",
            WebkitMaskImage: "linear-gradient(180deg, black 15%, rgb(0 0 0 / 0.5) 60%, transparent 95%)",
          }}
        >
          gwen
        </div>

        <div className="gw-container relative flex min-h-[100svh] flex-col justify-end pb-14 pt-32 lg:min-h-[880px] lg:pb-16">
          {/* Card and the perks floating around it. */}
          <div className="relative mx-auto mb-12 w-[min(78vw,480px)] lg:mb-14">
            <Tilt className="gw-float" max={12}>
              <div className="-rotate-[7deg]">
                <CardArt glint />
              </div>
            </Tilt>
            <Notice
              icon={Utensils}
              title="Tables credit applied"
              detail="Dinner for two, Thursday"
              amount="+$150"
              className="gw-rise gw-rise-2 absolute -left-[74%] top-[12%] hidden -rotate-[2deg] xl:block"
            />
            <Notice
              icon={Ticket}
              title="Presale unlocked"
              detail="48 hours before everyone else"
              when="2m ago"
              className="gw-rise gw-rise-3 absolute -right-[74%] -top-[6%] hidden rotate-[2deg] xl:block"
            />
            <Notice
              icon={BedDouble}
              title="Stay confirmed"
              detail="2 nights, breakfast on us"
              amount="+$250"
              when="1h ago"
              className="gw-rise gw-rise-4 absolute -right-[68%] -bottom-[6%] hidden -rotate-[1deg] xl:block"
            />
          </div>

          <div className="grid items-end gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
            <h1 className="gw-display gw-rise text-balance text-[46px] sm:text-[64px] lg:text-[84px]">
              For the table, the trip and the <span className="gw-serif text-[1.08em]">encore.</span>
            </h1>
            <div className="gw-rise gw-rise-2 lg:pb-2">
              <p className="max-w-md text-[17px] leading-relaxed text-gw-ink/75">
                {card.name} pays you back {usd(total)} a year at the restaurants, venues, hotels and services you&apos;d choose anyway, with 3x points on
                dining, tickets and streaming.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link href={href.apply} className="gw-btn bg-gw-ink text-white hover:bg-gw-ink-3">
                  Check eligibility <ArrowRight className="size-4" />
                </Link>
                <Link href={href.perks} className="gw-btn gw-glass text-gw-ink hover:bg-white">
                  See the perks
                </Link>
              </div>
              <p className="mt-3 text-[13px] text-gw-ink/55">Checking takes a minute and won&apos;t affect your credit score.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Partners --------------------------------------------------------- */}
      <section className="border-b border-gw-line bg-gw-paper py-8" aria-label="Partners">
        <div className="gw-container flex items-center gap-8">
          <span className="hidden shrink-0 text-[13px] font-medium text-gw-mute md:block">Credits that work at</span>
          <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
            <div className="gw-marquee-track">
              {[0, 1].map((k) => (
                <ul key={k} className="flex shrink-0 items-center gap-12 pr-12" aria-hidden={k === 1}>
                  {partners.map((p) => (
                    <li key={p} className="whitespace-nowrap font-[family-name:var(--font-gw-display)] text-[22px] font-semibold tracking-[-0.03em] text-gw-ink/35">
                      {p}
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Statement -------------------------------------------------------- */}
      <section className="bg-gw-paper py-24 lg:py-36">
        <div className="gw-container">
          <p className="gw-display mx-auto max-w-[1040px] text-center text-[34px] font-medium leading-[1.12] sm:text-[48px] lg:text-[60px]">
            {statement.split(" ").map((w, i) => (
              <span key={i} className="gw-word">
                {w}{" "}
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* Numbers ---------------------------------------------------------- */}
      <section className="bg-gw-paper pb-24 lg:pb-32">
        <div className="gw-container grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {stats.map((s) => (
            <div key={s.label} className="relative overflow-hidden rounded-[24px] border border-gw-line bg-white p-6 lg:p-7">
              <span className="gw-gold absolute right-6 top-7 h-6 w-1 rounded-full" />
              <div className="gw-num text-[40px] font-semibold leading-none lg:text-[52px]">{s.value}</div>
              <div className="mt-8 text-[14px] text-gw-mute">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Perks ------------------------------------------------------------ */}
      <section id="perks" className="mx-2 scroll-mt-24 rounded-[32px] bg-gw-ink py-20 text-white sm:mx-4 sm:rounded-[40px] lg:py-28">
        <div className="gw-container">
          <div className="grid items-end gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Eyebrow dark>Seven credits</Eyebrow>
              <h2 className="gw-display mt-5 text-balance text-[44px] sm:text-[60px] lg:text-[72px]">
                Seven credits. <span className="gw-serif gw-gold-text pr-1 text-[1.08em]">One</span> card.
              </h2>
            </div>
            <p className="max-w-md text-[17px] leading-relaxed text-white/65 lg:justify-self-end">
              Worth {usd(total)} a year, paid as statement credits at places you&apos;d go anyway. No codes, no enrolment, nothing to activate.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-12 lg:gap-4">
            {[
              { slug: "tables", span: "md:col-span-7 md:row-span-2 min-h-[420px] md:min-h-[560px]" },
              { slug: "front-row", span: "md:col-span-5 min-h-[300px]" },
              { slug: "stays", span: "md:col-span-5 min-h-[300px]" },
              { slug: "away", span: "md:col-span-5 min-h-[340px]" },
              { slug: "screen", span: "md:col-span-7 min-h-[340px]" },
              { slug: "shop", span: "md:col-span-6 min-h-[300px]" },
              { slug: "move", span: "md:col-span-6 min-h-[300px]" },
            ].map(({ slug, span }) => {
              const p = perk(slug);
              const copy = perkCopy[slug];
              const Icon = perkIcon[slug];
              return (
                <article key={slug} id={`perk-${slug}`} className={cn("group relative isolate flex flex-col justify-between overflow-hidden rounded-[26px] p-6 lg:p-7", span)}>
                  <Photo src={perkPhoto(p)} alt={p.description} className="absolute inset-0 -z-20 transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(12_15_29/0.35)_0%,rgb(12_15_29/0.05)_35%,rgb(12_15_29/0.82)_100%)]" />
                  <div className="flex items-start justify-between">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold backdrop-blur-md ring-1 ring-white/25">
                      <Icon className="size-3.5" />
                      {copy.value}
                    </span>
                    <span className="grid size-10 place-items-center rounded-full bg-white/15 opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                  <div>
                    <h3 className="gw-display text-[34px] lg:text-[40px]">{p.name}</h3>
                    <p className="mt-2 max-w-md text-[15.5px] leading-snug text-white/80">{copy.line}</p>
                    <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-white/55">
                      {copy.partners.map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Where the money goes. */}
          <div className="mt-12 rounded-[26px] bg-white/[0.04] p-6 ring-1 ring-white/10 lg:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="text-[15px] text-white/65">
                Credits every year <span className="gw-num ml-2 text-[28px] font-semibold text-white">{usd(total)}</span>
              </div>
              <div className="text-[15px] text-white/65">
                Annual fee <span className="gw-num ml-2 text-[28px] font-semibold text-white">{usd(card.annualFee)}</span>
              </div>
            </div>
            <div className="mt-5 flex h-3 gap-1 overflow-hidden rounded-full">
              {all.map((p, i) => (
                <div
                  key={p.slug}
                  className="h-full rounded-full"
                  style={{ flex: p.price, background: ["#ffb27a", "#f7a8c4", "#dcd6f7", "#b9b3f2", "#9fd0f5", "#cfe2fa", "#ffd9c4"][i % 7] }}
                  title={`${p.name} ${usd(p.price)}`}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-white/55 sm:grid-cols-4 lg:grid-cols-7">
              {all.map((p) => (
                <div key={p.slug} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <span className="gw-num text-white/85">{usd(p.price)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Rewards ---------------------------------------------------------- */}
      <section id="rewards" className="scroll-mt-24 bg-gw-paper py-24 lg:py-32">
        <div className="gw-container grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <Eyebrow>Rewards</Eyebrow>
            <h2 className="gw-display mt-5 text-balance text-[44px] sm:text-[56px] lg:text-[64px]">
              Points on everything. <span className="gw-serif text-[1.08em]">More</span> on the good stuff.
            </h2>
            <ul className="mt-10 border-t border-gw-line">
              {earn.map((e) => (
                <li key={e.rate} className="grid grid-cols-[96px_1fr] items-center gap-4 border-b border-gw-line py-5">
                  <span className="gw-num text-[44px] font-semibold leading-none">{e.rate}</span>
                  <span>
                    <span className="block text-[17px] font-semibold">{e.what}</span>
                    <span className="block text-[14px] text-gw-mute">{e.note}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-center gap-6 rounded-[24px] bg-white p-5 ring-1 ring-gw-line">
              <div className="w-[132px] shrink-0 -rotate-6">
                <CardArt finish="pearl" />
              </div>
              <div>
                <div className="text-[13px] font-medium text-gw-mute">Welcome offer</div>
                <div className="gw-num mt-1 text-[28px] font-semibold leading-tight">{card.welcome.points.toLocaleString("en-US")} points</div>
                <p className="mt-1 text-[14px] text-gw-ink/70">
                  After {usd(card.welcome.spend)} in purchases in your first {card.welcome.months} months. Worth{" "}
                  {usd((card.welcome.points * card.pointValue) / 100)} at Gwen Travel.
                </p>
              </div>
            </div>
          </div>

          <Calculator credits={total} fee={card.annualFee} welcomePoints={card.welcome.points} pointValue={card.pointValue} />
        </div>
      </section>

      {/* App -------------------------------------------------------------- */}
      <section id="app" className="gw-dawn relative mx-2 scroll-mt-24 overflow-hidden rounded-[32px] py-20 sm:mx-4 sm:rounded-[40px] lg:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="gw-cloud gw-drift left-[-10%] top-[60%] h-[240px] w-[640px]" />
          <div className="gw-cloud gw-drift-slow right-[-12%] top-[8%] h-[220px] w-[560px] opacity-80" />
        </div>
        <div className="gw-container relative grid items-center gap-16 lg:grid-cols-[1.15fr_1fr]">
          <div className="order-2 flex justify-center lg:order-1 lg:justify-end lg:pr-8">
            <div className="relative w-[300px] sm:w-[320px]">
              <Phone />
              <Notice
                icon={Utensils}
                title="Tables credit applied"
                detail="$62 left until December"
                amount="+$88"
                className="absolute right-[calc(100%-52px)] top-[30%] w-[290px] max-md:hidden"
              />
              <Notice
                icon={Zap}
                title="3x points earned"
                detail="Two tickets, Front Row"
                amount="+186"
                when="5m ago"
                className="absolute bottom-[13%] right-[calc(100%-20px)] w-[280px] max-md:hidden"
              />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>The app</Eyebrow>
            <h2 className="gw-display mt-5 text-balance text-[44px] sm:text-[56px] lg:text-[64px]">
              Credits that <span className="gw-serif text-[1.08em]">find</span> you.
            </h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-gw-ink/70">
              Every credit, what&apos;s left of it and where it works, on one screen. Most members never open a menu to use a perk.
            </p>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {appFeatures.map((f, i) => {
                const Icon = [Check, Bell, Lock, Wallet][i];
                return (
                  <div key={f.title} className="rounded-[22px] bg-white/70 p-5 ring-1 ring-white backdrop-blur">
                    <Icon className="size-5" strokeWidth={2} />
                    <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-gw-ink/65">{f.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* The card --------------------------------------------------------- */}
      <section id="card" className="scroll-mt-24 bg-gw-paper py-24 lg:py-32">
        <div className="gw-container grid items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative mx-auto aspect-[1.25] w-full max-w-[600px]">
            <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,rgb(255_217_196/0.9),rgb(220_214_247/0.5),transparent)] blur-2xl" />
            <div className="absolute left-[2%] top-[8%] w-[74%] -rotate-[10deg]">
              <CardArt finish="pearl" holder="Sam Okafor" />
            </div>
            <Tilt className="absolute bottom-[6%] right-[2%] w-[74%]" max={8}>
              <div className="rotate-[6deg]">
                <CardArt />
              </div>
            </Tilt>
          </div>
          <div>
            <Eyebrow>The card</Eyebrow>
            <h2 className="gw-display mt-5 text-balance text-[44px] sm:text-[56px] lg:text-[64px]">
              Stainless steel. <span className="gw-serif text-[1.08em]">Eighteen</span> grams.
            </h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-gw-ink/70">
              A numberless front in Graphite or Pearl, finished in gold: the mark, the chip and a fine line across the card. Your card details live in the app, where you can change
              them.
            </p>
            <ul className="mt-8 space-y-3 text-[15.5px]">
              {[
                "Two finishes, Graphite and Pearl, for you and your authorized users",
                "Contactless, Apple Pay and Google Pay from the minute you're approved",
                "Trip delay cover, purchase protection and no foreign transaction fees",
                "A virtual number for every subscription, frozen in one tap",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-gw-ink text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Members ---------------------------------------------------------- */}
      <section className="bg-gw-paper pb-24 lg:pb-32">
        <div className="gw-container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Members</Eyebrow>
              <h2 className="gw-display mt-5 text-balance text-[44px] sm:text-[56px] lg:text-[64px]">
                In their <span className="gw-serif text-[1.08em]">words.</span>
              </h2>
            </div>
            <p className="max-w-sm text-[15px] text-gw-mute">Members pay the annual fee back with credits in five months on average.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {members.map((m) => (
              <figure key={m.name} className="flex flex-col overflow-hidden rounded-[26px] bg-white ring-1 ring-gw-line">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Photo src={sceneSrc(m.scene)} alt={`${m.name}, Gwen member`} position="center 25%" />
                  <span className="gw-glass absolute bottom-3 left-3 rounded-full px-3 py-1 text-[12.5px] font-semibold">Uses most: {m.uses}</span>
                </div>
                <blockquote className="flex-1 p-6 text-[16.5px] leading-relaxed text-gw-ink/85">&ldquo;{m.quote}&rdquo;</blockquote>
                <figcaption className="flex items-center justify-between border-t border-gw-line px-6 py-4 text-[14px]">
                  <span className="font-semibold">
                    {m.name} <span className="font-normal text-gw-mute">· {m.city}</span>
                  </span>
                  <span className="text-[12.5px] text-gw-soft">{m.since}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Rates and fees + questions -------------------------------------- */}
      <section id="fees" className="scroll-mt-24 border-t border-gw-line bg-white py-24 lg:py-28">
        <div className="gw-container grid gap-14 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
          <div>
            <Eyebrow>Rates and fees</Eyebrow>
            <h2 className="gw-display mt-5 text-balance text-[40px] sm:text-[52px]">
              The <span className="gw-serif text-[1.08em]">small</span> print, made big.
            </h2>
            <dl className="mt-8 divide-y divide-gw-line rounded-[22px] bg-gw-paper ring-1 ring-gw-line">
              {[
                ["Annual fee", usd(card.annualFee)],
                ["Authorized users", `${usd(card.authorizedUser)} each`],
                ["Purchase APR", card.apr],
                ["Foreign transaction fee", card.foreignFee],
                ["Late payment fee", card.latePayment],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-4">
                  <dt className="text-[15px] text-gw-mute">{k}</dt>
                  <dd className="text-right text-[15.5px] font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-gw-mute">
              APR varies with the market based on the Prime Rate. Rates as of October 2026. Issued by {card.issuer}.
            </p>
          </div>

          <div id="faq" className="scroll-mt-24">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="gw-display mt-5 text-balance text-[40px] sm:text-[52px]">
              Asked <span className="gw-serif text-[1.08em]">often.</span>
            </h2>
            <div className="mt-8 border-t border-gw-line">
              {faq.map((f) => (
                <details key={f.q} className="group border-b border-gw-line">
                  <summary className="flex items-center justify-between gap-6 py-5 text-[17px] font-semibold">
                    {f.q}
                    <span className="gw-faq-icon grid size-8 shrink-0 place-items-center rounded-full bg-gw-paper transition-transform duration-200">
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[15.5px] leading-relaxed text-gw-ink/70">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Apply ------------------------------------------------------------ */}
      <section id="apply" className="scroll-mt-24 bg-white pb-4">
        <div className="relative mx-2 isolate overflow-hidden rounded-[32px] sm:mx-4 sm:rounded-[40px]">
          <Photo src={sceneSrc("scene-above-clouds")} alt="" className="absolute inset-0 -z-20" position="center 60%" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(196_219_247/0.7)_0%,rgb(247_220_226/0.55)_55%,rgb(12_15_29/0.15)_100%)]" />
          <div className="gw-container flex min-h-[620px] flex-col items-center justify-center py-24 text-center">
            <div className="w-[220px] rotate-[-8deg] sm:w-[260px]">
              <CardArt />
            </div>
            <h2 className="gw-display mt-12 max-w-3xl text-[44px] text-gw-ink sm:text-[64px] lg:text-[76px]">
              See if you&apos;re approved in <span className="gw-serif text-[1.08em]">sixty</span> seconds.
            </h2>
            <p className="mt-5 max-w-md text-[17px] text-gw-ink/75">A soft check shows your offer and limit. Nothing touches your credit score until you say yes.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              <Link href="#" className="gw-btn h-14 bg-gw-ink px-7 text-[16px] text-white hover:bg-gw-ink-3">
                Check eligibility <ArrowRight className="size-4" />
              </Link>
              <Link href={href.fees} className="gw-btn gw-glass h-14 px-7 text-[16px] text-gw-ink hover:bg-white">
                Rates and fees
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
