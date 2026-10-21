import Link from "next/link";
import { ArrowRight, Check, Clock, MapPin } from "lucide-react";
import { CoffeeCard } from "@/components/halfmoon/coffee-card";
import { Header } from "@/components/halfmoon/header";
import { JsonLd, homeJsonLd } from "@/lib/halfmoon/jsonld";
import { CLUB, COFFEES, HALFMOON, STATS, clubPrice, coffeeBySlug, href, img } from "@/lib/halfmoon/site";

const BREW = [
  { slug: "first-light", title: "First Light, by the pour-over", text: "15 g to 250 g of water just off the boil. Bloom for 40 seconds, then pour slow circles. Three and a half minutes." },
  { slug: "crescent", title: "Crescent, pulled short", text: "18 g in, 36 g out, about 28 seconds. Sweet enough on its own, chocolatey enough for a flat white." },
  { slug: "eclipse", title: "Eclipse, in the French press", text: "30 g, coarse, 500 g of water. Four minutes, stir, plunge. Late nights encouraged." },
  { slug: "moonrise", title: "Moonrise, wherever you are", text: "Already brewed. Crack it cold on the trail, the drive or the dock, or pour over ice." },
];

export default function HalfMoonHome() {
  const cheapest = Math.min(...COFFEES.map((c) => c.price));
  return (
    <main>
      <JsonLd data={homeJsonLd()} />

      {/* Hero: the sky, the moon, and the coffee floating in it */}
      <section className="relative overflow-hidden bg-(--hm-sky)">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img("sky.jpg")} alt="" aria-hidden fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[70%_30%]" />
        <Header tone="sky" />
        <div className="hm-container relative pb-14 pt-6 sm:pb-20 lg:min-h-[720px] lg:pb-24">
          <p className="hm-display pointer-events-none absolute inset-x-0 top-[16%] hidden select-none whitespace-nowrap text-center text-[15vw] uppercase leading-none text-white/25 sm:block lg:top-[19%] lg:text-[180px]" aria-hidden>
            Every phase
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img("iced-glasses.webp")}
            alt="Two iced coffees, a cold brew and an iced latte, with the Half Moon logo on the glasses"
            className="hm-drift relative mx-auto h-[300px] w-auto sm:h-[400px] lg:absolute lg:left-1/2 lg:top-[2%] lg:h-[470px] lg:-translate-x-1/2"
          />
          <div className="relative mt-6 grid items-end gap-8 lg:mt-0 lg:min-h-[640px] lg:grid-cols-[1.25fr_1fr]">
            <h1 className="hm-display text-[56px] sm:text-[88px] lg:text-[104px]">
              Coffee for
              <br />
              every phase.
            </h1>
            <div className="max-w-[380px] lg:justify-self-end lg:pb-3">
              <p className="text-[16px] leading-relaxed text-(--hm-ink)">
                Small-batch roasts from {HALFMOON.city}, California. A bright first cup, a sweet espresso, a midnight dark roast and cold brew for the road, shipped within 48 hours of roasting.
              </p>
              <Link href={href.shop} className="hm-btn hm-btn-ink mt-6">
                Shop the roasts
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The four coffees */}
      <section id="coffee" className="hm-container scroll-mt-4 pt-24 sm:pt-28" aria-labelledby="roasts">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="roasts" className="hm-display text-[44px] sm:text-[60px]">
            Four roasts,
            <br />
            one for every phase
          </h2>
          <p className="max-w-sm text-[15.5px] leading-relaxed text-(--hm-ink-soft)">Whole bean or ground to order. From {`$${cheapest}`} a bag, free shipping over $40, or {CLUB.discount}% off with Moon Club.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {COFFEES.map((c) => (
            <CoffeeCard key={c.slug} c={c} />
          ))}
        </div>
      </section>

      {/* Story */}
      <section id="story" className="mt-28 scroll-mt-4 bg-(--hm-sky-light) py-20 sm:py-28" aria-labelledby="story-title">
        <div className="hm-container grid items-center gap-12 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[28px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img("splash.jpg")} alt="An iced latte splashing against a blue sky" loading="lazy" className="aspect-[4/5] w-full object-cover" />
          </div>
          <div className="lg:pl-6">
            <p className="hm-eyebrow">Our story</p>
            <h2 id="story-title" className="hm-display mt-4 text-[44px] sm:text-[56px]">
              Roasted slow,
              <br />a block from the ocean
            </h2>
            <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-(--hm-ink-soft)">
              Half Moon started in {HALFMOON.founded} with one secondhand drum roaster in a garage in {HALFMOON.city}. We still roast in small batches, four days a week, and ship every bag within 48 hours so it reaches you at its best.
            </p>
            <p className="mt-4 max-w-lg text-[16.5px] leading-relaxed text-(--hm-ink-soft)">
              We buy from the same farms year after year and pay well above Fair Trade minimums. Four roasts, kept on purpose: we would rather make four coffees brilliantly than forty well enough.
            </p>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-black/10 pt-8">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="hm-display text-[40px]">{s.value}</dd>
                  <dd className="mt-1.5 text-[13.5px] leading-snug text-(--hm-ink-soft)">{s.label}</dd>
                </div>
              ))}
            </dl>
            <Link href={href.visit} className="hm-btn hm-btn-ink mt-10">
              Visit the roastery
            </Link>
          </div>
        </div>
      </section>

      {/* Cold brew, full bleed */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img("table.jpg")} alt="Two hands reaching for iced lattes on a sunny café table by the coast" loading="lazy" className="h-[560px] w-full object-cover sm:h-[680px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" aria-hidden />
        <div className="hm-container absolute inset-x-0 top-0 pt-12 sm:pt-16">
          <h2 className="hm-display max-w-xl text-[40px] text-white sm:text-[56px]">
            Real beans.
            <br />
            Really good cold brew.
          </h2>
          <Link href={href.coffee("moonrise")} className="hm-btn hm-btn-white mt-6">
            Shop Moonrise cans
          </Link>
        </div>
      </section>

      {/* Brew guides */}
      <section id="brew" className="hm-container scroll-mt-4 pt-24 sm:pt-28" aria-labelledby="brew-title">
        <h2 id="brew-title" className="hm-display text-[44px] sm:text-[60px]">
          Brew it your way
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BREW.map((b) => {
            const c = coffeeBySlug(b.slug)!;
            return (
              <article key={b.slug} className="group">
                <Link href={href.coffee(c.slug)} className="block overflow-hidden rounded-[24px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(c.photo)} alt={c.photoAlt} loading="lazy" className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                </Link>
                <h3 className="hm-title mt-5 text-[20px]">{b.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-(--hm-ink-soft)">{b.text}</p>
                <Link href={href.coffee(c.slug)} className="mt-3 inline-flex items-center gap-1.5 text-[14.5px] font-semibold hover:gap-2.5 transition-all">
                  Shop {c.name} <ArrowRight className="size-4" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {/* Moon Club */}
      <section id="moon-club" className="hm-container scroll-mt-4 pt-24 sm:pt-28" aria-labelledby="club">
        <div className="grid items-center gap-10 overflow-hidden rounded-[32px] bg-(--hm-peach) lg:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img("subscription.jpg")} alt="Bags of First Light, Crescent and Eclipse in a shipping box on a sunny doorstep" loading="lazy" className="h-full min-h-[340px] w-full object-cover" />
          <div className="px-7 pb-12 sm:px-12 lg:py-14 lg:pl-4 lg:pr-14">
            <p className="hm-eyebrow">Subscription</p>
            <h2 id="club" className="hm-display mt-4 text-[44px] sm:text-[56px]">
              {CLUB.name}
            </h2>
            <p className="mt-4 max-w-md text-[16.5px] leading-relaxed text-(--hm-ink-soft)">Your roast, every two or four weeks, roasted the week it ships. Stick with one or rotate through all four.</p>
            <ul className="mt-7 space-y-3">
              {CLUB.perks.map((p) => (
                <li key={p} className="flex items-center gap-3 text-[15.5px]">
                  <span className="flex size-6 items-center justify-center rounded-full bg-(--hm-ink) text-white">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href={href.coffee("first-light")} className="hm-btn hm-btn-ink">
                Join Moon Club
              </Link>
              <span className="text-[14.5px] text-(--hm-ink-soft)">From {clubPrice(coffeeBySlug("moonrise")!)} a delivery</span>
            </div>
          </div>
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="hm-container scroll-mt-4 py-24 sm:py-28" aria-labelledby="visit-title">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="hm-eyebrow">The roastery</p>
            <h2 id="visit-title" className="hm-display mt-4 text-[44px] sm:text-[56px]">
              Come smell
              <br />
              roast day
            </h2>
            <p className="mt-5 max-w-md text-[16.5px] leading-relaxed text-(--hm-ink-soft)">Our roastery café is on Main Street, a short walk from the beach. Pour-overs at the bar, every coffee by the bag, and the roaster running Tuesday to Friday mornings.</p>
            <ul className="mt-7 space-y-3 text-[15.5px]">
              <li className="flex items-center gap-3">
                <MapPin className="size-5 text-(--hm-sky-deep)" strokeWidth={2} />
                {HALFMOON.street}, {HALFMOON.city}, {HALFMOON.region} {HALFMOON.postalCode}
              </li>
              <li className="flex items-center gap-3">
                <Clock className="size-5 text-(--hm-sky-deep)" strokeWidth={2} />
                {HALFMOON.hours}
              </li>
            </ul>
            <a href={`https://maps.google.com/?q=${encodeURIComponent(`${HALFMOON.street}, ${HALFMOON.city}, ${HALFMOON.region}`)}`} className="hm-btn hm-btn-line mt-8">
              Get directions
            </a>
          </div>
          <div className="overflow-hidden rounded-[28px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img("roastery.jpg")} alt="Freshly roasted beans tumbling into the cooling tray of a drum roaster, with the ocean through the window" loading="lazy" className="aspect-[4/3] w-full object-cover" />
          </div>
        </div>
      </section>
    </main>
  );
}
