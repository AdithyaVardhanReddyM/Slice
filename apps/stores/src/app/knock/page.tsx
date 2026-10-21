import Link from "next/link";
import { ArrowRight, Bike, ChefHat, Clock, Flame, MapPin, MessageCircle, Star } from "lucide-react";
import { Header } from "@/components/knock/header";
import { RestaurantCard } from "@/components/knock/restaurant-card";
import { Sticker } from "@/components/knock/sticker";
import { JsonLd, homeJsonLd } from "@/lib/knock/jsonld";
import { AREAS, CATEGORIES, KNOCK, RESTAURANTS, TESTIMONIALS, TRENDING, dishOf, href, img, money, restaurantBySlug } from "@/lib/knock/site";

const POPULAR = ["birrieria-gonzalez", "tsujita", "howlin-rays", "sqirl", "prince-street-pizza", "mariscos-jalisco"].map((s) => restaurantBySlug(s)!);

const STEPS = [
  { n: "01", title: "Crave", text: "Browse 140+ independent LA kitchens by dish, neighbourhood or what you watched last night." },
  { n: "02", title: "Tap", text: "Order in a few taps. We show the real time, not a hopeful one, and the fee before you pay." },
  { n: "03", title: "Knock", text: "Our own riders bring it over in insulated bags. Two knocks, and dinner's at the door." },
];

const PROMISES = [
  { icon: Flame, title: "Hot or it's on us", text: "If your order shows up cold, the next one is free. No forms, no arguing." },
  { icon: ChefHat, title: "Only local kitchens", text: "Independent LA restaurants and trucks. No ghost kitchens, no chains pretending." },
  { icon: MessageCircle, title: "Real people, 7am to 2am", text: "Chat with our team in LA, every day. They answer in under two minutes." },
];

export default function KnockHome() {
  return (
    <main className="pb-24">
      <JsonLd data={homeJsonLd(POPULAR)} />

      {/* Hero */}
      <section className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
        <div className="relative rounded-[32px] bg-(--kn-yellow) sm:rounded-[44px]">
          <div className="kn-container">
            <Header />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-12 pt-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-12">
              <div className="relative z-10">
                <h1 className="kn-display text-[54px] min-[400px]:text-[62px] sm:text-[104px] lg:text-[124px]">
                  Crave.
                  <br />
                  Tap.
                  <br />
                  Knock.
                </h1>
                <p className="mt-7 max-w-[470px] text-[18px] leading-relaxed text-(--kn-ink)">
                  Birria from East LA, tsukemen from Sawtelle, hot chicken from Chinatown. {KNOCK.stats.kitchens}+ of LA&apos;s favourite kitchens, at your door in about {KNOCK.stats.minutes} minutes.
                </p>
                <form action={href.restaurants} className="mt-8 flex max-w-[540px] items-center gap-2 rounded-full border-[1.5px] border-(--kn-ink) bg-(--kn-cream) p-1.5 shadow-[0_3px_0_var(--kn-ink)]">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5 pl-4">
                    <MapPin className="size-5 shrink-0 text-(--kn-red)" strokeWidth={2.2} />
                    <span className="sr-only">Delivery address</span>
                    <input name="address" size={1} placeholder="Your delivery address" autoComplete="street-address" className="h-11 w-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-(--kn-mute)" />
                  </label>
                  <button type="submit" className="kn-btn kn-btn-red h-11 shrink-0 shadow-none hover:translate-y-0 hover:shadow-none">
                    Find food
                  </button>
                </form>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-medium">
                  <span className="flex items-center gap-1.5">
                    <Star className="size-4 fill-(--kn-ink)" strokeWidth={0} />
                    {KNOCK.stats.rating} on the App Store
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Bike className="size-4" strokeWidth={2} />
                    {KNOCK.stats.angelenos} Angelenos ordered last month
                  </span>
                </div>
              </div>

              <div className="relative h-[400px] sm:h-[520px] lg:h-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img("courier.webp")}
                  alt="A smiling Knock courier on a red scooter with a yellow Knock delivery box"
                  fetchPriority="high"
                  className="absolute -bottom-12 left-1/2 h-[440px] w-auto max-w-none -translate-x-1/2 drop-shadow-[0_24px_30px_rgb(38_22_13/0.25)] sm:-bottom-16 sm:h-[580px] lg:-bottom-[150px] lg:left-auto lg:right-[2%] lg:h-[660px] lg:translate-x-0"
                />
                <Sticker src={img("sticker-ramen.webp")} alt="Tonkotsu ramen from Daikokuya" tilt={-8} className="kn-float absolute left-[2%] top-[6%] w-[110px] sm:w-[150px] lg:left-[-6%] lg:top-[34%] lg:w-[140px] xl:left-[0%] xl:top-[12%] xl:w-[170px]" />
                <Sticker src={img("sticker-tacos.webp")} alt="Birria tacos from Birrieria Gonzalez" tilt={9} className="kn-float-late absolute right-[2%] top-0 w-[96px] sm:w-[128px] lg:right-[-2%] lg:top-[-4%] lg:w-[140px]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="kn-container pt-24 sm:pt-28 lg:pt-44" aria-labelledby="crave">
        <h2 id="crave" className="kn-display text-center text-[40px] sm:text-[56px]">
          What are you craving?
        </h2>
        <div className="kn-rail -mx-5 mt-8 flex gap-3 overflow-x-auto px-5 pb-2 lg:mx-0 lg:flex-wrap lg:justify-center lg:px-0">
          {CATEGORIES.map((c) => (
            <Link key={c.id} href={href.category(c.id)} className="kn-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(c.image)} alt="" className="size-[44px] rounded-full object-cover" />
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Popular restaurants */}
      <section className="kn-container pt-20" aria-labelledby="popular">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="popular" className="kn-display text-[40px] sm:text-[56px]">
            Popular in LA
            <br className="sm:hidden" /> right now
          </h2>
          <Link href={href.restaurants} className="kn-btn kn-btn-light kn-btn-sm">
            All {RESTAURANTS.length} kitchens <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {POPULAR.map((r, i) => (
            <RestaurantCard key={r.slug} r={r} priority={i < 3} />
          ))}
        </div>
      </section>

      {/* Banner */}
      <section className="kn-container pt-24">
        <div className="relative overflow-hidden rounded-[32px] bg-(--kn-red-deep) sm:rounded-[40px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img("banner-chicken.jpg")} alt="Crispy fried chicken and fries under warm light" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#7a0f08]/90 via-[#9b140b]/55 to-transparent" aria-hidden />
          <div className="relative px-7 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
            <p className="kn-display-italic text-[44px] text-(--kn-cream) sm:text-[76px] lg:text-[96px]">
              Hot from
              <span className="block pl-[0.6em]">their kitchen.</span>
              <span className="block">Straight to</span>
              <span className="block pl-[0.6em] text-(--kn-yellow)">your door.</span>
            </p>
          </div>
        </div>
      </section>

      {/* Trending this week */}
      <section className="kn-container pt-24" aria-labelledby="trending">
        <h2 id="trending" className="kn-display text-center text-[40px] sm:text-[56px]">
          Trending this week
        </h2>
        <div className="kn-rail -mx-5 mt-10 flex snap-x gap-5 overflow-x-auto px-5 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
          {TRENDING.map((t) => {
            const { r, dish } = dishOf(t);
            return (
              <article key={t.dish} className="w-[250px] shrink-0 snap-start lg:w-auto">
                <Link href={href.restaurant(r.slug)} className="group relative block aspect-square overflow-hidden rounded-[24px] bg-(--kn-ink)">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(t.image)} alt={`${dish.name} from ${r.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  {t.offer && (
                    <>
                      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" aria-hidden />
                      <span className="kn-display absolute bottom-4 left-4 right-4 text-[15px] text-white">{t.offer}</span>
                    </>
                  )}
                </Link>
                <span className="kn-tag mt-4">{t.ordered.toLocaleString("en-US")} ordered</span>
                <h3 className="kn-display mt-3 text-[18px] leading-tight">{dish.name}</h3>
                <p className="mt-1 text-[14.5px] text-(--kn-ink-soft)">{r.name}</p>
                <p className="mt-1.5 text-[15px] font-bold text-(--kn-red)">{money(dish.price)}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Neighbourhoods */}
      <section id="neighbourhoods" className="kn-container scroll-mt-6 pt-24" aria-labelledby="areas">
        <div className="max-w-2xl">
          <h2 id="areas" className="kn-display text-[40px] sm:text-[56px]">
            LA, one neighbourhood at a time
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-(--kn-ink-soft)">We deliver across the city, but we started with the streets LA eats on. Pick a neighbourhood and get its best-known dishes, wherever you are.</p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AREAS.slice(0, 8).map((a) => {
            const here = RESTAURANTS.filter((r) => r.area === a.id).map((r) => r.name);
            return (
              <li key={a.id}>
                <Link href={href.area(a.id)} className="group flex h-full flex-col rounded-[22px] border-[1.25px] border-(--kn-ink) bg-(--kn-cream) p-5 transition-shadow hover:shadow-[0_4px_0_var(--kn-ink)]">
                  <span className="flex items-center justify-between">
                    <span className="kn-title text-[21px]">{a.name}</span>
                    <ArrowRight className="size-5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </span>
                  <span className="mt-1.5 text-[15px] text-(--kn-ink-soft)">{a.note}</span>
                  <span className="mt-auto pt-4 text-[14px] font-semibold text-(--kn-red)">{here.join(", ")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="kn-container scroll-mt-6 pt-32" aria-labelledby="how">
        <div className="relative rounded-[32px] bg-(--kn-yellow) sm:rounded-[40px]">
          <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_1fr]">
            <div className="px-7 py-12 sm:px-12 sm:py-16 lg:px-16">
              <h2 id="how" className="kn-display text-[44px] sm:text-[64px]">
                How it works
              </h2>
              <ol className="mt-10 space-y-8">
                {STEPS.map((s) => (
                  <li key={s.n} className="grid grid-cols-[56px_1fr] gap-4">
                    <span className="kn-display flex size-14 items-center justify-center rounded-full border-[1.5px] border-(--kn-ink) bg-(--kn-cream) text-[20px]">{s.n}</span>
                    <span>
                      <span className="kn-title block text-[24px]">{s.title}</span>
                      <span className="mt-1 block max-w-md text-[16px] leading-relaxed text-(--kn-ink-soft)">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative hidden h-full min-h-[460px] lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img("courier-stack.webp")} alt="A Knock courier giving a thumbs up while carrying a stack of takeout" loading="lazy" className="absolute bottom-0 right-6 h-[560px] w-auto max-w-none" />
            </div>
          </div>
        </div>
        <ul className="mt-10 grid gap-6 md:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--kn-red) text-white">
                <p.icon className="size-[22px]" strokeWidth={2} />
              </span>
              <span>
                <span className="kn-title block text-[19px]">{p.title}</span>
                <span className="mt-1 block text-[15.5px] leading-relaxed text-(--kn-ink-soft)">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Customer love */}
      <section className="kn-container pt-28" aria-labelledby="love">
        <h2 id="love" className="kn-display text-[40px] sm:text-[56px]">
          Customer love
        </h2>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
          <figure>
            <div className="flex gap-1" aria-label="5 out of 5 stars">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="size-5 fill-(--kn-yellow)" strokeWidth={1.5} />
              ))}
            </div>
            <blockquote className="kn-title mt-5 text-[28px] leading-snug sm:text-[34px]">&ldquo;{TESTIMONIALS[0].quote}&rdquo;</blockquote>
            <figcaption className="mt-5 text-[15.5px] text-(--kn-ink-soft)">
              <span className="font-semibold text-(--kn-ink)">{TESTIMONIALS[0].name}</span>, {TESTIMONIALS[0].area}
            </figcaption>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {TESTIMONIALS.slice(1).map((t) => (
                <figure key={t.name} className="rounded-[22px] bg-(--kn-cream-deep) p-6">
                  <blockquote className="text-[16px] leading-relaxed">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="mt-4 text-[14.5px] text-(--kn-ink-soft)">
                    <span className="font-semibold text-(--kn-ink)">{t.name}</span>, {t.area}
                  </figcaption>
                </figure>
              ))}
            </div>
          </figure>
          <div className="mx-auto w-full max-w-[420px]">
            <div className="aspect-square overflow-hidden rounded-full border-[6px] border-(--kn-yellow)">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img("testimonial-taco.jpg")} alt="A birria taco held up against a blue LA sky" loading="lazy" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* For restaurants */}
      <section id="for-restaurants" className="kn-container scroll-mt-6 pt-28" aria-labelledby="partners">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="aspect-[4/3] overflow-hidden rounded-[32px] bg-(--kn-ink)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img("kitchen-handoff.jpg")} alt="A cook handing a takeout bag to a Knock courier" loading="lazy" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-(--kn-red)">For restaurants</p>
            <h2 id="partners" className="kn-display mt-3 text-[40px] sm:text-[56px]">
              Your kitchen, on LA&apos;s couch
            </h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-(--kn-ink-soft)">
              Knock takes 15% and pays every Friday. Our riders carry your food in insulated bags, our LA team handles the questions, and your regulars find you by the dish, not by an ad budget.
            </p>
            <dl className="mt-8 grid max-w-md grid-cols-3 gap-4">
              {[
                ["15%", "commission"],
                [`${KNOCK.stats.minutes} min`, "average delivery"],
                ["Weekly", "payouts"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="kn-display text-[30px]">{v}</dd>
                  <dd className="mt-1 text-[14px] text-(--kn-ink-soft)">{l}</dd>
                </div>
              ))}
            </dl>
            <Link href={`mailto:partners@${KNOCK.domain}`} className="kn-btn kn-btn-red mt-9">
              Partner with Knock
            </Link>
          </div>
        </div>
      </section>

      {/* App */}
      <section id="app" className="kn-container scroll-mt-6 pt-28">
        <div className="flex flex-col items-start gap-8 rounded-[32px] bg-(--kn-red) px-7 py-12 text-white sm:rounded-[40px] sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-16">
          <div>
            <h2 className="kn-display text-[40px] sm:text-[56px]">Get the Knock app</h2>
            <p className="mt-3 max-w-md text-[17px] text-white/85">Free delivery on your first three orders, live tracking down to your block, and reorder in one tap.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="#app" className="kn-btn kn-btn-light">
              Download on the App Store
            </a>
            <a href="#app" className="kn-btn kn-btn-yellow">
              Get it on Google Play
            </a>
          </div>
        </div>
        <p className="mt-6 flex items-center gap-2 text-[14px] text-(--kn-ink-soft)">
          <Clock className="size-4" /> Open every day, 7am to 2am, in {AREAS.length} LA neighbourhoods and counting.
        </p>
      </section>
    </main>
  );
}
